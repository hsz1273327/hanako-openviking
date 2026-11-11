// 受管运行时：本 App 唯一的出站网络出口。
//
// App 主入口跑在 Node Permission Model 里，没有 --allow-net；清单里的
// network.allowedHosts 又只支持精确主机名与 *.suffix，覆盖不了用户自填的内网 IP。
// 所以真正的请求在这个进程里发：它由宿主以 native + network:"external" 启动，
// 用宿主自带的 node 二进制，不依赖用户系统装了什么。
//
// 契约（与 src/ov/transport.js 对齐）：
//   POST /fetch
//   x-ov-token: <argv --token>
//   { url, method, headers, body, timeoutMs, maxBytes }
//   -> 200 { status, headers, body }
//   -> 4xx/5xx { error: { code: TIMEOUT | NETWORK | TOO_LARGE | BAD_REQUEST, message } }
//   GET /health
//   -> 200 { ok: true, ready: true }
//
// 只做转发，不记日志、不落盘、不碰 API Key。
// /health 是启动后探活用的：宿主可能先把 runtimeId 交出来、服务却还没应，
// 光看 runtimeId 会把一条死路当成出口（见 src/ov/transport.js 的 probeRuntime）。

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export const READY_MARKER = "APP_READY";
export const HEALTH_PATH = "/health";
export const READ_FILE_PATH = "/read-file";
export const LIST_SESSIONS_PATH = "/list-sessions";
export const DEFAULT_READ_BYTES = 1_048_576;
export const MAX_READ_BYTES = 8_388_608;
export const DEFAULT_PORT = 47821;
export const DEFAULT_TIMEOUT_MS = 1500;
export const MAX_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_BYTES = 2_097_152;

// 宿主 ctx.runtime.fetch 的请求体上限是 1 MiB，这里留同一条边界。
const MAX_REQUEST_BYTES = 1_048_576;

// 逐跳头：由 Node 自己按本次连接生成，不转发上游发来的值。
const HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
]);

function httpError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function parseArgs(argv = []) {
  const out = { port: DEFAULT_PORT, token: "", agentsRoot: "" };
  for (const raw of argv) {
    const text = String(raw ?? "");
    if (text.startsWith("--port=")) {
      const port = Number(text.slice("--port=".length));
      if (Number.isInteger(port) && port > 0 && port < 65536) out.port = port;
      continue;
    }
    if (text.startsWith("--token=")) {
      out.token = text.slice("--token=".length);
    }
    if (text.startsWith("--agents-root=")) {
      out.agentsRoot = text.slice("--agents-root=".length);
    }
  }
  return out;
}

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * 校验并归一化一次转发请求。返回的 url 是 URL 对象，headers 只保留字符串值，
 * 逐跳头在这里剥掉，避免把调用方的 Host / Content-Length 带进上游。
 */
export function normalizeEnvelope(raw, options = {}) {
  const defaultTimeoutMs = positiveInt(options.defaultTimeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const defaultMaxBytes = positiveInt(options.defaultMaxBytes, DEFAULT_MAX_BYTES, Number.MAX_SAFE_INTEGER);

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw httpError("BAD_REQUEST", "body 必须是 JSON 对象", 400);
  }

  let url;
  try {
    url = new URL(String(raw.url || ""));
  } catch {
    throw httpError("BAD_REQUEST", "url 不是合法 URL", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw httpError("BAD_REQUEST", "只接受 http / https", 400);
  }

  const method = String(raw.method || "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw httpError("BAD_REQUEST", "method 非法", 400);
  }

  const headers = {};
  if (raw.headers && typeof raw.headers === "object" && !Array.isArray(raw.headers)) {
    for (const [name, value] of Object.entries(raw.headers)) {
      if (typeof value !== "string") continue;
      const key = String(name).toLowerCase();
      if (HOP_HEADERS.has(key)) continue;
      headers[key] = value;
    }
  }
  // 不要让上游压缩：这个进程按 UTF-8 字符串回传 body，压缩流会被解成乱码。
  headers["accept-encoding"] = "identity";

  const body = raw.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    throw httpError("BAD_REQUEST", "body 必须是字符串", 400);
  }

  return {
    url,
    method,
    headers,
    body: typeof body === "string" ? body : null,
    timeoutMs: positiveInt(raw.timeoutMs, defaultTimeoutMs, MAX_TIMEOUT_MS),
    maxBytes: positiveInt(raw.maxBytes, defaultMaxBytes, Number.MAX_SAFE_INTEGER),
  };
}

/** 真正发出去的那一跳。不跟随重定向，3xx + Location 原样带回。 */
export function forwardEnvelope(envelope) {
  return new Promise((resolve, reject) => {
    const lib = envelope.url.protocol === "https:" ? https : http;
    const headers = { ...envelope.headers };
    if (envelope.body !== null && envelope.method !== "GET" && envelope.method !== "HEAD") {
      headers["content-length"] = String(Buffer.byteLength(envelope.body));
    }

    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    let request;
    try {
      request = lib.request(envelope.url, { method: envelope.method, headers }, (upstream) => {
        const chunks = [];
        let size = 0;

        upstream.on("data", (chunk) => {
          if (settled) return;
          size += chunk.length;
          if (size > envelope.maxBytes) {
            upstream.destroy();
            request.destroy();
            finish(
              reject,
              httpError("TOO_LARGE", `响应超过 ${envelope.maxBytes} 字节`, 413),
            );
            return;
          }
          chunks.push(chunk);
        });

        upstream.on("end", () => {
          finish(resolve, {
            status: upstream.statusCode || 0,
            headers: upstream.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });

        upstream.on("error", (error) => {
          finish(reject, httpError("NETWORK", error?.message || "上游连接中断", 502));
        });
      });
    } catch (error) {
      finish(reject, httpError("BAD_REQUEST", error?.message || "请求构造失败", 400));
      return;
    }

    timer = setTimeout(() => {
      request.destroy();
      finish(reject, httpError("TIMEOUT", `上游超过 ${envelope.timeoutMs}ms 未响应`, 504));
    }, envelope.timeoutMs);

    request.on("error", (error) => {
      finish(reject, httpError("NETWORK", error?.message || "上游不可达", 502));
    });

    if (envelope.body !== null) request.write(envelope.body);
    request.end();
  });
}

function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!expected || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;

    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        // 先把请求流抽干，再回错误；否则响应可能发不出去。
        req.resume();
        reject(httpError("BAD_REQUEST", `请求体超过 ${limit} 字节`, 413));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      if (done) return;
      done = true;
      reject(httpError("BAD_REQUEST", error?.message || "请求体读取失败", 400));
    });
  });
}

function respond(res, status, payload) {
  if (res.writableEnded) return;
  const text = JSON.stringify(payload);
  try {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(text),
    });
    res.end(text);
  } catch {
    try {
      res.destroy();
    } catch {
      /* 客户端已经走了 */
    }
  }
}

export function agentsRootOf(options = {}) {
  const raw = typeof options.agentsRoot === "string" ? options.agentsRoot.trim() : "";
  return path.resolve(raw || path.join(os.homedir(), ".hanako", "agents"));
}

/**
 * 只放行 agents 目录下、以 .jsonl 结尾的会话文件。
 * 先拒绝 `..` 段，再 path.resolve，最后比前缀——顺序反过来会让 `a/../../b` 混过前缀检查。
 */
export function resolveSessionFile(rawPath, agentsRoot) {
  const root = path.resolve(agentsRoot);
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw httpError("BAD_REQUEST", "path 必填", 400);
  }
  const segments = rawPath.split(/[\\/]+/);
  if (segments.includes("..")) {
    throw httpError("BAD_REQUEST", "path 不能包含 ..", 400);
  }
  if (!/\.jsonl$/i.test(rawPath)) {
    throw httpError("BAD_REQUEST", "只接受 .jsonl 文件", 400);
  }
  const target = path.resolve(rawPath);
  if (target === root || !target.startsWith(root + path.sep)) {
    throw httpError("BAD_REQUEST", "path 不在 agents 目录内", 400);
  }
  return target;
}

/**
 * 分块读会话文件。返回的 chunk 尽量在换行处收尾，避免把多字节字符切成两半；
 * 客户端按 Buffer.byteLength(chunk) 推进 offset。
 */
export async function readSessionChunk(rawPath, { agentsRoot, offset = 0, limit = DEFAULT_READ_BYTES } = {}) {
  const target = resolveSessionFile(rawPath, agentsRoot);
  const stat = await fs.promises.stat(target);
  if (!stat.isFile()) throw httpError("BAD_REQUEST", "不是普通文件", 400);
  const size = stat.size;
  const from = Math.max(0, Math.floor(Number(offset) || 0));
  const want = Math.min(
    MAX_READ_BYTES,
    Math.max(1, Math.floor(Number(limit) || DEFAULT_READ_BYTES)),
    Math.max(0, size - from),
  );
  if (want === 0) return { ok: true, chunk: "", eof: true, size };

  const buffer = Buffer.alloc(want);
  const handle = await fs.promises.open(target, "r");
  let read = 0;
  try {
    const result = await handle.read(buffer, 0, want, from);
    read = result.bytesRead;
  } finally {
    await handle.close();
  }
  let slice = buffer.subarray(0, read);
  let next = from + read;
  let eof = next >= size;
  if (!eof) {
    const lastNewline = slice.lastIndexOf(0x0a);
    if (lastNewline >= 0) {
      slice = slice.subarray(0, lastNewline + 1);
      next = from + lastNewline + 1;
    }
  }
  return { ok: true, chunk: slice.toString("utf8"), eof, size };
}

/** 列 <agentsRoot>/<agent>/sessions/*.jsonl；只读元数据，不读内容。 */
export async function listSessionFiles(options = {}) {
  const root = agentsRootOf(options);
  const out = [];
  const agents = await fs.promises.readdir(root, { withFileTypes: true });
  for (const agent of agents) {
    if (!agent.isDirectory()) continue;
    const dir = path.join(root, agent.name, "sessions");
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.jsonl$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const stat = await fs.promises.stat(file);
        out.push({ path: file, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        /* 单个文件读不到就跳过 */
      }
    }
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, root, sessions: out };
}

async function handleFetch(req, res, options) {
  const pathname = String(req.url || "").split("?")[0];
  // 探活：只证明这个进程还在应答，不碰上游、不看 token、不回任何可用的信息。
  if (req.method === "GET" && pathname === HEALTH_PATH) {
    respond(res, 200, { ok: true, ready: true });
    return;
  }
  const allowed = pathname === "/fetch" || pathname === READ_FILE_PATH || pathname === LIST_SESSIONS_PATH;
  if (req.method !== "POST" || !allowed) {
    respond(res, 404, {
      error: { code: "BAD_REQUEST", message: "只接受 POST /fetch、POST /read-file、POST /list-sessions 与 GET /health" },
    });
    return;
  }
  if (!tokenMatches(req.headers["x-ov-token"], options.token)) {
    respond(res, 403, { error: { code: "BAD_REQUEST", message: "x-ov-token 不匹配" } });
    return;
  }

  let raw;
  try {
    raw = await readRequestBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    respond(res, error.status || 400, { error: { code: "BAD_REQUEST", message: error.message } });
    return;
  }

  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    respond(res, 400, { error: { code: "BAD_REQUEST", message: "body 不是 JSON" } });
    return;
  }

  if (pathname === READ_FILE_PATH) {
    try {
      const result = await readSessionChunk(parsed?.path, {
        agentsRoot: agentsRootOf(options),
        offset: parsed?.offset,
        limit: parsed?.limit,
      });
      respond(res, 200, result);
    } catch (error) {
      respond(res, error.status || 500, {
        error: { code: error.code || "READ_FAILED", message: error?.message || String(error) },
      });
    }
    return;
  }

  if (pathname === LIST_SESSIONS_PATH) {
    try {
      const result = await listSessionFiles(options);
      respond(res, 200, result);
    } catch (error) {
      respond(res, error.status || 500, {
        error: { code: error.code || "LIST_FAILED", message: error?.message || String(error) },
      });
    }
    return;
  }

  let envelope;
  try {
    envelope = normalizeEnvelope(parsed, options);
  } catch (error) {
    respond(res, error.status || 400, {
      error: { code: error.code || "BAD_REQUEST", message: error.message },
    });
    return;
  }

  try {
    const result = await forwardEnvelope(envelope);
    respond(res, 200, result);
  } catch (error) {
    respond(res, error.status || 502, {
      error: { code: error.code || "NETWORK", message: error.message },
    });
  }
}

export function createProxyServer(options = {}) {
  return http.createServer((req, res) => {
    handleFetch(req, res, options).catch((error) => {
      respond(res, 500, {
        error: { code: "NETWORK", message: String(error?.message || error) },
      });
    });
  });
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.token) {
    process.stderr.write("runtime/service.mjs: missing --token=<hex>\n");
    process.exitCode = 1;
    return null;
  }

  const server = createProxyServer({ token: args.token, agentsRoot: args.agentsRoot });
  server.on("error", (error) => {
    process.stderr.write(`runtime/service.mjs: ${error?.message || error}\n`);
    process.exit(1);
  });
  server.listen(args.port, "127.0.0.1", () => {
    // 宿主只认这一行精确标记。别加前缀、别带颜色。
    process.stdout.write(`${READY_MARKER}\n`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

// 会话文件的读取口。
//
// 主进程跑在 Node 权限模型里：只放行安装目录与 app-data，`~/.hanako/agents/<agent>/sessions/*.jsonl`
// 不在白名单内，读它直接 ERR_ACCESS_DENIED（连 existsSync 都算越界）。开发环境不受限，
// 所以先用 fs 直读；被拒才降级到受管运行时（runtime/service.mjs 的子进程不受这套限制），
// 降级只记一次 warn。
//
// 降级路径按块拿：大文件最大 25MB，不能一次性拉回来。块在换行处收尾，行由这里拼。

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { runtimeFileRequest } from "../ov/transport.js";

export const SESSION_CHUNK_BYTES = 1_048_576;

let warned = false;

/** 测试用：让「只 warn 一次」重新生效。 */
export function resetSessionReaderWarning() {
  warned = false;
}

function isPermissionDenied(error) {
  const code = String(error?.code || "");
  if (code === "ERR_ACCESS_DENIED" || code === "EACCES" || code === "EPERM") return true;
  return /Access to this API has been restricted|permission/i.test(String(error?.message || ""));
}

function noteFallback(logger, file, error) {
  if (warned) return;
  warned = true;
  try {
    logger?.warn?.(
      `openviking session read fell back to runtime (${file}): ${error?.message || error}`,
    );
  } catch {
    /* 日志不能影响读取 */
  }
}

function chunkReaderFor(deps = {}) {
  if (typeof deps.readChunk === "function") return deps.readChunk;
  return (file, offset, limit) => runtimeFileRequest("/read-file", { path: file, offset, limit });
}

/** 整份读（capture 用）：fs 直读失败且是权限问题 → runtime 分块拼起来。 */
export async function readSessionText(file, deps = {}) {
  try {
    if (typeof deps.readFile === "function") return await deps.readFile(file);
    return await fs.promises.readFile(file, "utf8");
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    noteFallback(deps.logger, file, error);
    return readWholeViaRuntime(file, deps);
  }
}

async function readWholeViaRuntime(file, deps = {}) {
  const readChunk = chunkReaderFor(deps);
  const chunkBytes = Number(deps.chunkBytes) > 0 ? Number(deps.chunkBytes) : SESSION_CHUNK_BYTES;
  let offset = 0;
  let text = "";
  for (let guard = 0; guard < 10000; guard += 1) {
    const part = await readChunk(file, offset, chunkBytes);
    if (!part || typeof part.chunk !== "string") {
      throw new Error("runtime read-file 返回体不合法");
    }
    text += part.chunk;
    offset += Buffer.byteLength(part.chunk);
    if (part.eof === true || !part.chunk) return text;
  }
  throw new Error("runtime read-file 分块过多");
}

/**
 * 逐行读（backfill 用）：先用 createReadStream + readline；打开就被拒时降级到 runtime 分块。
 * 回调返回 false 立刻停，降级路径也不会再多取一块。
 */
export async function forEachSessionLine(file, onLine, deps = {}) {
  if (typeof deps.openLines === "function") return deps.openLines(file, onLine);
  const viaFs = await linesViaFs(file, onLine);
  if (viaFs === "ok") return undefined;
  return forEachRuntimeLine(file, onLine, deps);
}

async function linesViaFs(file, onLine) {
  let stream;
  try {
    stream = fs.createReadStream(file, { encoding: "utf8" });
  } catch (error) {
    if (isPermissionDenied(error)) return "denied";
    throw error;
  }

  try {
    await new Promise((resolve, reject) => {
      stream.once("open", resolve);
      stream.once("error", reject);
    });
  } catch (error) {
    stream.destroy();
    if (isPermissionDenied(error)) return "denied";
    throw error;
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if ((await onLine(line)) === false) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return "ok";
}

export async function forEachRuntimeLine(file, onLine, deps = {}) {
  const readChunk = chunkReaderFor(deps);
  const chunkBytes = Number(deps.chunkBytes) > 0 ? Number(deps.chunkBytes) : SESSION_CHUNK_BYTES;
  let offset = 0;
  let carry = "";
  for (let guard = 0; guard < 10000; guard += 1) {
    const part = await readChunk(file, offset, chunkBytes);
    if (!part || typeof part.chunk !== "string") {
      throw new Error("runtime read-file 返回体不合法");
    }
    offset += Buffer.byteLength(part.chunk);
    carry += part.chunk;
    let index = carry.indexOf("\n");
    while (index >= 0) {
      const line = carry.slice(0, index).replace(/\r$/, "");
      carry = carry.slice(index + 1);
      if ((await onLine(line)) === false) return undefined;
      index = carry.indexOf("\n");
    }
    if (part.eof === true || !part.chunk) break;
  }
  if (carry) await onLine(carry.replace(/\r$/, ""));
  return undefined;
}

/**
 * 列 <agentsRoot>/<agent>/sessions/*.jsonl 的元数据。
 * fs 被拒时走 runtime 的 POST /list-sessions；返回 [{path, size, mtimeMs}]。
 */
export async function listSessionFiles(root, deps = {}) {
  if (typeof deps.listFiles === "function") return deps.listFiles(root);
  try {
    return await listViaFs(root);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    noteFallback(deps.logger, root, error);
    const payload =
      typeof deps.listRuntime === "function"
        ? await deps.listRuntime(root)
        : await runtimeFileRequest("/list-sessions", { root });
    return Array.isArray(payload?.sessions) ? payload.sessions : [];
  }
}

async function listViaFs(root) {
  const out = [];
  const agents = await fs.promises.readdir(root, { withFileTypes: true });
  for (const agent of agents) {
    if (!agent.isDirectory()) continue;
    const dir = path.join(root, agent.name, "sessions");
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch (error) {
      // 权限被拒要交给上层降级，不能当成「这个 agent 没会话」吞掉。
      if (isPermissionDenied(error)) throw error;
      continue;
    }
    for (const name of names) {
      if (!/\.jsonl$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const stat = await fs.promises.stat(file);
        out.push({ path: file, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch (error) {
        if (isPermissionDenied(error)) throw error;
        /* 单个文件读不到就跳过 */
      }
    }
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

// 传输层：把一次 OpenViking 请求交给哪个出口。
//
// 首选受管运行时（runtime/service.mjs，native + network:"external"）；
// 运行时没起来时退回 App 自己的 ctx.network.fetch（受 manifest 白名单限制）。
// 两条路径对 client.js 是同一个形状：send(url, { method, headers, body })。
//
// 纪律：API Key 只进信封的 headers，不进日志、不进 runtime.fetch 的参数之外。

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BYTES = 2_097_152;
const PROXY_EXCHANGE_PATH = "/fetch";

export class TransportError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : String(code || "NETWORK"));
    this.name = "TransportError";
    this.code = code || "NETWORK";
  }
}

function clampTimeout(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(parsed)), MAX_TIMEOUT_MS);
}

function messageOf(error) {
  return String(error?.message || error || "unknown");
}

/**
 * 构造受管运行时传输。
 *
 * runtimeFetch 就是宿主 ctx.runtime.fetch，签名 (runtimeId, path, init) -> Response。
 * 返回的 sendJson 与 client.js 对接：成功 { status, ok, headers, data }；
 * 代理本身失败（进程没起 / 端口不通 / token 不匹配 / 超时）抛带 code 的 TransportError。
 */
export function createRuntimeTransport({
  runtimeFetch,
  runtimeId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  logger,
} = {}) {
  if (typeof runtimeFetch !== "function") {
    throw new TypeError("createRuntimeTransport: runtimeFetch 必须是函数");
  }
  if (typeof runtimeId !== "string" || !runtimeId) {
    throw new TypeError("createRuntimeTransport: runtimeId 必填");
  }

  const defaultTimeout = clampTimeout(timeoutMs, DEFAULT_TIMEOUT_MS);
  const defaultMaxBytes =
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
      ? Math.floor(Number(maxBytes))
      : DEFAULT_MAX_BYTES;

  async function sendJson(url, init = {}) {
    const envelope = {
      url: String(url || ""),
      method: String(init.method || "GET").toUpperCase(),
      headers: { ...(init.headers || {}) },
      timeoutMs: clampTimeout(init.timeoutMs ?? defaultTimeout, defaultTimeout),
      maxBytes:
        Number.isFinite(Number(init.maxBytes)) && Number(init.maxBytes) > 0
          ? Math.floor(Number(init.maxBytes))
          : defaultMaxBytes,
    };
    // body 只有字符串一种形态：client 已经序列化好了。
    if (typeof init.body === "string") envelope.body = init.body;

    // 宿主这一跳自己的超时要略大于上游超时，否则代理还没来得及回 TIMEOUT 就被掐断。
    const bridgeTimeout = Math.min(envelope.timeoutMs + 1000, MAX_TIMEOUT_MS);

    let response;
    try {
      response = await runtimeFetch(runtimeId, PROXY_EXCHANGE_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(envelope),
        timeoutMs: bridgeTimeout,
      });
    } catch (error) {
      // 运行时没起、服务未 ready、token 错、宿主代理超时都走这里。
      throw new TransportError(error?.code || "NETWORK", `managed runtime bridge: ${messageOf(error)}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    // 代理自己失败：HTTP 非 2xx，或服务回了 { error: { code, message } }。
    if (!response.ok || (payload && typeof payload === "object" && payload.error)) {
      const code = payload?.error?.code || `HTTP ${response.status}`;
      const message = payload?.error?.message || response.statusText || "";
      if (logger?.warn) {
        try {
          // 只记 code 与 message；信封里有 API Key，绝不整包打印。
          logger.warn(`openviking runtime transport failed: ${code}`);
        } catch {
          /* 日志不能影响请求 */
        }
      }
      throw new TransportError(code, message);
    }

    if (!payload || typeof payload !== "object") {
      throw new TransportError("BAD_REQUEST", "managed runtime 返回了无法解析的信封");
    }

    const status = Number(payload.status) || 0;
    const bodyText = typeof payload.body === "string" ? payload.body : "";
    let data = null;
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = null;
      }
    }

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: payload.headers && typeof payload.headers === "object" ? payload.headers : {},
      data,
    };
  }

  return { kind: "runtime", runtimeId, sendJson };
}

// ---- 进程级出口状态：index.js 启动时写入，路由与钩子读同一份 ----

let active = { send: null, runtimeId: null, port: null, error: null };

export function setRuntimeTransport({ send = null, runtimeId = null, port = null, error = null } = {}) {
  active = {
    send: typeof send === "function" ? send : null,
    runtimeId,
    port,
    error,
  };
  return { ...active };
}

export function resetRuntimeTransport() {
  active = { send: null, runtimeId: null, port: null, error: null };
}

export function runtimeTransportState() {
  return { ...active };
}

/**
 * 取这次请求该用的出口。
 *   runtime: 受管运行时已就绪
 *   direct:  退回 ctx.network.fetch
 *   down:    两条都不可用（调用方应直接判失败，不联网）
 */
export function transportFor(ctx) {
  if (typeof active.send === "function") {
    return { mode: "runtime", send: active.send };
  }
  const network = ctx?.network;
  if (typeof network?.fetch === "function") {
    return { mode: "direct", fetchImpl: network.fetch.bind(network) };
  }
  return { mode: "down" };
}

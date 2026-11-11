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

// 探活：走服务自己的 GET /health。
// 宿主把 runtime.fetch 限定在「已注册且 ready 的服务」上，所以探测本身就等价于
// 问了一句「宿主眼里这个服务算不算活着」——比只看 runtimeId 强得多。
export const RUNTIME_HEALTH_PATH = "/health";

/**
 * 探活预算：单次 300ms × 最多 3 次，中间隔 120ms，最坏约 1.1s。
 * 留给「刚起来、宿主还没看到 readyMarker」一点时间，但绝不把 App 装载拖成好几秒。
 */
export const PROBE_TIMEOUT_MS = 300;
export const PROBE_ATTEMPTS = 3;
export const PROBE_INTERVAL_MS = 120;

// 宿主 / 代理把「服务没 ready」写成好几种话：code 是 APP_RUNTIME_NOT_READY，
// message 是 `does not have a ready service`。两处都认，别只认一个。
const NOT_READY_HINTS = /APP_RUNTIME_NOT_READY|RUNTIME_NOT_READY|does not have a ready service|runtime (?:is )?not ready/i;

export class TransportError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : String(code || "NETWORK"));
    this.name = "TransportError";
    this.code = code || "NETWORK";
  }
}

/** 这一发失败是不是「托管服务根本没 ready」。 */
export function isRuntimeNotReady(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (NOT_READY_HINTS.test(code)) return true;
  return NOT_READY_HINTS.test(String(error.message || ""));
}

function delay(ms) {
  const wait = Number(ms);
  if (!Number.isFinite(wait) || wait <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, wait);
  });
}

/**
 * 给一发探测加硬上限。
 *
 * init.timeoutMs 是「请宿主在这么久之后超时」，不是「本地一定会在这时醒过来」。
 * 宿主要是没兑现，装载就会被一条永不回话的探测挂住；这里再兜一层，保证预算真的是预算。
 * 输掉竞速的那一发仍可能在稍后失败，先挂一个空 catch，别让它变成未处理的拒绝。
 */
function withDeadline(promise, ms, label) {
  const budget = Number(ms);
  if (!Number.isFinite(budget) || budget <= 0) return promise;
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} 超过 ${budget}ms 没有应答`);
      error.code = "PROBE_TIMEOUT";
      reject(error);
    }, budget);
  });
  Promise.resolve(promise).catch(() => {});
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * 启动后的健康探测。
 *
 * 只看 runtime.start 的返回值是不够的：宿主会先给出 runtimeId、服务却未必应了
 * （实测进程不在、端口也不监听）。这里真发一次 GET /health，答不上来就判死。
 *
 * 返回 { ok: true, attempts } 或 { ok: false, error }；不抛，探测失败是正常分支。
 */
export async function probeRuntime({
  runtimeFetch,
  runtimeId,
  token,
  timeoutMs = PROBE_TIMEOUT_MS,
  attempts = PROBE_ATTEMPTS,
  intervalMs = PROBE_INTERVAL_MS,
} = {}) {
  if (typeof runtimeFetch !== "function") {
    return { ok: false, error: "宿主没有提供 ctx.runtime.fetch" };
  }
  if (typeof runtimeId !== "string" || !runtimeId) {
    return { ok: false, error: "runtimeId 为空" };
  }

  const tries = Math.max(1, Math.floor(Number(attempts) || 1));
  const perTry = clampTimeout(timeoutMs, PROBE_TIMEOUT_MS);
  let last = "";

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await withDeadline(
        runtimeFetch(runtimeId, RUNTIME_HEALTH_PATH, {
          method: "GET",
          headers: token ? { "x-ov-token": token } : {},
          timeoutMs: perTry,
        }),
        perTry,
        "runtime health",
      );
      if (response?.ok) return { ok: true, attempts: attempt };
      last = `health 回了 HTTP ${response?.status ?? "?"}`;
    } catch (error) {
      last = messageOf(error);
    }
    if (attempt < tries) await delay(intervalMs);
  }

  return { ok: false, error: last || "健康探测没有通过" };
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
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  logger,
  onNotReady,
} = {}) {
  if (typeof runtimeFetch !== "function") {
    throw new TypeError("createRuntimeTransport: runtimeFetch 必须是函数");
  }
  if (typeof runtimeId !== "string" || !runtimeId) {
    throw new TypeError("createRuntimeTransport: runtimeId 必填");
  }
  // token 与受管进程 argv 里那份必须一致，否则每个请求都是 403。
  // 这里宁可启动就抛错，也不要让链路带着一个永远对不上的头跑到线上。
  if (typeof token !== "string" || !token) {
    throw new TypeError("createRuntimeTransport: token 必填");
  }

  const defaultTimeout = clampTimeout(timeoutMs, DEFAULT_TIMEOUT_MS);
  const defaultMaxBytes =
    Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
      ? Math.floor(Number(maxBytes))
      : DEFAULT_MAX_BYTES;

  // 一次降级只通知一次：重启是尽力而为，不能每轮都去捅一个已经死掉的服务。
  let demoted = false;

  function demote(detail) {
    // 只切自己这一份：重启之后可能已经有新的 transport 上任了，别把新的也拆了，
    // 也别因为一条旧链路失败去重启一个已经健康的 runtime。
    if (active.send !== sendJson) {
      demoted = true;
      return;
    }
    setActiveDirect(detail);
    if (demoted) return;
    demoted = true;
    if (typeof onNotReady === "function") {
      try {
        Promise.resolve(onNotReady(detail)).catch(() => {});
      } catch {
        /* 重启是尽力而为，失败只影响下一次能不能回到托管 */
      }
    }
  }

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
        headers: { "content-type": "application/json", "x-ov-token": token },
        body: JSON.stringify(envelope),
        timeoutMs: bridgeTimeout,
      });
    } catch (error) {
      // 运行时没起、服务未 ready、token 错、宿主代理超时都走这里。
      if (isRuntimeNotReady(error)) {
        const detail = messageOf(error);
        /* 这一发已经证明服务是死的：马上把出口切回直连，下一轮不必再陪葬。 */
        demote(detail);
        // 宿主原始 code 留在 hostCode 上：排错时能分清“宿主自己报的”与“代理转的”。
        const notReady = new TransportError("RUNTIME_NOT_READY", `managed runtime bridge: ${detail}`);
        notReady.hostCode = error?.code || null;
        throw notReady;
      }
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
      // 代理自己回的「没 ready」也是同一个结论，走同一条降级。
      if (isRuntimeNotReady({ code, message })) {
        demote(message || code);
        const notReady = new TransportError("RUNTIME_NOT_READY", `managed runtime bridge: ${message || code}`);
        notReady.hostCode = code;
        throw notReady;
      }
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

/**
 * 启动后把托管运行时接管成当前的出口：先探活，再决定设不设 send。
 *
 * 这一步不能省：runtime.start 回了 runtimeId 不代表服务活着（实测进程不在、端口也不监听）。
 * 探不通就不设 send，transportFor 自然走 ctx.network 直连，并把原因记进出口状态。
 *
 * 返回 { ok: true, send } 或 { ok: false, error }；不抛。
 */
export async function activateRuntime({
  runtimeFetch,
  runtimeId,
  token,
  port = null,
  timeoutMs = PROBE_TIMEOUT_MS,
  logger,
  onNotReady,
} = {}) {
  setRuntimeBridge({ runtimeFetch, runtimeId, token });
  const probe = await probeRuntime({ runtimeFetch, runtimeId, token, timeoutMs });
  if (!probe.ok) {
    const message = `${probe.error}`;
    setRuntimeTransport({ send: null, runtimeId, port, error: message });
    try {
      // 只在这里说一次：调用方不再重复打印同一条降级。
      logger?.warn?.(
        `openviking runtime not ready (runtimeId=${runtimeId}, port=${port}), falling back to ctx.network: ${message}`,
      );
    } catch {
      /* 日志不能影响装载 */
    }
    return { ok: false, error: message };
  }

  const transport = createRuntimeTransport({ runtimeFetch, runtimeId, token, logger, onNotReady });
  setRuntimeTransport({ send: transport.sendJson, runtimeId, port, error: null });
  return { ok: true, send: transport.sendJson };
}

// ---- 进程级出口状态：index.js 启动时写入，路由与钩子读同一份 ----

let active = { send: null, runtimeId: null, port: null, error: null };

/** 出口切回直连，但把 runtimeId / port / 原因留着：面板要说得清为什么降级。 */
function setActiveDirect(error) {
  active = {
    send: null,
    runtimeId: active.runtimeId,
    port: active.port,
    error: typeof error === "string" && error ? error : active.error,
  };
  return { ...active };
}

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

// ---- 受管运行时的文件桥 ----
//
// 主进程跑在 Node 权限模型里，读不到 ~/.hanako/agents/<agent>/sessions/*.jsonl；
// runtime 子进程不受这套限制。这里留着启动时的 runtimeFetch / runtimeId / token，
// 只给 session-reader 的降级路径用，权限面在 runtime 那边按目录白名单收窄。

let bridge = { runtimeFetch: null, runtimeId: null, token: null };

export function setRuntimeBridge({ runtimeFetch = null, runtimeId = null, token = null } = {}) {
  bridge = {
    runtimeFetch: typeof runtimeFetch === "function" ? runtimeFetch : null,
    runtimeId: typeof runtimeId === "string" && runtimeId ? runtimeId : null,
    token: typeof token === "string" && token ? token : null,
  };
}

export function resetRuntimeBridge() {
  bridge = { runtimeFetch: null, runtimeId: null, token: null };
}

export function runtimeBridgeState() {
  return {
    ready: typeof bridge.runtimeFetch === "function" && !!bridge.runtimeId && !!bridge.token,
  };
}

/**
 * 走 runtime 的 POST /read-file 与 /list-sessions。
 * 失败抛带 code 的 TransportError；不发日志（调用方决定怎么记）。
 */
export async function runtimeFileRequest(pathname, body, { timeoutMs = 15000 } = {}) {
  const { runtimeFetch, runtimeId, token } = bridge;
  if (typeof runtimeFetch !== "function" || !runtimeId || !token) {
    throw new TransportError("RUNTIME_NOT_READY", "runtime file bridge unavailable");
  }
  let response;
  try {
    response = await runtimeFetch(runtimeId, pathname, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ov-token": token },
      body: JSON.stringify(body || {}),
      timeoutMs,
    });
  } catch (error) {
    throw new TransportError(error?.code || "NETWORK", `runtime file bridge: ${messageOf(error)}`);
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || (payload && typeof payload === "object" && payload.error)) {
    throw new TransportError(
      payload?.error?.code || `HTTP ${response.status}`,
      payload?.error?.message || response.statusText || "",
    );
  }
  return payload;
}

export function runtimeTransportState() {
  return { ...active };
}

/**
 * 取这次请求该用的出口。
 *   runtime: 受管运行时已就绪（send 只在探活通过后才设上；撞到 NOT_READY 会被切成 null）
 *   direct:  退回 ctx.network.fetch
 *   down:    两条都不可用（调用方应直接判失败，不联网）
 *
 * 判据只看 send 是不是函数，所以“设上来”这件事背后的含义必须是可信的：
 * 启动时探活、请求中撞上 NOT_READY 就降级，两者都在保这个不变量。
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

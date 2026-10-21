// OpenViking HTTP 客户端。
//
// 端点与响应封装已按官方文档核实（docs.openviking.ai）：
//   成功 { status:"ok", result }
//   失败 { status:"error", error:{code,message} } —— HTTP 错误走顶层 error，不要去翻 result.status
// 身份头：X-API-Key；跨机区分用 X-OpenViking-Actor-Peer。

/**
 * peer_scope 线上值映射。
 *
 * 对外（manifest 枚举、会话覆盖、DESIGN）一直用 all / self；但 v0.4.16 的
 * /api/v1/search/search 只接受 'actor' | 'all'，传 self 会直接 HTTP 400：
 *   {"code":"INVALID_ARGUMENT","message":"body.peer_scope: Input should be 'actor' or 'all'"}
 * 所以发请求前把 self 翻译成 actor；all 原样。未知值按 all 处理（与旧默认值一致）。
 */
export function wirePeerScope(scope) {
  return scope === "self" ? "actor" : "all";
}

export function createClient({
  serverUrl,
  apiKey,
  peer,
  timeoutMs = 1500,
  fetchImpl,
  send,
} = {}) {
  const base = String(serverUrl || "").replace(/\/+$/, "");
  // send 优先（受管运行时的 transport.sendJson）；没有就退回 fetchImpl。
  const doSend = typeof send === "function" ? send : null;
  const doFetch = fetchImpl || globalThis.fetch;

  function headers(extra) {
    const h = { "Content-Type": "application/json", ...(extra || {}) };
    if (apiKey) h["X-API-Key"] = apiKey;
    // 服务端据此区分 self / actor_peer / other_peer。
    if (peer) h["X-OpenViking-Actor-Peer"] = peer;
    return h;
  }

  // 两条出口只在"怎么拿到 status / ok / data"上不同，判错误体的逻辑共用一份。
  function unwrap(path, { status, ok, data, statusText = "" }) {
    if (!ok || data?.status === "error") {
      const code = data?.error?.code || `HTTP ${status}`;
      const message = data?.error?.message || statusText || "";
      throw new Error(`OpenViking ${path}: ${code} ${message}`.trim());
    }
    return data?.result;
  }

  async function call(path, init = {}) {
    const url = base + path;
    const requestHeaders = headers(init.headers);

    if (doSend) {
      const result = await doSend(url, {
        method: init.method || "GET",
        headers: requestHeaders,
        body: init.body,
        timeoutMs,
      });
      return unwrap(path, {
        status: result?.status,
        ok: result?.ok === true,
        data: result?.data ?? null,
      });
    }

    const res = await doFetch(url, {
      ...init,
      headers: requestHeaders,
      // 连不上即短路：超时极短，失败直接抛，由调用方吞掉并降级。
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return unwrap(path, {
      status: res.status,
      ok: res.ok,
      data,
      statusText: res.statusText,
    });
  }

  return {
    baseUrl: base,

    // 健康检查，免认证。
    health: () => call("/health", { method: "GET" }),
    ready: () => call("/ready", { method: "GET" }),

    // 记忆召回。mode="context" 返回服务端已按 token 预算组装好的上下文块。
    recall: (query, opts = {}) =>
      call("/api/v1/search/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          mode: "context",
          peer_scope: wirePeerScope(opts.peerScope),
          max_tokens: opts.maxTokens ?? 2000,
          score_threshold: opts.scoreThreshold ?? 0.35,
        }),
      }),

    // 技能检索。返回按包分组的命中，含 name/description/root_uri/skill_md_uri。
    findSkills: (query, opts = {}) =>
      call("/api/v1/skills/find", {
        method: "POST",
        body: JSON.stringify({
          query,
          limit: opts.limit ?? 5,
          score_threshold: opts.scoreThreshold ?? 0.45,
          ...(opts.level ? { level: opts.level } : {}),
          ...(opts.targetUri ? { target_uri: opts.targetUri } : {}),
        }),
      }),

    // level: 0 摘要 / 1 概览 / 2 正文；省略返回全部层级。
    getSkill: (skillName, opts = {}) => {
      const qs = new URLSearchParams();
      if (opts.level !== undefined) qs.set("level", String(opts.level));
      if (opts.includeContent !== undefined) qs.set("include_content", String(opts.includeContent));
      if (opts.includeFiles !== undefined) qs.set("include_files", String(opts.includeFiles));
      const q = qs.toString();
      return call(`/api/v1/skills/${encodeURIComponent(skillName)}${q ? `?${q}` : ""}`, {
        method: "GET",
      });
    },

    // 会话：创建 -> 追加消息 -> 提交（提交时抽取长期记忆）。
    createSession: (opts = {}) =>
      call("/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify({
          ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
          ...(opts.autoCommitPolicy ? { auto_commit_policy: opts.autoCommitPolicy } : {}),
        }),
      }),
    addMessages: (sessionId, messages) =>
      call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/messages/batch`, {
        method: "POST",
        body: JSON.stringify({ messages }),
      }),
    commit: (sessionId) =>
      call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commit`, { method: "POST" }),
  };
}

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

/** peer 记忆树的遍历上限。node_limit 是服务端的节点总数上限，达到即截断。 */
const TREE_NODE_LIMIT = 500;
const TREE_LEVEL_LIMIT = 5;

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
    // 没有身份就不冒充：peer 为 null / 空串时**不发**这个头。
    // "没有 peer"和"peer=openhanako"是两件事，前者服务端才知道它不认识这个来源。
    const actor = String(peer ?? "").trim();
    if (actor) h["X-OpenViking-Actor-Peer"] = actor;
    return h;
  }

  // 两条出口只在"怎么拿到 status / ok / data"上不同，判错误体的逻辑共用一份。
  // mode="raw" 给 /health、/ready 这类直接把字段摆在顶层的端点用。
  function unwrap(path, { status, ok, data, statusText = "" }, mode = "result") {
    if (!ok || data?.status === "error") {
      const code = data?.error?.code || `HTTP ${status}`;
      const message = data?.error?.message || statusText || "";
      throw new Error(`OpenViking ${path}: ${code} ${message}`.trim());
    }
    return mode === "raw" ? data : data?.result;
  }

  async function call(path, init = {}, mode = "result") {
    const url = base + path;
    const requestHeaders = headers(init.headers);

    if (doSend) {
      const result = await doSend(url, {
        method: init.method || "GET",
        headers: requestHeaders,
        body: init.body,
        timeoutMs,
      });
      return unwrap(
        path,
        {
          status: result?.status,
          ok: result?.ok === true,
          data: result?.data ?? null,
        },
        mode,
      );
    }

    const res = await doFetch(url, {
      ...init,
      headers: requestHeaders,
      // 连不上即短路：超时极短，失败直接抛，由调用方吞掉并降级。
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return unwrap(
      path,
      {
        status: res.status,
        ok: res.ok,
        data,
        statusText: res.statusText,
      },
      mode,
    );
  }

  return {
    baseUrl: base,

    // 健康检查，免认证。/health 与 /ready 把字段摆在顶层，没有 result 包一层。
    health: () => call("/health", { method: "GET" }, "raw"),
    ready: () => call("/ready", { method: "GET" }, "raw"),

    // 记忆召回。mode="context" 返回服务端已按 token 预算组装好的上下文块。
    // exclude_uris 只在确实有排除项时出现：空数组 / 未传都不带这个键，
    // 让请求体保持与旧版逐字节一致。
    recall: (query, opts = {}) => {
      const excludeUris = Array.isArray(opts.excludeUris)
        ? opts.excludeUris.filter((uri) => typeof uri === "string" && uri.trim())
        : [];
      return call("/api/v1/search/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          mode: "context",
          peer_scope: wirePeerScope(opts.peerScope),
          max_tokens: opts.maxTokens ?? 2000,
          score_threshold: opts.scoreThreshold ?? 0.35,
          ...(excludeUris.length ? { exclude_uris: excludeUris } : {}),
        }),
      });
    },

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

    // 中枢里已有的 peer 目录。simple=true 只要目录名，不要每条的元数据。
    // 返回的 URI 形如 viking://user/default/peers/hermes，这里只留最后一段。
    // 顺序原样保留；非数组 / 非字符串条目直接跳过，界面只负责怎么摆。
    listPeers: async () => {
      const result = await call(
        "/api/v1/fs/ls?uri=viking://user/default/peers&simple=true",
        { method: "GET" },
      );
      if (!Array.isArray(result)) return [];
      const names = [];
      for (const entry of result) {
        if (typeof entry !== "string") continue;
        const name = entry.replace(/\/+$/, "").split("/").pop();
        if (name) names.push(name);
      }
      return names;
    },

    // 某个 peer 的记忆条数与是否数到了上限。
    //
    // memories 下面不是记忆，是类别目录（cases / entities / events ...），类别里
    // 还可能有子目录；真正的记忆是 .md 文件。所以不能数目录，也不能用 fs/ls，
    // 要一次把子树拉平：fs/tree 的 result 是**扁平数组**（含 isDir / rel_path），
    // 层级靠 rel_path 体现，没有嵌套结构。
    // 形状不认识就抛，由调用方记成 null（读不到 ≠ 0 条）。
    listPeerMemories: async (peerName) => {
      const name = String(peerName ?? "").trim();
      if (!name) throw new Error("peer 名为空");
      const uri = `viking://user/default/peers/${encodeURIComponent(name)}/memories`;
      const result = await call(
        `/api/v1/fs/tree?uri=${uri}&output=agent&level_limit=${TREE_LEVEL_LIMIT}&node_limit=${TREE_NODE_LIMIT}`,
        { method: "GET" },
      );
      if (!Array.isArray(result)) {
        throw new Error("memories 树形状不认识");
      }
      // 只数 .md 文件：目录节点（isDir=true）与树自带的其它文件都不算记忆。
      const count = result.filter(
        (node) =>
          node &&
          node.isDir === false &&
          typeof node.rel_path === "string" &&
          node.rel_path.endsWith(".md"),
      ).length;
      return { count, capped: result.length >= TREE_NODE_LIMIT };
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

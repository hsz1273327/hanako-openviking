// 离线冒烟：不联网、不装 App，只验纯逻辑。
// 跑法：node dev/smoke.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "../src/ov/client.js";
import {
  createRuntimeTransport,
  resetRuntimeTransport,
  setRuntimeTransport,
  transportFor,
} from "../src/ov/transport.js";
import { normalizeEnvelope, parseArgs } from "../runtime/service.mjs";
import registerStatusRoutes from "../routes/status.js";
import registerPeersRoutes from "../routes/peers.js";
import registerSessionRoutes from "../routes/session.js";
import registerConnRoutes from "../routes/conn.js";
import registerRecallModeRoutes from "../routes/recall-mode.js";
import {
  composePeer,
  resolvePeer,
  describePeer,
  agentDirFromSessionPath,
  normalizePrefix,
  peerForSession,
  noteActivePeer,
  readActivePeer,
} from "../src/ov/identity.js";
import {
  readConnection,
  readExcludedPeers,
  readSwitches,
  parseExcludedPeers,
  normalizeRecallGate,
  normalizeQueryMode,
  DEFAULTS,
} from "../src/ov/settings.js";
import { createProbe } from "../src/probe.js";
import {
  stripInjected,
  lastUserText,
  contextQuery,
  recallQuery,
  injectMemory,
  estimateTokens,
  trimToBudget,
  CONTEXT_MESSAGES_MAX,
  CONTEXT_CHARS_MAX,
} from "../src/inject/plan.js";
import { skillFindTool, skillLoadTool } from "../src/skills/tools.js";
import {
  createDeduper,
  createRecallHandler,
  extractRecallText,
  fingerprint,
  isShortOperationCommand,
  memoryBlock,
  resetShapeWarning,
  shouldSkipRecall,
  DEDUP_LIMIT,
  GATE_MAX_CHARS,
  MEMORY_MAX_TOKENS,
} from "../src/memory/recall.js";
import {
  readSession,
  patchSession,
  effective,
  listSessions,
  touchSession,
  markClosed,
  sessionKeyOf,
  OVERRIDE_KEYS,
} from "../src/state/session.js";
// 前端那份同名规则：两边必须一模一样，否则页面查一份、卡片写另一份。
import { sessionKeyOf as uiSessionKeyOf } from "../ui/assets/session-key.js";
// checks 归一化的唯一实现：路由与工具共用，这里直接验同一份输入过两处。
import { normalizeChecks, normalizeReady } from "../src/ov/ready.js";
// check 状态 -> 颜色档位，前端与详情行共用。
import { statusTone as uiStatusTone } from "../ui/assets/check-tone.js";
// 服务端检查项的摘要文案：面板那一行字由它造，必须能测。
import {
  checkStatusLabel as uiCheckStatusLabel,
  summarizeChecks as uiSummarizeChecks,
} from "../ui/assets/check-summary.js";
// 面板那排召回下拉的状态与提交：成功 / 失败两种收笔都由它定。
import { commitLayers, paintLayers } from "../ui/assets/recall-layers.js";
// 工具的报告体：与 /status 比 ready.checks 的形状是否一致。
import { buildStatusReport } from "../index.js";

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

function eq(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
}

// ---- mock sdk.config ----
function sdkWith(values = {}) {
  return { config: { get: async (key) => values[key] } };
}

// ---- mock sdk（召回用：配置 + 网络 + 临时 dataDir）----
// reads 统计 sdk.config.get 的调用次数，用来断言"去重键提前"真的省掉了配置读取。
function recallSdk({ values = {}, fetchImpl, dataDir, logger, reads }) {
  const counter = reads || { count: 0 };
  const sink = logger || {};
  return {
    dataDir,
    reads: counter,
    config: {
      get: async (key) => {
        counter.count += 1;
        return values[key];
      },
    },
    network: { fetch: fetchImpl },
    logger: {
      info: (...args) => sink.info?.(...args),
      warn: (...args) => sink.warn?.(...args),
    },
  };
}

// ---- mock fetch ----
function mockFetch({ status = 200, body = { status: "ok", result: {} } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

// ================= client =================
{
  const { calls, fetchImpl } = mockFetch({
    body: { status: "ok", healthy: true, version: "v0.4.16" },
  });
  const client = createClient({
    serverUrl: "http://192.168.50.142:8000/",
    apiKey: "k-123",
    peer: "mbp-hanako",
    fetchImpl,
  });

  const result = await client.health();
  eq("health 返回顶层字段", result, { status: "ok", healthy: true, version: "v0.4.16" });
  eq("health 里能拿到版本", result?.version, "v0.4.16");
  eq("base 去掉尾部斜杠", client.baseUrl, "http://192.168.50.142:8000");
  eq("health 走 GET", calls[0].init.method, "GET");
  eq("health URL", calls[0].url, "http://192.168.50.142:8000/health");
  eq("带上 X-API-Key", calls[0].init.headers["X-API-Key"], "k-123");
  eq("带上 actor peer", calls[0].init.headers["X-OpenViking-Actor-Peer"], "mbp-hanako");
}

{
  // ---- 没有身份就不冒充：peer 为 null / 空串时干脆不发这个头 ----
  const unbound = mockFetch();
  await createClient({ serverUrl: "http://h:1", apiKey: "k", peer: null, fetchImpl: unbound.fetchImpl }).health();
  eq(
    "peer 为 null 时不发身份头",
    "X-OpenViking-Actor-Peer" in unbound.calls[0].init.headers,
    false,
  );

  const blank = mockFetch();
  await createClient({ serverUrl: "http://h:1", apiKey: "k", peer: "  ", fetchImpl: blank.fetchImpl }).health();
  eq(
    "peer 为空白串时也不发身份头",
    "X-OpenViking-Actor-Peer" in blank.calls[0].init.headers,
    false,
  );
  eq("无身份时其他头照旧", blank.calls[0].init.headers["X-API-Key"], "k");
}

{
  const { calls, fetchImpl } = mockFetch();
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });

  await client.recall("昨天说的那件事", { peerScope: "self", maxTokens: 800 });
  const body = JSON.parse(calls[0].init.body);
  eq("recall 用 context 模式", body.mode, "context");
  eq("recall peer_scope(self 映射为 actor)", body.peer_scope, "actor");
  eq("recall max_tokens", body.max_tokens, 800);
  eq("recall 路径", calls[0].url, "http://h:1/api/v1/search/search");

  await client.recall("跨门牌", { peerScope: "all" });
  eq("recall peer_scope(all 原样)", JSON.parse(calls[1].init.body).peer_scope, "all");

  await client.recall("默认范围");
  eq("recall peer_scope 默认 all", JSON.parse(calls[2].init.body).peer_scope, "all");
}

{
  // ---- 排除项：非空数组才带 exclude_uris，空 / 未传都不带这个键 ----
  const { calls, fetchImpl } = mockFetch();
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });
  const hermes = "viking://user/default/peers/hermes";

  await client.recall("跨门牌", { peerScope: "all", excludeUris: [hermes] });
  eq("recall 带 exclude_uris", JSON.parse(calls[0].init.body).exclude_uris, [hermes]);

  await client.recall("跨门牌", { peerScope: "all", excludeUris: [] });
  eq(
    "空 excludeUris 不带这个键",
    "exclude_uris" in JSON.parse(calls[1].init.body),
    false,
  );

  await client.recall("跨门牌", { peerScope: "all" });
  eq(
    "未传 excludeUris 不带这个键",
    "exclude_uris" in JSON.parse(calls[2].init.body),
    false,
  );

  await client.recall("跨门牌", { peerScope: "all", excludeUris: ["", "  "] });
  eq(
    "全空字符串也不带这个键",
    "exclude_uris" in JSON.parse(calls[3].init.body),
    false,
  );
}

{
  const { calls, fetchImpl } = mockFetch();
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });

  await client.findSkills("把 PDF 表格抽出来");
  const body = JSON.parse(calls[0].init.body);
  eq("findSkills 路径", calls[0].url, "http://h:1/api/v1/skills/find");
  eq("findSkills 默认 limit", body.limit, 5);
  eq("findSkills 默认阈值", body.score_threshold, 0.45);

  await client.getSkill("pdf-table", { level: 2 });
  eq("getSkill level 到位", calls[1].url, "http://h:1/api/v1/skills/pdf-table?level=2");
}

{
  const { fetchImpl } = mockFetch({
    status: 404,
    body: { status: "error", error: { code: "NOT_FOUND", message: "no such skill" } },
  });
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });
  let caught = null;
  try {
    await client.getSkill("missing");
  } catch (error) {
    caught = String(error.message);
  }
  check("错误封装会抛", caught !== null);
  check("抛出里带 code", caught?.includes("NOT_FOUND"), caught);
}

{
  // ---- peer 目录：只留最后一段名字 ----
  const { calls, fetchImpl } = mockFetch({
    body: {
      status: "ok",
      result: [
        "viking://user/default/peers/dsh-desktop",
        "viking://user/default/peers/hermes",
      ],
    },
  });
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });
  eq("listPeers 只留目录名", await client.listPeers(), ["dsh-desktop", "hermes"]);
  eq(
    "listPeers 走 fs/ls",
    calls[0].url,
    "http://h:1/api/v1/fs/ls?uri=viking://user/default/peers&simple=true",
  );
  eq("listPeers 走 GET", calls[0].init.method, "GET");

  const empty = mockFetch({ body: { status: "ok", result: [] } });
  const emptyClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: empty.fetchImpl });
  eq("listPeers 空目录给空数组", await emptyClient.listPeers(), []);

  const oddShape = mockFetch({ body: { status: "ok", result: { entries: [] } } });
  const oddClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: oddShape.fetchImpl });
  eq("listPeers 形状不认识给空数组", await oddClient.listPeers(), []);
}

{
  // ---- peer 记忆条数：fs/tree 的 result 是扁平数组，只数 .md 文件 ----
  const node = (rel, isDir) => ({ uri: `u/${rel}`, size: isDir ? 0 : 900, isDir, modTime: "", rel_path: rel, abstract: "" });
  const tree = [
    node("cases", true),
    node("entities/project", true),
    node("events/2026", true),
    node("cases/mem_1.md", false),
    node("entities/project/mem_2.md", false),
    node("events/2026/mem_3.md", false),
    node("preferences/mem_4.md", false),
    node("preferences/notes.txt", false),
  ];
  const { calls, fetchImpl } = mockFetch({ body: { status: "ok", result: tree } });
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });
  eq("3 个目录 + 4 个 md + 1 个 txt -> count 是 4", (await client.listPeerMemories("hermes")).count, 4);
  eq("没达到 node_limit 时 capped 为 false", (await client.listPeerMemories("hermes")).capped, false);
  check("listPeerMemories 走 fs/tree", calls[0].url.startsWith("http://h:1/api/v1/fs/tree?"), calls[0].url);
  eq("fs/tree 的 node_limit", new URL(calls[0].url).searchParams.get("node_limit"), "500");

  const full = Array.from({ length: 500 }, (_, i) => node(`d${i % 10}/mem_${i}.md`, false));
  const fullMock = mockFetch({ body: { status: "ok", result: full } });
  const fullClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: fullMock.fetchImpl });
  eq("节点数达到 node_limit 时 capped 为 true", (await fullClient.listPeerMemories("hermes")).capped, true);

  const badMock = mockFetch({ body: { status: "ok", result: { nodes: [] } } });
  const badClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: badMock.fetchImpl });
  let treeError = null;
  try {
    await badClient.listPeerMemories("hermes");
  } catch (error) {
    treeError = error;
  }
  check("树形状不认识要抛（上层记 null，不猜 0）", treeError !== null);
}

// ================= 受管运行时传输 =================

// 一个假的宿主 ctx.runtime.fetch：记下调用，回一个合规的代理信封。
function mockRuntimeFetch({ status = 200, result = { ok: true }, headers = {} } = {}) {
  const calls = [];
  const runtimeFetch = async (runtimeId, path, init) => {
    calls.push({ runtimeId, path, init });
    return new Response(
      JSON.stringify({
        status,
        headers,
        body: JSON.stringify(result),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { calls, runtimeFetch };
}

{
  // ---- 信封打包：URL / method / headers / body 都在，API Key 只在信封里 ----
  const { calls, runtimeFetch } = mockRuntimeFetch({
    result: { status: "ok", result: { rendered: "一条记忆" } },
  });
  const transport = createRuntimeTransport({ runtimeFetch, token: "tk-test", runtimeId: "rt-7", timeoutMs: 1800 });
  const client = createClient({
    serverUrl: "http://192.168.50.142:8000/",
    apiKey: "secret-key",
    peer: "mbp-hanako",
    timeoutMs: 1800,
    send: transport.sendJson,
  });

  const result = await client.recall("昨天说的那件事", { peerScope: "self", maxTokens: 800 });
  eq("运行时路径拿到 result", result, { rendered: "一条记忆" });
  eq("只经 runtime.fetch 发一次", calls.length, 1);
  eq("runtimeId 到位", calls[0].runtimeId, "rt-7");
  eq("代理路径是 /fetch", calls[0].path, "/fetch");
  eq("代理用 POST", calls[0].init.method, "POST");
  eq("代理请求头带 x-ov-token", calls[0].init.headers["x-ov-token"], "tk-test");
  eq("代理请求体是 JSON 字符串", typeof calls[0].init.body, "string");

  const envelope = JSON.parse(calls[0].init.body);
  eq("信封 url", envelope.url, "http://192.168.50.142:8000/api/v1/search/search");
  eq("信封 method", envelope.method, "POST");
  eq("信封带 API Key", envelope.headers["X-API-Key"], "secret-key");
  eq("信封带 actor peer", envelope.headers["X-OpenViking-Actor-Peer"], "mbp-hanako");
  eq("信封 body 保留字符串形态", typeof envelope.body, "string");
  eq("信封 body 里 self 映射为 actor", JSON.parse(envelope.body).peer_scope, "actor");
  eq("信封带这次连接的超时", envelope.timeoutMs, 1800);
  eq("信封带 maxBytes", envelope.maxBytes, 2_097_152);
  check(
    "API Key 不在 runtime.fetch 的请求头里",
    !JSON.stringify(calls[0].init.headers).includes("secret-key"),
    JSON.stringify(calls[0].init.headers),
  );
  check(
    "API Key 不在 runtime.fetch 的别的参数里",
    !JSON.stringify({ runtimeId: calls[0].runtimeId, path: calls[0].path }).includes("secret-key"),
  );
}

{
  // ---- 代理返回非 2xx：client 仍按 OpenViking 错误体判 ----
  const { calls, runtimeFetch } = mockRuntimeFetch({
    status: 404,
    result: { status: "error", error: { code: "NOT_FOUND", message: "no such skill" } },
  });
  const client = createClient({
    serverUrl: "http://h:1",
    apiKey: "k",
    send: createRuntimeTransport({ runtimeFetch, token: "tk-test", runtimeId: "rt-1" }).sendJson,
  });
  let caught = null;
  try {
    await client.getSkill("missing");
  } catch (error) {
    caught = String(error.message);
  }
  eq("非 2xx 只发一次", calls.length, 1);
  check("非 2xx 时抛错", caught !== null);
  check("错误体里的 code 透出来", caught?.includes("NOT_FOUND"), caught);
  check("错误体里的 message 透出来", caught?.includes("no such skill"), caught);
}

{
  // ---- 代理自己失败：错误带 code ----
  const unauthorized = async () =>
    new Response(
      JSON.stringify({ error: { code: "BAD_REQUEST", message: "x-ov-token 不匹配" } }),
      { status: 403 },
    );
  const warnings = [];
  let caught = null;
  try {
    await createRuntimeTransport({
      runtimeFetch: unauthorized,
      token: "tk-test", runtimeId: "rt-1",
      logger: { warn: (message) => warnings.push(message) },
    }).sendJson("http://h:1/health", { headers: { "X-API-Key": "secret-key" } });
  } catch (error) {
    caught = error;
  }
  eq("代理 403 抛 TransportError", caught?.name, "TransportError");
  eq("代理 403 的 code", caught?.code, "BAD_REQUEST");
  check(
    "失败日志不含 API Key",
    !warnings.join(" ").includes("secret-key"),
    warnings.join(" | "),
  );

  const bridgeBroken = async () => {
    const error = new Error("runtime not ready");
    error.code = "APP_RUNTIME_NOT_READY";
    throw error;
  };
  caught = null;
  try {
    await createRuntimeTransport({ runtimeFetch: bridgeBroken, token: "tk-test", runtimeId: "rt-1" }).sendJson(
      "http://h:1/health",
      {},
    );
  } catch (error) {
    caught = error;
  }
  eq("桥本身失败时保留宿主 code", caught?.code, "APP_RUNTIME_NOT_READY");

  const timeout = async () =>
    new Response(JSON.stringify({ error: { code: "TIMEOUT", message: "too slow" } }), {
      status: 504,
    });
  caught = null;
  try {
    await createRuntimeTransport({ runtimeFetch: timeout, token: "tk-test", runtimeId: "rt-1" }).sendJson(
      "http://h:1/health",
      {},
    );
  } catch (error) {
    caught = error;
  }
  eq("代理超时的 code", caught?.code, "TIMEOUT");
}

{
  // ---- 降级：没有运行时就用 ctx.network.fetch ----
  resetRuntimeTransport();
  const { calls, fetchImpl } = mockFetch({
    body: { status: "ok", healthy: true, version: "v0.4.16" },
  });
  const fallback = transportFor({ network: { fetch: fetchImpl } });
  eq("没有运行时回落到 direct", fallback.mode, "direct");
  eq("direct 带 fetchImpl", typeof fallback.fetchImpl, "function");

  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", ...fallback });
  eq("direct 路径仍能拿到 health", (await client.health())?.version, "v0.4.16");
  eq("direct 路径走的是原 fetch", calls.length, 1);

  eq("两条都不可用时是 down", transportFor({}).mode, "down");
  resetRuntimeTransport();
}

{
  // ---- 运行时状态：/status 的 transport 字段 ----
  const dir = path.join(import.meta.dirname, ".tmp-status-transport");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const handlers = {};
  const app = { get: (route, handler) => { handlers[route] = handler; } };
  const ctx = {
    dataDir: dir,
    config: { get: async () => undefined },
    // 不该被调用：总闸关着时 /status 必须零联网。
    network: { fetch: async () => { throw new Error("不该联网"); } },
  };
  registerStatusRoutes(app, ctx);
  const invoke = (query = {}) =>
    handlers["/status"]({
      json: (body, status) => ({ body, status }),
      req: { query: (key) => query[key] ?? "" },
    });

  // 会话 key 现在是 uuid 形态（收紧后有形状检查），fixture 跟着改成真 uuid。
  const SESSION_KEY = "01a1585b-86d2-7c64-b8ac-edbe7099d0a1";
  const MISSING_KEY = "01a1585b-86d2-7c64-b8ac-edbe7099d0a2";

  resetRuntimeTransport();
  const direct = await invoke();
  eq("没有运行时时 /status 报 direct", direct.body.transport, "direct");
  eq("总闸关着时 reach 仍是 idle", direct.body.reach, "idle");

  setRuntimeTransport({ send: async () => ({ status: 200, ok: true, data: {} }), token: "tk-test", runtimeId: "rt-9" });
  const viaRuntime = await invoke();
  eq("运行时就绪时 /status 报 runtime", viaRuntime.body.transport, "runtime");

  resetRuntimeTransport();
  const down = await invoke();
  eq("没有 ctx.network 时是 down", transportFor({}).mode, "down");
  check("降级后 direct 仍可用", down.body.transport === "direct");

  // ---- peer 与 peerSource：拿不到就用 null，不拿别的会话顶上 ----
  const noSession = await invoke();
  eq("无会话时 peer 为 null", noSession.body.peer, null);
  eq("无会话时来源是 unbound", noSession.body.peerSource, "unbound");

  patchSession(dir, SESSION_KEY, { agentDir: "agent-z" });
  const withSession = await invoke({ session: SESSION_KEY });
  eq("?session= 时 peer 跟着会话走", withSession.body.peer, "openhanako-agent-z");
  eq("?session= 时来源是 session", withSession.body.peerSource, "session");

  const unknown = await invoke({ session: MISSING_KEY });
  eq("未记过身份的会话给 null", unknown.body.peer, null);
  eq("未记过身份的会话不借用别会话", unknown.body.peerSource, "unbound");

  // ---- 会话 key 统一：路径能定位到会话，sess_… 稳定 id 只看作"没带会话" ----
  const byPath = await invoke({
    session: `/Users/u/.hanako/agents/agent-z/sessions/2026-10-20T08-09-15-730Z_${SESSION_KEY}.jsonl`,
  });
  eq("?session= 接受会话路径", byPath.body.peer, "openhanako-agent-z");
  eq("?session= 接路径时来源是 session", byPath.body.peerSource, "session");

  const stableId = await invoke({ session: "sess_0mvgejpps_97df7c693a452f408c2c" });
  eq("sess_ 形式的会话给 null", stableId.body.peer, null);
  eq("sess_ 形式的会话来源是 unbound", stableId.body.peerSource, "unbound");
  eq(
    "sess_ 形式不造状态文件",
    fs.existsSync(path.join(dir, "sessions", "sess_0mvgejpps_97df7c693a452f408c2c.json")),
    false,
  );

  // 合并时 /status 也能看到“其实是哪个助手”。
  registerStatusRoutes(app, {
    ...ctx,
    config: { get: async (key) => ({ mergeMemory: true })[key] },
  });
  const mergedStatus = await invoke({ session: SESSION_KEY });
  eq("合并时 /status 的来源是 merged", mergedStatus.body.peerSource, "merged");
  eq("合并时 /status 也带出助手名", mergedStatus.body.peerAgentDir, "agent-z");

  resetRuntimeTransport();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= routes: /ready 归一化 =================
{
  const dir = path.join(import.meta.dirname, ".tmp-status-ready");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const handlers = {};
  const app = { get: (route, handler) => { handlers[route] = handler; } };

  // 用户截图里服务端的真实形态：字符串与对象混在一份 checks 里。
  const readyBody = {
    status: "ok",
    healthy: true,
    checks: {
      agfs: {
        status: "ok",
        checks: { storage: "ok", index: { status: "down" } },
      },
      vectordb: "ok",
      api_key_manager: "ok",
      embedding: "ok",
      ollama: "not_configured",
      weird: { detail: 1 },
    },
  };
  const fetchImpl = async (url) => {
    const body = url.endsWith("/ready")
      ? readyBody
      : { status: "ok", healthy: true, version: "v0.4.16" };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const ctx = {
    dataDir: dir,
    config: {
      get: async (key) =>
        ({ enabled: true, serverUrl: "http://h:1", apiKey: "k" })[key],
    },
    network: { fetch: fetchImpl },
  };

  resetRuntimeTransport();
  registerStatusRoutes(app, ctx);
  const status = await handlers["/status"]({
    json: (body, code) => ({ body, status: code }),
    req: { query: () => "" },
  });
  const checks = status.body.ready?.checks;

  check("/ready 的 checks 归一化成数组", Array.isArray(checks), JSON.stringify(checks));
  eq("/ready 字符串形态读成 status", checks.find((c) => c.name === "vectordb"), {
    name: "vectordb",
    status: "ok",
  });
  eq("not_configured 原样保留（不归成坏）", checks.find((c) => c.name === "ollama"), {
    name: "ollama",
    status: "not_configured",
  });
  eq("对象形态的 status 读得对", checks.find((c) => c.name === "agfs")?.status, "ok");
  eq("对象形态保留 details 且递归归一化", checks.find((c) => c.name === "agfs")?.details, [
    { name: "storage", status: "ok" },
    { name: "index", status: "down" },
  ]);
  eq("没写 status 的对象算 unknown", checks.find((c) => c.name === "weird"), {
    name: "weird",
    status: "unknown",
  });
  eq("checks 条数一条不少", checks.length, 6);
  eq("/ready 其余字段原样保留", status.body.ready.status, "ok");
  eq("ready 仍挂在 report 上", status.body.reach, "ok");

  // ---- 工具与 /status 读同一份 /ready：checks 的形状必须一模一样 ----
  // 同一份 readyBody 过两处：/status 刚从上面过完，工具用同一个 fetchImpl 重走一遍。
  const toolReport = await buildStatusReport(
    {
      dataDir: dir,
      config: { get: async (key) => ({ enabled: true, serverUrl: "http://h:1", apiKey: "k" })[key] },
      network: { fetch: fetchImpl },
    },
    {},
  );
  eq("工具与 /status 的 ready.checks 形状一致", toolReport.ready.checks, checks);
  eq("工具也走同一个归一化（不交服务端原始 map）", Array.isArray(toolReport.ready.checks), true);
  eq(
    "agfs 的 details 在工具里也是归一化后的数组",
    toolReport.ready.checks.find((c) => c.name === "agfs")?.details,
    [
      { name: "storage", status: "ok" },
      { name: "index", status: "down" },
    ],
  );
  // 归一化本身：details 与父项同形状，未知值不静默消失。
  eq("normalizeChecks 对付 undefined 给空数组", normalizeChecks(undefined), []);
  eq("normalizeReady 对非对象原样返回", normalizeReady(null), null);

  // ---- check 状态 -> 颜色档位：灰 = 不算坏，其余（含未知）都红 ----
  eq("ok 是绿", uiStatusTone("ok"), "ok");
  eq("not_configured 是灰", uiStatusTone("not_configured"), "muted");
  eq("not_supported 是灰", uiStatusTone("not_supported"), "muted");
  eq("disabled 是灰", uiStatusTone("disabled"), "muted");
  eq("error 是红", uiStatusTone("error"), "bad");
  eq("down 是红", uiStatusTone("down"), "bad");
  eq("failed 是红", uiStatusTone("failed"), "bad");
  eq("未知值是红", uiStatusTone("who_knows"), "bad");
  eq("空值是红", uiStatusTone(undefined), "bad");
  eq("multiwrite_sync 修完是灰不是红", uiStatusTone("not_supported"), "muted");

  resetRuntimeTransport();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= ui: 服务端检查项摘要 =================
{
  const checksOf = (statuses) =>
    statuses.map(([name, status]) => ({ name, status }));
  const allOk = checksOf([
    ["agfs", "ok"],
    ["vectordb", "ok"],
    ["api_key_manager", "ok"],
    ["embedding", "ok"],
    ["ollama", "ok"],
  ]);

  const green = uiSummarizeChecks(allOk);
  eq("五项全好写 5/5", green.text, "服务端就绪 5/5");
  eq("五项全好是绿档", green.tone, "ok");
  eq("五项全好没有问题项（全绿不列明细）", green.problems, []);
  eq("五项全好计数 5/5", [green.ok, green.total], [5, 5]);

  // 只差 ollama：摘要只说比例，项名交给下面那份问题列表。
  const oneMissing = allOk.map((check) =>
    check.name === "ollama" ? { ...check, status: "not_configured" } : check,
  );
  const lenient = uiSummarizeChecks(oneMissing);
  eq("缺一项写 4/5，不把项名重复进摘要行", lenient.text, "服务端 4/5 就绪");
  eq("摘要行里不出现项名", lenient.text.includes("ollama"), false);
  eq("只是没配是灰档不是红档", lenient.tone, "muted");
  eq("缺一项仍数出 4", [lenient.ok, lenient.total], [4, 5]);
  eq("待办项带名字与状态词", lenient.problems, [
    { name: "ollama", status: "not_configured", label: "未配置" },
  ]);

  // 有 error：措辞用「异常」而不是蛇形枚举。
  const broken = allOk.map((check) =>
    check.name === "ollama" ? { ...check, status: "error" } : check,
  );
  const red = uiSummarizeChecks(broken);
  eq("error 写进问题项而不是摘要行", red.text, "服务端 4/5 就绪");
  eq("有 error 是红档", red.tone, "bad");
  eq("error 的项名为 ollama 且念「异常」", red.problems, [
    { name: "ollama", status: "error", label: "异常" },
  ]);

  // 两项不对：两项都列，ok 项不出现。
  const twoBad = allOk.map((check) =>
    check.name === "vectordb"
      ? { ...check, status: "down" }
      : check.name === "ollama"
        ? { ...check, status: "not_configured" }
        : check,
  );
  const twoBadSummary = uiSummarizeChecks(twoBad);
  eq("多项不对时摘要只报比例", twoBadSummary.text, "服务端 3/5 就绪");
  eq("只列不对的那两项，顺序跟服务端一致", twoBadSummary.problems, [
    { name: "vectordb", status: "down", label: "异常" },
    { name: "ollama", status: "not_configured", label: "未配置" },
  ]);
  eq("ok 项不进问题列表", twoBadSummary.problems.some((p) => p.status === "ok"), false);
  eq(
    "问题列表条数 = 总数 − ok 数",
    twoBadSummary.problems.length,
    twoBadSummary.total - twoBadSummary.ok,
  );

  // 分母只数顶层：agfs 的 details 是脚注，不该把 5/5 变成 7/7。
  const nested = [
    {
      name: "agfs",
      status: "ok",
      details: [
        { name: "storage", status: "ok" },
        { name: "index", status: "down" },
      ],
    },
    { name: "vectordb", status: "ok" },
  ];
  const nestedSummary = uiSummarizeChecks(nested);
  eq("details 不参与分母", [nestedSummary.ok, nestedSummary.total], [2, 2]);
  eq("details 里的 down 不改父项措辞", nestedSummary.text, "服务端就绪 2/2");
  eq("details 里的 down 不进问题列表", nestedSummary.problems, []);
  eq("details 里的 down 不把档位拖红", nestedSummary.tone, "ok");

  // 没读到检查项（未启用 / ready 挂了）：有话说，但不假装 0/0 是好消息。
  const empty = uiSummarizeChecks([]);
  eq("空 checks 不写成 0/0", empty.text, "服务端检查项未知");
  eq("空 checks 没有问题项", empty.problems, []);
  eq("非数组也当空处理", uiSummarizeChecks(undefined).text, "服务端检查项未知");

  // 状态词映射：除了 ok，全念中文；认不出来的状态念「异常」。
  eq("ok 的状态词", uiCheckStatusLabel("ok"), "就绪");
  eq("not_configured 的状态词", uiCheckStatusLabel("not_configured"), "未配置");
  eq("not_supported 的状态词", uiCheckStatusLabel("not_supported"), "不支持");
  eq("disabled 的状态词", uiCheckStatusLabel("disabled"), "已禁用");
  eq("error 的状态词", uiCheckStatusLabel("error"), "异常");
  eq("未知状态的状态词", uiCheckStatusLabel("who_knows"), "异常");
  eq("空状态的状态词", uiCheckStatusLabel(undefined), "异常");
}

// ================= ui: 面板结构（静态） =================
{
  const read = (name) => fs.readFileSync(path.join(import.meta.dirname, "../ui", name), "utf8");
  const html = read("panel.html");
  const css = read("assets/panel.css").replace(/\/\*[\s\S]*?\*\//g, "");

  const colsStart = html.indexOf('<section class="cols">');
  const colsEnd = html.indexOf("</section>", colsStart);
  const peerIdx = html.indexOf('id="peerList"');
  const peerCountIdx = html.indexOf('id="peerCount"');
  const logsIdx = html.indexOf('<section class="card logs"');
  const summaryIdx = html.indexOf('id="checksSummary"');
  check("两栏与日志区都找得到", colsStart > 0 && colsEnd > colsStart && logsIdx > colsEnd);
  check("peer 列表不在中枢卡 / 两栏里", peerIdx > colsEnd, `peerIdx=${peerIdx} colsEnd=${colsEnd}`);
  check("peer 计数也跟着搬出两栏", peerCountIdx > colsEnd);
  check("peer 栏在两栏之后、日志之前", peerIdx < logsIdx);
  check("摘要行留在中枢卡里", summaryIdx > colsStart && summaryIdx < colsEnd);
  check("中枢卡里不再有 peer 列表", html.slice(colsStart, colsEnd).indexOf('id="peerList"') === -1);

  const ruleFor = (selector) => {
    const index = css.indexOf(`${selector} {`);
    if (index < 0) return null;
    const open = css.indexOf("{", index);
    const end = css.indexOf("}", open);
    return { index, body: css.slice(open + 1, end) };
  };
  const checksRule = ruleFor(".checks");
  const summaryRule = ruleFor(".checks-summary");
  check("明细列表的规则还在", checksRule !== null);
  check(
    "明细改成竖向一行一项（不再是横排胶囊）",
    /display\s*:\s*grid/.test(checksRule?.body || "") &&
      !/flex-wrap\s*:\s*wrap/.test(checksRule?.body || ""),
    checksRule?.body || "",
  );
  check("摘要行的规则在", summaryRule !== null);

  // 全绿时只是一行静态文字：不是按钮、不可点、没有箭头。
  const summaryTag = html.slice(0, summaryIdx).lastIndexOf("<");
  const summaryLine = html.slice(summaryTag, html.indexOf(">", summaryIdx) + 1);
  check("摘要行不是 button", summaryLine.includes("<button") === false, summaryLine);
  check("摘要行没有 aria-expanded", html.includes("aria-expanded") === false);
  check("摘要行不可点", /cursor\s*:\s*pointer/.test(summaryRule?.body || "") === false,
    summaryRule?.body || "");
  check("摘要行没有箭头伪元素", css.includes(".checks-summary::before") === false);
  check("箭头字符已经不在了", css.includes("▸") === false && css.includes("▾") === false);
  check("折叠状态的 open 类不再用", css.includes(".checks-summary.open") === false);
  const statusRule = ruleFor(".checks li .check-status");
  check("状态词规则在", statusRule !== null);
  check(
    "状态词不叠 opacity（父项 li 已经半透，再乘一层就看不见了）",
    /opacity/.test(statusRule?.body || "") === false,
    statusRule?.body || "",
  );
  check("状态词前有分隔点", /content\s*:\s*"·\\20"|content\s*:\s*"·\s/.test(
    ruleFor(".checks li .check-status::before")?.body || "",
  ));

  // hidden 的兜底：display:grid / flex 不能再把 hidden 顶掉。
  const hiddenRule = ruleFor(".page [hidden]");
  check("hidden 兜底规则在", hiddenRule !== null);
  check(
    "hidden 兜底是 display:none !important",
    /display\s*:\s*none\s*!important/.test(hiddenRule?.body || ""),
    hiddenRule?.body || "",
  );
  check(
    "hidden 兜底在 .checks 之前（先定规矩）",
    (hiddenRule?.index ?? Infinity) < (checksRule?.index ?? -1),
  );
}

// ================= routes: peers =================
{
  const handlers = { get: {}, post: {} };
  const app = {
    get: (route, handler) => { handlers.get[route] = handler; },
    post: (route, handler) => { handlers.post[route] = handler; },
  };
  const reply = (body, status) => ({ body, status });
  const invokeGet = () => handlers.get["/peers"]({ json: reply });
  const invokePost = (payload) =>
    handlers.post["/peers"]({ json: reply, req: { json: async () => payload } });

  // 配置 mock：set 记下写入，get 读回写后的值，这样 POST 返回的投影能反映真实状态。
  function ctxWith(values = {}, fetchImpl, writeLog = []) {
    const store = { ...values };
    return {
      config: {
        get: async (key) => store[key],
        set: async (key, value) => {
          writeLog.push([key, value]);
          store[key] = value;
        },
      },
      network: {
        fetch: fetchImpl || (async () => {
          throw new Error("不该联网");
        }),
      },
    };
  }

  resetRuntimeTransport();

  // ---- 总闸关着：不联网，空列表 + disabled ----
  let calls = 0;
  registerPeersRoutes(
    app,
    ctxWith({ enabled: false, serverUrl: "http://h:1", apiKey: "k" }, async () => {
      calls += 1;
      throw new Error("不该联网");
    }),
  );
  const off = await invokeGet();
  eq("总闸关时不联网", calls, 0);
  eq("总闸关时 ok 仍为 true", off.body.ok, true);
  eq("总闸关时 peers 为空", off.body.peers, []);
  eq("总闸关时 reason 是 disabled", off.body.reason, "disabled");
  eq("总闸关时 HTTP 200", off.status, 200);

  // ---- 正常：按本机前缀标 self，excluded 与配置一致 ----
  const listedFetch = mockFetch({
    body: {
      status: "ok",
      result: [
        "viking://user/default/peers/desktop-openhanako-blueflower",
        "viking://user/default/peers/hermes",
        "viking://user/default/peers/dsh-desktop",
      ],
    },
  });
  const writes = [];
  registerPeersRoutes(
    app,
    ctxWith(
      {
        enabled: true,
        serverUrl: "http://h:1",
        apiKey: "k",
        peerPrefix: "desktop",
        // 存量配置带大写与空格：按大小写原样保留，只有精确同名才算排除。
        excludedPeers: " hermes , DSH-desktop ,, hermes ",
      },
      listedFetch.fetchImpl,
      writes,
    ),
  );
  const listed = await invokeGet();
  eq("正常时 ok", listed.body.ok, true);
  eq("正常时 HTTP 200", listed.status, 200);
  eq("自己的 peer 标 self", listed.body.peers[0], {
    name: "desktop-openhanako-blueflower",
    self: true,
    excluded: false,
    // listedFetch 对任何 URL 都回同一份 peer 列表（字符串数组），
    // 树里没有 isDir === false 的 .md 节点，所以是 0 条，不是 3 条。
    count: 0,
    countCapped: false,
  });
  eq("别的 peer 不标 self", listed.body.peers[1], {
    name: "hermes",
    self: false,
    excluded: true,
    count: 0,
    countCapped: false,
  });
  eq("GET 的 excluded 标记与配置一致", listed.body.peers.map((p) => p.excluded), [
    false,
    true,
    false,
  ]);

  // ---- POST 非法项：整单 400，config.set 一次都不调 ----
  const invalidCases = [
    ["缺 excluded", {}],
    ["不是数组", { excluded: "hermes" }],
    ["空串项", { excluded: [""] }],
    ["路径穿越", { excluded: ["../etc"] }],
    ["非字符串项", { excluded: [1] }],
    ["超长项", { excluded: ["a".repeat(65)] }],
    ["超过 50 项", { excluded: Array.from({ length: 51 }, (_, i) => `p${i}`) }],
  ];
  for (const [label, payload] of invalidCases) {
    const before = writes.length;
    const bad = await invokePost(payload);
    eq(`POST 非法项（${label}）HTTP 400`, bad.status, 400);
    eq(`POST 非法项（${label}）ok false`, bad.body.ok, false);
    check(`POST 非法项（${label}）给中文错误`, /[\u4e00-\u9fa5]/.test(bad.body.error || ""), bad.body.error);
    eq(`POST 非法项（${label}）不写配置`, writes.length, before);
  }

  // ---- POST 合法：写入逗号串，返回实际存下的名单（不读中枢） ----
  const saved = await invokePost({ excluded: ["hermes", "dsh-desktop"] });
  eq("POST 合法项写入逗号串", writes.at(-1), ["excludedPeers", "hermes,dsh-desktop"]);
  eq("POST 返回 ok", saved.body.ok, true);
  eq("POST 返回存下的名单", saved.body.excluded, ["hermes", "dsh-desktop"]);
  check("POST 返回体不带 peers 数组", !("peers" in saved.body), JSON.stringify(saved.body));

  const cleared = await invokePost({ excluded: [] });
  eq("空数组清空名单", writes.at(-1), ["excludedPeers", ""]);
  eq("清空后返回空名单", cleared.body.excluded, []);

  // ---- 写路径不读列表：中枢不可达时 POST 仍成功，且不返回 peers ----
  const downWrites = [];
  registerPeersRoutes(
    app,
    ctxWith(
      { enabled: true, serverUrl: "http://h:1", apiKey: "k" },
      async () => {
        throw new Error("ETIMEDOUT");
      },
      downWrites,
    ),
  );
  const downPost = await invokePost({ excluded: ["Hermes"] });
  eq("中枢不可达时 POST HTTP 200", downPost.status, 200);
  eq("中枢不可达时 POST ok", downPost.body.ok, true);
  eq("中枢不可达时 POST 仍写配置", downWrites.at(-1), ["excludedPeers", "Hermes"]);
  eq("中枢不可达时 POST 返回存下的名单", downPost.body.excluded, ["Hermes"]);
  check(
    "中枢不可达时 POST 不带 peers 数组",
    !("peers" in downPost.body),
    JSON.stringify(downPost.body),
  );
  const downGet = await invokeGet();
  eq("中枢不可达时 GET 仍如实报错", downGet.body.ok, false);

  // 传输层整个不可用（没有出口）同样不影响写。
  const noExitWrites = [];
  const noExit = ctxWith(
    { enabled: true, serverUrl: "http://h:1", apiKey: "k" },
    undefined,
    noExitWrites,
  );
  delete noExit.network;
  registerPeersRoutes(app, noExit);
  const noExitPost = await invokePost({ excluded: ["hermes"] });
  eq("无网络出口时 POST ok", noExitPost.body.ok, true);
  eq("无网络出口时 POST 仍写配置", noExitWrites.at(-1), ["excludedPeers", "hermes"]);

  // ---- 大小写按中枢原样名匹配：POST Hermes -> GET 认出 Hermes ----
  const caseWrites = [];
  const caseFetch = mockFetch({
    body: {
      status: "ok",
      result: [
        "viking://user/default/peers/Hermes",
        "viking://user/default/peers/hermes",
      ],
    },
  });
  registerPeersRoutes(
    app,
    ctxWith(
      { enabled: true, serverUrl: "http://h:1", apiKey: "k" },
      caseFetch.fetchImpl,
      caseWrites,
    ),
  );
  const mixed = await invokePost({ excluded: ["Hermes"] });
  eq("POST 大写 peer HTTP 200", mixed.status, 200);
  eq("POST 大写 peer 写入原样", caseWrites.at(-1), ["excludedPeers", "Hermes"]);
  eq("POST 大写 peer 返回原样名单", mixed.body.excluded, ["Hermes"]);
  const mixedGet = await invokeGet();
  eq("GET 按原样名命中大写 peer", mixedGet.body.peers.map((p) => p.excluded), [
    true,
    false,
  ]);
  eq(
    "POST 重复项按大小写精确去重",
    (await invokePost({ excluded: ["Hermes", "hermes", "Hermes"] })).body.excluded,
    ["Hermes", "hermes"],
  );

  // ---- 空前缀：openhanako- 开头就算本机 ----
  const noPrefixFetch = mockFetch({
    body: { status: "ok", result: ["viking://user/default/peers/openhanako-hanako"] },
  });
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, noPrefixFetch.fetchImpl),
  );
  const noPrefix = await invokeGet();
  eq("空前缀按 openhanako- 认本机", noPrefix.body.peers[0].self, true);

  // ---- 传输失败：不抛，错误原文进 body ----
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, async () => {
      throw new Error("ETIMEDOUT");
    }),
  );
  let threw = null;
  let failed;
  try {
    failed = await invokeGet();
  } catch (error) {
    threw = error;
  }
  eq("传输失败不抛", threw, null);
  eq("传输失败 ok 为 false", failed.body.ok, false);
  check("传输失败带错误原文", failed.body.error.includes("ETIMEDOUT"), failed.body.error);
  eq("传输失败 HTTP 200", failed.status, 200);

  // ---- count：fs/tree 拉平子树，只数 .md 文件 ----------------
  // memories 下面是类别目录（还可能带子目录），真正的记忆是 .md 文件。
  const peerDirs = [
    "viking://user/default/peers/alpha",
    "viking://user/default/peers/beta",
  ];
  const json = (result) =>
    new Response(JSON.stringify({ status: "ok", result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const uriOf = (url) => new URL(url).searchParams.get("uri");
  const memoriesUris = ["alpha", "beta"].map(
    (name) => `viking://user/default/peers/${name}/memories`,
  );
  const node = (rel, isDir) => ({
    uri: `viking://user/default/peers/x/memories/${rel}`,
    size: isDir ? 0 : 900,
    isDir,
    modTime: "2026-01-01T00:00:00Z",
    rel_path: rel,
    abstract: "",
  });
  const dirNode = (rel) => node(rel, true);
  const mdNode = (rel) => node(rel, false);

  // 正常：alpha 的树是 3 个目录 + 4 个 md + 1 个非 md 文件 -> 4 条；beta 空 -> 0 条。
  // 0 是数字，不是 null；目录与非 md 文件一律不算记忆。
  const alphaTree = [
    dirNode("cases"),
    dirNode("entities"),
    dirNode("entities/project"),
    mdNode("cases/mem_a.md"),
    mdNode("entities/project/mem_b.md"),
    mdNode("events/2026/mem_c.md"),
    mdNode("patterns/mem_d.md"),
    node("preferences/notes.txt", false),
  ];
  const seen = [];
  const seenUrls = [];
  const okCountFetch = async (url) => {
    const uri = uriOf(url);
    seen.push(uri);
    seenUrls.push(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    if (uri === memoriesUris[0]) return json(alphaTree);
    return json([]);
  };
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, okCountFetch),
  );
  const counted = await invokeGet();
  eq("count 只数 .md 文件（3 个目录 + 4 个 md + 1 个 txt）", counted.body.peers.map((p) => p.count), [
    4,
    0,
  ]);
  eq("没达到 node_limit 时 countCapped 为 false", counted.body.peers.map((p) => p.countCapped), [
    false,
    false,
  ]);
  eq(
    "count 读的是各 peer 的 memories 树",
    seen.filter((uri) => uri.endsWith("/memories")).sort(),
    memoriesUris,
  );
  const treeUrl = new URL(seenUrls.find((url) => url.includes("/api/v1/fs/tree")));
  eq("count 走 fs/tree", treeUrl.pathname, "/api/v1/fs/tree");
  eq("fs/tree 要 agent 输出", treeUrl.searchParams.get("output"), "agent");
  eq("fs/tree 的 level_limit", treeUrl.searchParams.get("level_limit"), "5");
  eq("fs/tree 的 node_limit", treeUrl.searchParams.get("node_limit"), "500");

  // 真机基准：memories 下 6 个类别目录，记忆落在类别里（events 3 条、cases 2 条，其余类别没 md）。
  // 形状按真机形态造，不是线上真实条数——真实条数会变，别写死具体数字如 79。
  const sixCategoryTree = [
    dirNode("cases"),
    dirNode("entities"),
    dirNode("events"),
    dirNode("patterns"),
    dirNode("preferences"),
    dirNode("profile"),
    mdNode("events/mem_a.md"),
    mdNode("events/mem_b.md"),
    mdNode("events/mem_c.md"),
    mdNode("cases/mem_d.md"),
    mdNode("cases/mem_e.md"),
  ];
  const baselineFetch = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    if (uri === memoriesUris[0]) return json(sixCategoryTree);
    return json([]);
  };
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, baselineFetch),
  );
  const baseline = await invokeGet();
  eq("6 个类别目录的树 count 是 5（只数 .md）", baseline.body.peers[0].count, 5);
  eq("6 个类别目录的树 countCapped 为 false", baseline.body.peers[0].countCapped, false);

  // 节点数恰好等于 node_limit：上限从请求 URL 的 node_limit 里取，不写死 500。
  // 目录占一半、md 占另一半，总数正好等于上限 -> capped true。
  // 只断言 countCapped，具体条数随上限走，不写死。
  const exactTree = (limit) => {
    const dirs = Math.max(1, Math.floor(limit / 2));
    const mds = Math.max(0, limit - dirs);
    return [
      ...Array.from({ length: dirs }, (_, i) => dirNode(`d${i}`)),
      ...Array.from({ length: mds }, (_, i) => mdNode(`d${i % dirs}/mem_${i}.md`)),
    ];
  };
  const cappedFetch = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    if (uri === memoriesUris[0]) {
      const limit = Number(new URL(url).searchParams.get("node_limit"));
      return json(exactTree(limit));
    }
    return json([]);
  };
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, cappedFetch),
  );
  const capped = await invokeGet();
  eq("节点数恰好到 node_limit 时 countCapped 为 true", capped.body.peers[0].countCapped, true);
  eq("没到上限的 peer 仍为 false", capped.body.peers[1].countCapped, false);

  // 单个失败：beta 回 500，整张列表仍然 ok，beta 的 count 是 null、capped false。
  const partlyBroken = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    if (uri === memoriesUris[0]) return json([mdNode("cases/only-one.md")]);
    return new Response(
      JSON.stringify({ status: "error", error: { code: "INTERNAL", message: "boom" } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  };
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, partlyBroken),
  );
  const partly = await invokeGet();
  eq("单个读失败不拖垮整单", partly.body.ok, true);
  eq("单个失败给 null，好的那个照常给数字", partly.body.peers.map((p) => p.count), [1, null]);
  eq("单个失败时 countCapped 为 false", partly.body.peers.map((p) => p.countCapped), [
    false,
    false,
  ]);

  // 形状不认识（result 不是数组）：同样算读不到，不猜成 0。
  const oddTree = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    if (uri === memoriesUris[0]) return json({ entries: [] });
    return json([]);
  };
  registerPeersRoutes(
    app,
    ctxWith({ enabled: true, serverUrl: "http://h:1", apiKey: "k" }, oddTree),
  );
  const odd = await invokeGet();
  eq("树形状不认识时 count 是 null（不猜成 0）", odd.body.peers[0].count, null);
  eq("树形状不认识时整单仍 ok", odd.body.ok, true);

  // 并行：两个 memories 请求必须同时在路上。串行时第一个会等到超时（null）。
  let started = 0;
  let release = () => {};
  const bothStarted = new Promise((resolve) => { release = resolve; });
  const barrierFetch = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    started += 1;
    if (started >= 2) release();
    await bothStarted;
    return json([mdNode("cases/mem.md")]);
  };
  registerPeersRoutes(
    app,
    ctxWith(
      { enabled: true, serverUrl: "http://h:1", apiKey: "k", requestTimeoutMs: 400 },
      barrierFetch,
    ),
  );
  const parallel = await invokeGet();
  eq("两个 peer 的记忆是并行读的", parallel.body.peers.map((peer) => peer.count), [1, 1]);

  // 整体超时：memories 永不落（连 AbortSignal 都不理），到点全部 null、capped false。
  const hangFetch = async (url) => {
    const uri = uriOf(url);
    if (uri === "viking://user/default/peers") return json(peerDirs);
    return new Promise(() => {});
  };
  registerPeersRoutes(
    app,
    ctxWith(
      { enabled: true, serverUrl: "http://h:1", apiKey: "k", requestTimeoutMs: 120 },
      hangFetch,
    ),
  );
  const timedOut = await invokeGet();
  eq("整体超时时 count 是 null", timedOut.body.peers.map((peer) => peer.count), [null, null]);
  eq("整体超时时 countCapped 为 false", timedOut.body.peers.map((p) => p.countCapped), [
    false,
    false,
  ]);
  eq("整体超时不拖垮整单", timedOut.body.ok, true);

  resetRuntimeTransport();
}

{
  // ---- hidden 与 display 的相克 ----
  // `[hidden]` 的 `display:none` 来自 UA 样式表，优先级最低；元素自己写一条
  // `display: grid` 就能把它顶掉，于是「隐藏」的列表照旧占位。
  // 现在统一用一条 `.page [hidden] { display:none !important }` 兑底，
  // 并发验两个前提：.checks 确实是 display:grid（所以当初会被顶掉），
  // 且兑底规则的取值不会被后面的规则反向覆盖。
  const css = fs
    .readFileSync(path.join(import.meta.dirname, "../ui/assets/panel.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleFor = (selector) => {
    const index = css.indexOf(`${selector} {`);
    if (index < 0) return null;
    const open = css.indexOf("{", index);
    const end = css.indexOf("}", open);
    return { index, body: css.slice(open + 1, end) };
  };
  const guard = ruleFor(".page [hidden]");
  check("检查项列表确实是 display:grid（当初被顶掉的原因）",
    /display\s*:\s*grid/.test(ruleFor(".checks")?.body || ""));
  check("兑底规则存在", guard !== null);
  check("兑底规则带 !important", /!important/.test(guard?.body || ""));
  check(
    "兑底规则在 .checks 之前（不会被后写规则覆盖）",
    (guard?.index ?? Infinity) < (ruleFor(".checks")?.index ?? -1),
  );
  // 旧的嵌套 details 样式已经随渲染方式一起删掉，不该再有死规则。
  check("没有嵌套 details 的死规则", css.includes(".checks li > ul") === false);
}

{
  // ---- 服务端参数与信封校验（纯函数） ----
  eq("缺省端口", parseArgs([]).port, 47821);
  eq("argv 里的端口", parseArgs(["--port=5000"]).port, 5000);
  eq("argv 里的 token", parseArgs(["--token=abc"]).token, "abc");

  const ok = normalizeEnvelope({
    url: "http://192.168.50.142:8000/health",
    method: "get",
    headers: { Host: "evil", "X-API-Key": "k", "Content-Length": "9" },
    timeoutMs: 999999,
  });
  eq("协议保留", ok.url.protocol, "http:");
  eq("method 转大写", ok.method, "GET");
  eq("逐跳头被剥掉", ok.headers.host, undefined);
  eq("Content-Length 被剥掉", ok.headers["content-length"], undefined);
  eq("自定义头保留", ok.headers["x-api-key"], "k");
  eq("超时上限 30000", ok.timeoutMs, 30000);
  eq("maxBytes 缺省", ok.maxBytes, 2_097_152);
  eq("缺省 method", normalizeEnvelope({ url: "https://h/x" }).method, "GET");

  let rejected = null;
  try {
    normalizeEnvelope({ url: "file:///etc/passwd" });
  } catch (error) {
    rejected = error;
  }
  eq("非 http/https 被拒", rejected?.code, "BAD_REQUEST");

  rejected = null;
  try {
    normalizeEnvelope({ url: "http://h/x", body: { not: "string" } });
  } catch (error) {
    rejected = error;
  }
  eq("非字符串 body 被拒", rejected?.code, "BAD_REQUEST");
}

// ================= identity =================
{
  const p = "/Users/u/.hanako/agents/agent-muewpt9i/sessions/2026-10-19T02-41.jsonl";
  eq("从会话路径取 agentDir", agentDirFromSessionPath(p), "agent-muewpt9i");
  eq(
    "Windows 反斜杠路径也认",
    agentDirFromSessionPath("C:\\Users\\u\\.hanako\\agents\\agent-w\\sessions\\a.jsonl"),
    "agent-w",
  );
  eq("无前缀", resolvePeer({ peerPrefix: "" }, p), "openhanako-agent-muewpt9i");
  eq("有前缀", resolvePeer({ peerPrefix: "mbp" }, p), "mbp-openhanako-agent-muewpt9i");
  eq("合并记忆", resolvePeer({ peerPrefix: "mbp", mergeMemory: true }, p), "mbp-openhanako-merged");
  eq("未绑定时不冒充产品名", resolvePeer({}, null), null);
  eq("有前缀但不知助手也不冒充", resolvePeer({ peerPrefix: "mbp" }, null), null);
  eq("composePeer 空 agentDir 返回 null", composePeer({}, ""), null);
  check(
    "合并永远不等于未绑定",
    resolvePeer({ mergeMemory: true }, null) !== composePeer({ peerPrefix: "" }, ""),
  );
  eq("未绑定不是产品名", resolvePeer({ mergeMemory: false }, null) === "openhanako", false);
  eq("不同助手不撞名", composePeer({}, "blueflower") !== composePeer({}, "hanako"), true);
  eq("归一化后为空的 agentDir 也算未绑定", composePeer({}, "主力机"), null);

  // ---- 路径片段校验：不是单一目录名就当场拒绝 ----
  eq("拒绝 . 段", agentDirFromSessionPath("/a/agents/./sessions/x.jsonl"), "");
  eq("拒绝 .. 段", agentDirFromSessionPath("/a/agents/../sessions/x.jsonl"), "");
  eq("拒绝空段", agentDirFromSessionPath("/a/agents//sessions/x.jsonl"), "");
  eq("没有 agents/sessions 结构就当未绑定", agentDirFromSessionPath("/a/agents/x/other/x.jsonl"), "");

  // ---- 子会话：.../agents/<dir>/subagent-sessions/direct/<file>.jsonl ----
  const sub = "/home/u/.hanako/agents/blueflower/subagent-sessions/direct/a.jsonl";
  eq("子会话也解析出 agentDir", agentDirFromSessionPath(sub), "blueflower");
  eq(
    "子会话 Windows 反斜杠路径也认",
    agentDirFromSessionPath("C:\\Users\\u\\.hanako\\agents\\blueflower\\subagent-sessions\\direct\\a.jsonl"),
    "blueflower",
  );
  eq(
    "子会话结构对但目录名是 .. 仍然拒绝",
    agentDirFromSessionPath("/a/agents/../subagent-sessions/direct/x.jsonl"),
    "",
  );
  eq("会话根后面没有内容就拒绝", agentDirFromSessionPath("/a/agents/x/sessions/"), "");
  eq("子会话在端到端上算绑定", resolvePeer({}, sub), "openhanako-blueflower");

  // ---- 门牌前缀归一化：非法字符不能进 HTTP 头 ----
  eq("中文前缀归一到空", normalizePrefix("主力机"), "");
  eq("空格 + 大写归一化", normalizePrefix(" My MBP "), "my-mbp");
  eq("去尾部连字符", normalizePrefix("mbp-"), "mbp");
  eq(
    "非法前缀不会拼出非法头值",
    composePeer({ peerPrefix: "主力机" }, "blueflower"),
    "openhanako-blueflower",
  );

  // ---- peerAgentDir：合并把“是哪个助手”盖住了，得能单独看到 ----
  eq("绑定时也带归一化后的助手名", describePeer({}, "agent-z").peerAgentDir, "agent-z");
  const mergedDescribed = describePeer({ mergeMemory: true }, "BlueFlower");
  eq("合并时来源仍是 merged", mergedDescribed.peerSource, "merged");
  eq("合并时仍能看到是哪个助手", mergedDescribed.peerAgentDir, "blueflower");
  const noAgentDescribed = describePeer({ mergeMemory: true }, "");
  check(
    "没有助手名时干脆不给这个键",
    Object.prototype.hasOwnProperty.call(noAgentDescribed, "peerAgentDir") === false,
    JSON.stringify(noAgentDescribed),
  );

  // ---- peerSource：三种形态必须可区分 ----
  eq("绑定来源", peerForSession({}, "ps-none", p).peerSource, "session");
  eq("合并来源", peerForSession({ mergeMemory: true }, "ps-none", p).peerSource, "merged");
  eq("未绑定来源", peerForSession({}, "ps-none", null).peerSource, "unbound");
  eq("未绑定时 peer 为 null", peerForSession({}, "ps-none", null).peer, null);
  eq(
    "合并未绑定时也能给出身份",
    peerForSession({ mergeMemory: true }, "ps-none", null).peer,
    "openhanako-merged",
  );

  // ---- active peer 按会话存：不写空值，sessionPath 缺失不写 ----
  eq("没 peer 时不写", noteActivePeer("act-a", null), null);
  eq("没 peer 时读不到", readActivePeer("act-a"), null);
  noteActivePeer("act-a", "openhanako-blueflower");
  eq("按会话读回", readActivePeer("act-a"), "openhanako-blueflower");
  eq("不会串到别的会话", readActivePeer("act-b"), null);
  peerForSession({ mergeMemory: true }, "act-c", null);
  eq("sessionPath 缺失时不记 active peer", readActivePeer("act-c"), null);
}

// ================= settings =================
{
  const conn = await readConnection(sdkWith({}));
  eq("serverUrl 默认值", conn.serverUrl, DEFAULTS.serverUrl);
  eq("超时默认值", conn.timeoutMs, 1500);
  eq("预算默认值", conn.injectBudgetTokens, 2500);

  const sw = await readSwitches(sdkWith({ enabled: true }));
  eq("总闸读到 true", sw.enabled, true);
  eq("未填的开关保持默认", sw.readOnly, false);

  const trimmed = await readConnection(sdkWith({ serverUrl: "http://x:9///" }));
  eq("配置里的尾斜杠也去掉", trimmed.serverUrl, "http://x:9");

  // ---- 排除名单：逗号切、trim、去空、按大小写精确去重 ----
  eq(
    "排除名单解析",
    await readExcludedPeers(
      sdkWith({ excludedPeers: " hermes , DSH-desktop ,, hermes " }),
    ),
    ["hermes", "DSH-desktop"],
  );
  eq("大小写不同的名字不合并", parseExcludedPeers("hermes,Hermes"), ["hermes", "Hermes"]);
  eq("空格与空项处理后保持原样大小写", parseExcludedPeers(" Hermes ,, hermes "), [
    "Hermes",
    "hermes",
  ]);
  eq("排除名单缺省为空数组", await readExcludedPeers(sdkWith({})), []);
  eq(
    "非法条目整条忽略",
    parseExcludedPeers("hermes,../etc,bad name,ok_peer,.hidden"),
    ["hermes", "ok_peer", ".hidden"],
  );
  eq("排除名单最多 50 项", parseExcludedPeers(Array.from({ length: 60 }, (_, i) => `p${i}`).join(",")).length, 50);

  // ---- 召回前两层：默认值与非法值回退 ----
  eq("recallGate 默认 off", DEFAULTS.recallGate, "off");
  eq("queryMode 默认 last", DEFAULTS.queryMode, "last");

  const layerDefaults = await readSwitches(sdkWith({}));
  eq("未配置时 recallGate 为 off", layerDefaults.recallGate, "off");
  eq("未配置时 queryMode 为 last", layerDefaults.queryMode, "last");

  const layerSet = await readSwitches(
    sdkWith({ recallGate: "rules", queryMode: "context" }),
  );
  eq("recallGate 读到 rules", layerSet.recallGate, "rules");
  eq("queryMode 读到 context", layerSet.queryMode, "context");

  const layerBad = await readSwitches(
    sdkWith({ recallGate: "on", queryMode: "all" }),
  );
  eq("非法 recallGate 回退 off", layerBad.recallGate, "off");
  eq("非法 queryMode 回退 last", layerBad.queryMode, "last");
  eq("null recallGate 回退 off", normalizeRecallGate(null), "off");
  eq("数字 queryMode 回退 last", normalizeQueryMode(1), "last");
  eq("大小写不匹配也回退", normalizeRecallGate("RULES"), "off");
}

// ================= ui: 召回策略在主面板 =================
{
  const read = (name) => fs.readFileSync(path.join(import.meta.dirname, "../ui", name), "utf8");
  const html = read("panel.html");
  const panelJs = read("assets/panel.js");
  const css = read("assets/panel.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const settingsHtml = read("settings.html");
  const settingsJs = read("assets/settings.js");

  const gateIdx = html.indexOf('id="recallGate"');
  const modeIdx = html.indexOf('id="queryMode"');
  check("面板上有召回判断下拉", gateIdx > 0, `idx=${gateIdx}`);
  check("面板上有召回查询下拉", modeIdx > 0, `idx=${modeIdx}`);
  check("召回判断有 rules 选项", html.includes('value="rules"') && html.includes("规则跳过"));
  check("召回查询有 context 选项", html.includes('value="context"') && html.includes("带上文"));

  // 位置：两栏之后、日志之前，占满整行（不在两栏里），跟 peer 名单同一栏。
  const colsStart = html.indexOf('<section class="cols">');
  const colsEnd = html.indexOf("</section>", colsStart);
  const logsIdx = html.indexOf('<section class="card logs"');
  const recallStart = html.indexOf('<section class="card recall"');
  const recallEnd = html.indexOf("</section>", recallStart);
  const peerIdx = html.indexOf('id="peerList"');
  const peerCountIdx = html.indexOf('id="peerCount"');
  check("召回管理一栏找得到", recallStart > 0 && recallEnd > recallStart,
    `recall=${recallStart}..${recallEnd}`);
  check("召回管理在两栏之后", recallStart > colsEnd, `recall=${recallStart} colsEnd=${colsEnd}`);
  check("召回管理在日志之前", recallEnd < logsIdx, `recallEnd=${recallEnd} logs=${logsIdx}`);
  const hubIdx = html.indexOf(">中枢<");
  const identIdx = html.indexOf(">身份<");
  check(
    "中枢与身份仍在两栏里、在召回管理之前",
    hubIdx > colsStart && hubIdx < colsEnd && identIdx > colsStart && identIdx < colsEnd &&
      identIdx < recallStart,
    `hub=${hubIdx} ident=${identIdx} cols=${colsStart}..${colsEnd} recall=${recallStart}`,
  );

  // 同一栏：两个下拉与 peer 名单都在这个 section 里。
  check(
    "两个下拉与 peer 列表在同一个 section 内",
    gateIdx > recallStart && gateIdx < recallEnd &&
      modeIdx > recallStart && modeIdx < recallEnd &&
      peerIdx > recallStart && peerIdx < recallEnd,
    `recall=${recallStart}..${recallEnd} gate=${gateIdx} mode=${modeIdx} peer=${peerIdx}`,
  );
  check("计数也在这一栏里（仍算 peer 个数）",
    peerCountIdx > recallStart && peerCountIdx < recallEnd);
  const recallTitle = html
    .slice(recallStart, recallEnd)
    .match(/<h2 class="card-title">([^<]*)<\/h2>/);
  eq("这一栏的标题是「召回管理」", recallTitle?.[1], "召回管理");
  check("召回判断在前、召回查询在后", gateIdx < modeIdx);
  // 这一栏恰好两个下拉，没有掉进中枢卡。
  check("这一栏恰好两个下拉",
    (html.slice(recallStart, recallEnd).match(/<select /g) || []).length === 2);
  // 上下两块之间要有一条分隔，不然读起来像一锅端。
  check("下拉与名单之间有分隔",
    /class="recall-sep"/.test(html.slice(recallStart, recallEnd)));

  // 技能路由 / 探针那排恢复成只有两个开关，没有下拉。
  const toggleStart = html.indexOf('<section id="toggleGrid"');
  const toggleEnd = html.indexOf("</section>", toggleStart);
  const toggleBlock = html.slice(toggleStart, toggleEnd);
  const skillIdx = toggleBlock.indexOf('data-key="skillRouting"');
  const probeIdx = toggleBlock.indexOf('data-key="probe"');
  check("技能路由与探针还在，且路由在前", skillIdx > 0 && probeIdx > skillIdx);
  check("技能路由 / 探针那排里不含 select", toggleBlock.includes("<select") === false,
    toggleBlock);
  check("召回管理在开关排之后", recallStart > toggleEnd, `recall=${recallStart} toggleEnd=${toggleEnd}`);
  check("那排恰好两个开关", (toggleBlock.match(/role="switch"/g) || []).length === 2,
    toggleBlock);

  // 说明文字沿用面板的 hint 样式。
  check("规则跳过的说明在面板上", html.includes("≤8 字") && html.includes("指代词"));
  check(
    "带上文的说明在面板上",
    html.includes("300 字符") && html.includes("最新一句保持完整"),
  );
  check("说明小字用 field-hint", (html.match(/class="field-hint"/g) || []).length >= 2);
  // 原来那句排除说明保留，并说清排除了就不参与上面的召回。
  check(
    "名单底部说明串起两件事",
    html.includes("点一下任意一行可以排除这个 peer") && html.includes("不再参与上面的召回"),
  );

  // 旧的独立 recall-row 区块已并进召回管理栏：HTML / CSS / 脚本都不该再有它。
  check("HTML 里不再有独立的 recall-row 区块", html.includes("recall-row") === false);
  check("CSS 里不再有 recall-row 规则", css.includes(".recall-row") === false);
  check("脚本里不再引用 recall-row", panelJs.includes("recall-row") === false);

  const recallRule = css.indexOf(".recall-grid {");
  check("下拉那一行有栅格", recallRule >= 0);
  check(
    "召回那两个下拉并排（一行两列）",
    /grid-template-columns\s*:\s*1fr 1fr/.test(css.slice(recallRule, css.indexOf("}", recallRule))),
  );
  check("分隔线有样式", /\n\.recall-sep \{/.test(css));
  check("peer 名单样式还在", /\n\.peer-list \{/.test(css));
  check("下拉沿用 field 输入框样式", /\.field input,\n\.field select \{/.test(css));
  // 总闸关着时下拉也要跟着暗，别再指向已经不存在的类名。
  check("置灰覆盖到召回下拉", /\.toggle, \.recall-grid/.test(panelJs));

  // 面板脚本：读 + 整单提交，改了就发，没有保存按钮。
  check("面板读取召回策略", panelJs.includes('jsonGet("/recall-mode")'));
  check("面板提交召回策略", panelJs.includes('jsonPost("/recall-mode"'));
  check(
    "两个下拉绑 change 即时提交",
    /for \(const id of \["recallGate", "queryMode"\]\)[\s\S]{0,160}addEventListener\("change"/.test(
      panelJs,
    ),
  );
  check("面板没有为召回单设保存按钮", html.includes("recallSave") === false);

  // 设置页只剩连接：不再有召回分组、下拉、也不再碰 /recall-mode。
  check("设置页不再有召回判断", settingsHtml.includes("recallGate") === false);
  check("设置页不再有召回查询", settingsHtml.includes("queryMode") === false);
  check("设置页不再有下拉", settingsHtml.includes("<select") === false);
  check("设置页不再有召回分组标题", settingsHtml.includes("group-title") === false);
  check("设置页只留连接三字段", ["serverUrl", "apiKey", "peerPrefix"].every((id) =>
    settingsHtml.includes(`id="${id}"`),
  ));
  check("页脚说清开关在 OpenViking 页面", settingsHtml.includes("「OpenViking」页面"));
  check("settings.js 不再调 /recall-mode", settingsJs.includes("/recall-mode") === false);
  check("settings.js 不再有召回下拉的状态", settingsJs.includes("recallGate") === false);
  check(
    "settings.js 保存只走 /conn",
    (settingsJs.match(/hana\.api\.fetch\(/g) || []).length === 2 &&
      settingsJs.includes('hana.api.fetch("/conn", {'),
  );

  const manifest = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "../manifest.json"), "utf8"),
  );
  const props = manifest.contributes.settings.schema.properties;
  eq("manifest 里 recallGate 默认 off", props.recallGate?.default, "off");
  eq("manifest 里 recallGate 枚举", props.recallGate?.enum, ["off", "rules"]);
  eq("manifest 里 queryMode 默认 last", props.queryMode?.default, "last");
  eq("manifest 里 queryMode 枚举", props.queryMode?.enum, ["last", "context"]);
}

// ================= ui: 召回下拉的收笔逻辑 =================
{
  // 服务端回的投影照着显示；形状不全时回退默认值，别让下拉变空。
  eq("服务端回的召回策略照着显示", paintLayers({ recallGate: "rules", queryMode: "context" }), {
    recallGate: "rules",
    queryMode: "context",
  });
  eq("形状不全时回退默认值", paintLayers({}), { recallGate: "off", queryMode: "last" });
  eq("null 也回退默认值", paintLayers(null), { recallGate: "off", queryMode: "last" });
  eq("脏值回退默认值", paintLayers({ recallGate: "on", queryMode: "all" }), {
    recallGate: "off",
    queryMode: "last",
  });

  const shown = [];
  const notes = [];
  const apply = (layers) => shown.push(layers);
  const flash = (text, bad) => notes.push([text, Boolean(bad)]);
  const before = { recallGate: "off", queryMode: "last" };
  const next = { recallGate: "rules", queryMode: "context" };

  // 成功：整单一次提交两个键，界面收在服务端回的值上。
  {
    const sent = [];
    const out = await commitLayers({
      before,
      next,
      send: async (body) => {
        sent.push(body);
        return { ok: true, applied: ["recallGate", "queryMode"], ...next };
      },
      apply,
      flash,
    });
    eq("一次只发一单", sent.length, 1);
    eq("整单带上两个键", sent[0], next);
    eq("成功时返回新值", out, { ok: true, layers: next });
    eq("成功时界面停在服务端值上", shown.at(-1), next);
    eq("成功时提示不是错误", notes.at(-1), ["召回策略已生效", false]);
  }

  // 失败（服务端整单拒）：退回上一次确认的值，报错，不谎报已生效。
  {
    const out = await commitLayers({
      before: next,
      next: { recallGate: "rules", queryMode: "bogus" },
      send: async () => ({ ok: false, error: "queryMode 只能是 last / context" }),
      apply,
      flash,
    });
    eq("被拒时 ok 为 false", out.ok, false);
    eq("被拒时界面退回上次确认的值", shown.at(-1), paintLayers(next));
    eq("被拒时返回回滚后的值", out.layers, paintLayers(next));
    eq("被拒时面板上有错误提示", notes.at(-1), ["queryMode 只能是 last / context", true]);
  }

  // 失败（网络抛错）：同一条回滚路。
  {
    const out = await commitLayers({
      before,
      next,
      send: async () => {
        throw new Error("网络不通");
      },
      apply,
      flash,
    });
    eq("网络错也回滚", shown.at(-1), before);
    eq("网络错也提示", notes.at(-1), ["网络不通", true]);
    eq("网络错不算成功", out.ok, false);
  }

  // 半路失败不会出现「一半生效」：脏值连同合法值一起被服务端拒掉，界面整单回滚。
  {
    const shownCount = shown.length;
    await commitLayers({
      before,
      next: { recallGate: "on", queryMode: "context" },
      send: async () => ({ ok: false, error: "recallGate 只能是 off / rules" }),
      apply,
      flash,
    });
    eq("半单被拒时只落一次界面状态", shown.length - shownCount, 1);
    eq("半单被拒时界面仍是旧值", shown.at(-1), before);
  }
}

// ================= probe =================
{
  const dir = path.join(import.meta.dirname, ".tmp-probe");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const probe = createProbe({ dataDir: dir });
  const session = { sessionId: "s-1", sessionPath: "/a/agents/x/sessions/y.jsonl" };

  await probe("agent/before-start", { prompt: "帮我看看这个报错", systemPrompt: "sys", session });
  await probe("provider/before-request", {
    payload: { system: "sys", messages: [{ role: "user" }, { role: "assistant" }] },
    session,
  });
  await probe("provider/before-request", {
    payload: { system: "sys", messages: [{ role: "user" }] },
    session,
  });

  await probe("recall/gate-skip", {
    session,
    query: "运行测试",
    reason: "short-operation-command",
  });

  const lines = fs
    .readFileSync(path.join(dir, "probe.log"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  eq("四行记录", lines.length, 4);
  eq("第一个事件名", lines[0].event, "agent/before-start");
  eq("before-start 记了 prompt 长度", lines[0].shape.promptChars, 8);
  eq("同一会话第二次计数为 2", lines[2].count, 2);
  eq("payload 里数出 messages", lines[1].shape.messageCount, 2);
  eq("payload 顶层键", lines[1].shape.payloadKeys, ["system", "messages"]);
  eq("gate 事件名", lines[3].event, "recall/gate-skip");
  eq("gate 记了查询长度", lines[3].shape.queryChars, 4);
  eq("gate 记了查询头部", lines[3].shape.queryHead, "运行测试");
  eq("gate 记了原因", lines[3].shape.reason, "short-operation-command");

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= inject/plan =================
{
  const block = "<openviking-memory>\npeer mbp-hanako 说：周三要交稿\n</openviking-memory>";

  eq(
    "stripInjected 去掉注入块",
    stripInjected(`${block}\n\n这条怎么改？`),
    "这条怎么改？",
  );
  eq("stripInjected 对纯文本不动", stripInjected("纯文本"), "纯文本");
  eq("stripInjected 对非字符串给空串", stripInjected(null), "");

  const payloadString = {
    model: "x",
    system: "sys",
    messages: [
      { role: "user", content: "第一句" },
      { role: "assistant", content: "答复" },
      { role: "user", content: "第二句" },
    ],
  };

  eq("lastUserText 取最后一条用户消息", lastUserText(payloadString), "第二句");
  eq("lastUserText 会剥掉既往注入", lastUserText({ messages: [{ role: "user", content: `${block}\n\n原话` }] }), "原话");

  // ---- context 查询：去重 / 3 条上限 / 300 字截断方向 / 空退回 last ----
  eq("context 最多拼 3 条", CONTEXT_MESSAGES_MAX, 3);
  eq("context 总长上限 300", CONTEXT_CHARS_MAX, 300);

  eq(
    "context 从旧到新用换行拼接",
    contextQuery({
      messages: [
        { role: "user", content: "第一句" },
        { role: "assistant", content: "答复" },
        { role: "user", content: "第二句" },
      ],
    }),
    "第一句\n第二句",
  );

  eq(
    "context 丢掉相邻重复的用户文本",
    contextQuery({
      messages: [
        { role: "user", content: "同一句" },
        { role: "assistant", content: "答复" },
        { role: "user", content: "同一句" },
      ],
    }),
    "同一句",
  );

  eq(
    "context 只取最近三条（更旧的整条丢掉）",
    contextQuery({
      messages: [
        { role: "user", content: "第一句" },
        { role: "user", content: "第二句" },
        { role: "user", content: "第三句" },
        { role: "user", content: "第四句" },
      ],
    }),
    "第二句\n第三句\n第四句",
  );

  const oldest = `起点${"旧".repeat(398)}`;
  const clipped = contextQuery({
    messages: [
      { role: "user", content: oldest },
      { role: "user", content: "最新一句" },
    ],
  });
  eq("超长时总长正好收到 300", Array.from(clipped).length, CONTEXT_CHARS_MAX);
  check("最新一条完整保留", clipped.endsWith("\n最新一句"));
  check("最旧一条被截掉的是开头", clipped.startsWith("旧".repeat(295)) && !clipped.includes("起点"));

  eq(
    "context 也剥掉既往注入块",
    contextQuery({
      messages: [
        { role: "user", content: `${block}\n\n第一句` },
        { role: "user", content: "第二句" },
      ],
    }),
    "第一句\n第二句",
  );

  eq(
    "没有用户文本时 context 给空串",
    contextQuery({ messages: [{ role: "assistant", content: "嗯" }] }),
    "",
  );
  eq(
    "context 拼不出东西时退回 last（这里也是空）",
    recallQuery({ messages: [{ role: "assistant", content: "嗯" }] }, "context"),
    "",
  );
  eq(
    "context 单条与 last 相同",
    recallQuery({ messages: [{ role: "user", content: "只有一句" }] }, "context"),
    "只有一句",
  );
  eq(
    "last 模式只用最后一句",
    recallQuery(
      { messages: [{ role: "user", content: "第一句" }, { role: "user", content: "最后一句" }] },
      "last",
    ),
    "最后一句",
  );
  eq(
    "不认识的查询模式按 last",
    recallQuery(
      { messages: [{ role: "user", content: "第一句" }, { role: "user", content: "最后一句" }] },
      "bogus",
    ),
    "最后一句",
  );

  const injected = injectMemory(payloadString, block);
  check("injectMemory 返回新对象", injected !== null);
  check("不改原 payload", payloadString.messages[2].content === "第二句");
  eq("消息条数不变", injected.messages.length, 3);
  check("记忆块在用户消息前", injected.messages[2].content.startsWith("<openviking-memory>"));
  check("原话仍在末尾", injected.messages[2].content.endsWith("第二句"));
  eq("system 未被动过", injected.system, "sys");

  const partsPayload = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "用 parts 的" }] },
    ],
  };
  const partsInjected = injectMemory(partsPayload, block);
  check("parts 形态也能注", partsInjected?.messages[0].parts[0].text.startsWith("<openviking-memory>"));
  eq("parts 不新增 part", partsInjected.messages[0].parts.length, 1);

  eq("没有 messages 返回 null", injectMemory({ model: "x" }, block), null);
  eq("没有用户消息返回 null", injectMemory({ messages: [{ role: "assistant" }] }, block), null);

  check("estimateTokens 中文约等于字数", estimateTokens("四个汉字") >= 4);
  eq("estimateTokens 空串为 0", estimateTokens(""), 0);
  const trimmed = trimToBudget("啊".repeat(400), 50);
  check("trimToBudget 会截断", trimmed.length < 400 && trimmed.endsWith("…"));
  eq("trimToBudget 不超时原样返回", trimToBudget("短", 50), "短");
}

// ================= skills/tools =================
{
  const { calls, fetchImpl } = mockFetch({
    body: {
      status: "ok",
      result: {
        results: [
          { name: "pdf-table", description: "从 PDF 里抽表格", tags: ["pdf"], root_uri: "viking://x" },
        ],
      },
    },
  });
  const sdk = {
    config: { get: async (key) => ({ enabled: true, apiKey: "k", serverUrl: "http://h:1" })[key] },
    network: { fetch: fetchImpl },
    logger: { info() {}, warn() {} },
  };

  const find = skillFindTool(sdk);
  const found = await find.execute({ query: "抽表格", limit: 3 });
  const foundBody = JSON.parse(found.content[0].text);
  eq("find 命中数", foundBody.count, 1);
  eq("find 带出 name", foundBody.skills[0].name, "pdf-table");
  eq("find 走 skills/find", calls[0].url, "http://h:1/api/v1/skills/find");

  const load = skillLoadTool(sdk);
  const loaded = await load.execute({ name: "pdf-table", level: 2 });
  check("load 有返回", typeof loaded.content[0].text === "string");
  check("load 打到 skill 端点", calls[1].url.includes("/api/v1/skills/pdf-table"));

  const offSdk = {
    config: { get: async (key) => ({ enabled: false, apiKey: "" })[key] },
    network: { fetch: async () => { throw new Error("不该联网"); } },
    logger: { info() {}, warn() {} },
  };
  const off = await skillFindTool(offSdk).execute({ query: "任何" });
  const offBody = JSON.parse(off.content[0].text);
  eq("未启用时不联网且说明原因", offBody.ok, false);
  check("原因里提到未启用", offBody.reason.includes("未启用"), offBody.reason);

  const noUrlSdk = {
    config: {
      get: async (key) =>
        ({ enabled: true, apiKey: "k", serverUrl: "" })[key],
    },
    network: { fetch: async () => { throw new Error("不该联网"); } },
    logger: { info() {}, warn() {} },
  };
  const noUrl = JSON.parse((await skillFindTool(noUrlSdk).execute({ query: "任何" })).content[0].text);
  eq("没 serverUrl 时不联网", noUrl.ok, false);
  check("原因里提到 Server 地址", noUrl.reason.includes("Server 地址"), noUrl.reason);
}

{
  // ---- 身份：技能工具必须跟会话走，且只认宿主给的会话路径 ----
  const { calls, fetchImpl } = mockFetch({ body: { status: "ok", result: { results: [] } } });
  const sdk = {
    config: { get: async (key) => ({ enabled: true, apiKey: "k", serverUrl: "http://h:1" })[key] },
    network: { fetch: fetchImpl },
    logger: { info() {}, warn() {} },
  };
  const sessionPath = "/Users/u/.hanako/agents/agent-z/sessions/x.jsonl";
  const hasPeerHeader = (index) => "X-OpenViking-Actor-Peer" in calls[index].init.headers;
  const peerHeader = (index) => calls[index].init.headers["X-OpenViking-Actor-Peer"];

  await skillFindTool(sdk).execute({ query: "抽表格", context: { sessionPath } });
  eq("技能工具用 context 里的会话路径算身份", peerHeader(0), "openhanako-agent-z");

  await skillFindTool(sdk).execute({ query: "抽表格" });
  check("拿不到会话路径时不发身份头", hasPeerHeader(1) === false);

  await skillLoadTool(sdk, { sessionPath }).execute({ name: "pdf-table" });
  eq("options.sessionPath 字符串兜底", peerHeader(2), "openhanako-agent-z");

  await skillFindTool(sdk, { sessionPath: () => sessionPath }).execute({ query: "抽表格" });
  eq("options.sessionPath 函数兜底", peerHeader(3), "openhanako-agent-z");

  await skillFindTool(sdk, {
    sessionPath: "/Users/u/.hanako/agents/agent-other/sessions/y.jsonl",
  }).execute({ query: "抽表格", context: { sessionPath } });
  eq("context 优先于 options", peerHeader(4), "openhanako-agent-z");

  await skillFindTool(sdk).execute({ query: "抽表格", sessionPath });
  check("模型自报的 args.sessionPath 不被采纳", hasPeerHeader(5) === false);
}

// ================= state/session =================
{
  const dir = path.join(import.meta.dirname, ".tmp-session");
  fs.rmSync(dir, { recursive: true, force: true });

  const empty = readSession(dir, "sess-a");
  eq("新会话无覆盖值", empty.overrides, {});
  eq("新会话召回计数为 0", empty.recall.turns, 0);

  const patched = patchSession(dir, "sess-a", {
    overrides: { autoRecall: false, readOnly: true },
  });
  eq("写入后覆盖值到位", patched.overrides, { autoRecall: false, readOnly: true });

  const again = readSession(dir, "sess-a");
  eq("重新读取得到同一份", again.overrides.autoRecall, false);

  const undone = patchSession(dir, "sess-a", { overrides: { autoRecall: null } });
  eq("null 撤销单项覆盖", undone.overrides, { readOnly: true });

  const ignored = patchSession(dir, "sess-a", {
    overrides: { enabled: false, recallPeerScope: "bogus", probe: true },
  });
  check("总闸不可被会话覆盖", !("enabled" in ignored.overrides), JSON.stringify(ignored.overrides));
  check("非法枚举被丢弃", !("recallPeerScope" in ignored.overrides));
  eq("合法布尔照写", ignored.overrides.probe, true);

  const base = { autoRecall: true, autoCapture: true, readOnly: false, probe: false, skillRouting: true };
  const merged = effective(base, ignored);
  eq("覆盖后只读生效", merged.readOnly, true);
  eq("未覆盖的跟随全局", merged.autoRecall, true);
  check("覆盖键集合不含总闸", !OVERRIDE_KEYS.includes("enabled"));

  patchSession(dir, "sess-b", { overrides: { autoCapture: false } });
  const rows = listSessions(dir);
  eq("列出两个会话", rows.length, 2);
  check("列表带会话 id", rows.some((row) => row.sessionId === "sess-b"));

  // ---- 生命周期 ----
  touchSession(dir, "sess-c");
  check("session-start 建了文件并带 createdAt", Boolean(readSession(dir, "sess-c").createdAt));

  markClosed(dir, "sess-c", "test");
  check("shutdown 打了关闭标记", Boolean(readSession(dir, "sess-c").closedAt));

  // 回填身份只补 agentDir：不能把已关闭的会话重新打开。
  patchSession(dir, "sess-c", { agentDir: "agent-c" });
  eq("补 agentDir 真的写进去了", readSession(dir, "sess-c").agentDir, "agent-c");
  check("补 agentDir 不清关闭标记", Boolean(readSession(dir, "sess-c").closedAt));
  eq("补 agentDir 不动关闭原因", readSession(dir, "sess-c").closeReason, "test");
  patchSession(dir, "sess-c", { agentDir: "   " });
  eq("空 agentDir 不覆盖已有身份", readSession(dir, "sess-c").agentDir, "agent-c");

  touchSession(dir, "sess-c");
  eq("重开同一会话清掉关闭标记", readSession(dir, "sess-c").closedAt, null);

  // ---- 过期清理：关闭时间早于阀值就删 ----
  const staleDir = path.join(dir, "sessions");
  fs.mkdirSync(staleDir, { recursive: true });
  const staleFile = path.join(staleDir, "stale.json");
  fs.writeFileSync(
    staleFile,
    JSON.stringify({ sessionId: "stale", closedAt: "2000-01-01T00:00:00.000Z", overrides: {} }),
  );
  listSessions(dir);
  check("过期会话被清掉", !fs.existsSync(staleFile));

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= 会话 key：路径 / key / 稳定 id =================
// 一个 key 从哪来、往哪去，只看这个函数。三种输入对不上，就会出现
// "卡片读一份、开关写另一份"。
{
  eq(
    "sessionKeyOf: 路径取文件名里的 uuid",
    sessionKeyOf("/a/agents/blueflower/sessions/2026-01-01T00-00-00-000Z_01a1585b-86d2.jsonl"),
    "01a1585b-86d2",
  );
  eq("sessionKeyOf: 已经是 key 就原样", sessionKeyOf("01a1585b-86d2"), "01a1585b-86d2");
  eq(
    "sessionKeyOf: sess_ 稳定 id 映射不到",
    sessionKeyOf("sess_0mvgejpps_97df7c693a452f408c2c"),
    "",
  );
  eq("sessionKeyOf: 空串", sessionKeyOf(""), "");
  eq("sessionKeyOf: 非字符串", sessionKeyOf(null), "");
  eq(
    "sessionKeyOf: 反斜杠路径也认",
    sessionKeyOf("C:\\a\\agents\\x\\sessions\\2026-01-01T00-00-00-000Z_01a1585b-86d2.jsonl"),
    "01a1585b-86d2",
  );
  // 时间戳剥离按“最后一个 _ 之后”取，不去猜时区形态：宿主换成 +08-00 也能剥对。
  eq(
    "sessionKeyOf: 带 +08-00 时区的时间戳也剥得掉",
    sessionKeyOf("/a/agents/x/sessions/2026-01-01T00-00-00-000+08-00_01a1585b-86d2.jsonl"),
    "01a1585b-86d2",
  );
  // 形状检查收紧后的预期变化：abc-123 / abc-9 不是 uuid 形态（没有第二个短段），
  // 因此不再被当成 key。这是故意接受的收紧，不是回归；为了让它继续过而放宽正则
  // 等于把造文件的洞留着。
  eq(
    "sessionKeyOf: 非 uuid 形态的路径不再当 key",
    sessionKeyOf("/a/agents/x/sessions/abc-123.jsonl"),
    "",
  );
  eq(
    "sessionKeyOf: 任意字符串不造 key",
    sessionKeyOf("foo"),
    "",
  );
  // 这条是本次收紧要堵的原始症状：以前 basename 是 passwd，会在 sessions 里建文件。
  eq("sessionKeyOf: 路径穿越不落地", sessionKeyOf("../../etc/passwd"), "");
  eq(
    "sessionKeyOf: 子会话路径同样取 basename",
    sessionKeyOf("/a/agents/x/subagent-sessions/direct/01a1585b-86d2-7c64-b8ac-edbe7099d0a1.jsonl"),
    "01a1585b-86d2-7c64-b8ac-edbe7099d0a1",
  );

  // 前端 sessionKeyOf(active) 吃整个 getActive() 快照：key 取 sessionPath，不吃 sessionId。
  const active = {
    sessionId: "sess_0mvgejpps_97df7c693a452f408c2c",
    sessionPath: "/Users/u/.hanako/agents/blueflower/sessions/2026-10-20T08-09-15-730Z_01a1585b-86d2-7c64-b8ac-edbe7099d0a1.jsonl",
    title: "一段对话",
    agentId: "blueflower",
  };
  eq("前端与后端算出同一个 key", uiSessionKeyOf(active), sessionKeyOf(active.sessionPath));
  eq("前端 key 落地形态", uiSessionKeyOf(active), "01a1585b-86d2-7c64-b8ac-edbe7099d0a1");
  eq("前端拿不到 sessionPath 时不编 key", uiSessionKeyOf({ sessionId: "sess_x" }), "");
  eq("前端 null 快照不炸", uiSessionKeyOf(null), "");
  // 前端与后端必须是同一条规则：非 uuid 形态一致给空串。
  eq("前端与后端对 foo 一致", uiSessionKeyOf({ sessionPath: "foo" }), "");
  eq("前端与后端对路径穿越一致", uiSessionKeyOf({ sessionPath: "../../etc/passwd" }), "");
  eq(
    "前端 +08-00 形态与后端剥出同一个 key",
    uiSessionKeyOf({
      sessionPath: "/a/agents/x/sessions/2026-01-01T00-00-00-000+08-00_01a1585b-86d2.jsonl",
    }),
    sessionKeyOf("/a/agents/x/sessions/2026-01-01T00-00-00-000+08-00_01a1585b-86d2.jsonl"),
  );

  // hook 侧不用改：invocation.session.sessionId 就是路径里的 uuid。这条断言锁住
  // "换 key 规则不会让 agentDir 的写入落到另一份文件上"。
  const hookDir = path.join(import.meta.dirname, ".tmp-key-agree");
  fs.rmSync(hookDir, { recursive: true, force: true });
  const hookSessionId = "01a1585b-86d2-7c64-b8ac-edbe7099d0a1";
  touchSession(hookDir, hookSessionId, agentDirFromSessionPath(active.sessionPath));
  eq(
    "hook 写入的身份能被路径查询读到",
    readSession(hookDir, sessionKeyOf(active.sessionPath)).agentDir,
    "blueflower",
  );
  eq(
    "状态文件名就是 hook 的 sessionId",
    fs.readdirSync(path.join(hookDir, "sessions")),
    [`${hookSessionId}.json`],
  );
  fs.rmSync(hookDir, { recursive: true, force: true });
}

// ================= routes: conn =================
{
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const store = {};
  const writes = [];
  const ctx = {
    config: {
      get: async (key) => store[key],
      set: async (key, value) => {
        writes.push([key, value]);
        store[key] = value;
      },
    },
  };
  registerConnRoutes(app, ctx);
  const post = (body) =>
    handlers["POST /conn"]({
      req: { json: async () => body },
      json: (payload, status) => ({ body: payload, status }),
    });

  const chinese = await post({ peerPrefix: "主力机" });
  eq("中文前缀被拒", chinese.status, 400);
  check(
    "拒绝原因讲清可用字符",
    String(chinese.body.error).includes("字母、数字和连字符"),
    chinese.body.error,
  );
  eq("被拒不落库", writes.length, 0);

  const tooLong = await post({ peerPrefix: "a".repeat(33) });
  eq("超长前缀被拒", tooLong.status, 400);
  eq("超长也不落库", writes.length, 0);

  // 同一次提交里的其他字段也不能先一步落库。
  const mixed = await post({ serverUrl: "http://h:9", peerPrefix: "主力机", apiKey: "k" });
  eq("一处不合法就整单被拒", mixed.status, 400);
  eq("同单其他字段也不落库", writes.length, 0);
  eq("serverUrl 确实没写", store.serverUrl, undefined);

  const normalized = await post({ peerPrefix: " My MBP " });
  eq("归一化后再落库", normalized.body.peerPrefix, "my-mbp");
  eq("落库的是归一化后的值", store.peerPrefix, "my-mbp");

  const trailing = await post({ peerPrefix: "mbp-" });
  eq("尾部连字符去掉", trailing.body.peerPrefix, "mbp");

  const cleared = await post({ peerPrefix: "" });
  eq("空串表示清除前缀", cleared.body.peerPrefix, "");
  eq("清除也落库", store.peerPrefix, "");

  // ---- 存量脏前缀：未变化就放行，改成另一个脏值则整单拒 ----
  const getConn = () => handlers["GET /conn"]({ json: (payload, status) => ({ body: payload, status }) });

  store.peerPrefix = "主力机";
  writes.length = 0;

  const keepDirty = await post({ serverUrl: "http://h:7", peerPrefix: "主力机" });
  eq("未变化的脏前缀不阻断整单", keepDirty.status, 200);
  eq("同一单里的 serverUrl 照常落库", store.serverUrl, "http://h:7");
  eq("脏前缀原样留着", store.peerPrefix, "主力机");
  check(
    "未变化的前缀没有被写回",
    !writes.some(([key]) => key === "peerPrefix"),
    JSON.stringify(writes),
  );
  check(
    "applied 不声称改了前缀",
    !keepDirty.body.applied.includes("peerPrefix"),
    JSON.stringify(keepDirty.body.applied),
  );

  writes.length = 0;
  const dirtyToDirty = await post({ peerPrefix: "主力机2" });
  eq("改成另一个脏值仍被拒", dirtyToDirty.status, 400);
  eq("被拒时零写入", writes.length, 0);
  eq("脏前缀没被改掉", store.peerPrefix, "主力机");

  const dirtyGet = await getConn();
  eq("脏前缀在 GET 里可见为不合法", dirtyGet.body.peerPrefixValid, false);

  store.peerPrefix = "mbp";
  eq("正常前缀算合法", (await getConn()).body.peerPrefixValid, true);

  store.peerPrefix = "";
  eq("空前缀算合法", (await getConn()).body.peerPrefixValid, true);
}

// ================= routes: recall-mode =================
{
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const store = {};
  const writes = [];
  const ctx = {
    config: {
      get: async (key) => store[key],
      set: async (key, value) => {
        writes.push([key, value]);
        store[key] = value;
      },
    },
  };
  registerRecallModeRoutes(app, ctx);
  const get = () => handlers["GET /recall-mode"]({ json: (payload, status) => ({ body: payload, status }) });
  const post = (body) =>
    handlers["POST /recall-mode"]({
      req: { json: async () => body },
      json: (payload, status) => ({ body: payload, status }),
    });

  const defaults = await get();
  eq("GET 缺省时 recallGate=off", defaults.body.recallGate, "off");
  eq("GET 缺省时 queryMode=last", defaults.body.queryMode, "last");

  store.recallGate = "bogus";
  store.queryMode = 3;
  const dirty = await get();
  eq("GET 把存量非法值收敛成默认值", [dirty.body.recallGate, dirty.body.queryMode], ["off", "last"]);

  const saved = await post({ recallGate: "rules", queryMode: "context" });
  eq("合法值落库", [store.recallGate, store.queryMode], ["rules", "context"]);
  eq("applied 列出两个键", saved.body.applied, ["recallGate", "queryMode"]);
  eq("POST 回显当前值", [saved.body.recallGate, saved.body.queryMode], ["rules", "context"]);

  writes.length = 0;
  const bad = await post({ recallGate: "on", queryMode: "context" });
  eq("非法值整单被拒", bad.status, 400);
  eq("被拒时零写入", writes.length, 0);
  eq("被拒时另一个键也没改", store.queryMode, "context");

  const badType = await post({ queryMode: 1 });
  eq("类型不对也拒", badType.status, 400);
  eq("类型不对零写入", writes.length, 0);

  const partial = await post({ queryMode: "last" });
  eq("只提交一个键也能改", partial.status, 200);
  eq("另一个键保持原值", store.recallGate, "rules");
}

// ================= routes: session =================
{
  const dir = path.join(import.meta.dirname, ".tmp-route-peer");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const ctxWith = (values) => ({
    dataDir: dir,
    config: { get: async (key) => values[key] },
    network: { fetch: async () => { throw new Error("不该联网"); } },
  });
  const getSession = (sid) =>
    handlers["GET /session/:sid"]({
      req: { param: () => sid },
      json: (payload, status) => ({ body: payload, status }),
    });
  const postSession = (sid, body) =>
    handlers["POST /session/:sid"]({
      req: { param: () => sid, json: async () => body },
      json: (payload, status) => ({ body: payload, status }),
    });

  registerSessionRoutes(app, ctxWith({}));
  // 会话 key 现在是 uuid 形态（收紧后有形状检查），fixture 跟着改成真 uuid。
  const BOUND_KEY = "01a1585b-86d2-7c64-b8ac-edbe7099d0a1";
  const UNBOUND_KEY = "01a1585b-86d2-7c64-b8ac-edbe7099d0a2";
  patchSession(dir, BOUND_KEY, { agentDir: "agent-x" });

  const bound = await getSession(BOUND_KEY);
  eq("有 agentDir 时 peer 是绑定的", bound.body.peer, "openhanako-agent-x");
  eq("有 agentDir 时来源是 session", bound.body.peerSource, "session");

  const unbound = await getSession(UNBOUND_KEY);
  eq("没 agentDir 时 peer 为 null", unbound.body.peer, null);
  eq("没 agentDir 时来源是 unbound", unbound.body.peerSource, "unbound");

  // mergeMemory 打开时，就算没有 agentDir 也能给出身份，但来源必须是 merged。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true }));
  const merged = await getSession(UNBOUND_KEY);
  eq("合并时 peer 带 -merged", merged.body.peer, "openhanako-merged");
  eq("合并时来源是 merged", merged.body.peerSource, "merged");

  // 带前缀时合并身份也带前缀。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true, peerPrefix: "mbp" }));
  const prefixed = await getSession(UNBOUND_KEY);
  eq("带前缀的合并身份", prefixed.body.peer, "mbp-openhanako-merged");

  // 合并把“是哪个助手”盖住了，但接口仍能把助手名单独带出来。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true }));
  const mergedBound = await getSession(BOUND_KEY);
  eq("合并时来源仍是 merged", mergedBound.body.peerSource, "merged");
  eq("合并时也能看到助手是谁", mergedBound.body.peerAgentDir, "agent-x");
  const mergedUnknown = await getSession(UNBOUND_KEY);
  check(
    "合并但不知道助手时响应里不出现 peerAgentDir",
    Object.prototype.hasOwnProperty.call(mergedUnknown.body, "peerAgentDir") === false,
    JSON.stringify(mergedUnknown.body),
  );

  // ---- 会话 key 统一：路径与 key 指向同一份状态；sess_… 不许造文件 ----
  registerSessionRoutes(app, ctxWith({}));
  const byPath = await getSession(
    `/Users/u/.hanako/agents/agent-x/sessions/2026-10-20T08-09-15-730Z_${BOUND_KEY}.jsonl`,
  );
  eq("路径查询映射到同一个 key", byPath.body.sessionId, BOUND_KEY);
  eq("路径查询仍能说出会话身份", byPath.body.peer, "openhanako-agent-x");

  const filesBefore = fs.readdirSync(path.join(dir, "sessions")).sort();
  check("先有会话状态文件", filesBefore.includes(`${BOUND_KEY}.json`));

  const bogusRead = await getSession("sess_0mvgejpps_97df7c693a452f408c2c");
  eq("sess_ 形式的读取回 ok:false", bogusRead.body.ok, false);
  eq("sess_ 形式的读取给明确原因", bogusRead.body.error, "unknown session key");
  eq("sess_ 形式的读取是 400", bogusRead.status, 400);
  eq("sess_ 形式的读取报未绑定", bogusRead.body.peerSource, "unbound");
  eq(
    "sess_ 形式的读取不建文件",
    fs.readdirSync(path.join(dir, "sessions")).sort(),
    filesBefore,
  );

  const bogusWrite = await postSession("sess_0mvgejpps_97df7c693a452f408c2c", {
    overrides: { autoRecall: false },
  });
  eq("sess_ 形式的写入被拒", bogusWrite.body.ok, false);
  eq("被拒时给明确原因", bogusWrite.body.error, "unknown session key");
  eq("被拒状态码是 400", bogusWrite.status, 400);
  eq(
    "被拒时不建状态文件",
    fs.readdirSync(path.join(dir, "sessions")).sort(),
    filesBefore,
  );

  // 形状不对的任意字符串同样不消费：400 + ok:false，且目录列表一个字节不变。
  const fooRead = await getSession("foo");
  eq("非 uuid 形态的读取回 ok:false", fooRead.body.ok, false);
  eq("非 uuid 形态的读取是 400", fooRead.status, 400);
  eq("非 uuid 形态的读取给明确原因", fooRead.body.error, "unknown session key");
  eq(
    "非 uuid 形态的读取不建文件",
    fs.readdirSync(path.join(dir, "sessions")).sort(),
    filesBefore,
  );

  const fooWrite = await postSession("foo", { overrides: { autoRecall: false } });
  eq("非 uuid 形态的写入被拒", fooWrite.body.ok, false);
  eq("非 uuid 形态的写入是 400", fooWrite.status, 400);
  eq("非 uuid 形态的写入给明确原因", fooWrite.body.error, "unknown session key");
  eq(
    "非 uuid 形态的写入不建文件",
    fs.readdirSync(path.join(dir, "sessions")).sort(),
    filesBefore,
  );

  // 路径形式的写入必须落到同一个 key 上，不能另起一份。
  const filesBeforePathWrite = fs.readdirSync(path.join(dir, "sessions")).sort();
  const pathWrite = await postSession(
    `/Users/u/.hanako/agents/agent-x/sessions/2026-10-20T08-09-15-730Z_${BOUND_KEY}.jsonl`,
    { overrides: { autoCapture: false } },
  );
  eq("路径写入落到同一个 key", pathWrite.body.sessionId, BOUND_KEY);
  eq("路径写入写的是同一份状态", readSession(dir, BOUND_KEY).overrides.autoCapture, false);
  eq(
    "路径写入没有多出一份文件",
    fs.readdirSync(path.join(dir, "sessions")).sort(),
    filesBeforePathWrite,
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= recall gate =================
{
  eq("gate 长度上限是 8", GATE_MAX_CHARS, 8);

  // 判据 1：trim 后长度 ≤ 8
  eq("≤8 字的纯操作指令跳过", isShortOperationCommand("运行测试"), true);
  eq("trim 后仍按 8 字算", isShortOperationCommand("  运行测试  "), true);
  eq("超过 8 字不跳过", isShortOperationCommand("重启开发服务器进程"), false);

  // 判据 2：不含问号
  eq("带半角问号不跳过", isShortOperationCommand("运行测试?"), false);
  eq("带全角问号不跳过", isShortOperationCommand("运行测试？"), false);

  // 判据 3：不含疑问词
  eq("带疑问词不跳过（怎么）", isShortOperationCommand("怎么运行"), false);
  eq("带疑问词不跳过（为什么）", isShortOperationCommand("为什么"), false);

  // 判据 4：不含指代词
  eq("带指代词不跳过（这）", isShortOperationCommand("把这个删了"), false);
  eq("带指代词不跳过（继续）", isShortOperationCommand("继续"), false);

  // 任务书里的四个举例
  eq("运行测试 -> 跳过", shouldSkipRecall("运行测试", "rules"), true);
  eq("把这个删了 -> 召回", shouldSkipRecall("把这个删了", "rules"), false);
  eq("继续 -> 召回", shouldSkipRecall("继续", "rules"), false);
  eq("那为啥不是默认开启? -> 召回", shouldSkipRecall("那为啥不是默认开启?", "rules"), false);

  // off / 非法值永远不跳
  eq("off 永远不跳过", shouldSkipRecall("运行测试", "off"), false);
  eq("非法 gate 也不跳过", shouldSkipRecall("运行测试", "banana"), false);
  eq("空文本不跳过", isShortOperationCommand("   "), false);
}

{
  // ---- recallGate=rules 接入链路：跳过时不发请求，日志与探针各记一行 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-gate");
  fs.rmSync(dir, { recursive: true, force: true });

  const infos = [];
  const probes = [];
  const mock = mockFetch({ body: { status: "ok", result: { rendered: "不该召回" } } });
  const sdk = recallSdk({
    values: {
      enabled: true,
      apiKey: "k",
      serverUrl: "http://h:1",
      recallGate: "rules",
      probe: true,
    },
    fetchImpl: mock.fetchImpl,
    dataDir: dir,
    logger: { info: (m) => infos.push(m) },
  });
  const handler = createRecallHandler(sdk, {
    probe: async (event, invocation) => probes.push({ event, invocation }),
  });
  const session = { sessionId: "gate-skip" };
  const payload = { messages: [{ role: "user", content: "运行测试" }] };

  eq("gate 跳过时返回 undefined", await handler({ payload, session }), undefined);
  eq("gate 跳过时不发请求", mock.calls.length, 0);
  check(
    "gate 跳过时日志有一行 gate: skipped",
    infos.some((m) => m.includes("gate: skipped")),
  );
  eq("gate 跳过时探针记一次", probes.length, 1);
  eq("探针事件名", probes[0].event, "recall/gate-skip");
  eq("探针带上了查询原文", probes[0].invocation.query, "运行测试");
  eq("探针带上了原因", probes[0].invocation.reason, "short-operation-command");

  await handler({ payload, session });
  eq(
    "同一句第二次不再记 gate",
    infos.filter((m) => m.includes("gate: skipped")).length,
    1,
  );
  eq("同一句第二次也不再写探针", probes.length, 1);

  const probesOff = [];
  const offHandler = createRecallHandler(
    recallSdk({
      values: {
        enabled: true,
        apiKey: "k",
        serverUrl: "http://h:1",
        recallGate: "rules",
        probe: false,
      },
      fetchImpl: mock.fetchImpl,
      dataDir: dir,
      logger: { info: () => {} },
    }),
    { probe: async () => probesOff.push(1) },
  );
  await offHandler({
    payload: { messages: [{ role: "user", content: "运行测试" }] },
    session: { sessionId: "gate-probe-off" },
  });
  eq("probe 开关关着时不写探针", probesOff.length, 0);

  // 反例：含指代词的短句照常召回。
  const recallMock = mockFetch({ body: { status: "ok", result: { rendered: "该召回" } } });
  const recallHandler = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1", recallGate: "rules" },
      fetchImpl: recallMock.fetchImpl,
      dataDir: dir,
    }),
  );
  const recalled = await recallHandler({
    payload: { messages: [{ role: "user", content: "把这个删了" }] },
    session: { sessionId: "gate-recall" },
  });
  check("含指代词的短句照常召回", Boolean(recalled?.payload));
  eq("含指代词的短句发了请求", recallMock.calls.length, 1);

  // ---- gate 只看最后一条用户原话：recallGate 与 queryMode 解耦 ----
  // 判据看的是“这句话需不需要查记忆”，拼接结果只决定“用什么去查”。
  const gateHistory = [
    { role: "user", content: "先把上周那版设计文档里的接口清单整理出来给我看看" },
    { role: "assistant", content: "好" },
    { role: "user", content: "再把它按模块拆成三份，每份不超过一页" },
  ];
  const joinedGate = `${gateHistory[0].content}\n${gateHistory[2].content}\n把这个删了`;

  // 用例 1：rules + context + 短指令 + 长历史 -> 跳过，不发请求。
  {
    const m = mockFetch({ body: { status: "ok", result: { rendered: "不该召回" } } });
    const h = createRecallHandler(
      recallSdk({
        values: {
          enabled: true,
          apiKey: "k",
          serverUrl: "http://h:1",
          recallGate: "rules",
          queryMode: "context",
        },
        fetchImpl: m.fetchImpl,
        dataDir: dir,
      }),
    );
    const r = await h({
      payload: {
        messages: [...gateHistory, { role: "user", content: "重启一下服务" }],
      },
      session: { sessionId: "gate-matrix-skip" },
    });
    check("用例1 rules+context+短指令：跳过时不干预", r === undefined);
    eq("用例1 rules+context+短指令：请求数 0", m.calls.length, 0);
  }

  // 用例 2：rules + context + 带指代词 -> 不跳过，查询是拼接结果。
  {
    const m = mockFetch({ body: { status: "ok", result: { rendered: "上下文召回" } } });
    const h = createRecallHandler(
      recallSdk({
        values: {
          enabled: true,
          apiKey: "k",
          serverUrl: "http://h:1",
          recallGate: "rules",
          queryMode: "context",
        },
        fetchImpl: m.fetchImpl,
        dataDir: dir,
      }),
    );
    const r = await h({
      payload: {
        messages: [...gateHistory, { role: "user", content: "把这个删了" }],
      },
      session: { sessionId: "gate-matrix-recall" },
    });
    check("用例2 rules+context+指代词：照常召回", Boolean(r?.payload));
    eq("用例2 rules+context+指代词：请求数 1", m.calls.length, 1);
    eq(
      "用例2 发出的查询是拼接结果",
      JSON.parse(m.calls[0].init.body).query,
      joinedGate,
    );
  }

  // 用例 3：rules + last + 短指令 + 无历史 -> 跳过。
  {
    const m = mockFetch({ body: { status: "ok", result: { rendered: "不该召回" } } });
    const h = createRecallHandler(
      recallSdk({
        values: {
          enabled: true,
          apiKey: "k",
          serverUrl: "http://h:1",
          recallGate: "rules",
          queryMode: "last",
        },
        fetchImpl: m.fetchImpl,
        dataDir: dir,
      }),
    );
    const r = await h({
      payload: { messages: [{ role: "user", content: "重启一下服务" }] },
      session: { sessionId: "gate-matrix-last-skip" },
    });
    check("用例3 rules+last+短指令：跳过时不干预", r === undefined);
    eq("用例3 rules+last+短指令：请求数 0", m.calls.length, 0);
  }

  // 用例 4：off + context + 短指令 + 有历史 -> 不跳过。
  {
    const m = mockFetch({ body: { status: "ok", result: { rendered: "关闭判断后照常召回" } } });
    const h = createRecallHandler(
      recallSdk({
        values: {
          enabled: true,
          apiKey: "k",
          serverUrl: "http://h:1",
          recallGate: "off",
          queryMode: "context",
        },
        fetchImpl: m.fetchImpl,
        dataDir: dir,
      }),
    );
    const r = await h({
      payload: {
        messages: [...gateHistory, { role: "user", content: "重启一下服务" }],
      },
      session: { sessionId: "gate-matrix-off-ctx" },
    });
    check("用例4 off+context+短指令：照常召回", Boolean(r?.payload));
    eq("用例4 off+context+短指令：请求数 1", m.calls.length, 1);
    eq(
      "用例4 发出的查询是拼接结果",
      JSON.parse(m.calls[0].init.body).query,
      `${gateHistory[0].content}\n${gateHistory[2].content}\n重启一下服务`,
    );
  }

  // 默认 off：同样的短指令照常召回，行为不比现在更差。
  const offMock = mockFetch({ body: { status: "ok", result: { rendered: "关闭判断后照常召回" } } });
  const offModeHandler = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: offMock.fetchImpl,
      dataDir: dir,
    }),
  );
  const offRecalled = await offModeHandler({
    payload: { messages: [{ role: "user", content: "运行测试" }] },
    session: { sessionId: "gate-off-default" },
  });
  check("默认 off 时短指令照常召回", Boolean(offRecalled?.payload));
  eq("默认 off 时发了请求", offMock.calls.length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= memory/recall =================
{
  // ---- 去重：同一会话、同一句用户文本，只召回一次 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-dedupe");
  fs.rmSync(dir, { recursive: true, force: true });

  const { calls, fetchImpl } = mockFetch({
    body: {
      status: "ok",
      result: { rendered: "<memory uri=\"viking://user/default/mem\">周三要交稿。</memory>" },
    },
  });
  const sdk = recallSdk({
    values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
    fetchImpl,
    dataDir: dir,
  });
  const handler = createRecallHandler(sdk);
  const session = {
    sessionId: "recall-dedupe",
    sessionPath: "/Users/u/.hanako/agents/agent-x/sessions/a.jsonl",
  };
  const payload = {
    model: "m",
    messages: [
      { role: "user", content: "什么时候交稿？" },
      { role: "assistant", content: "我查一下" },
      { role: "user", content: "我记得是周三？" },
    ],
  };
  const before = JSON.stringify(payload);

  const first = await handler({ payload, session });
  check("召回成功返回 payload", Boolean(first?.payload));
  eq("注入后消息条数不变", first?.payload.messages.length, 3);
  check(
    "最后一条用户消息以记忆标记开头",
    first?.payload.messages[2].content.startsWith("<openviking-memory>"),
  );
  check("原用户文本仍在末尾", first?.payload.messages[2].content.endsWith("我记得是周三？"));
  check("记忆正文在块里", first?.payload.messages[2].content.includes("周三要交稿。"));
  eq("助手消息没被动过", first?.payload.messages[1].content, "我查一下");
  eq("原 payload 未被修改", JSON.stringify(payload), before);
  eq("只发了一次召回请求", calls.length, 1);

  const reqBody = JSON.parse(calls[0].init.body);
  eq("召回走 context 模式", reqBody.mode, "context");
  eq("默认跨门牌召回", reqBody.peer_scope, "all");
  eq("预算取 DESIGN 上限", reqBody.max_tokens, MEMORY_MAX_TOKENS);
  eq("查询是剥掉注入后的文本", reqBody.query, "我记得是周三？");
  eq("召回请求带会话自己的 peer", calls[0].init.headers["X-OpenViking-Actor-Peer"], "openhanako-agent-x");

  const again = await handler({ payload: first.payload, session });
  eq("第二次同文本返回 undefined", again, undefined);
  eq("第二次不发请求", calls.length, 1);

  const otherText = { messages: [{ role: "user", content: "换个问题" }] };
  const other = await handler({ payload: otherText, session });
  check("不同文本仍会召回", Boolean(other?.payload));
  eq("不同文本发第二次请求", calls.length, 2);

  const state = readSession(dir, "recall-dedupe");
  eq("召回轮次记了两次", state.recall.turns, 2);
  check("注入 token 累加", state.recall.injectedTokens > 0);
  check("记了最后召回时间", typeof state.recall.lastAt === "string");

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 排除名单：配置里的名字转成 exclude_uris，只对 all 范围生效 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-exclude");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = {
    enabled: true,
    apiKey: "k",
    serverUrl: "http://h:1",
    recallPeerScope: "all",
    excludedPeers: " hermes , DSH-desktop ,, hermes ",
  };
  const all = mockFetch({ body: { status: "ok", result: { rendered: "跨门牌的记忆" } } });
  const allHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: all.fetchImpl, dataDir: dir }),
  );
  await allHandler({
    payload: { messages: [{ role: "user", content: "别的机器说过什么" }] },
    session: { sessionId: "exclude-all" },
  });
  eq(
    "排除名单转成 exclude_uris",
    JSON.parse(all.calls[0].init.body).exclude_uris,
    ["viking://user/default/peers/hermes", "viking://user/default/peers/DSH-desktop"],
  );

  const self = mockFetch({ body: { status: "ok", result: { rendered: "本机记忆" } } });
  const selfHandler = createRecallHandler(
    recallSdk({ values: { ...values, recallPeerScope: "self" }, fetchImpl: self.fetchImpl, dataDir: dir }),
  );
  await selfHandler({
    payload: { messages: [{ role: "user", content: "只看本机" }] },
    session: { sessionId: "exclude-self" },
  });
  eq(
    "self 范围不带 exclude_uris",
    "exclude_uris" in JSON.parse(self.calls[0].init.body),
    false,
  );

  const none = mockFetch({ body: { status: "ok", result: { rendered: "全部记忆" } } });
  const noneHandler = createRecallHandler(
    recallSdk({ values: { ...values, excludedPeers: "" }, fetchImpl: none.fetchImpl, dataDir: dir }),
  );
  await noneHandler({
    payload: { messages: [{ role: "user", content: "没有排除项" }] },
    session: { sessionId: "exclude-none" },
  });
  eq(
    "名单为空时不带 exclude_uris",
    "exclude_uris" in JSON.parse(none.calls[0].init.body),
    false,
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 未启用 / 没 key：一次请求都不发 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-off");
  fs.rmSync(dir, { recursive: true, force: true });
  const session = { sessionId: "recall-off" };
  const payload = { messages: [{ role: "user", content: "在吗" }] };
  const boom = {
    calls: 0,
    fetchImpl: async () => {
      boom.calls += 1;
      throw new Error("不该联网");
    },
  };

  const off = createRecallHandler(
    recallSdk({
      values: { enabled: false, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("总闸关时返回 undefined", await off({ payload, session }), undefined);
  eq("总闸关时不发请求", boom.calls, 0);

  const noKey = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没 key 时返回 undefined", await noKey({ payload, session }), undefined);
  eq("没 key 时不发请求", boom.calls, 0);

  const noUrl = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没 serverUrl 时返回 undefined", await noUrl({ payload, session }), undefined);
  eq("没 serverUrl 时不发请求", boom.calls, 0);

  const noSession = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没有 sessionId 时返回 undefined", await noSession({ payload }), undefined);
  eq("没有 sessionId 时不发请求", boom.calls, 0);

  const empty = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq(
    "没有用户文本时返回 undefined",
    await empty({ payload: { messages: [{ role: "assistant", content: "嗯" }] }, session }),
    undefined,
  );
  eq("没有用户文本时不发请求", boom.calls, 0);

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 形状不认识：返回 undefined，不抛，也不联网 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-shape");
  fs.rmSync(dir, { recursive: true, force: true });
  const boom = {
    calls: 0,
    fetchImpl: async () => {
      boom.calls += 1;
      throw new Error("不该联网");
    },
  };
  const handler = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );

  let threw = null;
  let result;
  try {
    result = await handler({ payload: { model: "m" }, session: { sessionId: "shape-1" } });
  } catch (error) {
    threw = error;
  }
  eq("没有 messages 时返回 undefined", result, undefined);
  eq("没有 messages 时不抛", threw, null);
  eq("没有 messages 时不联网", boom.calls, 0);

  // 有 messages、能联网，但响应里没有可读文本 -> 仍然不改载荷。
  const emptyBody = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: mockFetch({ body: { status: "ok", result: { total: 0 } } }).fetchImpl,
      dataDir: dir,
    }),
  );
  const payload = { messages: [{ role: "user", content: "有没有记忆" }] };
  eq(
    "响应无文本时返回 undefined",
    await emptyBody({ payload, session: { sessionId: "shape-2" } }),
    undefined,
  );
  eq("响应无文本时 payload 原样", payload.messages[0].content, "有没有记忆");

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 失败路径：payload 原样，且同一文本不重复试错 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-fail");
  fs.rmSync(dir, { recursive: true, force: true });
  let calls = 0;
  const handler = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("ETIMEDOUT");
      },
      dataDir: dir,
    }),
  );
  const payload = { messages: [{ role: "user", content: "断网时问一句" }] };
  const session = { sessionId: "fail-1" };
  const before = JSON.stringify(payload);

  let threw = null;
  let result;
  try {
    result = await handler({ payload, session });
  } catch (error) {
    threw = error;
  }
  eq("网络失败返回 undefined", result, undefined);
  eq("网络失败不抛", threw, null);
  eq("失败时 payload 深度相等", JSON.stringify(payload), before);
  eq("失败时调用者手里还是原引用", payload.messages[0].content, "断网时问一句");
  eq("失败记了一次请求", calls, 1);

  await handler({ payload, session });
  eq("失败后同文本不再重试", calls, 1);

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 会话覆盖：autoRecall / recallPeerScope / readOnly ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-override");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = {
    enabled: true,
    apiKey: "k",
    serverUrl: "http://h:1",
    recallPeerScope: "self",
  };
  const payload = { messages: [{ role: "user", content: "跨门牌找找" }] };

  patchSession(dir, "ov-off", { overrides: { autoRecall: false } });
  const autoOff = mockFetch({ body: { status: "ok", result: { rendered: "不该出现" } } });
  const offHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: autoOff.fetchImpl, dataDir: dir }),
  );
  eq(
    "会话关掉 autoRecall 时返回 undefined",
    await offHandler({ payload, session: { sessionId: "ov-off" } }),
    undefined,
  );
  eq("会话关掉 autoRecall 时不发请求", autoOff.calls.length, 0);

  patchSession(dir, "ov-scope", { overrides: { recallPeerScope: "all", readOnly: true } });
  const scoped = mockFetch({ body: { status: "ok", result: { rendered: "跨门牌的记忆" } } });
  const scopeHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: scoped.fetchImpl, dataDir: dir }),
  );
  const scopedResult = await scopeHandler({
    payload: { messages: [{ role: "user", content: "别的机器说过什么" }] },
    session: { sessionId: "ov-scope" },
  });
  check("只读模式不影响召回", Boolean(scopedResult?.payload));
  eq("会话覆盖召回范围", JSON.parse(scoped.calls[0].init.body).peer_scope, "all");

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 真实响应形状：rendered 主路径 / digest / entries 兜底 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-rendered");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = { enabled: true, apiKey: "k", serverUrl: "http://h:1" };
  const renderedXml =
    '<memory uri="viking://user/default/skills" type="skills" score="0.57" detail="overview">\n预览\n</memory>';

  const renderedFetch = mockFetch({
    body: {
      status: "ok",
      result: {
        entries: [{ text: "条目不该赢" }],
        rendered: renderedXml,
        digest: "摘要不该赢",
        stats: {},
      },
    },
  });
  const renderedHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: renderedFetch.fetchImpl, dataDir: dir }),
  );
  const renderedResult = await renderedHandler({
    payload: { messages: [{ role: "user", content: "rendered 优先" }] },
    session: { sessionId: "shape-rendered" },
  });
  check("rendered 形状注入成功", Boolean(renderedResult?.payload));
  check("rendered 内容进块", renderedResult?.payload.messages[0].content.includes(renderedXml));
  check(
    "rendered 优先于 digest 与 entries",
    !renderedResult?.payload.messages[0].content.includes("摘要不该赢") &&
      !renderedResult?.payload.messages[0].content.includes("条目不该赢"),
  );

  const digestFetch = mockFetch({
    body: {
      status: "ok",
      result: { entries: [{ text: "条目也不该赢" }], rendered: "", digest: "只有摘要" },
    },
  });
  const digestHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: digestFetch.fetchImpl, dataDir: dir }),
  );
  const digestResult = await digestHandler({
    payload: { messages: [{ role: "user", content: "digest 兜底" }] },
    session: { sessionId: "shape-digest" },
  });
  check("digest 形状注入成功", Boolean(digestResult?.payload));
  check("空 rendered 让位给 digest", digestResult?.payload.messages[0].content.includes("只有摘要"));
  check("digest 命中时不再看 entries", !digestResult?.payload.messages[0].content.includes("条目也不该赢"));

  const entriesFetch = mockFetch({
    body: {
      status: "ok",
      result: {
        entries: [{ text: "第一条" }, { text: "" }, { text: "第二条" }],
        rendered: "",
        digest: "",
        stats: {},
      },
    },
  });
  const entriesHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: entriesFetch.fetchImpl, dataDir: dir }),
  );
  const entriesResult = await entriesHandler({
    payload: { messages: [{ role: "user", content: "entries 兜底" }] },
    session: { sessionId: "shape-entries" },
  });
  check("entries 形状注入成功", Boolean(entriesResult?.payload));
  check(
    "entries 用空行拼起来且跳过空项",
    entriesResult?.payload.messages[0].content.includes("第一条\n\n第二条"),
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 三者皆空：返回 undefined，且同一进程只告警一次 ----
  resetShapeWarning();
  const dir = path.join(import.meta.dirname, ".tmp-recall-warn");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = { enabled: true, apiKey: "k", serverUrl: "http://h:1" };
  const warnings = [];
  const infos = [];
  const logger = { info: (m) => infos.push(m), warn: (m) => warnings.push(m) };
  const emptyFetch = () =>
    mockFetch({ body: { status: "ok", result: { total: 0, stats: {} } } }).fetchImpl;

  const handler = createRecallHandler(
    recallSdk({ values, fetchImpl: emptyFetch(), dataDir: dir, logger }),
  );
  const payload = { messages: [{ role: "user", content: "这一句没有记忆" }] };
  const session = { sessionId: "warn-1" };
  eq("三者皆空时返回 undefined", await handler({ payload, session }), undefined);
  eq("未知形状告警一次", warnings.length, 1);
  check(
    "告警含「响应形状未识别」与键名",
    warnings[0]?.includes("响应形状未识别") &&
      warnings[0]?.includes("total") &&
      warnings[0]?.includes("stats"),
  );
  eq("payload 原样未改", payload.messages[0].content, "这一句没有记忆");

  await handler({ payload, session });
  eq("同文本重复调用不再告警", warnings.length, 1);

  const otherHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: emptyFetch(), dataDir: dir, logger }),
  );
  await otherHandler({
    payload: { messages: [{ role: "user", content: "另一句也没有" }] },
    session: { sessionId: "warn-2" },
  });
  eq("同进程其他会话也不再告警", warnings.length, 1);
  check("仍然只发了一次日志而非每轮刷屏", infos.filter((m) => m.includes("no text")).length === 2);

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 日志噪音：跳过日志排在去重键之后，同一会话同一原因一轮只记一次 ----
  const dir = path.join(import.meta.dirname, ".tmp-recall-noise");
  fs.rmSync(dir, { recursive: true, force: true });
  const infos = [];
  const boom = async () => {
    throw new Error("不该联网");
  };
  const sdk = recallSdk({
    values: { enabled: false, apiKey: "k", serverUrl: "http://h:1" },
    fetchImpl: boom,
    dataDir: dir,
    logger: { info: (m) => infos.push(m) },
  });
  const handler = createRecallHandler(sdk);
  const payload = { messages: [{ role: "user", content: "闸关着问一句" }] };
  const session = { sessionId: "noise-off" };

  for (let i = 0; i < 12; i += 1) await handler({ payload, session });
  eq(
    "关闸时一轮只记一条 skip: disabled",
    infos.filter((m) => m.includes("skip: disabled")).length,
    1,
  );
  eq("12 次步调用总共只记一条日志", infos.length, 1);

  const readsAfterFirst = sdk.reads.count;
  check("首轮确实读了配置", readsAfterFirst > 0);
  await handler({ payload, session });
  eq("重复调用不再读配置", sdk.reads.count, readsAfterFirst);

  const infos2 = [];
  const noId = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "", serverUrl: "http://h:1" },
      fetchImpl: boom,
      dataDir: dir,
      logger: { info: (m) => infos2.push(m) },
    }),
  );
  for (let i = 0; i < 3; i += 1) {
    await noId({ payload, session: { sessionId: "noise-noid" } });
  }
  eq(
    "没身份时重复调用也只记一条",
    infos2.filter((m) => m.includes("skip: no identity")).length,
    1,
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // ---- 纯函数：指纹 / 去重容量 / 响应解析 / 预算截断 ----
  eq("指纹稳定", fingerprint("同一句"), fingerprint("同一句"));
  check("不同文本指纹不同", fingerprint("甲") !== fingerprint("乙"));

  const deduper = createDeduper(3);
  eq("首次占键成功", deduper.claim("a"), true);
  eq("重复占键失败", deduper.claim("a"), false);
  deduper.claim("b");
  deduper.claim("c");
  deduper.claim("d");
  eq("超容量按最旧淘汰", deduper.has("a"), false);
  check("新键保留", deduper.has("d"));
  eq("容量不超过上限", deduper.size, 3);
  check("默认容量常量可用", DEDUP_LIMIT >= 100);

  eq("响应是字符串", extractRecallText("  一段记忆  "), "一段记忆");
  eq(
    "rendered 优先",
    extractRecallText({ rendered: "渲染块", digest: "摘要", entries: [{ text: "条目" }] }),
    "渲染块",
  );
  eq(
    "空 rendered 落到 digest",
    extractRecallText({ rendered: "  ", digest: "只有摘要", entries: [{ text: "条目" }] }),
    "只有摘要",
  );
  eq(
    "没有 rendered/digest 时拼 entries",
    extractRecallText({ entries: [{ text: "第一条" }, { text: "" }, { text: "第二条" }] }),
    "第一条\n\n第二条",
  );
  eq("旧猜测键不再猜", extractRecallText({ context: "旧形状" }), "");
  eq("响应无文本给空串", extractRecallText({ total: 0 }), "");
  eq("响应是 null 给空串", extractRecallText(null), "");

  const block = memoryBlock("啊".repeat(400), 20);
  check("记忆块带开关标记", block.startsWith("<openviking-memory>") && block.endsWith("</openviking-memory>"));
  check("超预算时截断且标记完整", block.includes("…") && block.endsWith("</openviking-memory>"));
}

// ================= 结果 =================
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);

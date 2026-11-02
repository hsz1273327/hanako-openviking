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
import registerModelsRoutes from "../routes/models.js";
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
  normalizeGateModel,
  normalizeGatePrompt,
  normalizeRerank,
  normalizeRerankModel,
  normalizeRerankPrompt,
  normalizeServiceModel,
  normalizeServiceTimeout,
  normalizeServiceUrl,
  serializeServiceTimeout,
  servicePairError,
  serviceTimeoutOrDefault,
  parseRerankChannel,
  parseRerankChannels,
  serializeRerankChannels,
  GATE_PROMPT_MAX,
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TYPES,
  RERANK_CHANNEL_URL_MAX,
  RERANK_MODES,
  RERANK_PROMPT_MAX,
  SERVICE_MODEL_MAX,
  SERVICE_TIMEOUT_LIMITS,
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
  candidateSummary,
  extractRecallItems,
  extractRecallText,
  fingerprint,
  isShortOperationCommand,
  memoryBlock,
  resetShapeWarning,
  shouldSkipRecall,
  gateAnswerRecalls,
  gatePromptOf,
  parseRerankAnswer,
  readGateStreamText,
  renderGatePrompt,
  renderRerankPrompt,
  rerankPromptOf,
  rerankChannelsOf,
  resolveRerankChannel,
  normalizeChannelScores,
  squashRerankScores,
  mergeRerankScores,
  rankRerankIndexes,
  runRerankChannels,
  dropRejectedIndexes,
  writeRerankSample,
  readRerankSample,
  buildSystemOneState,
  systemoneInstructions,
  systemoneTimeoutFor,
  testScoringService,
  CHANNEL_PAIR_NOTE_MODEL,
  CHANNEL_PAIR_NOTE_URL,
  SYSTEMONE_MAX_CANDIDATES,
  SYSTEMONE_CHANNEL_TIMEOUT_MS,
  SYSTEMONE_TIMEOUT_MAX_MS,
  SYSTEMONE_TIMEOUT_PER_CANDIDATE_MS,
  SYSTEMONE_DOCUMENT_CHARS,
  SYSTEMONE_STATE_MAX_CHARS,
  RERANK_CHANNEL_TIMEOUT_MS,
  RERANK_MODEL_CHANNEL_TIMEOUT_MS,
  RERANK_DOCUMENT_CHARS,
  DEFAULT_GATE_PROMPT,
  DEFAULT_RERANK_PROMPT,
  GATE_MESSAGE_PLACEHOLDER,
  GATE_TIMEOUT_MS,
  GATE_MAX_TOKENS,
  RERANK_TIMEOUT_MS,
  RERANK_MAX_TOKENS,
  DEDUP_LIMIT,
  GATE_MAX_CHARS,
  GATE_QUESTION_WORDS,
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
// 面板三页标签与记忆键：纯逻辑，node 直接验。
import {
  DEFAULT_TAB,
  TAB_KEY,
  TABS,
  normalizeTab,
  readTab,
  writeTab,
} from "../ui/assets/tabs.js";
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
import {
  DEFAULT_GATE_PROMPT as UI_DEFAULT_GATE_PROMPT,
  DEFAULT_MODEL_OPTION,
  DEFAULT_RERANK_PROMPT as UI_DEFAULT_RERANK_PROMPT,
  RERANK_CHANNEL_LABELS,
  RERANK_CHANNELS_MAX as UI_RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TIMEOUT_DEFAULTS as UI_RERANK_CHANNEL_TIMEOUT_DEFAULTS,
  CHANNEL_PAIR_NOTE_MODEL as UI_CHANNEL_PAIR_NOTE_MODEL,
  CHANNEL_PAIR_NOTE_URL as UI_CHANNEL_PAIR_NOTE_URL,
  SERVICE_TEST_TEXT as UI_SERVICE_TEST_TEXT,
  SERVICE_TIMEOUT_LIMITS as UI_SERVICE_TIMEOUT_LIMITS,
  SERVICE_MODEL_MAX as UI_SERVICE_MODEL_MAX,
  SERVICE_URL_MAX as UI_SERVICE_URL_MAX,
  channelPairNote as uiChannelPairNote,
  normalizeServiceTimeout as uiNormalizeServiceTimeout,
  serviceTestBody as uiServiceTestBody,
  serviceTestReady as uiServiceTestReady,
  serviceTestView as uiServiceTestView,
  serviceTimeoutInput as uiServiceTimeoutInput,
  SYSTEMONE_TIMEOUT_MAX as UI_SYSTEMONE_TIMEOUT_MAX,
  SYSTEMONE_TIMEOUT_BASE as UI_SYSTEMONE_TIMEOUT_BASE,
  SYSTEMONE_TIMEOUT_STEP as UI_SYSTEMONE_TIMEOUT_STEP,
  SYSTEMONE_MAX_CANDIDATES as UI_SYSTEMONE_MAX_CANDIDATES,
  commitLayers,
  emptyRerankChannel,
  channelServiceMissing,
  channelTypeOptions,
  isCompleteRerankChannel,
  modelOptions,
  normalizeRerankChannels,
  paintGateConfig,
  paintLayers,
  paintRecallConfig,
  paintRerankConfig,
  paintScoringConfig,
  promptDraft,
  promptStatus,
  rerankPromptDraft,
  rerankPromptStatus,
  rerankChannelsText,
} from "../ui/assets/recall-layers.js";
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
function recallSdk({ values = {}, fetchImpl, dataDir, logger, reads, models }) {
  const counter = reads || { count: 0 };
  const sink = logger || {};
  return {
    dataDir,
    reads: counter,
    models,
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

// ---- mock 宿主模型（ctx.models）----
// 记录每次调用的形状；utility / stream 的具体返回值由用例决定。
function modelSdk({ utility, stream } = {}) {
  const calls = { utility: [], stream: [], cancel: [] };
  return {
    calls,
    models: {
      utility: async (request) => {
        calls.utility.push(request);
        return utility ? utility(request) : { text: "" };
      },
      stream: async (request) => {
        calls.stream.push(request);
        return stream ? stream(request) : new Response("");
      },
      cancel: async (requestId) => {
        calls.cancel.push(requestId);
      },
    },
  };
}

function ndjsonResponse(events) {
  return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
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
  const memoryStart = html.indexOf('id="panel-memory"');
  const skillStart = html.indexOf('id="panel-skill"');
  const summaryIdx = html.indexOf('id="checksSummary"');
  check("两栏与日志区都找得到", colsStart > 0 && colsEnd > colsStart && logsIdx > colsEnd);
  check("peer 列表不在中枢卡 / 两栏里", peerIdx > colsEnd, `peerIdx=${peerIdx} colsEnd=${colsEnd}`);
  check("peer 计数也跟着搬出两栏", peerCountIdx > colsEnd);
  check("peer 栏在记忆页里", peerIdx > memoryStart && peerIdx < skillStart,
    `peer=${peerIdx} memory=${memoryStart}..${skillStart}`);
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

  // ---- llm 判断的配置：一个模型标识 + 提示词 ----
  eq("gateModel 默认空（用默认通道）", DEFAULTS.gateModel, "");
  eq("空串就是默认通道", normalizeGateModel(""), "");
  eq("只有空白也算空", normalizeGateModel("   "), "");
  eq("provider/model 原样保留", normalizeGateModel(" deepseek/deepseek-flash "), "deepseek/deepseek-flash");
  eq("缺 provider 的形状回退空", normalizeGateModel("/flash"), "");
  eq("缺 model 的形状回退空", normalizeGateModel("deepseek/"), "");
  eq("没有斜杠的形状回退空", normalizeGateModel("deepseek-flash"), "");
  eq("非字符串回退空", normalizeGateModel({ provider: "p" }), "");
  eq("带空格的标识回退空", normalizeGateModel("deep seek/flash"), "");
  eq("数字 gatePrompt 给空串", normalizeGatePrompt(1), "");
  eq(
    "gatePrompt 截断到上限",
    Array.from(normalizeGatePrompt("字".repeat(GATE_PROMPT_MAX + 50))).length,
    GATE_PROMPT_MAX,
  );

  const gateSet = await readSwitches(
    sdkWith({
      recallGate: "llm",
      gatePrompt: "提".repeat(GATE_PROMPT_MAX + 5),
      gateModel: "  deepseek/deepseek-flash  ",
    }),
  );
  eq("recallGate 读到 llm", gateSet.recallGate, "llm");
  eq(
    "readSwitches 也截断提示词",
    Array.from(gateSet.gatePrompt).length,
    GATE_PROMPT_MAX,
  );
  eq("readSwitches 读到模型标识", gateSet.gateModel, "deepseek/deepseek-flash");

  const gateBad = await readSwitches(sdkWith({ gateModel: "bogus-shape" }));
  eq("存量非法 gateModel 回退空", gateBad.gateModel, "");
  eq("未填时 gateModel 为空", (await readSwitches(sdkWith({}))).gateModel, "");

  // ---- 结果重排：默认关，非法值回 off，模型标识复用 gate 的解析 ----
  eq("rerank 默认 off", DEFAULTS.rerank, "off");
  eq("RERANK_MODES 只有 off / llm", RERANK_MODES, ["off", "llm"]);
  eq("未配置时 rerank 为 off", (await readSwitches(sdkWith({}))).rerank, "off");
  eq("rerank 读到 llm", (await readSwitches(sdkWith({ rerank: "llm" }))).rerank, "llm");
  eq("非法 rerank 回退 off", normalizeRerank("rules"), "off");
  eq("数字 rerank 回退 off", normalizeRerank(1), "off");
  eq("大小写不匹配也回退", normalizeRerank("LLM"), "off");
  eq("rerankModel 空串就是默认通道", normalizeRerankModel(""), "");
  eq("rerankModel 与 gateModel 同形", normalizeRerankModel(" p1/m1 "), "p1/m1");
  eq("rerankModel 缺 provider 回退空", normalizeRerankModel("m1"), "");
  eq("rerankPrompt 默认空（用内置模板）", DEFAULTS.rerankPrompt, "");
  eq("数字 rerankPrompt 给空串", normalizeRerankPrompt(1), "");
  eq(
    "rerankPrompt 截断到上限",
    Array.from(normalizeRerankPrompt("字".repeat(RERANK_PROMPT_MAX + 50))).length,
    RERANK_PROMPT_MAX,
  );

  const rerankSet = await readSwitches(
    sdkWith({
      rerank: "llm",
      rerankPrompt: "提".repeat(RERANK_PROMPT_MAX + 5),
      rerankModel: "  deepseek/deepseek-flash  ",
    }),
  );
  eq("readSwitches 读到 rerank", rerankSet.rerank, "llm");
  eq(
    "readSwitches 也截断重排提示词",
    Array.from(rerankSet.rerankPrompt).length,
    RERANK_PROMPT_MAX,
  );
  eq("readSwitches 读到重排模型", rerankSet.rerankModel, "deepseek/deepseek-flash");
  eq(
    "存量非法 rerankModel 回退空",
    (await readSwitches(sdkWith({ rerankModel: "bogus-shape" }))).rerankModel,
    "",
  );

  // ---- 精排通道：合法 / 非法 JSON / 字段不全 / 超过 8 路 ----
  eq("默认没有精排通道", DEFAULTS.rerankChannels, "");
  eq("未配置时通道为空数组", (await readSwitches(sdkWith({}))).rerankChannels, []);

  const channelWarnings = [];
  const channelWarn = (message) => channelWarnings.push(message);
  const parsedChannels = parseRerankChannels(
    JSON.stringify([
      {
        type: "rerank",
        name: "本地 rerank",
        url: "http://127.0.0.1:8080/",
        model: "bge-reranker",
        weight: 2,
        enabled: true,
      },
      { type: "systemone", url: "https://example.test", model: "small" },
      { type: "model", name: "宿主", model: "", enabled: false },
    ]),
    channelWarn,
  );
  eq("合法通道三项都保留", parsedChannels.length, 3);
  eq("URL 末尾斜杠被去掉", parsedChannels[0].url, "http://127.0.0.1:8080");
  eq("weight 缺省为 1", parsedChannels[1].weight, 1);
  eq("enabled 缺省为 true", parsedChannels[1].enabled, true);
  eq("model 类型允许空模型", parsedChannels[2].model, "");
  eq("合法配置不记 warn", channelWarnings, []);

  const badJsonWarnings = [];
  eq(
    "非法 JSON 回空数组",
    parseRerankChannels("{oops", (message) => badJsonWarnings.push(message)),
    [],
  );
  eq("非法 JSON 记一条 warn", badJsonWarnings.length, 1);
  eq("不是数组也回空数组", parseRerankChannels('{"type":"model"}'), []);
  eq("空串回空数组", parseRerankChannels("   "), []);

  const incompleteWarnings = [];
  const incomplete = parseRerankChannels(
    JSON.stringify([
      { type: "rerank", url: "http://h", model: "m" },
      { type: "rerank", url: "http://h" },
      { type: "bogus", url: "http://h", model: "m" },
      { type: "model", model: "m1" },
      { type: "systemone", model: "m", url: "ftp://h" },
    ]),
    (message) => incompleteWarnings.push(message),
  );
  eq("类型不认识 / 形状不对的整项丢弃，只靠服务配置的通道保留", incomplete.length, 2);
  eq("丢弃时每项各记一条 warn", incompleteWarnings.length, 3);
  eq(
    "合法项原样留下",
    [incomplete[0].type, incomplete[0].model],
    ["rerank", "m"],
  );
  eq(
    "只写类型的通道也留下（端点由打分服务提供）",
    [incomplete[1].type, incomplete[1].url, incomplete[1].model],
    ["rerank", "http://h", ""],
  );

  const many = Array.from({ length: 10 }, (_, index) => ({
    type: "model",
    model: "",
    name: `c${index}`,
  }));
  const cappedWarnings = [];
  eq(
    "超过 8 路只留前 8 路",
    parseRerankChannels(JSON.stringify(many), (message) => cappedWarnings.push(message)).length,
    RERANK_CHANNELS_MAX,
  );
  eq("只保留前 8 路", parseRerankChannels(JSON.stringify(many))[7].name, "c7");
  eq("超过 8 路记一条 warn", cappedWarnings.length, 1);

  eq("通道类型只有三种", RERANK_CHANNEL_TYPES, ["rerank", "systemone", "model"]);
  eq(
    "单项解析：只写类型也接受（运行时用打分服务）",
    parseRerankChannel({ type: "rerank", model: "m" }),
    { type: "rerank", name: "", url: "", model: "m", weight: 1, enabled: true },
  );
  eq(
    "单项解析：出现了 URL 就必须合法",
    parseRerankChannel({ type: "rerank", url: "ftp://h", model: "m" }),
    null,
  );
  eq(
    "单项解析：权重越界给 null",
    parseRerankChannel({ type: "model", weight: 11 }),
    null,
  );
  eq(
    "单项解析：保留可选 timeoutMs",
    parseRerankChannel({ type: "model", timeoutMs: 120 }).timeoutMs,
    120,
  );
  eq(
    "单项解析：timeoutMs 越界给 null",
    parseRerankChannel({ type: "model", timeoutMs: 0 }),
    null,
  );
  eq(
    "serialize 会重新校验并收敛形状",
    serializeRerankChannels([{ type: "model", model: "" }, { type: "rerank" }]),
    JSON.stringify([
      { type: "model", name: "", url: "", model: "", weight: 1, enabled: true },
      { type: "rerank", name: "", url: "", model: "", weight: 1, enabled: true },
    ]),
  );
  eq(
    "readSwitches 解析通道 JSON",
    (await readSwitches(
      sdkWith({
        rerankChannels: JSON.stringify([
          { type: "rerank", url: "http://h:1", model: "m", weight: 1 },
        ]),
      }),
    )).rerankChannels.length,
    1,
  );

  // ---- 打分服务：四个新配置项的归一化 ----
  eq("精排服务地址默认空", DEFAULTS.rerankServiceUrl, "");
  eq("决策服务模型默认空", DEFAULTS.systemoneServiceModel, "");
  eq(
    "未配置时四个服务字段都是空",
    await readSwitches(sdkWith({})).then((sw) => [
      sw.rerankServiceUrl,
      sw.rerankServiceModel,
      sw.systemoneServiceUrl,
      sw.systemoneServiceModel,
    ]),
    ["", "", "", ""],
  );

  eq("服务 URL 接受 http", normalizeServiceUrl("http://127.0.0.1:8098"), "http://127.0.0.1:8098");
  eq("服务 URL 接受 https", normalizeServiceUrl("https://rerank.test"), "https://rerank.test");
  eq("服务 URL 去首尾空白", normalizeServiceUrl("  http://h:1  "), "http://h:1");
  eq("服务 URL 去尾部斜杠", normalizeServiceUrl("http://h:1///"), "http://h:1");
  eq("非 http(s) 的服务 URL 当未配置", normalizeServiceUrl("ftp://h"), "");
  eq("缺协议的服务 URL 当未配置", normalizeServiceUrl("127.0.0.1:8098"), "");
  eq("空串服务 URL 就是未配置", normalizeServiceUrl("   "), "");
  eq("非字符串服务 URL 当未配置", normalizeServiceUrl(8098), "");

  eq("服务模型去空白", normalizeServiceModel("  bge-reranker-v2-m3  "), "bge-reranker-v2-m3");
  eq("服务模型允许为空", normalizeServiceModel("   "), "");
  eq("非字符串服务模型给空串", normalizeServiceModel(1), "");
  eq(
    "服务模型截断到 128",
    Array.from(normalizeServiceModel("m".repeat(SERVICE_MODEL_MAX + 20))).length,
    SERVICE_MODEL_MAX,
  );

  const services = await readSwitches(
    sdkWith({
      rerankServiceUrl: "http://127.0.0.1:8098/",
      rerankServiceModel: "  bge-reranker-v2-m3  ",
      systemoneServiceUrl: "ftp://nope",
      systemoneServiceModel: "  kev-4b  ",
    }),
  );
  eq(
    "readSwitches 读服务：合法地址去尾斜杠、非法地址收敛成空",
    [
      services.rerankServiceUrl,
      services.rerankServiceModel,
      services.systemoneServiceUrl,
      services.systemoneServiceModel,
    ],
    ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "", "kev-4b"],
  );

  // ---- 打分服务超时：空 / 非数字 / 越界一律回默认值，不留非法值 ----
  eq("精排与决策的默认超时", [
    SERVICE_TIMEOUT_LIMITS.rerank.fallback,
    SERVICE_TIMEOUT_LIMITS.systemone.fallback,
  ], [800, 3500]);
  eq("精排超时可填区间", [SERVICE_TIMEOUT_LIMITS.rerank.min, SERVICE_TIMEOUT_LIMITS.rerank.max], [100, 10000]);
  eq("决策超时可填区间", [
    SERVICE_TIMEOUT_LIMITS.systemone.min,
    SERVICE_TIMEOUT_LIMITS.systemone.max,
  ], [100, 15000]);
  eq("超时字符串归一成数字", normalizeServiceTimeout(" 1200 ", "rerank"), 1200);
  eq("数字也能归一", normalizeServiceTimeout(1200, "rerank"), 1200);
  eq("小数向下取整", normalizeServiceTimeout("1200.9", "rerank"), 1200);
  eq("空串 = 没配（null，不是 800）", normalizeServiceTimeout("   ", "rerank"), null);
  eq("非数字 = 没配", normalizeServiceTimeout("abc", "rerank"), null);
  eq("低于下限 = 没配", normalizeServiceTimeout(99, "rerank"), null);
  eq("高于上限 = 没配", normalizeServiceTimeout(10001, "rerank"), null);
  eq("决策那组的上限更宽", normalizeServiceTimeout(12000, "systemone"), 12000);
  eq("同一个值对精排越界", normalizeServiceTimeout(12000, "rerank"), null);
  eq("认不出的类型按精排那组", normalizeServiceTimeout("99999", "nope"), null);
  eq("未配置取默认值", [
    serviceTimeoutOrDefault("", "rerank"),
    serviceTimeoutOrDefault(null, "systemone"),
  ], [800, 3500]);
  eq("配了就用自己的", [
    serviceTimeoutOrDefault("1200", "rerank"),
    serviceTimeoutOrDefault(9000, "systemone"),
  ], [1200, 9000]);
  eq("写回：合法值存数字串", serializeServiceTimeout("1200", "rerank"), "1200");
  eq("写回：非法值存空串（= 回默认值，不留非法值）", [
    serializeServiceTimeout("99999", "rerank"),
    serializeServiceTimeout("abc", "systemone"),
    serializeServiceTimeout("", "rerank"),
  ], ["", "", ""]);

  const timeouts = await readSwitches(
    sdkWith({ rerankServiceTimeoutMs: "1200", systemoneServiceTimeoutMs: "99999" }),
  );
  eq(
    "readSwitches 读超时：合法的给数字，越界的当没配",
    [timeouts.rerankServiceTimeoutMs, timeouts.systemoneServiceTimeoutMs],
    [1200, null],
  );
  const noTimeouts = await readSwitches(sdkWith({}));
  eq(
    "没配超时时两项都是 null（运行时靠它区分「没配」与「配了默认值」）",
    [noTimeouts.rerankServiceTimeoutMs, noTimeouts.systemoneServiceTimeoutMs],
    [null, null],
  );
  eq("DEFAULTS 里两个超时默认空", [
    DEFAULTS.rerankServiceTimeoutMs,
    DEFAULTS.systemoneServiceTimeoutMs,
  ], ["", ""]);

  // ---- 地址与模型成对 ----
  eq(
    "地址 + 模型齐全就放行",
    servicePairError("http://h:8098", "bge", "rerankServiceUrl", "rerankServiceModel"),
    null,
  );
  eq(
    "只给地址 400 理由写明配了地址就要填模型名",
    servicePairError("http://h:8098", "", "rerankServiceUrl", "rerankServiceModel"),
    "rerankServiceUrl 配了地址就要填模型名（rerankServiceModel）",
  );
  eq(
    "只给模型不拦（地址空 = 服务未配置）",
    servicePairError("", "bge", "rerankServiceUrl", "rerankServiceModel"),
    null,
  );
  eq(
    "两个都空 = 都清空，不拦",
    servicePairError("", "", "systemoneServiceUrl", "systemoneServiceModel"),
    null,
  );
  eq(
    "非法地址不算配了地址（由 URL 校验先报）",
    servicePairError("ftp://h", "", "rerankServiceUrl", "rerankServiceModel"),
    null,
  );
}

// ================= ui: 召回策略在主面板 =================
{
  const read = (name) => fs.readFileSync(path.join(import.meta.dirname, "../ui", name), "utf8");
  const html = read("panel.html");
  const panelJs = read("assets/panel.js");
  const css = read("assets/panel.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const layersJs = read("assets/recall-layers.js");
  const settingsHtml = read("settings.html");
  const settingsJs = read("assets/settings.js");

  const gateIdx = html.indexOf('id="recallGate"');
  const modeIdx = html.indexOf('id="queryMode"');
  const rerankIdx = html.indexOf('id="rerank"');
  check("面板上有召回判断下拉", gateIdx > 0, `idx=${gateIdx}`);
  check("面板上有召回查询下拉", modeIdx > 0, `idx=${modeIdx}`);
  check("面板上有结果重排下拉", rerankIdx > 0, `idx=${rerankIdx}`);
  check("召回判断有 rules 选项", html.includes('value="rules"') && html.includes("规则跳过"));
  check("召回查询有 context 选项", html.includes('value="context"') && html.includes("带上文"));
  check("结果重排有 off / llm 选项", html.includes("结果重排") && html.includes("开启") &&
    /<select id="rerank">\s*<option value="off">关<\/option>\s*<option value="llm">开启<\/option>/.test(html));

  // 位置：两栏之后、日志之前，占满整行（不在两栏里），跟 peer 名单同一栏。
  const colsStart = html.indexOf('<section class="cols">');
  const colsEnd = html.indexOf("</section>", colsStart);
  const logsIdx = html.indexOf('<section class="card logs"');
  const globalPanelStart = html.indexOf('id="panel-global"');
  const memoryPanelStart = html.indexOf('id="panel-memory"');
  const skillPanelStart = html.indexOf('id="panel-skill"');
  const footStart = html.indexOf('<footer id="foot"');
  const scopedIdx = html.indexOf('class="scoped-note"');
  const recallStart = html.indexOf('<section class="card recall"');
  const recallEnd = html.indexOf("</section>", recallStart);
  const peerIdx = html.indexOf('id="peerList"');
  const peerCountIdx = html.indexOf('id="peerCount"');
  check("召回管理一栏找得到", recallStart > 0 && recallEnd > recallStart,
    `recall=${recallStart}..${recallEnd}`);
  check("召回管理在两栏之后", recallStart > colsEnd, `recall=${recallStart} colsEnd=${colsEnd}`);
  check(
    "日志在全局页、召回管理在记忆页",
    logsIdx > globalPanelStart && logsIdx < memoryPanelStart &&
      recallStart > memoryPanelStart && recallStart < skillPanelStart,
    `logs=${logsIdx} global=${globalPanelStart}..${memoryPanelStart} recall=${recallStart} skill=${skillPanelStart}`,
  );
  const hubIdx = html.indexOf(">中枢<");
  const identIdx = html.indexOf(">身份<");
  check(
    "中枢与身份仍在两栏里、在召回管理之前",
    hubIdx > colsStart && hubIdx < colsEnd && identIdx > colsStart && identIdx < colsEnd &&
      identIdx < recallStart,
    `hub=${hubIdx} ident=${identIdx} cols=${colsStart}..${colsEnd} recall=${recallStart}`,
  );

  // 同一栏：三个下拉与 peer 名单都在这个 section 里。
  check(
    "三个下拉与 peer 列表在同一个 section 内",
    gateIdx > recallStart && gateIdx < recallEnd &&
      modeIdx > recallStart && modeIdx < recallEnd &&
      rerankIdx > recallStart && rerankIdx < recallEnd &&
      peerIdx > recallStart && peerIdx < recallEnd,
    `recall=${recallStart}..${recallEnd} gate=${gateIdx} mode=${modeIdx} rerank=${rerankIdx} peer=${peerIdx}`,
  );
  check("计数也在这一栏里（仍算 peer 个数）",
    peerCountIdx > recallStart && peerCountIdx < recallEnd);
  const recallTitle = html
    .slice(recallStart, recallEnd)
    .match(/<h2 class="card-title">([^<]*)<\/h2>/);
  eq("这一栏的标题是「召回管理」", recallTitle?.[1], "召回管理");
  check("召回判断在前、召回查询在后", gateIdx < modeIdx);
  check("结果重排排在召回查询之后", modeIdx < rerankIdx);
  // 这一栏的主栅格恰好三个下拉；llm 判断 / 重排展开区各有一个模型下拉。
  const advancedIdx = html.indexOf('id="gateAdvanced"');
  const rerankAdvancedIdx = html.indexOf('id="rerankAdvanced"');
  const sepAfterAdvanced = html.indexOf('<div class="recall-sep"', advancedIdx);
  check("召回判断 / 查询 / 重排是三个主下拉",
    (html.slice(recallStart, advancedIdx).match(/<select /g) || []).length === 3);
  check("llm 判断展开区只有一个模型下拉（不再分两层）",
    (html.slice(advancedIdx, rerankAdvancedIdx).match(/<select /g) || []).length === 1);
  check("重排展开区只有一个模型下拉",
    (html.slice(rerankAdvancedIdx, sepAfterAdvanced).match(/<select /g) || []).length === 1);
  // 上下两块之间要有一条分隔，不然读起来像一锅端。
  check("下拉与名单之间有分隔",
    /class="recall-sep"/.test(html.slice(recallStart, recallEnd)));

  // 技能路由从开关排里搬出来，与记忆召回平级；探针归到「前置」卡。
  const preludeStart = html.indexOf('<section id="prelude"');
  const preludeEnd = html.indexOf("</section>", preludeStart);
  const preludeBlock = html.slice(preludeStart, preludeEnd);
  const skillRouteStart = html.indexOf('<section id="skillRoute"');
  const skillRouteEnd = html.indexOf("</section>", skillRouteStart);
  const skillRouteBlock = html.slice(skillRouteStart, skillRouteEnd);
  const masterStart = html.indexOf('<section id="masterCard"');

  check("前置一块存在", preludeStart > masterStart, `prelude=${preludeStart} master=${masterStart}`);
  check("前置里有探针开关", preludeBlock.includes('data-key="probe"'));
  check("前置里有两个打分服务", preludeBlock.includes('id="scoringServices"'));
  check(
    "前置里没有技能路由",
    preludeBlock.includes('data-key="skillRouting"') === false,
    preludeBlock,
  );
  check("前置里不含下拉", preludeBlock.includes("<select") === false, preludeBlock);
  check("前置里只有一个开关（探针）",
    (preludeBlock.match(/role="switch"/g) || []).length === 1, preludeBlock);

  check("技能路由独立成一块", skillRouteStart > preludeEnd, `skill=${skillRouteStart} preludeEnd=${preludeEnd}`);
  check("技能路由那块有标题", /<h2 class="card-title">技能路由<\/h2>/.test(skillRouteBlock), skillRouteBlock);
  check("技能路由那块有开关", skillRouteBlock.includes('data-key="skillRouting"'));
  check(
    "技能路由那块只有一行说明",
    skillRouteBlock.includes("把共享技能交给助手按需调用") &&
      (skillRouteBlock.match(/class="skill-route-hint"/g) || []).length === 1,
    skillRouteBlock,
  );
  check(
    "技能路由那块没有空壳列表或占位文案",
    skillRouteBlock.includes("<ul") === false &&
      skillRouteBlock.includes("即将") === false &&
      skillRouteBlock.includes("敬请") === false,
    skillRouteBlock,
  );
  check("toggleGrid 容器已拆掉", html.includes('id="toggleGrid"') === false);
  check("召回管理在前置之后", recallStart > preludeEnd, `recall=${recallStart} preludeEnd=${preludeEnd}`);

  const logsStart = html.indexOf('<section class="card logs"');
  const globalOrder = [masterStart, preludeStart, colsStart, logsStart];
  check(
    "全局页内顺序：总闸 → 前置 → 两栏 → 日志",
    globalOrder.every((value, index) =>
      value > globalPanelStart && value < memoryPanelStart &&
      (index === 0 || value > globalOrder[index - 1]),
    ),
    globalOrder.join(" < "),
  );
  check(
    "记忆页顺序：按会话说明 → 召回管理",
    memoryPanelStart < scopedIdx && scopedIdx < recallStart &&
      recallStart < recallEnd && recallEnd < skillPanelStart,
    `memory=${memoryPanelStart} scoped=${scopedIdx} recall=${recallStart}..${recallEnd} skill=${skillPanelStart}`,
  );
  check(
    "技能页位置：技能路由在记忆页之后、页脚之前",
    skillRouteStart > skillPanelStart && skillRouteEnd < footStart,
    `skill=${skillRouteStart}..${skillRouteEnd} panel=${skillPanelStart} foot=${footStart}`,
  );

  // ---- 打分服务：总闸下面、按会话说明之前，占满整行 ----
  const scoringIdx = html.indexOf('id="scoringServices"');
  check("打分服务一块存在", scoringIdx > 0);
  check(
    "打分服务在前置卡里、仍在全局页，scoped-note 已搬到记忆页",
    scoringIdx > preludeStart && scoringIdx > globalPanelStart &&
      scoringIdx < memoryPanelStart && scoringIdx < scopedIdx &&
      scopedIdx > memoryPanelStart,
    `scoring=${scoringIdx} prelude=${preludeStart} global=${globalPanelStart} memory=${memoryPanelStart} scoped=${scopedIdx}`,
  );
  check(
    "打分服务不在两栏里",
    scoringIdx < colsStart,
    `scoring=${scoringIdx} cols=${colsStart}..${colsEnd}`,
  );
  for (const id of [
    "rerankServiceUrl",
    "rerankServiceModel",
    "rerankServiceTimeoutMs",
    "rerankServiceTest",
    "rerankServiceResult",
    "systemoneServiceUrl",
    "systemoneServiceModel",
    "systemoneServiceTimeoutMs",
    "systemoneServiceTest",
    "systemoneServiceResult",
  ]) {
    check(`打分服务字段 ${id} 在`, new RegExp(`id="${id}"`).test(html));
  }

  // 每组服务四项：地址 / 模型 / 超时 / 测试。按两个组的切片数控件，不靠整页数。
  const rerankGroupStart = html.indexOf('data-kind="rerank"');
  const systemoneGroupStart = html.indexOf('data-kind="systemone"');
  check("两组服务都有 data-kind 标记", rerankGroupStart > 0 && systemoneGroupStart > rerankGroupStart);
  const rerankGroup = html.slice(rerankGroupStart, systemoneGroupStart);
  const systemoneGroup = html.slice(systemoneGroupStart, preludeEnd);
  for (const [name, group] of [
    ["精排服务", rerankGroup],
    ["决策服务", systemoneGroup],
  ]) {
    eq(`${name}三个输入框（地址 / 模型 / 超时）`, (group.match(/<input /g) || []).length, 3);
    eq(`${name}一个测试按钮`, (group.match(/<button /g) || []).length, 1);
    check(`${name}的测试按钮写着「测试」`, />测试<\/button>/.test(group), group.slice(0, 80));
    eq(`${name}一个结果行`, (group.match(/class="service-result"/g) || []).length, 1);
    check(`${name}的结果行默认隐藏`, /class="service-result" hidden/.test(group));
    check(`${name}的超时输入框是数字框`, /type="number"/.test(group));
  }
  eq(
    "精排超时 placeholder 写默认值与单位",
    /id="rerankServiceTimeoutMs"[^>]*placeholder="800 ms"/.test(html),
    true,
  );
  eq(
    "决策超时 placeholder 写默认值与单位",
    /id="systemoneServiceTimeoutMs"[^>]*placeholder="3500 ms"/.test(html),
    true,
  );
  eq(
    "两个超时输入框的上下限跟着各自类型",
    [
      /id="rerankServiceTimeoutMs"[^>]*max="10000"/.test(html),
      /id="systemoneServiceTimeoutMs"[^>]*max="15000"/.test(html),
    ],
    [true, true],
  );
  check(
    "精排服务两个占位文案在",
    html.includes('placeholder="http://127.0.0.1:8098"') &&
      html.includes('placeholder="bge-reranker-v2-m3"'),
  );
  check(
    "决策服务两个占位文案在",
    html.includes('placeholder="http://192.168.50.142:8097"') &&
      html.includes('placeholder="kev-4b"'),
  );
  check(
    "精排服务说明写清走 /v1/rerank 且留空不能选",
    html.includes("交叉编码器服务，走 /v1/rerank。留空则精排通道里不能选这一类。"),
  );
  check(
    "决策服务说明写清走 /v1/systemone 且留空不能选",
    html.includes("决策模型服务，走 /v1/systemone。留空则精排通道里不能选这一类。"),
  );
  check("打分服务有样式", /\n\.services \{/.test(css));
  check("服务两栏有栅格", /\n\.service-grid \{/.test(css) && /1fr 1fr/.test(css));
  check("总闸关着时打分服务也置灰", panelJs.includes('#scoringServices'));
  // 四项一排：地址 / 模型 / 窄的超时 / 测试。
  check(
    "服务行是四列栅格（超时窄、按钮自宽）",
    /\n\.service-fields \{[\s\S]{0,200}grid-template-columns:\s*1\.4fr 1fr 0\.62fr auto/.test(css),
  );
  check("测试按钮靠底对齐", /\.field\.service-test \{[\s\S]{0,120}align-items:\s*flex-end/.test(css));
  for (const tone of ["ok", "bad", "muted"]) {
    check(`结果行的 ${tone} 档有样式`, new RegExp(`\\.service-result\\.${tone} \\{`).test(css));
  }
  check("结果行样式存在", /\n\.service-result \{/.test(css));
  check("整对回退说明有样式", /\n\.channel-pair-note \{/.test(css));

  // 前端的接线点：新路由、测试函数、结果行与回退说明。
  check("面板往 service-test 发请求", panelJs.includes('/recall-mode/service-test'));
  check("面板有服务测试的执行函数", /async function runServiceTest\(kind\)/.test(panelJs));
  check("测试按钮进 loading 并禁用", /button\.disabled = true/.test(panelJs) &&
    panelJs.includes('"测试中…"'));
  check("两个测试按钮都绑上了", /for \(const \[kind, buttonId\] of SERVICE_TESTS\)/.test(panelJs));
  check("结果行按 tone 上色", /service-result \$\{view\.tone\}/.test(panelJs));
  check("通道行会画整对回退说明", panelJs.includes("channelPairNote(channel, layers)"));

  // 通道空态文案不能指向“下面”：打分服务在通道上面。
  check("添加通道旁提示指向上面", html.includes("先在上面配好打分服务"));
  check("提示不写“先在下面”", html.includes("先在下面配好打分服务") === false);
  check("技能路由那块有样式", /\n\.skill-route \{/.test(css));
  check("总闸关着时技能路由也置灰", panelJs.includes(".skill-route"));

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
    "召回那三个下拉并排（一行三列）",
    /grid-template-columns\s*:\s*1fr 1fr 1fr/.test(css.slice(recallRule, css.indexOf("}", recallRule))),
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
  check(
    "结果重排下拉也绑 change 即时提交",
    /rerank"\)\.addEventListener\("change"[\s\S]{0,80}saveLayers\b/.test(panelJs),
  );
  check("面板没有为召回单设保存按钮", html.includes("recallSave") === false);

  // ---- llm 档：选项、展开块、提示词与模型来源 ----
  check("召回判断有 llm 选项", html.includes('value="llm"') && html.includes("模型判断（用宿主模型）"));
  check("llm 展开块存在", advancedIdx > 0);
  const advancedTag = html.slice(advancedIdx, html.indexOf(">", advancedIdx));
  check("llm 展开块默认 hidden", /\shidden(?:\s|$)/.test(advancedTag), advancedTag);
  check("提示词框 rows=4", /id="gatePrompt"[^>]*rows="4"/.test(html));
  // 默认提示词靠 value 填，不靠 placeholder：placeholder 一敲键盘就消失，当不了草稿。
  const promptTag = /<textarea[^>]*id="gatePrompt"[^>]*>/.exec(html)?.[0] ?? "";
  check("提示词框没有 placeholder", promptTag.includes("placeholder") === false, promptTag);
  check(
    "默认提示词不再写进 HTML 的 placeholder",
    html.includes(DEFAULT_GATE_PROMPT) === false,
  );
  check("恢复默认按钮在", /id="gateResetPrompt"[^>]*>\s*恢复默认\s*</.test(html));
  check("提示词状态位在", /id="gatePromptStatus"/.test(html));
  check(
    "提示词框下有占位符说明",
    html.includes("用 {{message}} 表示当前这条用户消息；没写它的话，消息会自动接在末尾。"),
  );
  check(
    "恢复默认走正常提交",
    /gateResetPrompt"\)\.addEventListener\("click"[\s\S]{0,200}saveLayers\(\)/.test(panelJs),
  );
  check(
    "提示词框绑 input 并标记过 touched",
    /gatePrompt"\)\.addEventListener\("input"/.test(panelJs) &&
      panelJs.includes("promptTouched = true"),
  );
  check("空提示词不再写“留空使用默认”", html.includes("留空使用默认提示词") === false);
  // 模型只能一步选到位：一个下拉，首项是默认；没有 radio，也没有第二层 provider + 模型。
  check("判断模型只有一个下拉", (html.match(/<select[^>]*id="gateModel"/g) || []).length === 1);
  check(
    "模型下拉首项是默认",
    /<select id="gateModel">\s*<option value="">默认（宿主辅助模型）<\/option>/.test(html),
  );
  check("没有模型来源两个单选", html.includes('name="gateModelMode"') === false);
  check("没有第二层 provider 下拉", html.includes('id="gateProvider"') === false);
  check("没有可展开的自选区", html.includes('id="gateCustom"') === false);
  check("模型下拉不预设禁用", /id="gateModel"[^>]*disabled/.test(html) === false);
  check("目录读不到时留原因位", /id="gateModelsHint"/.test(html));
  check("面板读模型目录", panelJs.includes('jsonGet("/models")'));
  check(
    "llm 展开区受召回判断控制",
    panelJs.includes("paintGatePanels") && panelJs.includes("gateAdvanced"),
  );
  check("模型下拉由目录填充", panelJs.includes("modelOptions(modelCatalog.models)"));
  check("目录坏了只留默认项", panelJs.includes("[DEFAULT_MODEL_OPTION]"));
  check("新控件有样式", /\n\.gate-advanced \{/.test(css));
  check("textarea 有输入框样式", /\n\.field textarea \{/.test(css));

  // ---- 结果重排：下拉、展开块、提示词与模型 ----
  check("重排展开块存在", rerankAdvancedIdx > 0);
  const rerankAdvancedTag = html.slice(rerankAdvancedIdx, html.indexOf(">", rerankAdvancedIdx));
  check("重排展开块默认 hidden", /\shidden(?:\s|$)/.test(rerankAdvancedTag), rerankAdvancedTag);
  check("重排提示词框 rows=4", /id="rerankPrompt"[^>]*rows="4"/.test(html));
  const rerankPromptTag = /<textarea[^>]*id="rerankPrompt"[^>]*>/.exec(html)?.[0] ?? "";
  check("重排提示词框没有 placeholder", rerankPromptTag.includes("placeholder") === false, rerankPromptTag);
  check("重排恢复默认按钮在", /id="rerankResetPrompt"[^>]*>\s*恢复默认\s*</.test(html));
  check("重排提示词状态位在", /id="rerankPromptStatus"/.test(html));
  check(
    "重排提示词框下有占位符说明",
    html.includes("用 {{message}} 表示当前这条用户消息") &&
      html.includes("用 {{candidates}} 表示候选清单"),
  );
  check(
    "重排恢复默认走正常提交",
    /rerankResetPrompt"\)\.addEventListener\("click"[\s\S]{0,220}saveLayers\(\)/.test(panelJs),
  );
  check(
    "重排提示词框绑 input 并标记过 touched",
    /rerankPrompt"\)\.addEventListener\("input"/.test(panelJs) &&
      panelJs.includes("rerankPromptTouched = true"),
  );
  check("重排模型只有一个下拉", (html.match(/<select[^>]*id="rerankModel"/g) || []).length === 1);
  check(
    "重排模型下拉首项是默认",
    /<select id="rerankModel">\s*<option value="">默认（宿主辅助模型）<\/option>/.test(html),
  );
  check("重排模型下拉不预设禁用", /id="rerankModel"[^>]*disabled/.test(html) === false);
  check("重排目录读不到时留原因位", /id="rerankModelsHint"/.test(html));
  check(
    "重排展开区受结果重排控制",
    panelJs.includes("paintRerankPanels") && panelJs.includes("rerankAdvanced"),
  );

  // ---- 精排通道：列表、添加、空态、测试 ----
  check("面板有通道列表", html.includes('id="rerankChannelList"'));
  check(
    "面板有添加通道按钮",
    /id="rerankAddChannel"[^>]*>\s*添加通道\s*</.test(html),
  );
  check("通道为空时有空态文案", html.includes("还没有通道，精排不会生效"));
  check("面板有测试按钮", /id="rerankTestBtn"[^>]*>\s*测试\s*</.test(html));
  check("面板有测试结果位", html.includes('id="rerankTestResult"'));
  check(
    "通道行由脚本渲染可选类型",
    panelJs.includes("renderRerankChannels") && panelJs.includes("channelTypeOptions"),
  );
  check("通道行不再有 URL 与模型输入", panelJs.includes('channelCell("URL"') === false &&
    panelJs.includes('channelCell("模型"') === false &&
    panelJs.includes('textInput(channel.url') === false &&
    panelJs.includes('textInput(channel.model') === false);
  check("服务未配置的通道会标红", panelJs.includes("channelServiceMissing") &&
    panelJs.includes("服务未配置，不会生效"));
  check("两个服务都没配时添加按钮禁用", panelJs.includes("typeOptions.every") &&
    panelJs.includes("|| noService"));
  check("删除按钮在通道行里", panelJs.includes('textContent = "删除"'));
  check("权重输入有边界", panelJs.includes('weight.min = "0.1"') && panelJs.includes('weight.max = "10"'));
  check("添加通道用空模板", panelJs.includes("emptyRerankChannel(firstType)"));
  check("测试按钮打新端点", panelJs.includes('jsonPost("/recall-mode/test"'));
  check("通道行有样式", /\n\.channel-row \{/.test(css));
  check("测试结果有样式", /\n\.channel-result \{/.test(css));
  eq("通道上限与后端一致", UI_RERANK_CHANNELS_MAX, RERANK_CHANNELS_MAX);
  eq("三种通道都有下拉文案", Object.keys(RERANK_CHANNEL_LABELS), ["rerank", "systemone", "model"]);
  // 界面那一格的默认超时跟后端常量同值：两边对不上就是界面在骗人。
  eq("通道默认超时与后端一致", UI_RERANK_CHANNEL_TIMEOUT_DEFAULTS, {
    rerank: RERANK_CHANNEL_TIMEOUT_MS,
    systemone: SYSTEMONE_CHANNEL_TIMEOUT_MS,
    model: RERANK_MODEL_CHANNEL_TIMEOUT_MS,
  });
  eq("systemone 超时上限与后端一致", UI_SYSTEMONE_TIMEOUT_MAX, SYSTEMONE_TIMEOUT_MAX_MS);
  eq(
    "自适应两个参数与后端一致",
    [UI_SYSTEMONE_TIMEOUT_BASE, UI_SYSTEMONE_TIMEOUT_STEP],
    [SYSTEMONE_CHANNEL_TIMEOUT_MS, SYSTEMONE_TIMEOUT_PER_CANDIDATE_MS],
  );
  eq("候选上限与后端一致", UI_SYSTEMONE_MAX_CANDIDATES, SYSTEMONE_MAX_CANDIDATES);
  eq("服务模型上限与后端一致", UI_SERVICE_MODEL_MAX, SERVICE_MODEL_MAX);
  eq("服务地址上限与后端一致", UI_SERVICE_URL_MAX, RERANK_CHANNEL_URL_MAX);
  check(
    "面板提示写明默认 5 条",
    html.includes("默认 5 条") && html.includes(`只问前 ${SYSTEMONE_MAX_CANDIDATES}`) === false,
  );
  check("通道行能编辑超时", panelJs.includes('channelCell("超时（ms）", timeout)'));
  check(
    "超时那一格注明候选越多越慢",
    html.includes("超时（ms）") && html.includes("候选越多越慢"),
  );
  check(
    "通道说明写清超时三层优先级",
    html.includes("通道自带 &gt; 服务配置 &gt; 类型默认值"),
    html.slice(html.indexOf("超时优先级") - 40, html.indexOf("超时优先级") + 60),
  );
  check(
    "通道说明写清地址与模型成对",
    html.includes("通道自带的地址与模型成对生效，只填一半就整对改用服务配置"),
  );
  // 两份默认模板各只有一份：HTML 里零份，recall-layers.js 里恰好一份。
  check("判断默认模板不在 HTML 里", html.includes(DEFAULT_GATE_PROMPT) === false);
  check("重排默认模板不在 HTML 里", html.includes(DEFAULT_RERANK_PROMPT) === false);
  eq(
    "判断默认模板在 recall-layers.js 里只有一份",
    layersJs.split(DEFAULT_GATE_PROMPT).length - 1,
    1,
  );
  eq(
    "重排默认模板在 recall-layers.js 里只有一份",
    layersJs.split(DEFAULT_RERANK_PROMPT).length - 1,
    1,
  );
  eq("两份重排默认提示词逐字一致", UI_DEFAULT_RERANK_PROMPT, DEFAULT_RERANK_PROMPT);

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
  eq("manifest 里 recallGate 枚举", props.recallGate?.enum, ["off", "rules", "llm"]);
  eq("manifest 里 queryMode 默认 last", props.queryMode?.default, "last");
  eq("manifest 里 queryMode 枚举", props.queryMode?.enum, ["last", "context"]);
  eq("manifest 里 gateModel 默认空", props.gateModel?.default, "");
  eq("manifest 里没有 gateModelMode", props.gateModelMode, undefined);
  eq("manifest 里没有 gateProvider", props.gateProvider, undefined);
  eq("manifest 里 gatePrompt 默认空", props.gatePrompt?.default, "");
  eq("manifest 里 rerank 默认 off", props.rerank?.default, "off");
  eq("manifest 里 rerank 枚举", props.rerank?.enum, ["off", "llm"]);
  eq("manifest 里 rerankPrompt 默认空", props.rerankPrompt?.default, "");
  eq("manifest 里 rerankModel 默认空", props.rerankModel?.default, "");
  eq("manifest 里 rerankServiceUrl 默认空", props.rerankServiceUrl?.default, "");
  eq("manifest 里 rerankServiceModel 默认空", props.rerankServiceModel?.default, "");
  eq("manifest 里 systemoneServiceUrl 默认空", props.systemoneServiceUrl?.default, "");
  eq("manifest 里 systemoneServiceModel 默认空", props.systemoneServiceModel?.default, "");
  eq("manifest 里 rerankServiceTimeoutMs 默认空", props.rerankServiceTimeoutMs?.default, "");
  eq("manifest 里 systemoneServiceTimeoutMs 默认空", props.systemoneServiceTimeoutMs?.default, "");
  check(
    "manifest 的超时说明写了默认值与可填区间",
    String(props.rerankServiceTimeoutMs?.description).includes("800") &&
      String(props.rerankServiceTimeoutMs?.description).includes("100") &&
      String(props.rerankServiceTimeoutMs?.description).includes("10000") &&
      String(props.systemoneServiceTimeoutMs?.description).includes("3500") &&
      String(props.systemoneServiceTimeoutMs?.description).includes("15000"),
    JSON.stringify([props.rerankServiceTimeoutMs?.description, props.systemoneServiceTimeoutMs?.description]),
  );
  check(
    "manifest 里每个 DEFAULTS 键都有声明（新增配置不能只活在代码里）",
    Object.keys(DEFAULTS).every((key) => props[key] !== undefined),
    Object.keys(DEFAULTS).filter((key) => props[key] === undefined).join(", "),
  );
  check("manifest 声明 app/models.infer", manifest.capabilities.includes("app/models.infer"));
}

// ================= ui: 面板标签页 =================
{
  const read = (name) => fs.readFileSync(path.join(import.meta.dirname, "../ui", name), "utf8");
  const html = read("panel.html");
  const panelJs = read("assets/panel.js");
  const css = read("assets/panel.css").replace(/\/\*[\s\S]*?\*\//g, "");

  const globalStart = html.indexOf('id="panel-global"');
  const memoryStart = html.indexOf('id="panel-memory"');
  const skillStart = html.indexOf('id="panel-skill"');
  const footStart = html.indexOf('<footer id="foot"');
  const globalPanel = html.slice(globalStart, memoryStart);
  const memoryPanel = html.slice(memoryStart, skillStart);
  const skillPanel = html.slice(skillStart, footStart);
  const panelTag = (name) =>
    new RegExp(`<div[^>]*id="panel-${name}"[^>]*>`).exec(html)?.[0] ?? "";

  // ---- 标签按钮 ----
  check("标签栏只有一个 tablist", (html.match(/role="tablist"/g) || []).length === 1);
  check(
    "三个标签都在",
    ["global", "memory", "skill"].every((name) => html.includes(`id="tab-${name}"`)),
  );
  eq("role=tab 恰好三枚", (html.match(/role="tab"/g) || []).length, 3);
  check(
    "data-tab 三值齐全",
    ["global", "memory", "skill"].every((name) => html.includes(`data-tab="${name}"`)),
  );
  eq("aria-selected=true 恰好一枚", (html.match(/aria-selected="true"/g) || []).length, 1);
  const globalTabTag = /<button[^>]*id="tab-global"[^>]*>/.exec(html)?.[0] ?? "";
  check(
    "默认选中全局页且可聚焦",
    /aria-selected="true"/.test(globalTabTag) && /tabindex="0"/.test(globalTabTag),
    globalTabTag,
  );
  for (const name of ["memory", "skill"]) {
    const tag = new RegExp(`<button[^>]*id="tab-${name}"[^>]*>`).exec(html)?.[0] ?? "";
    check(
      `未选中的 ${name} 标签 aria-selected=false / tabindex=-1`,
      /aria-selected="false"/.test(tag) && /tabindex="-1"/.test(tag),
      tag,
    );
  }
  for (const name of ["global", "memory", "skill"]) {
    check(
      `${name} 标签 aria-controls 指向内容块`,
      new RegExp(`aria-controls="panel-${name}"`).test(html),
    );
  }

  // ---- tabpanel ----
  eq("role=tabpanel 恰好三块", (html.match(/role="tabpanel"/g) || []).length, 3);
  for (const name of ["global", "memory", "skill"]) {
    check(
      `${name} 内容块用对应 tab 标注`,
      panelTag(name).includes(`aria-labelledby="tab-${name}"`),
      panelTag(name),
    );
    check(`${name} 内容块有 tab-panel 类`, /class="tab-panel"/.test(panelTag(name)), panelTag(name));
  }
  check("初始只显示全局页", panelTag("global").includes("hidden") === false, panelTag("global"));
  check("初始隐藏记忆页", /\shidden(?:\s|>)/.test(panelTag("memory")), panelTag("memory"));
  check("初始隐藏技能页", /\shidden(?:\s|>)/.test(panelTag("skill")), panelTag("skill"));

  // ---- 内容归属 ----
  for (const needle of [
    'id="swEnabled"',
    'id="prelude"',
    'id="scoringServices"',
    'class="cols"',
    'class="card logs"',
  ]) {
    check(`全局页包含 ${needle}`, globalPanel.includes(needle), needle);
  }
  for (const needle of [
    'class="scoped-note"',
    'class="card recall"',
    'id="recallGate"',
    'id="queryMode"',
    'id="rerank"',
    'id="peerList"',
  ]) {
    check(`记忆页包含 ${needle}`, memoryPanel.includes(needle), needle);
  }
  check(
    "scoped-note 在记忆页顶部、召回管理之前",
    memoryPanel.indexOf('class="scoped-note"') > 0 &&
      memoryPanel.indexOf('class="scoped-note"') < memoryPanel.indexOf('class="card recall"'),
  );
  for (const needle of ['id="skillRoute"', 'data-key="skillRouting"']) {
    check(`技能页包含 ${needle}`, skillPanel.includes(needle), needle);
  }
  for (const needle of ["recallGate", "peerList", "skillRouting"]) {
    check(`全局页不包含 ${needle}`, globalPanel.includes(needle) === false, needle);
  }

  // ---- 切换接线与日志折叠（三页共用顶部 / 页脚） ----
  check(
    "selectTab 同时改 aria-selected / tabindex / hidden",
    panelJs.includes('button.setAttribute("aria-selected"') &&
      panelJs.includes("button.tabIndex = selected ? 0 : -1") &&
      panelJs.includes("panel.hidden = !selected"),
  );
  check(
    "启动时先摆好上次停的页再读数据",
    panelJs.includes("selectTab(readTab(safeLocalStorage()), { persist: false })"),
  );
  check(
    "点击标签会持久化并带键盘切换",
    /node\.addEventListener\("click", \(\) => selectTab\(tab, \{ persist: true \}\)\)/.test(panelJs) &&
      panelJs.includes("event.key === \"ArrowRight\"") &&
      panelJs.includes("event.key === \"Home\""),
  );
  check(
    "日志折叠仍在全局页",
    globalPanel.includes('id="logToggle"') && globalPanel.includes('id="logBody"'),
  );
  check("日志正文默认隐藏", /id="logBody"[^>]*hidden/.test(html));
  check(
    "折叠按钮仍只切隐藏与文案",
    /\$\("logToggle"\)\.addEventListener\("click"/.test(panelJs) &&
      panelJs.includes('$("logBody").hidden = !logOpen') &&
      panelJs.includes('logOpen ? "收起" : "展开"'),
  );

  // ---- localStorage 键与归一化 ----
  eq("tab 记忆键", TAB_KEY, "hanako-openviking:tab");
  check("tab 记忆键带 app 前缀", TAB_KEY.startsWith("hanako-openviking:"));
  eq("默认页", DEFAULT_TAB, "global");
  eq("三个页名", TABS, ["global", "memory", "skill"]);
  for (const value of [null, undefined, "", "nope", "Global", "MEMORY", " memory "]) {
    eq(`非法值 ${JSON.stringify(value)} 回默认页`, normalizeTab(value), "global");
  }
  for (const value of ["global", "memory", "skill"]) {
    eq(`合法值 ${value} 原样返回`, normalizeTab(value), value);
  }
  eq("空 storage 回默认页", readTab(null), "global");
  eq("storage 读不到回默认页", readTab({ getItem: () => null }), "global");
  eq("storage 读到合法值", readTab({ getItem: () => "memory" }), "memory");
  eq("storage 读到非法值回默认页", readTab({ getItem: () => "xx" }), "global");
  eq(
    "storage 读抛错不崩、回默认页",
    readTab({
      getItem: () => {
        throw new Error("denied");
      },
    }),
    "global",
  );
  {
    const store = new Map();
    const fake = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };
    writeTab(fake, "skill");
    eq("writeTab 写入正确的键值", [store.get(TAB_KEY), store.size], ["skill", 1]);
    eq("writeTab 后 readTab 能读回", readTab(fake), "skill");
  }
  eq(
    "writeTab 在 setItem 抛错时不崩",
    (() => {
      try {
        writeTab(
          {
            setItem: () => {
              throw new Error("quota");
            },
          },
          "memory",
        );
        return true;
      } catch {
        return false;
      }
    })(),
    true,
  );

  // ---- 置灰覆盖三页 ----
  const dimSource = panelJs.slice(
    panelJs.indexOf("function paintDim("),
    panelJs.indexOf("function renderStatus("),
  );
  const dimSelector = dimSource.match(/querySelectorAll\(\s*"([^"]+)"/)?.[1] ?? "";
  check("paintDim 选择器取到了", dimSelector.length > 0, dimSource.slice(0, 120));
  for (const selector of [
    ".toggle",
    "#scoringServices",
    ".recall-grid",
    ".gate-advanced",
    ".skill-route",
  ]) {
    check(`置灰覆盖 ${selector}`, dimSelector.includes(selector), dimSelector);
  }
  check(
    "全局页有可置灰节点",
    /class="toggle"/.test(globalPanel) && globalPanel.includes('id="scoringServices"'),
  );
  check(
    "记忆页有可置灰节点",
    memoryPanel.includes('class="recall-grid"') && memoryPanel.includes('class="gate-advanced"'),
  );
  check("技能页有可置灰节点", skillPanel.includes("skill-route"));
  check(
    "paintDim 没有限定在单个面板",
    ["panel-global", "panel-memory", "panel-skill"].every(
      (name) => dimSelector.includes(name) === false,
    ),
    dimSelector,
  );

  // ---- 跨页重算：改服务 -> 保存 -> 重画通道类型，不需要切页/刷新 ----
  const applySource = panelJs.match(/\nfunction applyLayers\([\s\S]*?\n\}/)?.[0] ?? "";
  check("applyLayers 会重画通道行", applySource.includes("renderRerankChannels"), applySource.slice(0, 120));
  const renderSource = panelJs.match(/\nfunction renderRerankChannels\([\s\S]*?\n\}/)?.[0] ?? "";
  check(
    "renderRerankChannels 用 channelTypeOptions(layers)",
    renderSource.includes("channelTypeOptions(layers)"),
    renderSource.slice(0, 120),
  );
  check(
    "服务字段 change 仍走 saveLayers",
    /\$\(id\)\.addEventListener\("change"[\s\S]{0,240}saveLayers\(\)/.test(panelJs),
  );
  check(
    "saveLayers 仍走 commitLayers 的 apply 链",
    /apply:\s*applyLayers/.test(panelJs) && panelJs.includes("commitLayers"),
  );
  const selectSource = panelJs.match(/\nfunction selectTab\([\s\S]*?\n\}/)?.[0] ?? "";
  check("selectTab 函数取到了", selectSource.length > 0, panelJs.slice(0, 80));
  check(
    "selectTab 不触发重算或写入",
    ["renderRerankChannels", "applyLayers", "saveLayers", "refresh"].every(
      (name) => selectSource.includes(name) === false,
    ),
    selectSource,
  );
  check(
    "记忆页的通道下拉节点还在（隐藏面板不删节点）",
    memoryPanel.includes('id="rerankChannelList"'),
  );

  // ---- CSS ----
  check("标签栏样式存在", /\n\.tabs \{/.test(css));
  check("选中标签样式存在", /\n\.tab\[aria-selected="true"\] \{/.test(css));
  check("内容块样式存在", /\n\.tab-panel \{/.test(css));
  const tabsRule = css.slice(css.indexOf(".tabs {"), css.indexOf("}", css.indexOf(".tabs {")));
  check("标签栏一行不换行", /flex-wrap:\s*nowrap/.test(tabsRule), tabsRule);
  const panelRule = css.slice(
    css.indexOf(".tab-panel {"),
    css.indexOf("}", css.indexOf(".tab-panel {")),
  );
  check(
    "内容块是 grid + 14px 间距",
    /display:\s*grid/.test(panelRule) && /gap:\s*14px/.test(panelRule),
    panelRule,
  );
  const tabRule = css.slice(css.indexOf(".tab {"), css.indexOf("}", css.indexOf(".tab {")));
  check("标签字号沿用 12px", /font-size:\s*12px/.test(tabRule), tabRule);
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

  // ---- 提示词框的显示与状态（value 当草稿，不靠 placeholder） ----
  eq("两份默认提示词逐字一致", UI_DEFAULT_GATE_PROMPT, DEFAULT_GATE_PROMPT);
  eq("配置为空时草稿就是默认全文", promptDraft(""), DEFAULT_GATE_PROMPT);
  eq("配置为空且用户动过就不再填默认", promptDraft("", true), "");
  eq("有自定义内容就显示自定义", promptDraft("我的提示词"), "我的提示词");
  eq("超过上限的存量值按截断显示", promptDraft("字".repeat(GATE_PROMPT_MAX + 5)).length, GATE_PROMPT_MAX);
  eq("内容等于默认 -> 当前为默认提示词", promptStatus(DEFAULT_GATE_PROMPT), "当前为默认提示词");
  eq("内容改过 -> 已修改", promptStatus("我的提示词"), "已修改");
  check(
    "清空 -> 已修改并提醒不拦截",
    promptStatus("").includes("已修改") && promptStatus("").includes("提示词为空时不会拦截任何召回"),
    promptStatus(""),
  );
  check(
    "只有空白也算空",
    promptStatus("   \n ").includes("不会拦截任何召回"),
    promptStatus("   \n "),
  );

  // ---- llm 的提示词与判断模型：归一化 + 整单收笔 ----
  eq(
    "llm 配置归一化非法值",
    paintGateConfig({
      gatePrompt: "字".repeat(GATE_PROMPT_MAX + 10),
      gateModel: "  p1/m1  ",
    }),
    {
      gatePrompt: "字".repeat(GATE_PROMPT_MAX),
      gateModel: "p1/m1",
    },
  );
  eq(
    "形状不对的模型标识当空（回到默认通道）",
    paintGateConfig({ gateModel: "m1" }).gateModel,
    "",
  );
  eq("完整投影包含两层、llm、重排配置、通道与打分服务", paintRecallConfig({ recallGate: "llm" }), {
    recallGate: "llm",
    queryMode: "last",
    gatePrompt: "",
    gateModel: "",
    rerank: "off",
    rerankPrompt: "",
    rerankModel: "",
    rerankChannels: [],
    rerankServiceUrl: "",
    rerankServiceModel: "",
    rerankServiceTimeoutMs: null,
    systemoneServiceUrl: "",
    systemoneServiceModel: "",
    systemoneServiceTimeoutMs: null,
  });

  // ---- 重排配置的归一化与草稿 ----
  eq(
    "重排配置归一化非法值",
    paintRerankConfig({
      rerank: "on",
      rerankPrompt: "字".repeat(RERANK_PROMPT_MAX + 10),
      rerankModel: "  p1/m1  ",
    }),
    {
      rerank: "off",
      rerankPrompt: "字".repeat(RERANK_PROMPT_MAX),
      rerankModel: "p1/m1",
      rerankChannels: [],
    },
  );
  eq("重排配置读到 llm", paintRerankConfig({ rerank: "llm" }).rerank, "llm");
  eq("形状不对的重排模型标识当空", paintRerankConfig({ rerankModel: "m1" }).rerankModel, "");
  eq("重排配置为空时草稿就是默认全文", rerankPromptDraft(""), DEFAULT_RERANK_PROMPT);
  eq("重排配置为空且用户动过就不再填默认", rerankPromptDraft("", true), "");
  eq("重排有自定义内容就显示自定义", rerankPromptDraft("我的重排提示词"), "我的重排提示词");
  eq(
    "重排内容等于默认 -> 当前为默认提示词",
    rerankPromptStatus(DEFAULT_RERANK_PROMPT),
    "当前为默认提示词",
  );
  eq("重排内容改过 -> 已修改", rerankPromptStatus("我的重排提示词"), "已修改");
  check(
    "重排清空 -> 已修改并提醒回默认模板",
    rerankPromptStatus("").includes("已修改") &&
      rerankPromptStatus("").includes("提示词为空时使用默认模板"),
    rerankPromptStatus(""),
  );

  // ---- 精排通道的界面归一化 ----
  eq("UI 通道：空值回空数组", normalizeRerankChannels(undefined), []);
  eq("UI 通道：非法 JSON 回空数组", normalizeRerankChannels("{oops"), []);
  eq(
    "UI 通道：JSON 串也认",
    normalizeRerankChannels(
      JSON.stringify([{ type: "systemone", url: "http://h", model: "m", weight: 3 }]),
    ).length,
    1,
  );
  eq(
    "UI 通道：保留启用状态与权重",
    [
      normalizeRerankChannels([{ type: "model", enabled: false, weight: 2.5 }])[0].enabled,
      normalizeRerankChannels([{ type: "model", weight: 2.5 }])[0].weight,
    ],
    [false, 2.5],
  );
  eq(
    "UI 通道：存量 timeoutMs 不会被保存洗掉",
    normalizeRerankChannels([{ type: "model", timeoutMs: 120 }])[0].timeoutMs,
    120,
  );
  eq("UI 通道：最多 8 行", normalizeRerankChannels(
    Array.from({ length: 10 }, () => ({ type: "model" })),
  ).length, UI_RERANK_CHANNELS_MAX);
  eq("空模板默认 rerank", emptyRerankChannel(), {
    type: "rerank",
    name: "",
    url: "",
    model: "",
    weight: 1,
    enabled: true,
  });
  eq(
    "通道 JSON 串往返",
    JSON.parse(rerankChannelsText([{ type: "rerank", url: "http://h", model: "m", weight: 2 }]))[0]
      .weight,
    2,
  );
  eq("只选类型的空模板也算完整通道（端点由打分服务提供）", isCompleteRerankChannel(emptyRerankChannel()), true);
  eq(
    "存量 URL 合法也算完整",
    isCompleteRerankChannel({ type: "rerank", url: "http://h", model: "m" }),
    true,
  );
  eq(
    "model 通道留空也算完整",
    isCompleteRerankChannel({ type: "model", model: "" }),
    true,
  );
  eq(
    "非 http(s) 的 URL 不算完整",
    isCompleteRerankChannel({ type: "systemone", url: "ftp://h", model: "m" }),
    false,
  );

  // ---- 打分服务：显示归一化与通道类型选项 ----
  eq(
    "打分服务显示值归一化",
    paintScoringConfig({
      rerankServiceUrl: "  http://127.0.0.1:8098///  ",
      rerankServiceModel: "  bge-reranker-v2-m3  ",
      rerankServiceTimeoutMs: "  1200  ",
      systemoneServiceUrl: "ftp://nope",
      systemoneServiceModel: "kev-4b",
      systemoneServiceTimeoutMs: "99999",
    }),
    {
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceTimeoutMs: 1200,
      systemoneServiceUrl: "",
      systemoneServiceModel: "kev-4b",
      systemoneServiceTimeoutMs: null,
    },
  );
  // ---- 打分服务的超时：前后端同口径 ----
  eq("超时边界与后端同值", UI_SERVICE_TIMEOUT_LIMITS, SERVICE_TIMEOUT_LIMITS);
  eq("超时默认值与后端同值", [
    UI_SERVICE_TIMEOUT_LIMITS.rerank.fallback,
    UI_SERVICE_TIMEOUT_LIMITS.systemone.fallback,
  ], [800, 3500]);
  eq("界面侧超时归一与后端一致（合法）", uiNormalizeServiceTimeout(" 1200 ", "rerank"), 1200);
  eq("界面侧超时归一与后端一致（越界回 null）", [
    uiNormalizeServiceTimeout("99999", "rerank"),
    uiNormalizeServiceTimeout("abc", "systemone"),
    uiNormalizeServiceTimeout("", "rerank"),
  ], [null, null, null]);
  eq("输入框：没配就是空串", uiServiceTimeoutInput(null, "rerank"), "");
  eq("输入框：配了就是数字串", uiServiceTimeoutInput(1200, "systemone"), "1200");
  eq("输入框：越界当没配", uiServiceTimeoutInput("99999", "rerank"), "");

  // ---- 「测试」按钮的两件纯逻辑：发什么、怎么显示 ----
  eq(
    "测试请求用界面此刻的值，地址去尾斜杠、超时归一",
    uiServiceTestBody("rerank", {
      url: "  http://127.0.0.1:8098///  ",
      model: "  bge-reranker-v2-m3  ",
      timeoutMs: "1200",
    }),
    {
      kind: "rerank",
      url: "http://127.0.0.1:8098",
      model: "bge-reranker-v2-m3",
      timeoutMs: 1200,
    },
  );
  eq(
    "超时没填就不带这个键（服务端按类型给默认值）",
    "timeoutMs" in uiServiceTestBody("systemone", { url: "http://h:1", model: "kev-4b" }),
    false,
  );
  eq(
    "地址与模型都填了才算可测",
    [
      uiServiceTestReady({ url: "http://h:1", model: "kev-4b" }),
      uiServiceTestReady({ url: "http://h:1", model: "  " }),
      uiServiceTestReady({ url: "", model: "kev-4b" }),
      uiServiceTestReady(null),
    ],
    [true, false, false, false],
  );

  eq(
    "成功行：可用 · 187ms · 服务端返回的模型名",
    uiServiceTestView({ ok: true, elapsedMs: 187, model: "bge-reranker-v2-m3" }, "configured"),
    { tone: "ok", text: "可用 · 187ms · bge-reranker-v2-m3" },
  );
  eq(
    "成功行：服务端不回模型名就用配的那个",
    uiServiceTestView({ ok: true, elapsedMs: 42, model: null }, "kev-4b"),
    { tone: "ok", text: "可用 · 42ms · kev-4b" },
  );
  eq(
    "成功行：两边都没有就不编一个模型名",
    uiServiceTestView({ ok: true, elapsedMs: 9, model: null }, ""),
    { tone: "ok", text: "可用 · 9ms" },
  );
  eq(
    "失败行：原文照抄错误",
    uiServiceTestView({ ok: false, elapsedMs: 12, error: "connect ECONNREFUSED 127.0.0.1:8098" }),
    { tone: "bad", text: "不可用 · connect ECONNREFUSED 127.0.0.1:8098" },
  );
  eq(
    "失败行：错误截到 120 字",
    Array.from(
      uiServiceTestView({ ok: false, error: "x".repeat(200) }).text.replace("不可用 · ", ""),
    ).length,
    120,
  );
  eq(
    "失败行：没错误原文也不空着",
    uiServiceTestView({ ok: false }).text,
    "不可用 · 失败",
  );
  eq("未配置行：先填地址和模型", uiServiceTestView(null), {
    tone: "muted",
    text: "先填地址和模型",
  });
  eq(
    "三档开头词与文案常量一致",
    [UI_SERVICE_TEST_TEXT.ok, UI_SERVICE_TEST_TEXT.bad, UI_SERVICE_TEST_TEXT.missing],
    ["可用", "不可用", "先填地址和模型"],
  );

  eq(
    "只配精排 -> 精排服务 + 宿主模型",
    channelTypeOptions({ rerankServiceUrl: "http://h:8098" }).map((option) => option.value),
    ["rerank", "model"],
  );
  eq(
    "只配决策 -> 决策服务 + 宿主模型",
    channelTypeOptions({ systemoneServiceUrl: "http://h:8097" }).map((option) => option.value),
    ["systemone", "model"],
  );
  eq(
    "都配 -> 三类都在",
    channelTypeOptions({
      rerankServiceUrl: "http://h:8098",
      systemoneServiceUrl: "http://h:8097",
    }).map((option) => option.value),
    ["rerank", "systemone", "model"],
  );
  eq(
    "都不配 -> 只剩宿主模型",
    channelTypeOptions({}).map((option) => option.value),
    ["model"],
  );
  eq(
    "选项文案就是服务名",
    channelTypeOptions({
      rerankServiceUrl: "http://h:8098",
      systemoneServiceUrl: "http://h:8097",
    }).map((option) => option.label),
    ["精排服务", "决策服务", "宿主模型"],
  );

  // 服务被清空：已有通道保留，只标记不可用，不自动删。
  const clearedServiceChannels = parseRerankChannels(
    JSON.stringify([{ type: "rerank" }, { type: "model" }]),
  );
  eq("服务清空后通道仍保留", clearedServiceChannels.length, 2);
  eq(
    "缺服务的通道被标记不可用",
    clearedServiceChannels.map((channel) => channelServiceMissing(channel, {})),
    [true, false],
  );
  eq(
    "服务配上后同一通道变为可用",
    channelServiceMissing(clearedServiceChannels[0], {
      rerankServiceUrl: "http://h:8098",
    }),
    false,
  );
  check(
    "通道自己的地址与模型成对时不再依赖服务",
    channelServiceMissing({ type: "systemone", url: "http://h:8097", model: "kev-4b" }, {}) === false,
  );
  check(
    "只填地址（老配置）时仍依赖服务：服务没配就是废票",
    channelServiceMissing({ type: "systemone", url: "http://h:8097" }, {}),
  );

  // 运行时端点优先级：通道自带 > 打分服务配置。
  eq(
    "通道自带的 URL / 模型优先",
    (({ url, model }) => [url, model])(
      resolveRerankChannel(
        { type: "rerank", url: "http://channel:1", model: "channel-model" },
        { rerankServiceUrl: "http://service:2", rerankServiceModel: "service-model" },
      ),
    ),
    ["http://channel:1", "channel-model"],
  );
  eq(
    "通道没填时用服务配置",
    (({ url, model }) => [url, model])(
      resolveRerankChannel(
        { type: "rerank", url: "", model: "" },
        { rerankServiceUrl: "http://service:2", rerankServiceModel: "service-model" },
      ),
    ),
    ["http://service:2", "service-model"],
  );
  eq(
    "服务地址为空时孤立模型不生效",
    (({ url, model }) => [url, model])(
      resolveRerankChannel({ type: "rerank" }, { rerankServiceModel: "orphan-model" }),
    ),
    ["", ""],
  );
  eq(
    "决策服务只看 systemone 那组",
    (({ url, model }) => [url, model])(
      resolveRerankChannel(
        { type: "systemone" },
        {
          rerankServiceUrl: "http://r:1",
          rerankServiceModel: "r",
          systemoneServiceUrl: "http://s:2",
          systemoneServiceModel: "s",
        },
      ),
    ),
    ["http://s:2", "s"],
  );
  eq(
    "宿主模型不受打分服务影响",
    (({ url, model }) => [url, model])(
      resolveRerankChannel(
        { type: "model", model: "p/m" },
        { rerankServiceUrl: "http://r:1", rerankServiceModel: "r" },
      ),
    ),
    ["", "p/m"],
  );

  // ---- 整对回退：地址与模型要么都有、要么都不用 ----
  const serviceRerank = {
    rerankServiceUrl: "http://service:2",
    rerankServiceModel: "service-model",
  };
  {
    const both = resolveRerankChannel(
      { type: "rerank", url: "http://channel:1", model: "channel-model" },
      serviceRerank,
    );
    eq("整对都在：地址用通道自己的", both.url, "http://channel:1");
    eq("整对都在：模型也用通道自己的", both.model, "channel-model");
    eq("整对都在：不显示回退说明", both.pairNote, undefined);
  }
  {
    // 老配置：只填了地址，没填模型名。整对改用服务配置。
    const urlOnly = resolveRerankChannel(
      { type: "rerank", url: "http://channel:1" },
      serviceRerank,
    );
    eq("只给地址：地址改用服务配置", urlOnly.url, "http://service:2");
    eq("只给地址：模型也用服务配置（不配自己的地址）", urlOnly.model, "service-model");
    eq("只给地址：给出回退说明", urlOnly.pairNote, CHANNEL_PAIR_NOTE_MODEL);
    eq(
      "回退说明就是任务书那句",
      CHANNEL_PAIR_NOTE_MODEL,
      "通道自带的模型名为空，已改用服务配置",
    );
    eq("前后两份回退说明逐字一致（模型那半）", CHANNEL_PAIR_NOTE_MODEL, UI_CHANNEL_PAIR_NOTE_MODEL);
  }
  {
    const modelOnly = resolveRerankChannel(
      { type: "systemone", model: "kev-4b" },
      {
        systemoneServiceUrl: "http://service:3",
        systemoneServiceModel: "service-model",
      },
    );
    eq("只给模型：地址用服务配置", modelOnly.url, "http://service:3");
    eq("只给模型：模型也用服务配置（不拿孤立模型去拼）", modelOnly.model, "service-model");
    eq("只给模型：说明写的是地址为空", modelOnly.pairNote, CHANNEL_PAIR_NOTE_URL);
    eq("前后两份回退说明逐字一致（地址那半）", CHANNEL_PAIR_NOTE_URL, UI_CHANNEL_PAIR_NOTE_URL);
  }
  {
    const orphan = resolveRerankChannel({ type: "rerank", url: "http://channel:1" }, {});
    eq("只给地址且服务也没配：整对为空", [orphan.url, orphan.model], ["", ""]);
    eq("这种时候不说「已改用服务配置」", orphan.pairNote, undefined);
  }
  eq(
    "界面侧的整对说明与后端同一口径（只给地址）",
    uiChannelPairNote({ type: "rerank", url: "http://channel:1" }, serviceRerank),
    CHANNEL_PAIR_NOTE_MODEL,
  );
  eq(
    "界面侧的整对说明与后端同一口径（只给模型）",
    uiChannelPairNote({ type: "systemone", model: "kev-4b" }, {
      systemoneServiceUrl: "http://service:3",
    }),
    CHANNEL_PAIR_NOTE_URL,
  );
  eq(
    "界面侧：整对都在时不显示说明",
    uiChannelPairNote(
      { type: "rerank", url: "http://channel:1", model: "channel-model" },
      serviceRerank,
    ),
    "",
  );
  eq(
    "界面侧：服务也没配时不显示说明（那一行已经标红了）",
    uiChannelPairNote({ type: "rerank", url: "http://channel:1" }, {}),
    "",
  );
  eq(
    "界面侧：宿主模型通道不参与整对回退",
    uiChannelPairNote({ type: "model", url: "http://channel:1" }, serviceRerank),
    "",
  );

  // ---- 超时优先级：三层逐一验（读值，不发请求） ----
  eq(
    "通道自带的超时压过服务配置",
    resolveRerankChannel(
      { type: "rerank", timeoutMs: 1200 },
      { ...serviceRerank, rerankServiceTimeoutMs: 900 },
    ).timeoutMs,
    1200,
  );
  eq(
    "通道没填时用服务配置的超时",
    resolveRerankChannel(
      { type: "systemone" },
      {
        systemoneServiceUrl: "http://s:2",
        systemoneServiceModel: "m",
        systemoneServiceTimeoutMs: 2000,
      },
    ).timeoutMs,
    2000,
  );
  eq(
    "两边都没配就不塞 timeoutMs（留给默认值 / 自适应）",
    "timeoutMs" in resolveRerankChannel({ type: "systemone" }, {}),
    false,
  );
  eq(
    "systemone 服务超时压过自适应",
    systemoneTimeoutFor(
      resolveRerankChannel({ type: "systemone" }, { systemoneServiceTimeoutMs: 2000 }),
      5,
    ),
    2000,
  );
  eq(
    "没配服务超时时 systemone 仍按候选数自适应",
    systemoneTimeoutFor(resolveRerankChannel({ type: "systemone" }, {}), 6),
    4200,
  );
  eq(
    "存量里越界的服务超时当没配（回到自适应）",
    systemoneTimeoutFor(
      resolveRerankChannel({ type: "systemone" }, { systemoneServiceTimeoutMs: 99999 }),
      5,
    ),
    3500,
  );

  // 模型目录 -> 选项：一步选到位，文案带 provider，值形如 provider/id。
  eq("目录选项带 provider", modelOptions([
    { provider: "deepseek", id: "deepseek-flash", name: "DeepSeek Flash" },
    { provider: "opencode-go", id: "glm-5.2", name: "GLM-5.2" },
  ]), [
    { value: "deepseek/deepseek-flash", label: "deepseek · deepseek-flash" },
    { value: "opencode-go/glm-5.2", label: "opencode-go · glm-5.2" },
  ]);
  eq("同名模型靠 provider 区分", modelOptions([
    { provider: "a", id: "flash" },
    { provider: "b", id: "flash" },
  ]).map((o) => o.label), ["a · flash", "b · flash"]);
  eq("形状不全的条目丢掉", modelOptions([{ id: "no-provider" }, { provider: "p" }, null, 1]), []);
  eq("重复标识只留一条", modelOptions([
    { provider: "p", id: "m" },
    { provider: "p", id: "m" },
  ]).length, 1);
  eq("非数组当空", modelOptions(undefined), []);
  eq("下拉首项是默认", DEFAULT_MODEL_OPTION, { value: "", label: "默认（宿主辅助模型）" });

  {
    const extendedBefore = paintRecallConfig({ recallGate: "off" });
    const extendedNext = paintRecallConfig({
      recallGate: "llm",
      queryMode: "last",
      gatePrompt: "自定义",
      gateModel: "p/m",
    });
    const sent = [];
    const out = await commitLayers({
      before: extendedBefore,
      next: extendedNext,
      send: async (body) => {
        sent.push(body);
        return { ok: true, ...extendedNext };
      },
      apply: (value) => shown.push(value),
      flash,
      normalize: paintRecallConfig,
    });
    eq("llm 整单带上四个字段", sent[0], extendedNext);
    eq("llm 成功收在服务端四字段上", shown.at(-1), extendedNext);
    eq("llm 成功也算成功", out.ok, true);
  }

  {
    const extendedBefore = paintRecallConfig({
      recallGate: "llm",
      gatePrompt: "旧提示词",
      gateModel: "p/m",
    });
    const out = await commitLayers({
      before: extendedBefore,
      next: { ...extendedBefore, gatePrompt: "新提示词" },
      send: async () => ({ ok: false, error: "gatePrompt 被拒" }),
      apply: (value) => shown.push(value),
      flash,
      normalize: paintRecallConfig,
    });
    eq("llm 被拒时提示词回滚", shown.at(-1).gatePrompt, "旧提示词");
    eq("llm 被拒时判断模型也回滚", shown.at(-1).gateModel, "p/m");
    eq("llm 被拒不算成功", out.ok, false);
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
  eq("GET 缺省时 rerank=off", defaults.body.rerank, "off");
  eq("GET 缺省时 rerankPrompt 为空", defaults.body.rerankPrompt, "");
  eq("GET 缺省时 rerankModel 为空", defaults.body.rerankModel, "");

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

  // ---- llm 档与提示词 / 判断模型 ----
  writes.length = 0;
  const llm = await post({
    recallGate: "llm",
    gatePrompt: "自定义提示词",
    gateModel: "",
  });
  eq("llm 档可写", store.recallGate, "llm");
  eq("提示词落库", store.gatePrompt, "自定义提示词");
  eq("模型标识落库（空 = 默认通道）", store.gateModel, "");
  eq(
    "GET 回显 llm 配置",
    [llm.body.gatePrompt, llm.body.gateModel],
    ["自定义提示词", ""],
  );

  writes.length = 0;
  const custom = await post({ gateModel: "  p1/m1  " });
  eq("模型标识落库", store.gateModel, "p1/m1");
  eq("回显也去空白", custom.body.gateModel, "p1/m1");

  writes.length = 0;
  const badRef = await post({ gateModel: "m1" });
  eq("缺 provider 的标识 400", badRef.status, 400);
  eq("缺 provider 零写入", writes.length, 0);
  eq("被拒后旧值还在", store.gateModel, "p1/m1");

  writes.length = 0;
  const badRef2 = await post({ gateModel: "p1/" });
  eq("缺 model 的标识 400", badRef2.status, 400);
  eq("缺 model 零写入", writes.length, 0);

  writes.length = 0;
  const badRefType = await post({ gateModel: 7 });
  eq("标识类型不对 400", badRefType.status, 400);
  eq("标识类型不对零写入", writes.length, 0);

  // 旧键彻底不认：提交它们不该被当成合法写入。
  writes.length = 0;
  await post({ gateModelMode: "custom", gateProvider: "p9" });
  eq("旧键不再落库", writes.length, 0);

  writes.length = 0;
  const longPrompt = await post({ gatePrompt: "字".repeat(GATE_PROMPT_MAX + 1) });
  eq("超长提示词 400", longPrompt.status, 400);
  eq("超长提示词零写入", writes.length, 0);

  writes.length = 0;
  const badPrompt = await post({ gatePrompt: 1 });
  eq("提示词类型不对 400", badPrompt.status, 400);
  eq("提示词类型不对零写入", writes.length, 0);

  // ---- 结果重排：开关 / 提示词 / 模型三个字段 ---------
  writes.length = 0;
  const rerankOk = await post({
    rerank: "llm",
    rerankPrompt: "重排模板 {{message}} {{candidates}}",
    rerankModel: "" ,
  });
  eq("重排档可写", store.rerank, "llm");
  eq("重排提示词落库", store.rerankPrompt, "重排模板 {{message}} {{candidates}}");
  eq("重排模型为空 = 默认通道", store.rerankModel, "");
  eq(
    "GET 回显重排配置",
    [rerankOk.body.rerank, rerankOk.body.rerankPrompt, rerankOk.body.rerankModel],
    ["llm", "重排模板 {{message}} {{candidates}}", ""],
  );

  writes.length = 0;
  const badRerank = await post({ rerank: "rules" });
  eq("非法 rerank 400", badRerank.status, 400);
  eq("非法 rerank 零写入", writes.length, 0);
  eq("被拒后旧 rerank 还在", store.rerank, "llm");

  writes.length = 0;
  const badRerankPrompt = await post({ rerankPrompt: "字".repeat(RERANK_PROMPT_MAX + 1) });
  eq("超长重排提示词 400", badRerankPrompt.status, 400);
  eq("超长重排提示词零写入", writes.length, 0);

  writes.length = 0;
  const badRerankPromptType = await post({ rerankPrompt: 1 });
  eq("重排提示词类型不对 400", badRerankPromptType.status, 400);
  eq("重排提示词类型不对零写入", writes.length, 0);

  writes.length = 0;
  const badRerankRef = await post({ rerankModel: "m1" });
  eq("重排模型缺 provider 400", badRerankRef.status, 400);
  eq("重排模型非法零写入", writes.length, 0);

  writes.length = 0;
  const rerankRef = await post({ rerankModel: "  p2/m2  " });
  eq("重排模型标识落库", store.rerankModel, "p2/m2");
  eq("重排模型回显也去空白", rerankRef.body.rerankModel, "p2/m2");

  // 整单校验：重排字段不合法时，同一单里的合法字段也不能落库。
  writes.length = 0;
  const rerankMixed = await post({ rerank: "llm", rerankModel: "bad" });
  eq("重排整单被拒", rerankMixed.status, 400);
  eq("重排整单被拒时零写入", writes.length, 0);

  // 只改别的键不该被存量模型配置连坐。
  store.gateModel = "p1/m1";
  const untouched = await post({ queryMode: "context" });
  eq("只改 queryMode 不受模型配置影响", untouched.status, 200);
  eq("模型配置原样还在", store.gateModel, "p1/m1");

  // ---- 打分服务四字段：整单校验、非法 400 零写入 ----
  eq("GET 缺省时四个服务字段都为空",
    (await get()).body.rerankServiceUrl === "" &&
      (await get()).body.rerankServiceModel === "" &&
      (await get()).body.systemoneServiceUrl === "" &&
      (await get()).body.systemoneServiceModel === "",
    true);

  writes.length = 0;
  const servicesOk = await post({
    rerankServiceUrl: "  http://127.0.0.1:8098/  ",
    rerankServiceModel: "  bge-reranker-v2-m3  ",
    systemoneServiceUrl: "http://192.168.50.142:8097",
    systemoneServiceModel: "  kev-4b  ",
  });
  eq("服务四字段可写", servicesOk.status, 200);
  eq("服务 URL 落库时去尾斜杠", store.rerankServiceUrl, "http://127.0.0.1:8098");
  eq("服务模型落库时去空白", store.systemoneServiceModel, "kev-4b");
  eq(
    "GET 回显四个服务字段",
    [
      servicesOk.body.rerankServiceUrl,
      servicesOk.body.rerankServiceModel,
      servicesOk.body.systemoneServiceUrl,
      servicesOk.body.systemoneServiceModel,
    ],
    ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "http://192.168.50.142:8097", "kev-4b"],
  );
  check("applied 列出服务字段",
    ["rerankServiceUrl", "rerankServiceModel", "systemoneServiceUrl", "systemoneServiceModel"]
      .every((key) => servicesOk.body.applied.includes(key)));

  writes.length = 0;
  const badServiceUrl = await post({ rerankServiceUrl: "ftp://nope", rerank: "llm" });
  eq("非 http(s) 服务 URL 400", badServiceUrl.status, 400);
  eq("非法服务 URL 零写入", writes.length, 0);
  eq("非法服务 URL 不会静默清空旧值", store.rerankServiceUrl, "http://127.0.0.1:8098");

  writes.length = 0;
  const missingScheme = await post({ systemoneServiceUrl: "192.168.50.142:8097" });
  eq("缺协议的服务 URL 400", missingScheme.status, 400);
  eq("缺协议零写入", writes.length, 0);

  writes.length = 0;
  const badServiceUrlType = await post({ rerankServiceUrl: 8098 });
  eq("服务 URL 类型不对 400", badServiceUrlType.status, 400);
  eq("服务 URL 类型不对零写入", writes.length, 0);

  writes.length = 0;
  const longServiceModel = await post({ rerankServiceModel: "m".repeat(SERVICE_MODEL_MAX + 1) });
  eq("超长服务模型 400", longServiceModel.status, 400);
  eq("超长服务模型零写入", writes.length, 0);

  writes.length = 0;
  const badServiceModelType = await post({ systemoneServiceModel: 1 });
  eq("服务模型类型不对 400", badServiceModelType.status, 400);
  eq("服务模型类型不对零写入", writes.length, 0);

  writes.length = 0;
  const controlServiceModel = await post({ rerankServiceModel: "a\u0000b" });
  eq("服务模型含控制字符 400", controlServiceModel.status, 400);
  eq("控制字符服务模型零写入", writes.length, 0);

  writes.length = 0;
  const emptyService = await post({ rerankServiceUrl: "", rerankServiceModel: "" });
  eq("服务可以清空", emptyService.status, 200);
  eq("清空后落库为空串", [store.rerankServiceUrl, store.rerankServiceModel], ["", ""]);

  // ---- 精排通道的读写与整单校验 ----
  eq("GET 缺省时通道为空数组", (await get()).body.rerankChannels, []);

  writes.length = 0;
  const channelJson = JSON.stringify([
    { type: "rerank", name: "r", url: "http://h:1/", model: "m", weight: 2, enabled: true },
    { type: "model", name: "host", model: "", enabled: false },
  ]);
  const channelsOk = await post({ rerankChannels: channelJson });
  eq("通道 JSON 可写", channelsOk.status, 200);
  eq("通道落库仍是 JSON 串", typeof store.rerankChannels, "string");
  eq("落库时重算形状", JSON.parse(store.rerankChannels).length, 2);
  eq("落库时 URL 去尾斜杠", JSON.parse(store.rerankChannels)[0].url, "http://h:1");
  eq("回显是通道数组", channelsOk.body.rerankChannels.length, 2);
  check("applied 列出 rerankChannels", channelsOk.body.applied.includes("rerankChannels"));

  writes.length = 0;
  const badChannelsJson = await post({ rerankChannels: "{oops" });
  eq("非法通道 JSON 400", badChannelsJson.status, 400);
  eq("非法通道 JSON 零写入", writes.length, 0);

  writes.length = 0;
  const badChannelsType = await post({ rerankChannels: 1 });
  eq("通道不是字符串 400", badChannelsType.status, 400);
  eq("通道类型不对零写入", writes.length, 0);

  writes.length = 0;
  const badChannelsShape = await post({ rerankChannels: '{"type":"model"}' });
  eq("通道不是数组 400", badChannelsShape.status, 400);
  eq("通道不是数组零写入", writes.length, 0);

  writes.length = 0;
  const badChannelsItem = await post({
    rerankChannels: JSON.stringify([{ type: "rerank", url: "ftp://h" }]),
  });
  eq("通道 URL 非法 400", badChannelsItem.status, 400);
  eq("通道 URL 非法零写入", writes.length, 0);

  writes.length = 0;
  const typeOnlyChannels = await post({
    rerankChannels: JSON.stringify([{ type: "rerank" }, { type: "systemone" }]),
  });
  eq("只写类型的通道可写（端点走打分服务）", typeOnlyChannels.status, 200);
  eq("只写类型的通道落库", JSON.parse(store.rerankChannels).length, 2);
  eq(
    "只写类型的通道 url / model 为空",
    [
      JSON.parse(store.rerankChannels)[0].url,
      JSON.parse(store.rerankChannels)[0].model,
    ],
    ["", ""],
  );

  writes.length = 0;
  const tooManyChannels = await post({
    rerankChannels: JSON.stringify(
      Array.from({ length: RERANK_CHANNELS_MAX + 1 }, () => ({ type: "model", model: "" })),
    ),
  });
  eq("通道超过 8 路 400", tooManyChannels.status, 400);
  eq("通道超过 8 路零写入", writes.length, 0);

  writes.length = 0;
  const clearedChannels = await post({ rerankChannels: "" });
  eq("空串清空通道", clearedChannels.status, 200);
  eq("清空后落库为空串", store.rerankChannels, "");
  eq("清空后回显空数组", clearedChannels.body.rerankChannels, []);

  // ---- 地址与模型成对：有地址无模型 400、零写入 ----
  writes.length = 0;
  const urlOnly = await post({ rerankServiceUrl: "http://127.0.0.1:8098" });
  eq("有地址无模型 400", urlOnly.status, 400);
  check(
    "拒绝理由写明配了地址就要填模型名",
    String(urlOnly.body.error || "").includes("配了地址就要填模型名"),
    urlOnly.body.error,
  );
  eq("有地址无模型零写入", writes.length, 0);
  eq("旧地址没被写进去", store.rerankServiceUrl ?? "", "");

  writes.length = 0;
  const modelOnly = await post({ systemoneServiceModel: "kev-4b" });
  eq("只有模型时照旧可写", modelOnly.status, 200);
  eq("孤立模型名可以落库", store.systemoneServiceModel, "kev-4b");

  // 两步提交：先存模型、再补地址，也能过。
  writes.length = 0;
  const stepOne = await post({ rerankServiceModel: "bge-reranker-v2-m3" });
  eq("第一步：先存模型", stepOne.status, 200);
  const stepTwo = await post({ rerankServiceUrl: "http://127.0.0.1:8098" });
  eq("第二步：补上地址", stepTwo.status, 200);
  eq(
    "两步之后是一对完整的值",
    [store.rerankServiceUrl, store.rerankServiceModel],
    ["http://127.0.0.1:8098", "bge-reranker-v2-m3"],
  );

  // 存量里已经有「有地址缺模型」时，改别的键不能被连坐。
  store.systemoneServiceUrl = "http://192.168.50.142:8097";
  store.systemoneServiceModel = "";
  writes.length = 0;
  const otherKey = await post({ queryMode: "last" });
  eq("没动那一对时不被存量老配置连坐", otherKey.status, 200);
  store.systemoneServiceUrl = "";

  // 清空时两个一起清。
  writes.length = 0;
  const clearedPair = await post({ rerankServiceUrl: "", rerankServiceModel: "" });
  eq("成对清空", clearedPair.status, 200);
  eq("清空后两个都是空串", [store.rerankServiceUrl, store.rerankServiceModel], ["", ""]);

  // ---- 超时字段：非法值回默认、不留在配置里 ----
  eq("GET 未配置时两个超时是 null", [
    (await get()).body.rerankServiceTimeoutMs,
    (await get()).body.systemoneServiceTimeoutMs,
  ], [null, null]);

  writes.length = 0;
  const timeoutOk = await post({
    rerankServiceTimeoutMs: "1200",
    systemoneServiceTimeoutMs: 2000,
  });
  eq("超时可写", timeoutOk.status, 200);
  eq("超时落库成数字串", [store.rerankServiceTimeoutMs, store.systemoneServiceTimeoutMs], [
    "1200",
    "2000",
  ]);
  eq("GET 回显超时为数字", [
    timeoutOk.body.rerankServiceTimeoutMs,
    timeoutOk.body.systemoneServiceTimeoutMs,
  ], [1200, 2000]);
  check(
    "applied 列出超时字段",
    timeoutOk.body.applied.includes("rerankServiceTimeoutMs") &&
      timeoutOk.body.applied.includes("systemoneServiceTimeoutMs"),
  );

  writes.length = 0;
  const timeoutOutOfRange = await post({ rerankServiceTimeoutMs: "99999" });
  eq("超时越界不报错", timeoutOutOfRange.status, 200);
  eq("超时越界落库为空串（= 回默认值）", store.rerankServiceTimeoutMs, "");
  eq("越界后 GET 回 null", timeoutOutOfRange.body.rerankServiceTimeoutMs, null);

  writes.length = 0;
  const timeoutNumeric = await post({ systemoneServiceTimeoutMs: "abc" });
  eq("非数字超时不报错", timeoutNumeric.status, 200);
  eq("非数字超时也不留在配置里", store.systemoneServiceTimeoutMs, "");

  writes.length = 0;
  const timeoutBadType = await post({ rerankServiceTimeoutMs: { ms: 1200 } });
  eq("超时类型不对（对象）400", timeoutBadType.status, 400);
  eq("超时类型不对零写入", writes.length, 0);

  // 面板清空那一格时发的是 null（归一化之后的形状），不能当成类型错。
  writes.length = 0;
  const timeoutCleared = await post({ rerankServiceTimeoutMs: null });
  eq("null = 清空这一格", timeoutCleared.status, 200);
  eq("清空后落库为空串", store.rerankServiceTimeoutMs, "");
  eq("清空后 GET 回 null", timeoutCleared.body.rerankServiceTimeoutMs, null);
}

// ================= routes: 精排通道测试按钮 =================
{
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const dir = path.join(import.meta.dirname, ".tmp-recall-mode-test");
  fs.rmSync(dir, { recursive: true, force: true });
  const session = "01a1585b-86d2-4a5f-9c1e-1234567890ab";
  const store = {
    rerank: "llm",
    rerankChannels: JSON.stringify([
      { type: "rerank", name: "r", url: "http://127.0.0.1:9", model: "m", weight: 1 },
    ]),
  };
  const calls = [];
  const ctx = {
    dataDir: dir,
    config: {
      get: async (key) => store[key],
      set: async (key, value) => { store[key] = value; },
    },
    network: {
      fetch: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({
            results: [
              { index: 0, relevance_score: 0.8 },
              { index: 1, relevance_score: 0.1 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  };
  registerRecallModeRoutes(app, ctx);
  const post = (body) =>
    handlers["POST /recall-mode/test"]({
      req: { json: async () => body },
      json: (payload, status) => ({ body: payload, status }),
    });

  writeRerankSample({ dataDir: dir }, session, {
    query: "问过什么",
    items: [{ text: "甲" }, { text: "乙" }],
  });
  resetRuntimeTransport();
  const tested = await post({ session });
  eq("测试端点成功", tested.body.ok, true);
  eq("测试端点回候选数", tested.body.candidates, 2);
  eq("测试端点回每路分数", tested.body.channels[0].scores, [0.8, 0.1]);
  eq("测试端点回标准化分", tested.body.channels[0].normalized, [1, 0]);
  eq("测试端点回合并分", tested.body.merged, [1, 0]);
  eq("测试端点回保留索引（标准化后的末位不丢）", tested.body.kept, [0, 1]);
  eq("测试端点不写配置", store.rerankChannels.startsWith("["), true);
  eq("测试端点走当前配置的 URL", calls[0].url, "http://127.0.0.1:9/v1/rerank");

  const unknown = await post({ session: "sess_not_a_key" });
  eq("认不出的会话 key 400", unknown.status, 400);

  const missing = await post({ session: "01a1585b-86d2-4a5f-9c1e-000000000000" });
  eq("没有样本时返回可读错误", [missing.body.ok, missing.body.error], [
    false,
    "这个会话还没有可复跑的召回候选",
  ]);

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= routes: 打分服务的连通性测试 =================
{
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const store = {};
  const writes = [];
  const calls = [];
  // 每个用例换一次：这就是“那个服务此刻怎么回应”的全部。
  let respond = async () => new Response("{}", { status: 200 });
  const ctx = {
    config: {
      get: async (key) => store[key],
      set: async (key, value) => {
        writes.push([key, value]);
        store[key] = value;
      },
    },
    network: {
      fetch: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return respond(url, init);
      },
    },
  };
  registerRecallModeRoutes(app, ctx);
  const test = (body) =>
    handlers["POST /recall-mode/service-test"]({
      req: { json: async () => body },
      json: (payload, status) => ({ body: payload, status }),
    });
  const jsonOf = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });

  // 测试不用运行时，走 ctx.network，跟没起运行时时的退路同一条。
  resetRuntimeTransport();

  // ---- 1. rerank 成功：2xx + results 非空 + 每项有分 ----
  calls.length = 0;
  respond = async () =>
    jsonOf({ model: "bge-reranker-v2-m3", results: [{ index: 0, relevance_score: 0.42 }] });
  const rerankOk = await test({
    kind: "rerank",
    url: "  http://127.0.0.1:8098/  ",
    model: "bge-reranker-v2-m3",
    timeoutMs: 800,
  });
  eq("service-test rerank 可用", rerankOk.body.ok, true);
  check("成功时给 elapsedMs", Number.isFinite(rerankOk.body.elapsedMs), rerankOk.body.elapsedMs);
  eq("模型名取服务端返回的那个", rerankOk.body.model, "bge-reranker-v2-m3");
  eq("请求打到 /v1/rerank，且地址去尾斜杠", calls[0].url, "http://127.0.0.1:8098/v1/rerank");
  eq("rerank 用 POST", calls[0].init.method, "POST");
  eq("请求体带上模型名", calls[0].body.model, "bge-reranker-v2-m3");
  eq("请求体带一句固定 query", calls[0].body.query, "连通性测试");
  eq("请求体带一条固定文档", calls[0].body.documents, ["这是一条用于测试的文档"]);
  check("detail 是一句话", typeof rerankOk.body.detail === "string" && rerankOk.body.detail.length > 0);

  // 服务端不回 model 时给 null，面板那边回退到配置里的模型名。
  respond = async () => jsonOf({ results: [{ index: 0, score: 0.1 }] });
  const rerankNoModel = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("score 也能当成有分", rerankNoModel.body.ok, true);
  eq("服务端不回 model 时给 null", rerankNoModel.body.model, null);

  // ---- 2. rerank 结构不对：200 也不算可用 ----
  respond = async () => jsonOf({ results: [] });
  const rerankEmpty = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("results 为空不算可用", rerankEmpty.body.ok, false);
  check(
    "空 results 的错误写明返回结构不符合预期",
    String(rerankEmpty.body.error).includes("返回结构不符合预期") &&
      String(rerankEmpty.body.error).includes("results"),
    rerankEmpty.body.error,
  );

  respond = async () => jsonOf({ data: [{ index: 0, relevance_score: 0.3 }] });
  const rerankWrongShape = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("只有 data 没有 results 不算可用", rerankWrongShape.body.ok, false);

  respond = async () => jsonOf({ results: [{ index: 0 }] });
  const rerankNoScore = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("结果项缺分不算可用", rerankNoScore.body.ok, false);
  check(
    "缺分时错误提到 relevance_score",
    String(rerankNoScore.body.error).includes("relevance_score"),
    rerankNoScore.body.error,
  );

  respond = async () => jsonOf({ error: "boom" }, 500);
  const rerank500 = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("HTTP 500 不算可用", rerank500.body.ok, false);
  check("非 2xx 的错误带状态码", String(rerank500.body.error).includes("500"), rerank500.body.error);

  // ---- 3. rerank 连不上：错误原文照抄 ----
  respond = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8098");
  };
  const refused = await test({ kind: "rerank", url: "http://127.0.0.1:8098", model: "bge" });
  eq("连不上就是不可用", refused.body.ok, false);
  check(
    "错误原文保留 ECONNREFUSED",
    String(refused.body.error).includes("ECONNREFUSED"),
    refused.body.error,
  );
  check("失败时也给 elapsedMs", Number.isFinite(refused.body.elapsedMs), refused.body.elapsedMs);
  eq("失败时不带 model 字段", refused.body.model, undefined);

  // ---- 4. systemone 成功 ----
  calls.length = 0;
  respond = async () => jsonOf({ answers: { q: { noul: 0.83 } } });
  const systemoneOk = await test({
    kind: "systemone",
    url: "http://192.168.50.142:8097",
    model: "kev-4b",
    timeoutMs: 3500,
  });
  eq("service-test systemone 可用", systemoneOk.body.ok, true);
  eq("systemone 打到自己的端点", calls[0].url, "http://192.168.50.142:8097/v1/systemone");
  eq("systemone 请求体带模型名", calls[0].body.model, "kev-4b");
  eq("systemone state 是一段 text", calls[0].body.state, { type: "text", content: "连通性测试" });
  eq("systemone 只问一个问题", Object.keys(calls[0].body.questions), ["q"]);
  eq("systemone 那个问题是 noul 题", calls[0].body.questions.q.type, "noul");
  eq("systemone 不回 model 时给 null", systemoneOk.body.model, null);

  // ---- 5. systemone 结构不对 ----
  respond = async () => jsonOf({ answers: {} });
  const systemoneWrong = await test({ kind: "systemone", url: "http://h:2", model: "kev-4b" });
  eq("缺 answers.q 不算可用", systemoneWrong.body.ok, false);
  check(
    "错误写明缺 answers.q",
    String(systemoneWrong.body.error).includes("answers.q"),
    systemoneWrong.body.error,
  );

  // ---- 6. 超时：请求体里的 timeoutMs 真的是硬上限 ----
  respond = async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return jsonOf({ answers: { q: { noul: 0.5 } } });
  };
  const timedOut = await test({
    kind: "systemone",
    url: "http://h:2",
    model: "kev-4b",
    timeoutMs: 100,
  });
  eq("超时就是不可用", timedOut.body.ok, false);
  check(
    "超时错误以 TIMEOUT 开头并带上限",
    /^TIMEOUT 100ms/.test(String(timedOut.body.error)),
    timedOut.body.error,
  );

  // ---- 7. 入参校验：全 400，零写入 ----
  writes.length = 0;
  const badKind = await test({ kind: "model", url: "http://h:1", model: "bge" });
  eq("kind 只认两类", badKind.status, 400);
  writes.length = 0;
  const noUrl = await test({ kind: "rerank", url: "", model: "bge" });
  eq("没地址 400", noUrl.status, 400);
  writes.length = 0;
  const ftpUrl = await test({ kind: "rerank", url: "ftp://h", model: "bge" });
  eq("非 http(s) 地址 400", ftpUrl.status, 400);
  writes.length = 0;
  const urlNoModel = await test({ kind: "rerank", url: "http://h:1", model: "  " });
  eq("有地址无模型 400", urlNoModel.status, 400);
  check(
    "测试路由的拒绝理由也写明配了地址就要填模型名",
    String(urlNoModel.body.error).includes("配了地址就要填模型名"),
    urlNoModel.body.error,
  );
  const badJson = await handlers["POST /recall-mode/service-test"]({
    req: { json: async () => { throw new Error("bad"); } },
    json: (payload, status) => ({ body: payload, status }),
  });
  eq("body 不是 JSON 也 400", badJson.status, 400);
  eq("测试路由全程零写入", writes.length, 0);

  // 请求体里的值说了算：存着的配置不影响这一单。
  store.rerankServiceUrl = "http://saved:1";
  store.rerankServiceModel = "saved-model";
  calls.length = 0;
  respond = async () => jsonOf({ results: [{ index: 0, relevance_score: 0.5 }] });
  await test({ kind: "rerank", url: "http://typed:2", model: "typed-model" });
  eq("测试用请求体里的地址，不用已保存的", calls[0].url, "http://typed:2/v1/rerank");
  eq("测试用请求体里的模型名", calls[0].body.model, "typed-model");
}

// ================= routes: models =================
{
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
  };
  let mode = "ok";
  const catalog = [{ id: "m1", provider: "p1", name: "M1", contextWindow: 8 }];
  const ctx = {
    models: {
      list: async () => {
        if (mode === "throw") throw new Error("APP_CAPABILITY_DENIED");
        return { models: catalog };
      },
    },
  };
  registerModelsRoutes(app, ctx);
  const get = () =>
    handlers["GET /models"]({ json: (payload, status) => ({ body: payload, status }) });

  const ok = await get();
  eq("models 成功时原样透传", ok.body, { ok: true, models: catalog });
  eq("models 成功时状态 200", ok.status, 200);

  mode = "throw";
  const failed = await get();
  eq("models 失败时仍是 200", failed.status, 200);
  eq("models 失败时 ok 为 false", failed.body.ok, false);
  check("models 失败时带上原因", String(failed.body.error || "").includes("APP_CAPABILITY_DENIED"));

  // 形状不认识时不要抛，给空目录。
  ctx.models.list = async () => ({ unexpected: true });
  const odd = await get();
  eq("models 形状不认识时给空数组", odd.body, { ok: true, models: [] });
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

  // ---- llm 档的内置提示词与解析规则 ----
  const expectedPrompt = `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。

用户消息：{{message}}`;
  eq("默认提示词全文", DEFAULT_GATE_PROMPT, expectedPrompt);
  eq("占位符字面量", GATE_MESSAGE_PLACEHOLDER, "{{message}}");
  check("默认模板含 {{message}}", DEFAULT_GATE_PROMPT.includes(GATE_MESSAGE_PLACEHOLDER));
  check("默认模板以占位符结尾", DEFAULT_GATE_PROMPT.endsWith(GATE_MESSAGE_PLACEHOLDER));
  // 空提示词不再是“用默认”：没有判据就不拦。
  eq("提示词为空时没有提示词", gatePromptOf({ gatePrompt: "" }), "");
  eq("只有空白的提示词也算空", gatePromptOf({ gatePrompt: "  \n " }), "");
  eq("没传这个键也算空", gatePromptOf({}), "");
  eq("自定义提示词原样用", gatePromptOf({ gatePrompt: "  自定义  " }), "自定义");
  eq("gate 超时 600ms", GATE_TIMEOUT_MS, 600);
  eq("gate 只要 8 个 token", GATE_MAX_TOKENS, 8);

  // ---- 模板渲染：占位符替换 / 无占位符追加 / 空模板 / 消息里的占位符字样 ----
  eq(
    "占位符被消息替换",
    renderGatePrompt("判断：{{message}}", "运行测试"),
    "判断：运行测试",
  );
  eq(
    "多处占位符全部替换",
    renderGatePrompt("{{message}} 和 {{message}}", "运行测试"),
    "运行测试 和 运行测试",
  );
  eq(
    "占位符在中间也替换",
    renderGatePrompt("前 {{message}} 后", "运行测试"),
    "前 运行测试 后",
  );
  eq(
    "无占位符时消息接在末尾并隔一空行",
    renderGatePrompt("只判断", "运行测试"),
    "只判断\n\n运行测试",
  );
  eq("空模板返回空串", renderGatePrompt("", "运行测试"), "");
  eq("非字符串模板也返回空串", renderGatePrompt(null, "运行测试"), "");
  eq(
    "消息里的占位符字样不被二次替换",
    renderGatePrompt("判断：{{message}}", "{{message}}"),
    "判断：{{message}}",
  );
  eq(
    "消息原样插入不裁剪",
    renderGatePrompt("判断：{{message}}", "  原样  "),
    "判断：  原样  ",
  );
  eq(
    "默认模板渲染出完整提示词",
    renderGatePrompt(DEFAULT_GATE_PROMPT, "运行测试"),
    `${expectedPrompt.slice(0, -GATE_MESSAGE_PLACEHOLDER.length)}运行测试`,
  );

  // 顺序不能反：「不需要」里含「需要」。
  eq("解析：不需要 -> 跳过", gateAnswerRecalls("不需要"), false);
  eq("解析：不需要优先于需要", gateAnswerRecalls("不需要，虽然看起来需要"), false);
  eq("解析：需要 -> 召回", gateAnswerRecalls("需要"), true);
  eq("解析：空串安全召回", gateAnswerRecalls(""), true);
  eq("解析：非字符串也安全召回", gateAnswerRecalls(null), true);
  eq("解析：跑题安全召回", gateAnswerRecalls("今天天气不错"), true);

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

  // ---- 口语疑问词：书面词表漏掉的那批 ----
  // 这几句都很短、也没有问号，但都是问事，必须召回；只靠「为什么/怎么」收不住它们。
  eq("啥意思 -> 召回（啥）", shouldSkipRecall("啥意思", "rules"), false);
  eq("咋办 -> 召回（咋）", shouldSkipRecall("咋办", "rules"), false);
  eq("为啥 -> 召回（为啥）", shouldSkipRecall("为啥", "rules"), false);
  eq("干嘛呢 -> 召回（干嘛）", shouldSkipRecall("干嘛呢", "rules"), false);
  eq("几号 -> 召回（几）", shouldSkipRecall("几号", "rules"), false);
  eq("如何 -> 召回（何）", shouldSkipRecall("如何", "rules"), false);
  eq("怎样 -> 召回（怎样）", shouldSkipRecall("怎样", "rules"), false);
  eq("为什么 -> 召回（为什么）", shouldSkipRecall("为什么", "rules"), false);

  // 反例：补词只能多召回，不能把真正的操作指令也放进来。
  // 这五句都是「说完就完、不指向任何东西」的短指令，仍然该跳过。
  eq("运行测试 -> 仍跳过", shouldSkipRecall("运行测试", "rules"), true);
  eq("重启一下服务 -> 仍跳过", shouldSkipRecall("重启一下服务", "rules"), true);
  eq("看看日志 -> 仍跳过", shouldSkipRecall("看看日志", "rules"), true);
  eq("嗯 -> 仍跳过", shouldSkipRecall("嗯", "rules"), true);
  eq("好 -> 仍跳过", shouldSkipRecall("好", "rules"), true);

  // 指代 / 问号本来就召回，补了口语词之后不能反过来变成跳过。
  eq("这啥 -> 召回（指代 + 疑问词）", shouldSkipRecall("这啥", "rules"), false);
  eq("它在哪 -> 召回（指代 + 疑问词）", shouldSkipRecall("它在哪", "rules"), false);
  eq("那为啥不是默认开启? -> 召回（指代 + 疑问词 + 问号）", shouldSkipRecall("那为啥不是默认开启?", "rules"), false);

  // 词表本身：口语词确实在里面，不是靠别的判据蒙对的。
  check(
    "口语疑问词都在表里",
    ["啥", "咋", "干嘛", "干吗", "几", "何", "怎样"].every((w) => GATE_QUESTION_WORDS.includes(w)),
  );

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

// ================= recall gate: llm =================
{
  const dir = path.join(import.meta.dirname, ".tmp-recall-gate-llm");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = {
    enabled: true,
    apiKey: "k",
    serverUrl: "http://h:1",
    recallGate: "llm",
    gateModel: "",
    // 空提示词已经不再回退成默认，要跑模型判断就得真存一份提示词。
    gatePrompt: DEFAULT_GATE_PROMPT,
    probe: true,
  };
  const recallBody = { status: "ok", result: { rendered: "该召回" } };

  // ---- default：走 utility，说不需 -> 跳过 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({ utility: () => ({ text: "不需要" }) });
    const infos = [];
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({
        values,
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
        logger: { info: (m) => infos.push(m) },
      }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "运行测试" }] },
      session: { sessionId: "llm-default-skip" },
    });
    eq("llm 说不需时返回 undefined", result, undefined);
    eq("llm 说不需时不发召回", mock.calls.length, 0);
    eq("default 走 utility", fake.calls.utility.length, 1);
    eq("default 不走 stream", fake.calls.stream.length, 0);
    const req = fake.calls.utility[0];
    check(
      "utility requestId 非空",
      typeof req.requestId === "string" && req.requestId.length > 0,
    );
    eq("utility scope app", req.scope, "app");
    eq("utility 只有一条 user 消息", req.messages.length, 1);
    eq("utility 消息 role 是 user", req.messages[0].role, "user");
    eq(
      "utility 消息是渲染后的默认模板",
      req.messages[0].content,
      renderGatePrompt(DEFAULT_GATE_PROMPT, "运行测试"),
    );
    eq("utility 不传 systemPrompt", "systemPrompt" in req, false);
    eq("utility maxTokens", req.maxTokens, 8);
    eq("utility temperature", req.temperature, 0);
    eq("utility 不传 provider/model", ["provider" in req, "model" in req], [false, false]);
    eq("llm 跳过探针记一次", probes.length, 1);
    eq("llm 跳过探针 by", probes[0].invocation.by, "llm");
    eq("llm 跳过探针 reason", probes[0].invocation.reason, "llm-no-need");
    check(
      "llm 跳过日志带 by=llm",
      infos.some((m) => m.includes("gate: skipped") && m.includes("by=llm")),
    );
  }

  // ---- custom：走 stream，text-delta 拼出「需要」-> 召回 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({
      stream: () =>
        ndjsonResponse([
          { type: "start", requestId: "r1" },
          { type: "text-delta", requestId: "r1", delta: "需" },
          { type: "text-delta", requestId: "r1", delta: "要" },
          {
            type: "done",
            requestId: "r1",
            stopReason: "stop",
            assistant: { role: "assistant", content: [] },
          },
        ]),
    });
    const handler = createRecallHandler(
      recallSdk({
        values: {
          ...values,
          gateModel: "p1/m1",
          gatePrompt: "自定义判断：{{message}}",
        },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "上次那个决定是什么" }] },
      session: { sessionId: "llm-custom-recall" },
    });
    check("llm 说需要时照常召回", Boolean(result?.payload));
    eq("custom 走 stream", fake.calls.stream.length, 1);
    eq("custom 不走 utility", fake.calls.utility.length, 0);
    const req = fake.calls.stream[0];
    eq("stream provider/model", [req.provider, req.model], ["p1", "m1"]);
    eq("stream 只有一条 user 消息", req.messages.length, 1);
    eq("stream 消息 role 是 user", req.messages[0].role, "user");
    eq(
      "stream 消息是渲染后的自定义模板",
      req.messages[0].content,
      "自定义判断：上次那个决定是什么",
    );
    eq("stream 不传 systemPrompt", "systemPrompt" in req, false);
    eq("stream maxTokens/temperature", [req.maxTokens, req.temperature], [8, 0]);
    eq("stream 不传 scope", "scope" in req, false);
    eq("需要时确实发了召回", mock.calls.length, 1);
  }

  // ---- custom 只需要 stream：没有 utility 也不能因此走不到模型 ----
  {
    const mock = mockFetch({ body: recallBody });
    let streamCalls = 0;
    const handler = createRecallHandler(
      recallSdk({
        values: {
          ...values,
          gateModel: "p1/m1",
        },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: {
          stream: async () => {
            streamCalls += 1;
            return ndjsonResponse([{ type: "text-delta", delta: "需要" }]);
          },
          cancel: async () => {},
        },
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "只有 stream 也要能判断" }] },
      session: { sessionId: "llm-stream-only" },
    });
    eq("custom 只提供 stream 也能调用", streamCalls, 1);
    check("stream-only 判断照常召回", Boolean(result?.payload));
  }

  // ---- 空提示词：不是“用默认”，而是根本不问模型，直接召回 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({ utility: () => ({ text: "不需要" }) });
    const infos = [];
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, gatePrompt: "" },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
        logger: { info: (m) => infos.push(m) },
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "重启一下服务" }] },
      session: { sessionId: "llm-empty-prompt" },
    });
    eq("空提示词时一次模型都没问", fake.calls.utility.length, 0);
    eq("空提示词时也不发 cancel", fake.calls.cancel.length, 0);
    check("空提示词时照常召回", Boolean(result?.payload));
    eq("空提示词时发了召回请求", mock.calls.length, 1);
    check(
      "空提示词日志说清不拦截",
      infos.some((m) => m.includes("prompt empty") && m.includes("recall anyway")),
    );
  }

  // ---- 只有空白的提示词同样算空 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({ utility: () => ({ text: "不需要" }) });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, gatePrompt: "   \n " },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "重启一下服务" }] },
      session: { sessionId: "llm-blank-prompt" },
    });
    eq("空白提示词也不问模型", fake.calls.utility.length, 0);
    check("空白提示词照常召回", Boolean(result?.payload));
  }

  // ---- 空回答：安全召回 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({ utility: () => ({ text: "" }) });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "空回答也召回" }] },
      session: { sessionId: "llm-empty-recall" },
    });
    check("空回答也照常召回", Boolean(result?.payload));
    eq("空回答时发了召回", mock.calls.length, 1);
  }

  // ---- 抛错：安全召回 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({
      utility: () => {
        throw new Error("APP_CAPABILITY_DENIED");
      },
    });
    const infos = [];
    const handler = createRecallHandler(
      recallSdk({
        values,
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
        logger: { info: (m) => infos.push(m) },
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "抛错也要召回" }] },
      session: { sessionId: "llm-throw-recall" },
    });
    check("模型抛错时照常召回", Boolean(result?.payload));
    eq("模型抛错时发了召回", mock.calls.length, 1);
    eq("抛错也 cancel 一次", fake.calls.cancel.length, 1);
    check("抛错日志说明照常召回", infos.some((m) => m.includes("recall anyway")));
  }

  // ---- error 事件：立即失败并召回 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({
      stream: () =>
        ndjsonResponse([
          {
            type: "error",
            requestId: "r1",
            code: "APP_MODEL_NOT_FOUND",
            message: "模型不存在",
          },
        ]),
    });
    const handler = createRecallHandler(
      recallSdk({
        values: {
          ...values,
          gateModel: "p1/missing",
        },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "error 事件要召回" }] },
      session: { sessionId: "llm-stream-error" },
    });
    check("error 事件后照常召回", Boolean(result?.payload));
    eq("error 事件后发了召回", mock.calls.length, 1);
    eq("error 事件后 cancel", fake.calls.cancel.length, 1);
  }

  // ---- 超时：600ms 后安全召回，不能挂住 ----
  {
    const mock = mockFetch({ body: recallBody });
    const fake = modelSdk({ utility: () => new Promise(() => {}) });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const started = Date.now();
    const result = await handler({
      payload: { messages: [{ role: "user", content: "超时也要召回" }] },
      session: { sessionId: "llm-timeout" },
    });
    const elapsed = Date.now() - started;
    check("超时后照常召回", Boolean(result?.payload));
    check("超时在 2 秒内收手", elapsed < 2000, `elapsed=${elapsed}`);
    eq("超时后发了召回", mock.calls.length, 1);
    eq("超时后 cancel 一次", fake.calls.cancel.length, 1);
  }

  // ---- stream 文本解析：error 事件立即失败 ----
  {
    let threw = null;
    try {
      await readGateStreamText(
        ndjsonResponse([
          { type: "text-delta", delta: "需" },
          { type: "error", code: "X", message: "坏了" },
        ]),
      );
    } catch (error) {
      threw = error;
    }
    check("stream error 事件直接抛", String(threw?.message).includes("坏了"));
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= recall rerank: 纯函数 =================
{
  // ---- 候选条目：保留边界，extractRecallText 仍按旧规则拼回去 ----
  eq(
    "条目：rendered 视为单条",
    extractRecallItems({ rendered: "渲染块", digest: "摘要", entries: [{ text: "条目" }] }),
    [{ text: "渲染块" }],
  );
  eq(
    "条目：空 rendered 让位给 digest（仍是单条）",
    extractRecallItems({ rendered: "  ", digest: "只有摘要", entries: [{ text: "条目" }] }),
    [{ text: "只有摘要" }],
  );
  eq(
    "条目：entries 逐条保留并跳过空项",
    extractRecallItems({ entries: [{ text: "第一条" }, { text: "" }, { text: "第二条" }] }),
    [{ text: "第一条" }, { text: "第二条" }],
  );
  eq("条目：字符串也是一条", extractRecallItems("  一段记忆  "), [{ text: "一段记忆" }]);
  eq("条目：未知形状给空数组", extractRecallItems({ total: 0 }), []);
  eq("条目：null 给空数组", extractRecallItems(null), []);
  eq(
    "extractRecallText 语义未变（entries 用空行连接）",
    extractRecallText({ entries: [{ text: "甲" }, { text: "" }, { text: "乙" }] }),
    "甲\n\n乙",
  );

  // ---- 渲染：两个占位符、缺 candidates、空模板 ----
  eq(
    "渲染：两个占位符都替换",
    renderRerankPrompt("问：{{message}}\n候选：\n{{candidates}}", "这句话", [
      { text: "甲" },
      { text: "乙" },
    ]),
    "问：这句话\n候选：\n1. 甲\n2. 乙",
  );
  eq(
    "渲染：缺 candidates 接在末尾",
    renderRerankPrompt("只问 {{message}}", "消息", ["甲"]),
    "只问 消息\n\n1. 甲",
  );
  eq("渲染：空模板给空串", renderRerankPrompt("", "消息", ["甲"]), "");
  eq(
    "渲染：消息里的占位符不二次展开",
    renderRerankPrompt("{{message}}|{{candidates}}", "消息里有 {{candidates}}", ["甲"]),
    "消息里有 {{candidates}}|1. 甲",
  );
  eq("候选摘要取首 120 字", Array.from(candidateSummary("字".repeat(200))).length, 120);
  eq("候选摘要压平换行", candidateSummary("第一行\n第二行"), "第一行 第二行");
  check(
    "默认重排模板带两个占位符",
    DEFAULT_RERANK_PROMPT.includes("{{message}}") &&
      DEFAULT_RERANK_PROMPT.includes("{{candidates}}"),
  );
  eq("空配置用默认重排模板", rerankPromptOf({ rerankPrompt: "" }), DEFAULT_RERANK_PROMPT);
  eq("只有空白也用默认重排模板", rerankPromptOf({ rerankPrompt: "   " }), DEFAULT_RERANK_PROMPT);
  eq("自定义重排模板原样返回", rerankPromptOf({ rerankPrompt: " 自定义 " }), "自定义");

  // ---- 解析：任务书里的六种输入 + 边界 ----
  eq("解析：1,3", parseRerankAnswer("1,3", 5), [0, 2]);
  eq("解析：无", parseRerankAnswer("无", 5), []);
  eq("解析：3", parseRerankAnswer("3", 5), [2]);
  eq("解析：1,9,99", parseRerankAnswer("1,9,99", 5), [0]);
  eq("解析：空串", parseRerankAnswer("", 5), null);
  eq("解析：跑题（我觉得都还行）", parseRerankAnswer("我觉得都还行", 5), null);
  eq("解析：全部超范围等同失败", parseRerankAnswer("9,99", 2), null);
  eq("解析：重复编号去重", parseRerankAnswer("2,2,1", 3), [0, 1]);
  eq("解析：无 + 数字不当成空数组", parseRerankAnswer("无 1", 2), [0]);
  eq("解析：total 为 0 时没有合法编号", parseRerankAnswer("1", 0), null);
  eq("解析：非字符串等同失败", parseRerankAnswer(null, 3), null);
  eq("超时常量 600ms", RERANK_TIMEOUT_MS, 600);
  eq("重排 maxTokens 32", RERANK_MAX_TOKENS, 32);
}

// ================= recall rerank: 链路 =================
{
  const dir = path.join(import.meta.dirname, ".tmp-recall-rerank");
  fs.rmSync(dir, { recursive: true, force: true });
  const values = {
    enabled: true,
    apiKey: "k",
    serverUrl: "http://h:1",
    rerank: "llm",
    probe: true,
  };
  const entries = [{ text: "第一条" }, { text: "第二条" }, { text: "第三条" }];
  const bodyWith = (list) => ({ status: "ok", result: { rendered: "", digest: "", entries: list } });
  const contentOf = (result) => result?.payload?.messages?.[0]?.content || "";

  // ---- 默认关：一次模型都不调 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({ utility: () => ({ text: "1" }) });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, rerank: "off" },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "默认关时别问模型" }] },
      session: { sessionId: "rerank-off" },
    });
    check("默认关时照常注入", Boolean(result?.payload));
    eq("默认关时 utility 一次都没调", fake.calls.utility.length, 0);
    eq("默认关时 stream 一次都没调", fake.calls.stream.length, 0);
    check(
      "默认关时内容全保留",
      ["第一条", "第二条", "第三条"].every((text) => contentOf(result).includes(text)),
    );
  }

  // ---- 选中两条：只注入保留的，探针记一笔 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({ utility: () => ({ text: "1,3" }) });
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "挑出有用的两条" }] },
      session: { sessionId: "rerank-keep-two" },
    });
    check("重排后仍有注入", Boolean(result?.payload));
    check("保留第一个候选", contentOf(result).includes("第一条"));
    check("保留第三个候选", contentOf(result).includes("第三条"));
    check("丢掉没被选中的候选", !contentOf(result).includes("第二条"));
    eq("rerank 走 utility 一次", fake.calls.utility.length, 1);
    eq("rerank 不走 stream", fake.calls.stream.length, 0);
    const req = fake.calls.utility[0];
    eq("rerank maxTokens", req.maxTokens, RERANK_MAX_TOKENS);
    eq("rerank temperature", req.temperature, 0);
    eq("rerank scope app", req.scope, "app");
    eq("rerank 只有一条 user 消息", req.messages.length, 1);
    check(
      "rerank 提示词带消息与编号候选",
      req.messages[0].content.includes("挑出有用的两条") &&
        req.messages[0].content.includes("1. 第一条") &&
        req.messages[0].content.includes("3. 第三条"),
    );
    eq("rerank 探针记一次", probes.length, 1);
    eq("rerank 探针事件名", probes[0].event, "recall/rerank");
    eq("探针记候选数", probes[0].invocation.candidates, 3);
    eq("探针记保留数", probes[0].invocation.kept, 2);
    eq("正常解析不算兜底", probes[0].invocation.fallback, false);
    check("探针记了耗时", typeof probes[0].invocation.elapsedMs === "number");
  }

  // ---- 自选模型走 stream，自定义模板生效 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({
      stream: () => ndjsonResponse([{ type: "text-delta", delta: "1" }]),
    });
    const handler = createRecallHandler(
      recallSdk({
        values: {
          ...values,
          rerankModel: "p1/m1",
          rerankPrompt: "自定义：{{message}}\n{{candidates}}",
        },
        fetchImpl: mock.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "自选模型重排" }] },
      session: { sessionId: "rerank-stream" },
    });
    check("stream 重排后仍有注入", Boolean(result?.payload));
    eq("自选重排走 stream", fake.calls.stream.length, 1);
    eq("自选重排不走 utility", fake.calls.utility.length, 0);
    const req = fake.calls.stream[0];
    eq("重排 stream provider/model", [req.provider, req.model], ["p1", "m1"]);
    eq("重排 stream temperature", req.temperature, 0);
    check(
      "自定义重排模板渲染生效",
      req.messages[0].content.startsWith("自定义：自选模型重排") &&
        req.messages[0].content.includes("1. 第一条"),
    );
  }

  // ---- 候选只有 1 条：没有可挑的，不问模型 ----
  {
    const mock = mockFetch({ body: bodyWith([{ text: "唯一一条" }]) });
    const fake = modelSdk({ utility: () => ({ text: "无" }) });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "只有一条候选" }] },
      session: { sessionId: "rerank-one" },
    });
    check("单候选照常注入", Boolean(result?.payload));
    eq("单候选时一次模型都没调", fake.calls.utility.length + fake.calls.stream.length, 0);
  }

  // ---- 候选 0 条：不问模型，也不注入 ----
  {
    const mock = mockFetch({ body: { status: "ok", result: { total: 0 } } });
    const fake = modelSdk({ utility: () => ({ text: "1" }) });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "一条候选都没有" }] },
      session: { sessionId: "rerank-zero" },
    });
    eq("零候选时不注入", result, undefined);
    eq("零候选时一次模型都没调", fake.calls.utility.length + fake.calls.stream.length, 0);
  }

  // ---- 模型明确说“无”：本轮不注入 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({ utility: () => ({ text: "无" }) });
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "一条都用不上" }] },
      session: { sessionId: "rerank-none" },
    });
    eq("模型说无时本轮不注入", result, undefined);
    eq("模型说无时召回请求照发", mock.calls.length, 1);
    eq("探针记保留数为 0", probes[0].invocation.kept, 0);
    eq("模型明确说无不算兜底", probes[0].invocation.fallback, false);
  }

  // ---- 解析失败（null）：保留全部 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({ utility: () => ({ text: "我觉得都还行" }) });
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "看不懂就全留" }] },
      session: { sessionId: "rerank-null" },
    });
    check("解析失败时仍有注入", Boolean(result?.payload));
    check(
      "解析失败时保留全部",
      ["第一条", "第二条", "第三条"].every((text) => contentOf(result).includes(text)),
    );
    eq("解析失败探针记兜底", probes[0].invocation.fallback, true);
    eq("解析失败探针保留数等于候选数", probes[0].invocation.kept, 3);
  }

  // ---- 抛错 / 超时：保留全部，并撤销在途请求 ----
  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({
      utility: () => {
        throw new Error("APP_CAPABILITY_DENIED");
      },
    });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "抛错也要全留" }] },
      session: { sessionId: "rerank-throw" },
    });
    check("抛错时仍有注入", Boolean(result?.payload));
    check(
      "抛错时保留全部",
      ["第一条", "第二条", "第三条"].every((text) => contentOf(result).includes(text)),
    );
    eq("抛错也 cancel 一次", fake.calls.cancel.length, 1);
  }

  {
    const mock = mockFetch({ body: bodyWith(entries) });
    const fake = modelSdk({ utility: () => new Promise(() => {}) });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: mock.fetchImpl, dataDir: dir, models: fake.models }),
    );
    const started = Date.now();
    const result = await handler({
      payload: { messages: [{ role: "user", content: "超时也要全留" }] },
      session: { sessionId: "rerank-timeout" },
    });
    const elapsed = Date.now() - started;
    check("超时后仍有注入", Boolean(result?.payload));
    check(
      "超时后保留全部",
      ["第一条", "第二条", "第三条"].every((text) => contentOf(result).includes(text)),
    );
    check("超时在 2 秒内收手", elapsed < 2000, `elapsed=${elapsed}`);
    eq("超时后 cancel 一次", fake.calls.cancel.length, 1);
  }

  // ---- 超时三层在真请求上的体现：通道自带 > 服务配置 > 默认 / 自适应 ----
  {
    // 每一跳把信封里的 timeoutMs 截下来：这就是实际会用的那个数。
    const timeoutOf = async (channel, switches, body) => {
      const seen = [];
      setRuntimeTransport({
        send: async (url, init) => {
          seen.push(init.timeoutMs);
          return { ok: true, status: 200, headers: {}, data: body };
        },
      });
      const sdk = recallSdk({ values: {}, dataDir: dir });
      await runRerankChannels({
        sdk,
        switches,
        query: "用户问题",
        items: [{ text: "甲" }, { text: "乙" }],
        channels: [channel],
      });
      resetRuntimeTransport();
      return seen[0];
    };
    const rerankBody = {
      results: [
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.1 },
      ],
    };
    const systemoneBody = { answers: { r1: { noul: 0.9 }, r2: { noul: 0.1 } } };

    eq(
      "rerank 第一层：通道自带的超时压过服务配置",
      await timeoutOf(
        { type: "rerank", url: "http://h:1", model: "m", timeoutMs: 1200 },
        { rerankServiceTimeoutMs: 900 },
        rerankBody,
      ),
      1200,
    );
    eq(
      "rerank 第二层：没填通道超时时用服务配置",
      await timeoutOf(
        { type: "rerank", url: "http://h:1", model: "m" },
        { rerankServiceTimeoutMs: 900 },
        rerankBody,
      ),
      900,
    );
    eq(
      "rerank 第三层：两边都没配时用 800",
      await timeoutOf({ type: "rerank", url: "http://h:1", model: "m" }, {}, rerankBody),
      RERANK_CHANNEL_TIMEOUT_MS,
    );

    eq(
      "systemone 第一层：通道自带的超时压过服务配置",
      await timeoutOf(
        { type: "systemone", url: "http://h:2", model: "m", timeoutMs: 2000 },
        { systemoneServiceTimeoutMs: 1200 },
        systemoneBody,
      ),
      2000,
    );
    eq(
      "systemone 第二层：没填通道超时时用服务配置",
      await timeoutOf(
        { type: "systemone", url: "http://h:2", model: "m" },
        { systemoneServiceTimeoutMs: 1200 },
        systemoneBody,
      ),
      1200,
    );
    eq(
      "systemone 第三层：两边都没配时按候选数自适应（2 条 = 基础值 3500）",
      await timeoutOf({ type: "systemone", url: "http://h:2", model: "m" }, {}, systemoneBody),
      SYSTEMONE_CHANNEL_TIMEOUT_MS,
    );
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= recall rerank: 多路通道 =================
{
  const r2 = (values) => values.map((value) => Math.round(value * 100) / 100);

  // ---- 每路先标准化，再加权合并 ----
  eq(
    "合并：两路同分（标准化后落在两端）",
    mergeRerankScores(
      [
        { ok: true, scores: [1, 0.5], weight: 1 },
        { ok: true, scores: [1, 0.5], weight: 1 },
      ],
      2,
    ),
    [1, 0],
  );
  eq(
    "合并：两路分歧按权重",
    mergeRerankScores(
      [
        { ok: true, scores: [1, 0], weight: 3 },
        { ok: true, scores: [0, 1], weight: 1 },
      ],
      2,
    ),
    [0.75, 0.25],
  );
  eq(
    "合并：一路弃权不归零（不参与分母）",
    mergeRerankScores(
      [
        { ok: false, weight: 1 },
        { ok: true, scores: [0.2, 0.8], weight: 2 },
      ],
      2,
    ),
    [0, 1],
  );
  eq(
    "合并：全部弃权回 null",
    mergeRerankScores([{ ok: false, weight: 1 }, { ok: false, weight: 2 }], 2),
    null,
  );
  eq("合并：空结果回 null", mergeRerankScores([], 2), null);

  // ---- 标准化：min-max 把一路拉平到 0..1 ----
  eq(
    "标准化：量纲不同的数值被拉平",
    r2(normalizeChannelScores([0.82, 0.85]).normalized),
    [0, 1],
  );
  {
    const scaled = normalizeChannelScores([0.82, 0.85]);
    eq("标准化：原区间一并带出", [scaled.min, scaled.max], [0.82, 0.85]);
  }
  eq("标准化：全部同分回 null（这一路弃权）", normalizeChannelScores([0.5, 0.5]), null);
  eq("标准化：单条候选回 null", normalizeChannelScores([0.77]), null);
  eq("标准化：非数字回 null", normalizeChannelScores([0.3, "x"]), null);

  // ---- 量纲差很多：标准化后的结论与“两路都说乙更好”一致 ----
  {
    const wide = { ok: true, weight: 1, scores: [0.82, 0.85] }; // 窄区间，尺子短
    const narrow = { ok: true, weight: 1, scores: [0.12, 0.88] }; // 宽区间，尺子长
    const naive = wide.scores.map((value, index) => (value + narrow.scores[index]) / 2);
    const scaled = mergeRerankScores([wide, narrow], 2);
    eq("量纲差：直接加权被长尺子带走", r2(naive), [0.47, 0.87]);
    eq("量纲差：标准化后两路等权", r2(scaled), [0, 1]);
    eq("量纲差：排序仍是乙在前", rankRerankIndexes(scaled), [1, 0]);
  }

  // ---- 一路分数全相同 -> 该路弃权，另一路照旧 ----
  {
    const flat = { ok: true, weight: 3, scores: [0.4, 0.4] };
    const alive = { ok: true, weight: 1, scores: [0.2, 0.9] };
    eq("同分那一路单独算就是 null", mergeRerankScores([flat], 2), null);
    eq("同分那一路不影响另一路", mergeRerankScores([flat, alive], 2), [0, 1]);
    eq(
      "同分那一路被标成弃权",
      mergeRerankScores([{ ...flat, abstained: true }, alive], 2),
      [0, 1],
    );
  }

  // ---- 二值通道与连续通道混跑：二值不再无届放大 ----
  {
    const binary = { ok: true, weight: 1, scores: [1, 0] }; // 挑中甲
    const smooth = { ok: true, weight: 1, scores: [0.85, 0.9] }; // 几乎平手，偏好乙
    const naive = binary.scores.map((value, index) => (value + smooth.scores[index]) / 2);
    const scaled = mergeRerankScores([binary, smooth], 2);
    eq("二值直加：1 与 0 的落差盖过 0.05 的偏好", r2(naive), [0.93, 0.45]);
    eq("二值标准化：两路各投一票，平手", r2(scaled), [0.5, 0.5]);
  }

  eq("排序：降序且同分保持原序", rankRerankIndexes([0.2, 0.9, 0.9, 0]), [1, 2, 0, 3]);
  eq("取舍：所有通道原始分都是 0 才丢", dropRejectedIndexes([0, 1, 2], [
    { ok: true, scores: [0, 1, 0] },
    { ok: true, scores: [0.4, 0.9, 0] },
  ]), [0, 1]);
  eq(
    "标准化：全 0 是明确反对，不是同分弃权",
    [normalizeChannelScores([0, 0]).allZero, normalizeChannelScores([0, 0]).normalized],
    [true, [0, 0]],
  );
  eq(
    "取舍：标准化后的 0 不算反对票",
    dropRejectedIndexes([0, 1], [{ ok: true, scores: [0.85, 0.9] }]),
    [0, 1],
  );
  eq(
    "取舍：弃权那一路不参与判反对",
    dropRejectedIndexes([0, 1], [{ ok: true, scores: [0.2, 0.8] }, { ok: false, abstained: true, scores: [0, 0] }]),
    [0, 1],
  );

  // ---- 没配置通道时退回旧的 rerankPrompt / rerankModel 那一路 ----
  const legacy = rerankChannelsOf({
    rerankChannels: [],
    rerankModel: "p1/m1",
    rerankPrompt: "",
  });
  eq("空通道退回一路兜底", legacy.length, 1);
  eq("兜底是 model 通道", [legacy[0].type, legacy[0].legacy], ["model", true]);
  eq("兜底沿用 rerankModel", legacy[0].model, "p1/m1");
  eq("兜底权重为 1", legacy[0].weight, 1);
  eq(
    "全部通道都停用时也退回兜底",
    rerankChannelsOf({
      rerankChannels: [
        { type: "rerank", url: "http://h", model: "m", weight: 1, enabled: false },
      ],
    })[0].legacy,
    true,
  );
  const configured = rerankChannelsOf({
    rerankChannels: [{ type: "model", model: "", weight: 4, enabled: true }],
  });
  eq("有启用通道就按配置跑", [configured.length, configured[0].weight], [1, 4]);
  eq("配置通道不带 legacy 标记", configured[0].legacy, undefined);

  const dir = path.join(import.meta.dirname, ".tmp-rerank-channels");
  fs.rmSync(dir, { recursive: true, force: true });
  const items = [{ text: "甲".repeat(900) }, { text: "乙" }, { text: "丙" }];
  const okBody = {
    results: [
      { index: 0, relevance_score: 0.9 },
      { index: 1, relevance_score: 0.25 },
      { index: 2, relevance_score: 0 },
    ],
  };

  // ---- rerank 请求形状 ----
  {
    resetRuntimeTransport();
    const calls = [];
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(okBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        {
          type: "rerank",
          name: "本地 rerank",
          url: "http://127.0.0.1:9999",
          model: "bge-reranker",
          weight: 1,
          enabled: true,
        },
      ],
    });
    eq("rerank 只发一条请求", calls.length, 1);
    eq("rerank 端点拼接 /v1/rerank", calls[0].url, "http://127.0.0.1:9999/v1/rerank");
    eq("rerank 用 POST", calls[0].init.method, "POST");
    eq(
      "rerank body 带 model / query / documents",
      [calls[0].body.model, calls[0].body.query, calls[0].body.documents.length],
      ["bge-reranker", "用户问题", 3],
    );
    eq(
      "rerank documents 截到 800 字",
      Array.from(calls[0].body.documents[0]).length,
      RERANK_DOCUMENT_CHARS,
    );
    eq("rerank 分数按 relevance_score 读", outcome.channels[0].scores, [0.9, 0.25, 0]);
    // 真机 bge-reranker 返回的是交叉编码器 logit（实测 7.88 / -8.32 / -10.69）：
    // 直接 clamp 会把负分全变 0（当反对票丢掉）、正分全变 1（排序没了）。
    {
      const rounded = (list) => list.map((value) => Number(value.toFixed(4)));
      eq(
        "0..1 相关度原样保留",
        rounded(squashRerankScores([0.9, 0.25, 0])),
        [0.9, 0.25, 0],
      );
      const logits = squashRerankScores([7.8827, -8.322, -10.692]);
      check(
        "logit 过 sigmoid 后保序且不再是 0/1",
        logits[0] > logits[1] &&
          logits[1] > logits[2] &&
          logits.every((value) => value > 0 && value < 1),
        JSON.stringify(rounded(logits)),
      );
      eq(
        "logit 里没有被 clamp 成 1 的",
        rounded(squashRerankScores([7.8827, 3.1])),
        [0.9996, 0.9569],
      );
      eq(
        "缺项保持 null",
        squashRerankScores([2.5, null], [2.5]).map((value) => (value === null ? null : Number(value.toFixed(3)))),
        [0.924, null],
      );
    }
    eq(
      "rerank 标准化后合并（0.9/0.25/0 拉成 1/0.28/0）",
      outcome.merged.map((value) => Number(value.toFixed(2))),
      [1, 0.28, 0],
    );
    eq(
      "探针同时留下标准化分",
      outcome.channels[0].normalized.map((value) => Number(value.toFixed(2))),
      [1, 0.28, 0],
    );
    eq("rerank 0 分候选被丢掉", outcome.indexes, [0, 1]);
  }

  // ---- 通道不写 URL / 模型时，用打分服务配置 ----
  {
    resetRuntimeTransport();
    const calls = [];
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(okBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: {
        rerankChannels: [],
        rerankPrompt: "",
        rerankModel: "",
        rerankServiceUrl: "http://127.0.0.1:8098",
        rerankServiceModel: "bge-reranker-v2-m3",
      },
      query: "用户问题",
      items,
      channels: [{ type: "rerank", name: "服务", url: "", model: "", weight: 1 }],
    });
    eq("服务配置补上端点", calls[0].url, "http://127.0.0.1:8098/v1/rerank");
    eq("服务配置补上模型", calls[0].body.model, "bge-reranker-v2-m3");
    eq("只选类型的通道也能正常出分", outcome.channels[0].ok, true);
  }

  // ---- 服务也没配：这一路弃权，不假装 0 分 ----
  {
    resetRuntimeTransport();
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async () => {
        throw new Error("不该联网");
      },
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [{ type: "rerank", name: "空", weight: 1 }],
    });
    eq("服务未配置的通道失败", outcome.channels[0].ok, false);
    check(
      "失败原因写明服务未配置",
      String(outcome.channels[0].error || "").includes("打分服务未配置"),
      outcome.channels[0].error,
    );
    eq("全部通道弃权时原样保留", outcome.fallback, true);
  }

  // ---- 通道走受管运行时出口：URL 由通道自己给，不锁死一个 origin ----
  {
    const calls = [];
    setRuntimeTransport({
      send: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return { ok: true, status: 200, headers: {}, data: okBody };
      },
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        {
          type: "rerank",
          name: "远端",
          url: "http://10.0.0.5:8080",
          model: "m",
          weight: 1,
          timeoutMs: 321,
        },
      ],
    });
    eq("通道走受管运行时出口", calls.length, 1);
    eq("运行时出口接收通道自己的 URL", calls[0].url, "http://10.0.0.5:8080/v1/rerank");
    eq("运行时信封带这一路的超时", calls[0].init.timeoutMs, 321);
    eq("运行时信封 body 仍是 rerank 形状", calls[0].body.model, "m");
    eq(
      "运行时返回值被读成分数",
      outcome.merged.map((value) => Number(value.toFixed(2))),
      [1, 0.28, 0],
    );
    resetRuntimeTransport();
  }

  // ---- systemone：全部候选拼进同一个 state，一次请求问回全部概率 ----
  {
    const calls = [];
    setRuntimeTransport({
      send: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          headers: {},
          data: { answers: { r1: { noul: 0.6 }, r2: { noul: 0.9 } } },
        };
      },
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items: [{ text: "甲" }, { text: "乙" }],
      channels: [
        {
          type: "systemone",
          name: "",
          url: "http://127.0.0.1:8080/",
          model: "small",
          weight: 1,
          enabled: true,
        },
      ],
    });
    // 批量：两条候选只发一条请求。
    eq("systemone 一次请求覆盖全部候选", calls.length, 1);
    eq("systemone 端点拼接 /v1/systemone", calls[0].url, "http://127.0.0.1:8080/v1/systemone");
    eq("systemone body.model", calls[0].body.model, "small");
    eq(
      "systemone state 带用户问题与编号候选列表",
      calls[0].body.state,
      "用户问题：用户问题\n候选列表：\n1. 甲\n2. 乙",
    );
    eq("systemone questions 是对象且键为 r1..rN", Object.keys(calls[0].body.questions), ["r1", "r2"]);
    eq(
      "systemone 每题都是 noul 且带序号",
      calls[0].body.questions.r1,
      { type: "noul", instructions: "第 1 条候选能帮助回答用户的问题吗" },
    );
    eq("systemone 序号跟着候选走", calls[0].body.questions.r2.instructions, systemoneInstructions(2));
    eq("systemone answers.rN 还原到候选下标", outcome.channels[0].scores, [0.6, 0.9]);
    eq("systemone 标准化后拉平", outcome.merged, [0, 1]);
    eq("systemone 走默认自适应超时（2 条 = 3500）", calls[0].init.timeoutMs, 3500);
    resetRuntimeTransport();
  }

  // ---- systemone：某条缺项记 null，不参与这一路的标准化 ----
  {
    setRuntimeTransport({
      send: async () => ({
        ok: true,
        status: 200,
        headers: {},
        // 只回了 r1 / r2，r3 缺失；3 条里缺 1 条不算过半。
        data: { answers: { r1: { noul: 0.2 }, r2: { noul: 0.8 } } },
      }),
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items: [{ text: "甲" }, { text: "乙" }, { text: "丙" }],
      channels: [
        { type: "systemone", name: "", url: "http://127.0.0.1:8080", model: "small", weight: 1, enabled: true },
      ],
    });
    check(
      "systemone 少量缺项不弃权",
      outcome.channels[0].ok === true && outcome.channels[0].abstained === false,
      JSON.stringify(outcome.channels[0]),
    );
    eq("systemone 缺 r3 时该条为 null", outcome.channels[0].scores, [0.2, 0.8, null]);
    eq("systemone 缺项不参与标准化", outcome.channels[0].normalized, [0, 1, null]);
    eq("systemone 缺项仍占位（只有这一路时排末位）", outcome.merged, [0, 1, 0]);
    eq(
      "缺项那条只由另一路定夺",
      mergeRerankScores(
        [
          { ok: true, weight: 1, normalized: [0, 1, null] },
          { ok: true, weight: 1, normalized: [1, 1, 1] },
        ],
        3,
      ),
      [0.5, 1, 1],
    );
    eq(
      "没人打分的那条不算反对票",
      dropRejectedIndexes([0, 1, 2], [{ ok: true, scores: [0.2, 0.8, null] }]),
      [0, 1, 2],
    );
    resetRuntimeTransport();
  }

  // ---- systemone：超过一半缺失 -> 整路弃权 ----
  {
    setRuntimeTransport({
      send: async () => ({
        ok: true,
        status: 200,
        headers: {},
        // r1 有数，r2 是 null（不是数字），r3 干脆没有：3 条缺 2 条，过半。
        data: { answers: { r1: { noul: 0.5 }, r2: { noul: null } } },
      }),
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items: [{ text: "甲" }, { text: "乙" }, { text: "丙" }],
      channels: [
        { type: "systemone", name: "", url: "http://127.0.0.1:8080", model: "small", weight: 1, enabled: true },
      ],
    });
    eq("systemone 超过一半缺失整路弃权", outcome.channels[0].ok, false);
    check(
      "systemone 弃权原因写明清点",
      /2\/3/.test(String(outcome.channels[0].error)),
      String(outcome.channels[0].error),
    );
    eq("systemone 全部弃权时原样保留", [outcome.fallback, outcome.indexes], [true, [0, 1, 2]]);
    resetRuntimeTransport();
  }

  // ---- systemone：只问前 5 条，超出的按未打分处理 ----
  {
    const calls = [];
    const answers = {};
    for (let position = 1; position <= SYSTEMONE_MAX_CANDIDATES; position += 1) {
      answers[`r${position}`] = { noul: position / 10 };
    }
    setRuntimeTransport({
      send: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return { ok: true, status: 200, headers: {}, data: { answers } };
      },
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const six = Array.from({ length: SYSTEMONE_MAX_CANDIDATES + 1 }, (_, index) => ({
      text: `候选${index + 1}`,
    }));
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items: six,
      channels: [
        { type: "systemone", name: "", url: "http://127.0.0.1:8080", model: "small", weight: 1, enabled: true },
      ],
    });
    eq(
      "systemone 只问前 5 条",
      Object.keys(calls[0].body.questions).length,
      SYSTEMONE_MAX_CANDIDATES,
    );
    check(
      "systemone state 只列前 5 条",
      calls[0].body.state.includes(`${SYSTEMONE_MAX_CANDIDATES}. 候选${SYSTEMONE_MAX_CANDIDATES}`) &&
        !calls[0].body.state.includes(`6. 候选6`),
      calls[0].body.state.split("\n").slice(-1)[0],
    );
    eq("systemone 超出的候选记为 null", outcome.channels[0].scores, [0.1, 0.2, 0.3, 0.4, 0.5, null]);
    eq("systemone 候选上限是 5", SYSTEMONE_MAX_CANDIDATES, 5);
    resetRuntimeTransport();
  }

  // ---- systemone：不手动配超时时按候选数自适应 ----
  {
    eq("自适应：1 条 = 基础值 3500", systemoneTimeoutFor({}, 1), 3500);
    eq("自适应：5 条 = 3500", systemoneTimeoutFor({}, 5), 3500);
    eq("自适应：6 条 = 4200（超上限前先按每条约 700）", systemoneTimeoutFor({}, 6), 4200);
    eq("自适应：8 条 = 5600", systemoneTimeoutFor({}, 8), 5600);
    eq("自适应：12 条被压到上限 8000", systemoneTimeoutFor({}, 12), 8000);
    eq("手动配 2000 不自适应", systemoneTimeoutFor({ timeoutMs: 2000 }, 5), 2000);
    eq("手动配 99999 被压到上限 8000", systemoneTimeoutFor({ timeoutMs: 99999 }, 5), 8000);
    eq("空串 / 非数字当没配", [
      systemoneTimeoutFor({ timeoutMs: "" }, 5),
      systemoneTimeoutFor({ timeoutMs: "abc" }, 5),
    ], [3500, 3500]);
  }

  // ---- systemone：超时可配，上限 8000 ----
  {
    for (const [given, expected] of [[1200, 1200], [9999, 8000]]) {
      const calls = [];
      setRuntimeTransport({
        send: async (url, init) => {
          calls.push({ url, init, body: JSON.parse(init.body) });
          return {
            ok: true,
            status: 200,
            headers: {},
            data: { answers: { r1: { noul: 0.1 }, r2: { noul: 0.9 } } },
          };
        },
      });
      const sdk = recallSdk({ values: {}, dataDir: dir });
      await runRerankChannels({
        sdk,
        switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
        query: "用户问题",
        items: [{ text: "甲" }, { text: "乙" }],
        channels: [
          {
            type: "systemone",
            name: "",
            url: "http://127.0.0.1:8080",
            model: "small",
            weight: 1,
            enabled: true,
            timeoutMs: given,
          },
        ],
      });
      eq(`systemone 超时可配：${given} -> ${expected}`, calls[0].init.timeoutMs, expected);
      resetRuntimeTransport();
    }
    eq("systemone 默认 3500ms 超时常量", SYSTEMONE_CHANNEL_TIMEOUT_MS, 3500);
    eq("systemone 超时上限 8000ms", SYSTEMONE_TIMEOUT_MAX_MS, 8000);
    eq("rerank 默认仍是 800ms", RERANK_CHANNEL_TIMEOUT_MS, 800);
    eq("model 默认仍是 1500ms", RERANK_MODEL_CHANNEL_TIMEOUT_MS, 1500);
  }

  // ---- systemone：state 拼装的两条边界（单条 500 字、总长 12000） ----
  {
    const single = buildSystemOneState("问题", [{ text: "甲".repeat(900) }]);
    eq(
      "state 单条候选截到 500 字",
      [single.count, Array.from(single.state).length],
      [1, Array.from("用户问题：问题\n候选列表：\n1. ").length + SYSTEMONE_DOCUMENT_CHARS],
    );
    eq("state 单条候选正文上限是 500", SYSTEMONE_DOCUMENT_CHARS, 500);
    const many = buildSystemOneState(
      "问题",
      Array.from({ length: 40 }, () => ({ text: "乙".repeat(600) })),
    );
    check(
      "state 总长不超过 12000 字符",
      Array.from(many.state).length <= SYSTEMONE_STATE_MAX_CHARS,
      String(Array.from(many.state).length),
    );
    check("state 装不下时只截断尾部", many.count > 0 && many.count < 40, String(many.count));
  }

  // ---- model 通道请求形状：沿用编号清单 ----
  {
    resetRuntimeTransport();
    const fake = modelSdk({ utility: () => ({ text: "2" }) });
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      models: fake.models,
      fetchImpl: async () => {
        throw new Error("model 通道不该发 HTTP");
      },
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        { type: "model", name: "宿主", url: "", model: "", weight: 1, enabled: true },
      ],
    });
    eq("model 通道只问一次宿主", fake.calls.utility.length, 1);
    const request = fake.calls.utility[0];
    check(
      "model 通道列编号候选",
      request.messages[0].content.includes("1. 甲") &&
        request.messages[0].content.includes("3. 丙"),
      request.messages[0].content,
    );
    eq("model 通道挑中为 1、未挑中为 0", outcome.merged, [0, 1, 0]);
    eq("model 通道只保留挑中的", outcome.indexes, [1]);
    eq("model 通道默认超时常量", RERANK_MODEL_CHANNEL_TIMEOUT_MS, 1500);
  }

  // ---- 任一路超时不影响另一路 ----
  {
    resetRuntimeTransport();
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async (url) => {
        if (url.includes("slow")) return new Promise(() => {});
        return new Response(JSON.stringify(okBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const started = Date.now();
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        { type: "rerank", name: "slow", url: "http://slow.test", model: "m", weight: 1, enabled: true },
        { type: "rerank", name: "fast", url: "http://fast.test", model: "m", weight: 1, enabled: true },
      ],
    });
    const elapsed = Date.now() - started;
    const slow = outcome.channels.find((channel) => channel.name === "slow");
    const fast = outcome.channels.find((channel) => channel.name === "fast");
    eq("超时那一路弃权", slow.ok, false);
    check("超时原因写进探针", String(slow.error).includes("TIMEOUT"), slow.error);
    check("超时原因是统一的 TIMEOUT 句（不随出口变）", String(slow.error).startsWith("TIMEOUT "), slow.error);
    eq("另一路照常成功", fast.ok, true);
    eq("合并只算成功的那一路", outcome.merged.map((value) => Number(value.toFixed(2))), [1, 0.28, 0]);
    eq("不是全部弃权", outcome.fallback, false);
    check("一路超时在 2 秒内收手", elapsed < 2000, `elapsed=${elapsed}`);
  }

  // ---- 直连出口的超时：AbortSignal 先手时也要说人话 ----
  {
    resetRuntimeTransport();
    const abortError = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async () => {
        throw abortError;
      },
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [{ type: "rerank", name: "abort", url: "http://abort.test", model: "m", weight: 1, enabled: true }],
    });
    const abort = outcome.channels.find((channel) => channel.name === "abort");
    check("直连超时也标成 TIMEOUT", String(abort.error).startsWith("TIMEOUT "), abort.error);
    eq("直连超时整路弃权", [abort.ok, outcome.fallback], [false, true]);
  }

  // ---- 一路分数全相同：这一路弃权，不影响另一路 ----
  {
    resetRuntimeTransport();
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async (url) =>
        new Response(
          JSON.stringify(
            url.includes("flat")
              ? { results: [
                  { index: 0, relevance_score: 0.5 },
                  { index: 1, relevance_score: 0.5 },
                  { index: 2, relevance_score: 0.5 },
                ] }
              : okBody,
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        { type: "rerank", name: "flat", url: "http://flat.test", model: "m", weight: 3, enabled: true },
        { type: "rerank", name: "live", url: "http://live.test", model: "m", weight: 1, enabled: true },
      ],
    });
    const flat = outcome.channels.find((channel) => channel.name === "flat");
    const live = outcome.channels.find((channel) => channel.name === "live");
    eq("同分那一路标成弃权", [flat.ok, flat.abstained], [false, true]);
    check("弃权原因写进探针", String(flat.error).includes("同分"), flat.error);
    eq("另一路照常成功", live.ok, true);
    eq("合并等于另一路的标准化分", outcome.merged.map((value) => Number(value.toFixed(2))), [1, 0.28, 0]);
    eq("同分的路不拉低排序", outcome.indexes, [0, 1]);
    eq("不是全部弃权", outcome.fallback, false);
  }

  // ---- 全部弃权：不排序，原样保留 ----
  {
    resetRuntimeTransport();
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async () => new Response("bad", { status: 500 }),
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        { type: "rerank", name: "", url: "http://bad.test", model: "m", weight: 1, enabled: true },
      ],
    });
    eq("全部弃权回 fallback", outcome.fallback, true);
    eq("全部弃权时索引原样", outcome.indexes, [0, 1, 2]);
    eq("全部弃权时保留全部", outcome.kept.length, 3);
  }

  // ---- 最近一轮候选样本：测试按钮的数据源 ----
  {
    writeRerankSample({ dataDir: dir }, "sample-session", { query: "问过什么", items });
    const sample = readRerankSample({ dataDir: dir }, "sample-session");
    eq("样本读出查询", sample.query, "问过什么");
    eq("样本读出候选条数", sample.items.length, 3);
    eq("样本候选仍是正文", sample.items[0].text.length, RERANK_DOCUMENT_CHARS);
    eq("没有样本时回 null", readRerankSample({ dataDir: dir }, "missing-session"), null);
  }

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

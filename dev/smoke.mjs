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
  normalizeGateDecisionPrompt,
  normalizeGatePrompt,
  normalizeRerank,
  normalizeRerankModel,
  normalizeRerankPrompt,
  normalizeServiceKey,
  normalizeServiceModel,
  normalizeServiceTimeout,
  normalizeServiceUrl,
  serializeServiceTimeout,
  servicePairError,
  serviceTimeoutOrDefault,
  parseRerankChannel,
  parseRerankChannels,
  serializeRerankChannels,
  DEFAULT_GATE_DECISION_PROMPT,
  decisionServiceConfigured,
  resolveRecallGate,
  GATE_PROMPT_MAX,
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TYPES,
  RERANK_CHANNEL_URL_MAX,
  RERANK_MODES,
  RERANK_PROMPT_MAX,
  SERVICE_MODEL_MAX,
  SERVICE_KEY_MAX,
  SERVICE_TIMEOUT_LIMITS,
  DEFAULTS,
} from "../src/ov/settings.js";
import { maskOf, maskString } from "../src/ov/mask.js";
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
  gateModelOf,
  gatePromptOf,
  parseModelRef,
  parseRerankAnswer,
  readGateStreamText,
  renderGatePrompt,
  renderRerankPrompt,
  rerankModelOf,
  rerankPromptOf,
  rerankScoreScale,
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
  gateDecisionPromptOf,
  DECISION_GATE_CRITERIA,
  DECISION_GATE_THRESHOLD,
  DECISION_GATE_TIMEOUT_MS,
  DECISION_GATE_TIMEOUT_MAX_MS,
  askDecisionGate,
  decisionGateServiceOf,
  decisionGateSkips,
  renderDecisionPrompt,
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
import { sessionKeyOf as uiSessionKeyOf } from "../ui-src/src/lib/session-key.js";
// 边栏会话卡的数据投影：覆盖提交语义、统计 / 提示 / peer 文案都在这里，纯函数。
import {
  BOOL_KEYS as CARD_BOOL_KEYS,
  OVERRIDE_KEYS as CARD_OVERRIDE_KEYS,
  SCOPE_KEY as CARD_SCOPE_KEY,
  activeSessionView as cardSessionView,
  hasOverride as hasCardOverride,
  hintView as cardHintView,
  noteView as cardNoteView,
  optimisticResetEffective as cardOptimisticReset,
  peerView as cardPeerView,
  resetOverride as cardResetOverride,
  statsText as cardStatsText,
  withOverride as cardWithOverride,
} from "../ui-src/src/lib/card-view.js";
// 面板四页标签与记忆键：纯逻辑，node 直接验。
import {
  DEFAULT_TAB,
  TAB_KEY,
  TABS,
  nextTab,
  normalizeTab,
  readTab,
  writeTab,
} from "../ui-src/src/lib/tabs.js";
// checks 归一化的唯一实现：路由与工具共用，这里直接验同一份输入过两处。
import { normalizeChecks, normalizeReady } from "../src/ov/ready.js";
// check 状态 -> 颜色档位，前端与详情行共用。
import { statusTone as uiStatusTone } from "../ui-src/src/lib/check-tone.js";
// 服务端检查项的摘要文案：面板那一行字由它造，必须能测。
import {
  checkStatusLabel as uiCheckStatusLabel,
  summarizeChecks as uiSummarizeChecks,
} from "../ui-src/src/lib/check-summary.js";
// 面板那排召回下拉的状态与提交：成功 / 失败两种收笔都由它定。
import {
  DEFAULT_GATE_DECISION_PROMPT as UI_DEFAULT_GATE_DECISION_PROMPT,
  DEFAULT_GATE_PROMPT as UI_DEFAULT_GATE_PROMPT,
  DEFAULT_MODEL_OPTION,
  DEFAULT_RERANK_PROMPT as UI_DEFAULT_RERANK_PROMPT,
  RERANK_CHANNEL_LABELS,
  RECALL_GATE_LABELS as UI_RECALL_GATE_LABELS,
  RERANK_CHANNELS_MAX as UI_RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TIMEOUT_DEFAULTS as UI_RERANK_CHANNEL_TIMEOUT_DEFAULTS,
  SCORING_SERVICES,
  CHANNEL_PAIR_NOTE_MODEL as UI_CHANNEL_PAIR_NOTE_MODEL,
  CHANNEL_PAIR_NOTE_URL as UI_CHANNEL_PAIR_NOTE_URL,
  SERVICE_TEST_TEXT as UI_SERVICE_TEST_TEXT,
  SERVICE_TIMEOUT_LIMITS as UI_SERVICE_TIMEOUT_LIMITS,
  SERVICE_MODEL_MAX as UI_SERVICE_MODEL_MAX,
  SERVICE_KEY_MAX as UI_SERVICE_KEY_MAX,
  SERVICE_URL_MAX as UI_SERVICE_URL_MAX,
  SERVICE_KEY_MASK_DOTS as UI_SERVICE_KEY_MASK_DOTS,
  channelPairNote as uiChannelPairNote,
  decisionPromptDraft,
  decisionPromptStatus,
  decisionServiceConfigured as uiDecisionServiceConfigured,
  decisionServiceView,
  normalizeGateDecisionPrompt as uiNormalizeGateDecisionPrompt,
  paintDecisionConfig,
  normalizeServiceKey as uiNormalizeServiceKey,
  normalizeServiceTimeout as uiNormalizeServiceTimeout,
  serviceKeyMask as uiServiceKeyMask,
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
  normalizeRerankChannel,
  normalizeRerankChannels,
  paintGateConfig,
  paintLayers,
  paintRecallConfig,
  paintRerankConfig,
  paintScoringConfig,
  promptDraft,
  promptStatus,
  recallGateOptions,
  rerankPromptDraft,
  rerankPromptStatus,
  rerankChannelsText,
  scoringServiceLayout,
  scoringServiceRow,
  scoringServicesNote,
} from "../ui-src/src/lib/recall-layers.js";
// 面板的视图投影（状态 → 文案 / 档位 / 行内容）：纯函数，节点直接验。
import {
  LOG_EMPTY,
  MASTER_HINT_OFF,
  MASTER_HINT_ON,
  PREFIX_WARN as uiPrefixWarn,
  apiKeyPlaceholder,
  dotClassOf,
  formatChannelTest,
  logBodyText,
  logChips,
  peerExcluded,
  peerMetaText,
  peerTappable,
  peerTitle,
  readFootText,
  statusView,
  transportTextOf,
  versionTextOf,
  withStoredOption,
} from "../ui-src/src/lib/panel-view.js";
// 响应式外壳：createConfig 注入假 fetch，useConfig 就是组件里用的那一份。
import { createConfig, useConfig } from "../ui-src/src/composables/useConfig.js";
// 只为验「store 写进去的状态真的能被 Vue 看见」——裸 import "vue" 从 dev/ 解析不到，
// 走 ui-src 自己的依赖目录（离线就位，构建也需要它）。
import { effect as vueEffect } from "../ui-src/node_modules/vue/index.mjs";

// 工具的报告体：与 /status 比 ready.checks 的形状是否一致。
import { buildStatusReport } from "../index.js";
// 设置页「GET /conn 响应 → 字段」的映射是纯函数，直接 import 断言，
// 不去 .vue 里正则捞字符串。
import {
  HINT_DEFAULT,
  HINT_SET,
  buildMask,
  connFields,
} from "../ui-src/src/conn-fields.js";
// 主题也是一份纯数据：直接检查对象，比正则靠谱。
import { lightThemeOverrides } from "../ui-src/src/theme.js";

// 决策那份默认题面：字面量只在这里写一次，其余断言引用它。
const DECISION_PROMPT_TEXT =
  "把这句话单独发给一个没看过聊天记录的人，他能不能立刻知道在说什么？";

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

// 响应里少了字段时，冒烟要红一条断言，不是摔一个 TypeError 把整轮带走。
// 只收敛「取不到的容器」这一层：数组给空数组、字符串给空串，原样值不动。
// 期望值本身就是空的时候（`eq(..., [])`）不要套它，否则「字段缺失」会被洗成「刚好符合」；
// 负向断言（期望 false）同理，缺字段必须仍然红，那种地方用 `?.` 让值变 undefined。
const asList = (value) => (Array.isArray(value) ? value : []);
const asText = (value) => (typeof value === "string" ? value : "");

// ---- ui-src 源码读取：只用于两条 a11y / 切页零副作用的契约 ----
const UI_SRC_DIR = path.join(import.meta.dirname, "../ui-src/src");
// 去掉注释再断言：解释性注释里会出现组件名、placeholder 这类词，
// 拿注释当证据等于自己骗自己。
const uiCode = (name) =>
  fs
    .readFileSync(path.join(UI_SRC_DIR, name), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*/gm, "");
const panelCss = ({ keepComments = false } = {}) => {
  const raw = fs.readFileSync(path.join(import.meta.dirname, "../ui/assets/panel.css"), "utf8");
  return keepComments ? raw : raw.replace(/\/\*[\s\S]*?\*\//g, "");
};

/** 取一条 CSS 规则的花括号内容（只取第一条，够用了）。 */
function ruleBody(css, selector) {
  const index = css.indexOf(`${selector} {`);
  if (index < 0) return null;
  const open = css.indexOf("{", index);
  const end = css.indexOf("}", open);
  return css.slice(open + 1, end);
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
    serverUrl: "http://127.0.0.1:8000/",
    apiKey: "k-123",
    peer: "mbp-hanako",
    fetchImpl,
  });

  const result = await client.health();
  eq(
    "health 返回顶层字段并能拿到版本 / health 走 GET、URL 正确、带上 key 与 actor peer，base 去掉尾部斜杠",
    [[result, result?.version], [calls[0].init.method, calls[0].url, calls[0].init.headers["X-API-Key"], calls[0].init.headers["X-OpenViking-Actor-Peer"], client.baseUrl]],
    [[
    { status: "ok", healthy: true, version: "v0.4.16" },
    "v0.4.16",
  ], ["GET", "http://127.0.0.1:8000/health", "k-123", "mbp-hanako", "http://127.0.0.1:8000"]],
  );
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
    "peer 为空白串时也不发身份头（其他头照旧）",
    ["X-OpenViking-Actor-Peer" in blank.calls[0].init.headers, blank.calls[0].init.headers["X-API-Key"]],
    [false, "k"],
  );
}

{
  const { calls, fetchImpl } = mockFetch();
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });

  await client.recall("昨天说的那件事", { peerScope: "self", maxTokens: 800 });
  const body = JSON.parse(calls[0].init.body);
  eq(
    "recall 请求（context 模式 / self 映射为 actor / max_tokens / 路径）",
    [body.mode, body.peer_scope, body.max_tokens, calls[0].url],
    ["context", "actor", 800, "http://h:1/api/v1/search/search"],
  );

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
  await client.recall("跨门牌", { peerScope: "all" });
  await client.recall("跨门牌", { peerScope: "all", excludeUris: ["", "  "] });
  eq(
    "空数组 / 未传 / 全空字符串都不带 exclude_uris",
    [1, 2, 3].map((index) => "exclude_uris" in JSON.parse(calls[index].init.body)),
    [false, false, false],
  );
}

{
  const { calls, fetchImpl } = mockFetch();
  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl });

  await client.findSkills("把 PDF 表格抽出来");
  const body = JSON.parse(calls[0].init.body);
  eq(
    "findSkills 路径与默认参数（limit 5 / 阈值 0.45）",
    [calls[0].url, body.limit, body.score_threshold],
    ["http://h:1/api/v1/skills/find", 5, 0.45],
  );

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
  check("错误封装会抛，且抛出里带 code", caught !== null && caught.includes("NOT_FOUND"), caught);
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
  eq(
    "listPeers 只留目录名 / listPeers 走 fs/ls（GET）",
    [await client.listPeers(), [calls[0].url, calls[0].init.method]],
    [["dsh-desktop", "hermes"], ["http://h:1/api/v1/fs/ls?uri=viking://user/default/peers&simple=true", "GET"]],
  );

  const empty = mockFetch({ body: { status: "ok", result: [] } });
  const emptyClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: empty.fetchImpl });
  const oddShape = mockFetch({ body: { status: "ok", result: { entries: [] } } });
  const oddClient = createClient({ serverUrl: "http://h:1", apiKey: "k", fetchImpl: oddShape.fetchImpl });
  eq("listPeers 空目录 / 形状不认识都给空数组",
    [await emptyClient.listPeers(), await oddClient.listPeers()], [[], []]);
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
  const memoryCount = await client.listPeerMemories("hermes");
  eq("listPeerMemories：只数 md（4 条）、没到上限 capped=false", [memoryCount.count, memoryCount.capped], [4, false]);
  check(
    "listPeerMemories 走 fs/tree，且带 node_limit 500",
    calls[0].url.startsWith("http://h:1/api/v1/fs/tree?") &&
      new URL(calls[0].url).searchParams.get("node_limit") === "500",
    calls[0].url,
  );

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
    serverUrl: "http://127.0.0.1:8000/",
    apiKey: "secret-key",
    peer: "mbp-hanako",
    timeoutMs: 1800,
    send: transport.sendJson,
  });

  const result = await client.recall("昨天说的那件事", { peerScope: "self", maxTokens: 800 });
  eq(
    "运行时路径拿到 result / 只经 runtime.fetch 发一次：POST /fetch、runtimeId 与 token 到位、请求体是 JSON 字符串",
    [result, [
      calls.length,
      [calls[0].runtimeId, calls[0].path, calls[0].init.method],
      calls[0].init.headers["x-ov-token"],
      typeof calls[0].init.body,
    ]],
    [{ rendered: "一条记忆" }, [1, ["rt-7", "/fetch", "POST"], "tk-test", "string"]],
  );

  const envelope = JSON.parse(calls[0].init.body);
  eq(
    "信封内容（url / method / API Key / actor peer / body 仍是字符串且 self→actor / 超时 / maxBytes）",
    [
      envelope.url,
      envelope.method,
      envelope.headers["X-API-Key"],
      envelope.headers["X-OpenViking-Actor-Peer"],
      [typeof envelope.body, JSON.parse(envelope.body).peer_scope],
      envelope.timeoutMs,
      envelope.maxBytes,
    ],
    [
      "http://127.0.0.1:8000/api/v1/search/search",
      "POST",
      "secret-key",
      "mbp-hanako",
      ["string", "actor"],
      1800,
      2_097_152,
    ],
  );
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
  check(
    "非 2xx：只发一次、抛错、错误体的 code 与 message 都透出来",
    calls.length === 1 && caught !== null && caught.includes("NOT_FOUND") && caught.includes("no such skill"),
    caught,
  );
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
  eq("代理 403 抛 TransportError 且带 code", [caught?.name, caught?.code], ["TransportError", "BAD_REQUEST"]);
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
  eq(
    "没有运行时回落到 direct / direct 带 fetchImpl",
    [fallback.mode, typeof fallback.fetchImpl],
    ["direct", "function"],
  );

  const client = createClient({ serverUrl: "http://h:1", apiKey: "k", ...fallback });
  eq(
    "direct 路径仍能拿到 health / direct 路径走的是原 fetch",
    [(await client.health())?.version, calls.length],
    ["v0.4.16", 1],
  );

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
  eq("没有运行时时 /status 报 direct，reach 仍是 idle",
    [direct.body.transport, direct.body.reach], ["direct", "idle"]);

  setRuntimeTransport({ send: async () => ({ status: 200, ok: true, data: {} }), token: "tk-test", runtimeId: "rt-9" });
  const viaRuntime = await invoke();
  eq("运行时就绪时 /status 报 runtime", viaRuntime.body.transport, "runtime");

  resetRuntimeTransport();
  const down = await invoke();
  eq("没有 ctx.network 时是 down", transportFor({}).mode, "down");
  check("降级后 direct 仍可用", down.body.transport === "direct");

  // ---- peer 与 peerSource：拿不到就用 null，不拿别的会话顶上 ----
  const noSession = await invoke();
  eq("无会话时 peer 为 null、来源是 unbound",
    [noSession.body.peer, noSession.body.peerSource], [null, "unbound"]);

  patchSession(dir, SESSION_KEY, { agentDir: "agent-z" });
  const withSession = await invoke({ session: SESSION_KEY });
  eq("?session= 时 peer 跟着会话走，来源是 session",
    [withSession.body.peer, withSession.body.peerSource], ["openhanako-agent-z", "session"]);

  const unknown = await invoke({ session: MISSING_KEY });
  eq("未记过身份的会话给 null，也不借用别会话",
    [unknown.body.peer, unknown.body.peerSource], [null, "unbound"]);

  // ---- 会话 key 统一：路径能定位到会话，sess_… 稳定 id 只看作"没带会话" ----
  const byPath = await invoke({
    session: `/Users/u/.hanako/agents/agent-z/sessions/2026-10-20T08-09-15-730Z_${SESSION_KEY}.jsonl`,
  });
  eq("?session= 接受会话路径，来源是 session",
    [byPath.body.peer, byPath.body.peerSource], ["openhanako-agent-z", "session"]);

  const stableId = await invoke({ session: "sess_0mvgejpps_97df7c693a452f408c2c" });
  eq(
    "sess_ 形式的会话给 null / sess_ 形式的会话来源是 unbound / sess_ 形式不造状态文件",
    [stableId.body.peer, stableId.body.peerSource, fs.existsSync(path.join(dir, "sessions", "sess_0mvgejpps_97df7c693a452f408c2c.json"))],
    [null, "unbound", false],
  );

  // 合并时 /status 也能看到“其实是哪个助手”。
  registerStatusRoutes(app, {
    ...ctx,
    config: { get: async (key) => ({ mergeMemory: true })[key] },
  });
  const mergedStatus = await invoke({ session: SESSION_KEY });
  eq("合并时 /status 的来源是 merged，并带出助手名",
    [mergedStatus.body.peerSource, mergedStatus.body.peerAgentDir], ["merged", "agent-z"]);

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
  eq(
    "/ready 字符串形态读成 status / not_configured 原样保留（不归成坏） / 对象形态的 status 读得对 / 对象形态保留 details 且递归归一化 / 没写 status 的对象算 unknown / checks 条数一条不少 / /ready 其余字段原样保留 / ready 仍挂在 report 上",
    [checks.find((c) => c.name === "vectordb"), checks.find((c) => c.name === "ollama"), checks.find((c) => c.name === "agfs")?.status, checks.find((c) => c.name === "agfs")?.details, checks.find((c) => c.name === "weird"), checks.length, status.body.ready.status, status.body.reach],
    [{
    name: "vectordb",
    status: "ok",
  }, {
    name: "ollama",
    status: "not_configured",
  }, "ok", [
    { name: "storage", status: "ok" },
    { name: "index", status: "down" },
  ], {
    name: "weird",
    status: "unknown",
  }, 6, "ok", "ok"],
  );

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
  eq(
    "工具与 /status 的 ready.checks 形状一致 / 工具也走同一个归一化（不交服务端原始 map） / agfs 的 details 在工具里也是归一化后的数组",
    [toolReport.ready.checks, Array.isArray(toolReport.ready.checks), toolReport.ready.checks.find((c) => c.name === "agfs")?.details],
    [checks, true, [
      { name: "storage", status: "ok" },
      { name: "index", status: "down" },
    ]],
  );
  // 归一化本身：details 与父项同形状，未知值不静默消失。
  eq(
    "normalizeChecks 对付 undefined 给空数组 / normalizeReady 对非对象原样返回",
    [normalizeChecks(undefined), normalizeReady(null)],
    [[], null],
  );

  // ---- check 状态 -> 颜色档位：灰 = 不算坏，其余（含未知）都红 ----
  // 状态 → 颜色档位：灰 = 不算坏，其余（含未知 / 空）都红。一张表一次验完。
  eq(
    "check 状态 → 颜色档位（灰 = 不坏，其余含未知都红）",
    ["ok", "not_configured", "not_supported", "disabled", "error", "down", "failed", "who_knows", undefined, ""].map(
      (status) => uiStatusTone(status),
    ),
    ["ok", "muted", "muted", "muted", "bad", "bad", "bad", "bad", "bad", "bad"],
  );

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
  eq(
    "五项全好写 5/5 / 五项全好是绿档 / 五项全好没有问题项（全绿不列明细） / 五项全好计数 5/5",
    [green.text, green.tone, green.problems, [green.ok, green.total]],
    ["服务端就绪 5/5", "ok", [], [5, 5]],
  );

  // 只差 ollama：摘要只说比例，项名交给下面那份问题列表。
  const oneMissing = allOk.map((check) =>
    check.name === "ollama" ? { ...check, status: "not_configured" } : check,
  );
  const lenient = uiSummarizeChecks(oneMissing);
  eq(
    "缺一项写 4/5，不把项名重复进摘要行 / 摘要行里不出现项名 / 只是没配是灰档不是红档 / 缺一项仍数出 4 / 待办项带名字与状态词",
    [lenient.text, lenient.text.includes("ollama"), lenient.tone, [lenient.ok, lenient.total], lenient.problems],
    ["服务端 4/5 就绪", false, "muted", [4, 5], [
    { name: "ollama", status: "not_configured", label: "未配置" },
  ]],
  );

  // 有 error：措辞用「异常」而不是蛇形枚举。
  const broken = allOk.map((check) =>
    check.name === "ollama" ? { ...check, status: "error" } : check,
  );
  const red = uiSummarizeChecks(broken);
  eq(
    "error 写进问题项而不是摘要行 / 有 error 是红档 / error 的项名为 ollama 且念「异常」",
    [red.text, red.tone, red.problems],
    ["服务端 4/5 就绪", "bad", [
    { name: "ollama", status: "error", label: "异常" },
  ]],
  );

  // 两项不对：两项都列，ok 项不出现。
  const twoBad = allOk.map((check) =>
    check.name === "vectordb"
      ? { ...check, status: "down" }
      : check.name === "ollama"
        ? { ...check, status: "not_configured" }
        : check,
  );
  const twoBadSummary = uiSummarizeChecks(twoBad);
  eq(
    "多项不对时摘要只报比例 / 只列不对的那两项，顺序跟服务端一致 / ok 项不进问题列表 / 问题列表条数 = 总数 − ok 数",
    [twoBadSummary.text, twoBadSummary.problems, twoBadSummary.problems.some((p) => p.status === "ok"), twoBadSummary.problems.length],
    ["服务端 3/5 就绪", [
    { name: "vectordb", status: "down", label: "异常" },
    { name: "ollama", status: "not_configured", label: "未配置" },
  ], false, twoBadSummary.total - twoBadSummary.ok],
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
  eq(
    "details 不参与分母 / details 里的 down 不改父项措辞 / details 里的 down 不进问题列表 / details 里的 down 不把档位拖红",
    [[nestedSummary.ok, nestedSummary.total], nestedSummary.text, nestedSummary.problems, nestedSummary.tone],
    [[2, 2], "服务端就绪 2/2", [], "ok"],
  );

  // 没读到检查项（未启用 / ready 挂了）：有话说，但不假装 0/0 是好消息。
  const empty = uiSummarizeChecks([]);
  eq(
    "空 checks 不写成 0/0 / 空 checks 没有问题项 / 非数组也当空处理",
    [empty.text, empty.problems, uiSummarizeChecks(undefined).text],
    ["服务端检查项未知", [], "服务端检查项未知"],
  );

  // 状态词映射：除了 ok，全念中文；认不出来的状态念「异常」。
  // 状态词：除了 ok，全念中文；认不出来的状态念「异常」。一张表一次验完。
  eq(
    "状态词（认不出来的念「异常」）",
    ["ok", "not_configured", "not_supported", "disabled", "error", "who_knows", undefined].map(
      (status) => uiCheckStatusLabel(status),
    ),
    ["就绪", "未配置", "不支持", "已禁用", "异常", "异常", "异常"],
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
  eq(
    "总闸关时不联网 / 总闸关时 ok 仍为 true / 总闸关时 peers 为空 / 总闸关时 reason 是 disabled / 总闸关时 HTTP 200",
    [calls, off.body.ok, off.body.peers, off.body.reason, off.status],
    [0, true, [], "disabled", 200],
  );

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
  eq(
    "正常时 ok / 正常时 HTTP 200",
    [listed.body.ok, listed.status],
    [true, 200],
  );
  // listedFetch 对任何 URL 都回同一份 peer 列表（字符串数组），
  // 树里没有 isDir === false 的 .md 节点，所以 count 是 0 条，不是 3 条。
  eq("GET /peers 的行投影（自己标 self、别人不标、excluded 与配置一致）",
    listed.body.peers,
    [
      { name: "desktop-openhanako-blueflower", self: true, excluded: false, count: 0, countCapped: false },
      { name: "hermes", self: false, excluded: true, count: 0, countCapped: false },
      { name: "dsh-desktop", self: false, excluded: false, count: 0, countCapped: false },
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
  // 七种非法项：一律 400 + ok:false + 中文错误 + 一个字节都不写。
  // 每种两条（契约与副作用分开），不再拆成四条。
  for (const [label, payload] of invalidCases) {
    const before = writes.length;
    const bad = await invokePost(payload);
    eq(`POST 非法项（${label}）被拒`, [bad.status, bad.body.ok], [400, false]);
    check(`POST 非法项（${label}）给中文错误且不写配置`,
      /[\u4e00-\u9fa5]/.test(bad.body.error || "") && writes.length === before,
      `${bad.body.error} / writes=${writes.length - before}`);
  }

  // ---- POST 合法：写入逗号串，返回实际存下的名单（不读中枢） ----
  const saved = await invokePost({ excluded: ["hermes", "dsh-desktop"] });
  eq(
    "POST 合法项写入逗号串 / POST 返回 ok / POST 返回存下的名单",
    [writes.at(-1), saved.body.ok, saved.body.excluded],
    [["excludedPeers", "hermes,dsh-desktop"], true, ["hermes", "dsh-desktop"]],
  );
  check("POST 返回体不带 peers 数组", !("peers" in saved.body), JSON.stringify(saved.body));

  const cleared = await invokePost({ excluded: [] });
  eq(
    "空数组清空名单 / 清空后返回空名单",
    [writes.at(-1), cleared.body.excluded],
    [["excludedPeers", ""], []],
  );

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
  eq(
    "中枢不可达时 POST 仍成功（200 / ok / 写配置 / 回显存下的名单）",
    [downPost.status, downPost.body.ok, downWrites.at(-1), downPost.body.excluded],
    [200, true, ["excludedPeers", "Hermes"], ["Hermes"]],
  );
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
  eq("没有网络出口时 POST 仍成功并写配置",
    [noExitPost.body.ok, noExitWrites.at(-1)], [true, ["excludedPeers", "hermes"]]);

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
  const mixedGet = await invokeGet();
  eq(
    "大小写按中枢原样名匹配（POST 写入原样、回显原样、GET 认出 Hermes 而不认 hermes） / POST 重复项按大小写精确去重",
    [[mixed.status, caseWrites.at(-1), mixed.body.excluded, asList(mixedGet.body.peers).map((p) => p.excluded)], (await invokePost({ excluded: ["Hermes", "hermes", "Hermes"] })).body.excluded],
    [[200, ["excludedPeers", "Hermes"], ["Hermes"], [true, false]], ["Hermes", "hermes"]],
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
  eq("空前缀按 openhanako- 认本机", asList(noPrefix.body.peers)[0]?.self, true);

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
  check(
    "传输失败不抛：HTTP 200 + ok:false + 错误原文",
    threw === null && failed.status === 200 && failed.body.ok === false &&
      asText(failed.body.error).includes("ETIMEDOUT"),
    `${threw} / ${failed.status} / ${failed.body.error}`,
  );

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
  eq(
    "count 只数 .md 文件（3 目录 + 4 md + 1 txt → 4 / 0），没到上限 catalogCapped 为 false / count 读的是各 peer 的 memories 树",
    [[asList(counted.body.peers).map((p) => p.count), asList(counted.body.peers).map((p) => p.countCapped)], seen.filter((uri) => uri.endsWith("/memories")).sort()],
    [[[4, 0], [false, false]], memoriesUris],
  );
  const treeUrl = new URL(seenUrls.find((url) => url.includes("/api/v1/fs/tree")));
  eq(
    "count 走 fs/tree（agent 输出 / level_limit 5 / node_limit 500）",
    [treeUrl.pathname, treeUrl.searchParams.get("output"), treeUrl.searchParams.get("level_limit"), treeUrl.searchParams.get("node_limit")],
    ["/api/v1/fs/tree", "agent", "5", "500"],
  );

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
  eq(
    "6 个类别目录的树 count 是 5（只数 .md） / 6 个类别目录的树 countCapped 为 false",
    [asList(baseline.body.peers)[0]?.count, asList(baseline.body.peers)[0]?.countCapped],
    [5, false],
  );

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
  eq(
    "节点数恰好到 node_limit 时 countCapped 为 true / 没到上限的 peer 仍为 false",
    [asList(capped.body.peers)[0]?.countCapped, asList(capped.body.peers)[1]?.countCapped],
    [true, false],
  );

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
  eq(
    "单个读失败不拖垮整单：好的照常给数字、坏的给 null、capped 都是 false",
    [partly.body.ok, asList(partly.body.peers).map((p) => p.count), asList(partly.body.peers).map((p) => p.countCapped)],
    [true, [1, null], [false, false]],
  );

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
  eq(
    "树形状不认识时 count 是 null（不猜成 0） / 树形状不认识时整单仍 ok",
    [asList(odd.body.peers).length > 0 ? odd.body.peers[0].count : "peers 缺失", odd.body.ok],
    [null, true],
  );

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
  eq("两个 peer 的记忆是并行读的", asList(parallel.body.peers).map((peer) => peer.count), [1, 1]);

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
  eq(
    "整体超时：count 全 null、capped 全 false、整单仍 ok",
    [asList(timedOut.body.peers).map((peer) => peer.count), asList(timedOut.body.peers).map((p) => p.countCapped), timedOut.body.ok],
    [[null, null], [false, false], true],
  );

  resetRuntimeTransport();
}

{
  // ---- 服务端参数与信封校验（纯函数） ----
  eq(
    "缺省端口 / argv 里的端口 / argv 里的 token",
    [parseArgs([]).port, parseArgs(["--port=5000"]).port, parseArgs(["--token=abc"]).token],
    [47821, 5000, "abc"],
  );

  const ok = normalizeEnvelope({
    url: "http://127.0.0.1:8000/health",
    method: "get",
    headers: { Host: "evil", "X-API-Key": "k", "Content-Length": "9" },
    timeoutMs: 999999,
  });
  eq(
    "协议保留 / method 转大写 / 逐跳头被剥掉 / Content-Length 被剥掉 / 自定义头保留 / 超时上限 30000 / maxBytes 缺省 / 缺省 method",
    [ok.url.protocol, ok.method, ok.headers.host, ok.headers["content-length"], ok.headers["x-api-key"], ok.timeoutMs, ok.maxBytes, normalizeEnvelope({ url: "https://h/x" }).method],
    ["http:", "GET", undefined, undefined, "k", 30000, 2_097_152, "GET"],
  );

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
  eq(
    "从会话路径取 agentDir / Windows 反斜杠路径也认 / 无前缀 / 有前缀 / 合并记忆 / 未绑定时不冒充产品名 / 有前缀但不知助手也不冒充 / composePeer 空 agentDir 返回 null",
    [agentDirFromSessionPath(p), agentDirFromSessionPath("C:\\Users\\u\\.hanako\\agents\\agent-w\\sessions\\a.jsonl"), resolvePeer({ peerPrefix: "" }, p), resolvePeer({ peerPrefix: "mbp" }, p), resolvePeer({ peerPrefix: "mbp", mergeMemory: true }, p), resolvePeer({}, null), resolvePeer({ peerPrefix: "mbp" }, null), composePeer({}, "")],
    ["agent-muewpt9i", "agent-w", "openhanako-agent-muewpt9i", "mbp-openhanako-agent-muewpt9i", "mbp-openhanako-merged", null, null, null],
  );
  check(
    "合并永远不等于未绑定",
    resolvePeer({ mergeMemory: true }, null) !== composePeer({ peerPrefix: "" }, ""),
  );
  eq(
    "未绑定不是产品名 / 不同助手不撞名 / 归一化后为空的 agentDir 也算未绑定",
    [resolvePeer({ mergeMemory: false }, null) === "openhanako", composePeer({}, "blueflower") !== composePeer({}, "hanako"), composePeer({}, "主力机")],
    [false, true, null],
  );

  // ---- 路径片段校验：不是单一目录名就当场拒绝 ----
  eq(
    "不是单一目录名就当未绑定（. / .. / 空段 / 没有 agents+sessions 结构）",
    [
      "/a/agents/./sessions/x.jsonl",
      "/a/agents/../sessions/x.jsonl",
      "/a/agents//sessions/x.jsonl",
      "/a/agents/x/other/x.jsonl",
    ].map((path) => agentDirFromSessionPath(path)),
    ["", "", "", ""],
  );

  // ---- 子会话：.../agents/<dir>/subagent-sessions/direct/<file>.jsonl ----
  const sub = "/home/u/.hanako/agents/blueflower/subagent-sessions/direct/a.jsonl";
  eq(
    "子会话的路径形态（正斜杠 / 反斜杠都认，目录名是 .. 仍然拒绝，根后没内容也拒绝）",
    [
      agentDirFromSessionPath(sub),
      agentDirFromSessionPath("C:\\Users\\u\\.hanako\\agents\\blueflower\\subagent-sessions\\direct\\a.jsonl"),
      agentDirFromSessionPath("/a/agents/../subagent-sessions/direct/x.jsonl"),
      agentDirFromSessionPath("/a/agents/x/sessions/"),
      resolvePeer({}, sub),
    ],
    ["blueflower", "blueflower", "", "", "openhanako-blueflower"],
  );

  // ---- 门牌前缀归一化：非法字符不能进 HTTP 头 ----
  eq(
    "门牌前缀归一化（非法字符归一到空 / 空格与大小写 / 去尾部连字符） / 非法前缀不会拼出非法头值",
    [[normalizePrefix("主力机"), normalizePrefix(" My MBP "), normalizePrefix("mbp-")], composePeer({ peerPrefix: "主力机" }, "blueflower")],
    [["", "my-mbp", "mbp"], "openhanako-blueflower"],
  );

  // ---- peerAgentDir：合并把“是哪个助手”盖住了，得能单独看到 ----
  eq("绑定时也带归一化后的助手名", describePeer({}, "agent-z").peerAgentDir, "agent-z");
  const mergedDescribed = describePeer({ mergeMemory: true }, "BlueFlower");
  eq(
    "合并时来源仍是 merged / 合并时仍能看到是哪个助手",
    [mergedDescribed.peerSource, mergedDescribed.peerAgentDir],
    ["merged", "blueflower"],
  );
  const noAgentDescribed = describePeer({ mergeMemory: true }, "");
  check(
    "没有助手名时干脆不给这个键",
    Object.prototype.hasOwnProperty.call(noAgentDescribed, "peerAgentDir") === false,
    JSON.stringify(noAgentDescribed),
  );

  // ---- peerSource：三种形态必须可区分 ----
  eq(
    "三种来源必须可区分（session / merged / unbound），未绑定时 peer 为 null",
    [
      peerForSession({}, "ps-none", p).peerSource,
      peerForSession({ mergeMemory: true }, "ps-none", p).peerSource,
      peerForSession({}, "ps-none", null).peerSource,
      peerForSession({}, "ps-none", null).peer,
      peerForSession({ mergeMemory: true }, "ps-none", null).peer,
    ],
    ["session", "merged", "unbound", null, "openhanako-merged"],
  );

  // ---- active peer 按会话存：不写空值，sessionPath 缺失不写 ----
  eq(
    "没 peer 时不写 / 没 peer 时读不到",
    [noteActivePeer("act-a", null), readActivePeer("act-a")],
    [null, null],
  );
  noteActivePeer("act-a", "openhanako-blueflower");
  eq(
    "按会话读回 / 不会串到别的会话",
    [readActivePeer("act-a"), readActivePeer("act-b")],
    ["openhanako-blueflower", null],
  );
  peerForSession({ mergeMemory: true }, "act-c", null);
  eq("sessionPath 缺失时不记 active peer", readActivePeer("act-c"), null);
}

// ================= settings =================
{
  // 读取侧归一：默认值、合法值、非法值回退都走同一张表，一条一行。
  const conn = await readConnection(sdkWith({}));
  const trimmed = await readConnection(sdkWith({ serverUrl: "http://x:9///" }));
  const swEnabled = await readSwitches(sdkWith({ enabled: true }));
  eq(
    "连接三项与开关的默认值；配置里的尾斜杠去掉",
    [
      [conn.serverUrl, conn.timeoutMs, conn.injectBudgetTokens],
      [swEnabled.enabled, swEnabled.readOnly],
      trimmed.serverUrl,
    ],
    [[DEFAULTS.serverUrl, 1500, 2500], [true, false], "http://x:9"],
  );

  // ---- 排除名单：逗号切、trim、去空、按大小写精确去重、非法条目整条丢、最多 50 ----
  eq(
    "排除名单解析（trim / 去空 / 大小写精确去重 / 非法条目丢弃 / 缺省空 / 最多 50）",
    [
      await readExcludedPeers(sdkWith({ excludedPeers: " hermes , DSH-desktop ,, hermes " })),
      parseExcludedPeers("hermes,Hermes"),
      await readExcludedPeers(sdkWith({})),
      parseExcludedPeers("hermes,../etc,bad name,ok_peer,.hidden"),
      parseExcludedPeers(Array.from({ length: 60 }, (_, i) => `p${i}`).join(",")).length,
    ],
    [["hermes", "DSH-desktop"], ["hermes", "Hermes"], [], ["hermes", "ok_peer", ".hidden"], 50],
  );

  // ---- 召回前两层：默认值 / 合法值 / 非法值回退 ----
  const layerDefault = await readSwitches(sdkWith({}));
  const layerSet = await readSwitches(sdkWith({ recallGate: "rules", queryMode: "context" }));
  eq(
    "召回前两层：默认 off/last，合法值照读，枚举外 / null / 数字 / 大小写不符一律回默认",
    [
      [DEFAULTS.recallGate, DEFAULTS.queryMode],
      [layerDefault.recallGate, layerDefault.queryMode],
      [layerSet.recallGate, layerSet.queryMode],
      [
        normalizeRecallGate("on"),
        normalizeQueryMode("all"),
        normalizeRecallGate(null),
        normalizeQueryMode(1),
        normalizeRecallGate("RULES"),
      ],
    ],
    [["off", "last"], ["off", "last"], ["rules", "context"], ["off", "last", "off", "last", "off"]],
  );

  // ---- 模型标识：只认 provider/model；空串 = 用宿主辅助模型 ----
  eq(
    "模型标识归一化（provider/model 原样保留，其余回空 = 默认通道；重排同形） / 提示词归一：非字符串给空串、超长按字符截断（判断 / 重排同一口径，默认都是空 = 用内置模板）",
    [[
      normalizeGateModel("   "),
      normalizeGateModel(" deepseek/deepseek-flash "),
      normalizeGateModel("/flash"),
      normalizeGateModel("deepseek/"),
      normalizeGateModel("deepseek-flash"),
      normalizeGateModel({ provider: "p" }),
      normalizeGateModel("deep seek/flash"),
      normalizeRerankModel(" p1/m1 "),
      normalizeRerankModel("m1"),
    ], [
      [normalizeGatePrompt(1), Array.from(normalizeGatePrompt("字".repeat(GATE_PROMPT_MAX + 50))).length],
      [normalizeRerankPrompt(1), Array.from(normalizeRerankPrompt("字".repeat(RERANK_PROMPT_MAX + 50))).length],
      [DEFAULTS.gatePrompt, DEFAULTS.rerankPrompt],
    ]],
    [["", "deepseek/deepseek-flash", "", "", "", "", "", "p1/m1", ""], [["", GATE_PROMPT_MAX], ["", RERANK_PROMPT_MAX], ["", ""]]],
  );

  // readSwitches 是唯一读入口：过一遍它也得同样的收敛。
  const gateSet = await readSwitches(
    sdkWith({
      recallGate: "llm",
      gatePrompt: "提".repeat(GATE_PROMPT_MAX + 5),
      gateModel: "  deepseek/deepseek-flash  ",
    }),
  );
  const rerankSet = await readSwitches(
    sdkWith({
      rerank: "llm",
      rerankPrompt: "提".repeat(RERANK_PROMPT_MAX + 5),
      rerankModel: "  deepseek/deepseek-flash  ",
    }),
  );
  eq(
    "readSwitches 读到 llm 档、截断提示词、收敛模型标识（判断与重排各一遍，存量脏值回空） / 结果重排：默认 off、枚举只有 off / llm，非法值（枚举外 / 数字 / 大小写）回 off",
    [[
      [gateSet.recallGate, Array.from(gateSet.gatePrompt).length, gateSet.gateModel],
      [rerankSet.rerank, Array.from(rerankSet.rerankPrompt).length, rerankSet.rerankModel],
      (await readSwitches(sdkWith({ gateModel: "bogus-shape" }))).gateModel,
      (await readSwitches(sdkWith({ rerankModel: "bogus-shape" }))).rerankModel,
    ], [
      DEFAULTS.rerank,
      RERANK_MODES,
      [
        (await readSwitches(sdkWith({}))).rerank,
        (await readSwitches(sdkWith({ rerank: "llm" }))).rerank,
        normalizeRerank("rules"),
        normalizeRerank(1),
        normalizeRerank("LLM"),
      ],
    ]],
    [[
      ["llm", GATE_PROMPT_MAX, "deepseek/deepseek-flash"],
      ["llm", RERANK_PROMPT_MAX, "deepseek/deepseek-flash"],
      "",
      "",
    ], ["off", ["off", "llm"], ["off", "llm", "off", "off", "off"]]],
  );

  // ---- 精排通道：合法 / 非法 JSON / 字段不全 / 超过 8 路 ----
  eq(
    "通道缺省：默认空串，读出来是空数组",
    [DEFAULTS.rerankChannels, (await readSwitches(sdkWith({}))).rerankChannels],
    ["", []],
  );

  const channelWarnings = [];
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
    (message) => channelWarnings.push(message),
  );
  eq(
    "合法通道三项都保留：URL 去尾斜杠、weight 缺省 1、enabled 缺省 true、model 类型允许空模型、不记 warn",
    [
      parsedChannels.length,
      parsedChannels[0].url,
      parsedChannels[1].weight,
      parsedChannels[1].enabled,
      parsedChannels[2].model,
      channelWarnings,
    ],
    [3, "http://127.0.0.1:8080", 1, true, "", []],
  );

  const badJsonWarnings = [];
  eq(
    "坏 JSON / 不是数组 / 空串都回空数组，坏 JSON 记一条 warn",
    [
      parseRerankChannels("{oops", (message) => badJsonWarnings.push(message)),
      badJsonWarnings.length,
      parseRerankChannels('{"type":"model"}'),
      parseRerankChannels("   "),
    ],
    [[], 1, [], []],
  );

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
  eq(
    "通道字段不全：类型不认识 / 形状不对的整项丢弃（每项一条 warn），只写类型的通道留下走服务配置",
    [
      [incomplete.length, incompleteWarnings.length],
      [incomplete[0].type, incomplete[0].model],
      [incomplete[1].type, incomplete[1].url, incomplete[1].model],
    ],
    [[2, 3], ["rerank", "m"], ["rerank", "http://h", ""]],
  );

  const many = Array.from({ length: 10 }, (_, index) => ({
    type: "model",
    model: "",
    name: `c${index}`,
  }));
  const cappedWarnings = [];
  eq(
    "超过 8 路只留前 8 路，且记一条 warn",
    [
      parseRerankChannels(JSON.stringify(many), (message) => cappedWarnings.push(message)).length,
      parseRerankChannels(JSON.stringify(many))[7].name,
      cappedWarnings.length,
      RERANK_CHANNELS_MAX,
    ],
    [8, "c7", 1, 8],
  );

  eq(
    "单项解析：通道类型只有三种；URL 必须合法、权重与 timeoutMs 越界整项回 null，合法的 timeoutMs 留着 / 写回前重新校验并收敛形状（缺字段补默认，坏项丢掉）",
    [[
      RERANK_CHANNEL_TYPES,
      parseRerankChannel({ type: "rerank", model: "m" }),
      parseRerankChannel({ type: "rerank", url: "ftp://h", model: "m" }),
      parseRerankChannel({ type: "model", weight: 11 }),
      parseRerankChannel({ type: "model", timeoutMs: 0 }),
      parseRerankChannel({ type: "model", timeoutMs: 120 }).timeoutMs,
    ], serializeRerankChannels([{ type: "model", model: "" }, { type: "rerank" }, { type: "bogus" }])],
    [[
      ["rerank", "systemone", "model"],
      { type: "rerank", name: "", url: "", model: "m", weight: 1, enabled: true },
      null,
      null,
      null,
      120,
    ], JSON.stringify([
      { type: "model", name: "", url: "", model: "", weight: 1, enabled: true },
      { type: "rerank", name: "", url: "", model: "", weight: 1, enabled: true },
    ])],
  );

  // ---- 打分服务：四个配置项的归一化 ----
  eq(
    "打分服务字段默认都是空；未配置时读出来也是空 / 服务 URL：http/https 都收、去空白去尾斜杠；非 http(s) / 缺协议 / 空 / 非字符串当未配置 / 服务模型：去空白、允许为空、非字符串给空串、超长截断 / readSwitches 读服务：合法地址去尾斜杠、非法地址收敛成空",
    [[
      [DEFAULTS.rerankServiceUrl, DEFAULTS.systemoneServiceModel, DEFAULTS.rerankServiceKey, DEFAULTS.systemoneServiceKey],
      await readSwitches(sdkWith({})).then((item) => [
        item.rerankServiceUrl,
        item.rerankServiceModel,
        item.systemoneServiceUrl,
        item.systemoneServiceModel,
      ]),
    ], [
      normalizeServiceUrl("http://127.0.0.1:8098"),
      normalizeServiceUrl("https://rerank.test"),
      normalizeServiceUrl("  http://h:1  "),
      normalizeServiceUrl("http://h:1///"),
      normalizeServiceUrl("ftp://h"),
      normalizeServiceUrl("127.0.0.1:8098"),
      normalizeServiceUrl("   "),
      normalizeServiceUrl(8098),
    ], [
      normalizeServiceModel("  bge-reranker-v2-m3  "),
      normalizeServiceModel("   "),
      normalizeServiceModel(1),
      Array.from(normalizeServiceModel("m".repeat(SERVICE_MODEL_MAX + 20))).length,
    ], await readSwitches(
      sdkWith({
        rerankServiceUrl: "http://127.0.0.1:8098/",
        rerankServiceModel: "  bge-reranker-v2-m3  ",
        systemoneServiceUrl: "ftp://nope",
        systemoneServiceModel: "  kev-4b  ",
      }),
    ).then((item) => [
      item.rerankServiceUrl,
      item.rerankServiceModel,
      item.systemoneServiceUrl,
      item.systemoneServiceModel,
    ])],
    [[["", "", "", ""], ["", "", "", ""]], ["http://127.0.0.1:8098", "https://rerank.test", "http://h:1", "http://h:1", "", "", "", ""], ["bge-reranker-v2-m3", "", "", SERVICE_MODEL_MAX], ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "", "kev-4b"]],
  );

  // ---- 打分服务密钥：可选、去空白、换行当没配、超长截断 ----
  eq(
    "密钥归一化：去空白 / 留空合法 / 非字符串给空 / 带换行整条丢弃 / 超长截断到 512（前后端同值）",
    [
      normalizeServiceKey("  sk-test-1234  "),
      normalizeServiceKey("   "),
      normalizeServiceKey(1234),
      normalizeServiceKey("sk-abc\ndef"),
      normalizeServiceKey("sk-abc\rdef"),
      Array.from(normalizeServiceKey("k".repeat(SERVICE_KEY_MAX + 40))).length,
      [SERVICE_KEY_MAX, UI_SERVICE_KEY_MAX],
    ],
    ["sk-test-1234", "", "", "", "", 512, [512, 512]],
  );

  // ---- 掩码：长 key / 短 key / 空，一份实现（conn 与 recall-mode 共用） ----
  eq(
    "掩码规则（长 key 前 4 + 8 圆点 + 后 4、短 key 只给后 4、空 / null 给空串）且不含明文",
    [
      maskOf("sk-abcdef1234567890"),
      maskOf("sk-abc123"),
      maskOf("abcdefghijkl"),
      maskOf(""),
      maskOf(null),
      maskString("sk-abcdef1234567890"),
      maskString("sk-abc123"),
      maskString(""),
      maskString("sk-abcdef1234567890").includes("abcdef") ||
        maskString("sk-abcdef1234567890").includes("123456"),
      UI_SERVICE_KEY_MASK_DOTS,
    ],
    [
      { head: "sk-a", tail: "7890" },
      { head: "", tail: "c123" },
      { head: "abcd", tail: "ijkl" },
      { head: "", tail: "" },
      { head: "", tail: "" },
      "sk-a••••••••7890",
      "••••••••c123",
      "",
      false,
      8,
    ],
  );

  // ---- 打分服务超时：空 / 非数字 / 越界一律回默认值，不留非法值 ----
  eq(
    "两组服务的默认超时与可填区间 / 超时归一（合法值照收并向下取整，空 / 非数字 / 越界 / 不认识的类型一律当没配） / 没配超时用默认值，配了用自己的；写回合法值存数字串、非法值存空串；DEFAULTS 两个超时默认空 / readSwitches 读超时：合法的给数字，越界的当没配（运行时靠 null 区分「没配」与「配了默认值」） / 没配超时时两项都是 null",
    [[
      SERVICE_TIMEOUT_LIMITS.rerank.fallback,
      SERVICE_TIMEOUT_LIMITS.systemone.fallback,
      [SERVICE_TIMEOUT_LIMITS.rerank.min, SERVICE_TIMEOUT_LIMITS.rerank.max],
      [SERVICE_TIMEOUT_LIMITS.systemone.min, SERVICE_TIMEOUT_LIMITS.systemone.max],
    ], [
      normalizeServiceTimeout(" 1200 ", "rerank"),
      normalizeServiceTimeout(1200, "rerank"),
      normalizeServiceTimeout("1200.9", "rerank"),
      normalizeServiceTimeout("   ", "rerank"),
      normalizeServiceTimeout("abc", "rerank"),
      normalizeServiceTimeout(99, "rerank"),
      normalizeServiceTimeout(10001, "rerank"),
      normalizeServiceTimeout(8000, "systemone"),
      normalizeServiceTimeout(8001, "systemone"),
      normalizeServiceTimeout("99999", "nope"),
    ], [
      [serviceTimeoutOrDefault("", "rerank"), serviceTimeoutOrDefault(null, "systemone")],
      [serviceTimeoutOrDefault("1200", "rerank"), serviceTimeoutOrDefault(8000, "systemone")],
      [serializeServiceTimeout("1200", "rerank"), serializeServiceTimeout("99999", "rerank"), serializeServiceTimeout("abc", "systemone")],
      [DEFAULTS.rerankServiceTimeoutMs, DEFAULTS.systemoneServiceTimeoutMs],
    ], await readSwitches(
      sdkWith({ rerankServiceTimeoutMs: "1200", systemoneServiceTimeoutMs: "99999" }),
    ).then((item) => [item.rerankServiceTimeoutMs, item.systemoneServiceTimeoutMs]), await readSwitches(sdkWith({})).then((item) => [
      item.rerankServiceTimeoutMs,
      item.systemoneServiceTimeoutMs,
    ])],
    [[800, 3500, [100, 10000], [100, 8000]], [1200, 1200, 1200, null, null, null, null, 8000, null, null], [
      [800, 3500],
      [1200, 8000],
      ["1200", "", ""],
      ["", ""],
    ], [1200, null], [null, null]],
  );

  // ---- 地址与模型成对 ----
  eq(
    "地址与模型成对：齐全放行、只给一半各给一句理由、两个都空=都清空也放行、非法地址交给 URL 校验",
    [
      servicePairError("http://h:8098", "bge", "rerankServiceUrl", "rerankServiceModel"),
      servicePairError("http://h:8098", "", "rerankServiceUrl", "rerankServiceModel"),
      servicePairError("", "bge", "rerankServiceUrl", "rerankServiceModel"),
      servicePairError("", "", "systemoneServiceUrl", "systemoneServiceModel"),
      servicePairError("ftp://h", "", "rerankServiceUrl", "rerankServiceModel"),
    ],
    [
      null,
      "rerankServiceUrl 配了地址就要填模型名（rerankServiceModel）",
      "rerankServiceUrl 配了模型名就要填地址",
      null,
      null,
    ],
  );
}
// ================= 跨端一致：前端常量与后端契约同值 =================
{
  // 面板加载不了 App 的 Node 模块，常量只能各存一份。这一节只守「两份不许漂」：
  // 漂了就是用户按下保存、落库的却是另一个数。组件结构不在这里验。
  eq(
    "通道上限 / 三种类型的默认超时 / 决策超时上限与自适应两端同值 / 服务字段上限两端同值（模型 / 地址 / 密钥） / 通道类型三种都有下拉文案（类型枚举与文案键一一对应） / 两份默认提示词逐字一致（判断 / 重排） / 提示词截断上限两端同值",
    [[
      UI_RERANK_CHANNELS_MAX,
      UI_RERANK_CHANNEL_TIMEOUT_DEFAULTS,
      UI_SYSTEMONE_TIMEOUT_MAX,
      [UI_SYSTEMONE_TIMEOUT_BASE, UI_SYSTEMONE_TIMEOUT_STEP],
      UI_SYSTEMONE_MAX_CANDIDATES,
    ], [UI_SERVICE_MODEL_MAX, UI_SERVICE_URL_MAX, UI_SERVICE_KEY_MAX], [RERANK_CHANNEL_TYPES, Object.keys(RERANK_CHANNEL_LABELS)], [UI_DEFAULT_GATE_PROMPT, UI_DEFAULT_GATE_DECISION_PROMPT, UI_DEFAULT_RERANK_PROMPT], [GATE_PROMPT_MAX, RERANK_PROMPT_MAX]],
    [[
      RERANK_CHANNELS_MAX,
      {
        rerank: RERANK_CHANNEL_TIMEOUT_MS,
        systemone: SYSTEMONE_CHANNEL_TIMEOUT_MS,
        model: RERANK_MODEL_CHANNEL_TIMEOUT_MS,
      },
      SYSTEMONE_TIMEOUT_MAX_MS,
      [SYSTEMONE_CHANNEL_TIMEOUT_MS, SYSTEMONE_TIMEOUT_PER_CANDIDATE_MS],
      SYSTEMONE_MAX_CANDIDATES,
    ], [SERVICE_MODEL_MAX, RERANK_CHANNEL_URL_MAX, SERVICE_KEY_MAX], [["rerank", "systemone", "model"], ["rerank", "systemone", "model"]], [DEFAULT_GATE_PROMPT, DEFAULT_GATE_DECISION_PROMPT, DEFAULT_RERANK_PROMPT], [GATE_PROMPT_MAX, RERANK_PROMPT_MAX]],
  );

  // 决策那份默认题面就是那句完整问法：两个常量逐字一致，而且不是「空值兜底」的那份字。
  eq(
    "决策提示词默认值就是那句完整问法（前后端两份常量逐字一致，且不是 gatePrompt 的默认）",
    [
      DEFAULT_GATE_DECISION_PROMPT,
      UI_DEFAULT_GATE_DECISION_PROMPT,
      DEFAULT_GATE_DECISION_PROMPT === DEFAULT_GATE_PROMPT,
      DEFAULTS.gateDecisionPrompt,
      normalizeGateDecisionPrompt("字".repeat(GATE_PROMPT_MAX + 5)).length,
      uiNormalizeGateDecisionPrompt("字".repeat(GATE_PROMPT_MAX + 5)).length,
    ],
    [
      DECISION_PROMPT_TEXT,
      DECISION_PROMPT_TEXT,
      false,
      DECISION_PROMPT_TEXT,
      GATE_PROMPT_MAX,
      GATE_PROMPT_MAX,
    ],
  );

  // manifest 是配置的唯一声明面：密钥要标 sensitive，新增键不能只活在代码里。
  const props = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "../manifest.json"), "utf8"),
  ).contributes.settings.schema.properties;
  eq(
    "两个服务密钥在 manifest 里标了 sensitive（不当普通字符串存）",
    [props.rerankServiceKey?.sensitive, props.systemoneServiceKey?.sensitive],
    [true, true],
  );
  eq(
    "manifest 的四档 enumLabels 就是「关闭 / 规则判断 / 语言模型判断 / 决策模型判断」/ 决策题面有独立配置项且默认是那句完整问法",
    [
      props.recallGate?.enum,
      props.recallGate?.ui?.enumLabels,
      props.gateDecisionPrompt?.default,
      props.gateDecisionPrompt?.type,
    ],
    [
      ["off", "rules", "llm", "decision"],
      ["关闭", "规则判断", "语言模型判断", "决策模型判断"],
      DECISION_PROMPT_TEXT,
      "string",
    ],
  );
  check(
    "manifest 里每个 DEFAULTS 键都有声明（新增配置不能只活在代码里）",
    Object.keys(DEFAULTS).every((key) => props[key] !== undefined),
    Object.keys(DEFAULTS).filter((key) => props[key] === undefined).join(", "),
  );
}
// ================= 页签状态：记忆与键盘 =================
{
  // 标签栏只是壳。这里守的是「停在哪一页」这件事：唯一键、非法值回默认、
  // 左右成圈、Home / End、存储读抛错不崩，以及切页不产生副作用。
  check(
    "页签记忆键带 app 前缀，默认页是全局",
    TAB_KEY === "hanako-openviking:tab" && TAB_KEY.startsWith("hanako-openviking:") && DEFAULT_TAB === "global",
    TAB_KEY,
  );
  eq(
    "四个页名（顺序即标签顺序） / 非法页名一律回默认页（大小写 / 空格 / 近义词都不认） / 四个合法页名原样返回 / 键盘换页（左右成圈 / Home / End / 别的键不动） / 读上次停的页（读不到 / 非法值回默认页，合法值原样，第四页 logs 也能读回） / storage 读抛错不崩、回默认页",
    [TABS, [null, undefined, "", "nope", "Global", "MEMORY", " memory ", "log", "Logs", "LOGS"].map(normalizeTab), TABS.map((value) => normalizeTab(value)), [
      nextTab("logs", "ArrowRight"),
      nextTab("skill", "ArrowRight"),
      nextTab("logs", "ArrowLeft"),
      nextTab("global", "ArrowLeft"),
      nextTab("logs", "Home"),
      nextTab("global", "End"),
      nextTab("logs", "End"),
      nextTab("global", "Enter"),
    ], [
      null,
      { getItem: () => null },
      { getItem: () => "memory" },
      { getItem: () => "logs" },
      { getItem: () => "xx" },
    ].map((storage) => readTab(storage)), readTab({
      getItem: () => {
        throw new Error("denied");
      },
    })],
    [["global", "memory", "skill", "logs"], Array(10).fill("global"), TABS, ["global", "logs", "skill", "logs", "global", "logs", "logs", null], ["global", "global", "memory", "logs", "global"], "global"],
  );
  {
    const store = new Map();
    const fake = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };
    writeTab(fake, "skill");
    const firstWrite = [store.get(TAB_KEY), store.size, readTab(fake)];
    writeTab(fake, "logs");
    eq(
      "写页签只占一个键且能读回",
      [firstWrite, store.get(TAB_KEY), store.size, readTab(fake)],
      [["skill", 1, "skill"], "logs", 1, "logs"],
    );
  }
  eq(
    "存储写满时不崩（setItem 抛错吞掉，切页照旧）",
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

  // 可访问性契约（换实现也不该丢）：读屏靠 role / aria-selected / tabindex 认页签。
  const tabBar = uiCode("components/TabBar.vue");
  check(
    "页签的 a11y 契约：唯一 tablist / role=tab / 选中态与焦点跟 active / aria-controls 指到内容块",
    (tabBar.match(/role="tablist"/g) || []).length === 1 &&
      tabBar.includes(":aria-selected=\"props.active === tab ? 'true' : 'false'\"") &&
      tabBar.includes(":tabindex=\"props.active === tab ? 0 : -1\"") &&
      tabBar.includes(":aria-controls=\"`panel-${tab}`\""),
    tabBar.slice(0, 300),
  );
  check(
    "键盘换页的映射在 lib 里，组件只转发按键并让焦点跟着走",
    tabBar.includes("nextTab") &&
      tabBar.includes("event.key") &&
      tabBar.includes(".focus?.()") &&
      ["ArrowRight", "ArrowLeft", "Home", "End"].every((key) => tabBar.includes(key) === false),
    tabBar.slice(0, 240),
  );

  // 切页只是切显隐：不能顺手写回、重算或提交（打开一页必须零副作用）。
  const selectTabBody = uiCode("App.vue").match(/function selectTab\(name\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  check(
    "切页不触发重算或写入",
    selectTabBody !== "" &&
      ["refresh", "saveLayers", "applyLayers", "rerankChannels", "patchControls"].every(
        (name) => selectTabBody.includes(name) === false,
      ),
    selectTabBody,
  );
}
// ================= 一屏高度链（样式只留这一节） =================
{
  // 这四条是用户点名的契约（整页不自滚 / 内容区吃满 / 矮屏降级 / hidden 不占位），
  // 所以它们确实锁了挂载层与内容区的具体选择器（html,body / #panel-app / .page /
  // .tab-panel）和 640 这个断点字面量——这些选择器与阈值就是契约本身，不是审美。
  // 换实现时它们会红，那是对的：改这条高度链要人来确认。
  // 样式侧其余一切（间距 / 字号 / 列宽 / 组件选型）都不在这里，也不该进冒烟。
  const css = panelCss();
  const pageRule = ruleBody(css, ".page");
  const panelRule = ruleBody(css, ".tab-panel");
  const mediaIdx = css.indexOf("@media (max-height: 640px)");
  const mediaBody = mediaIdx < 0 ? "" : css.slice(mediaIdx, css.lastIndexOf("}"));

  check(
    "根容器不自滚：html/body 与挂载层都取宿主给的定高，整页把溢出裁在自身（不写视口单位）",
    /height\s*:\s*100%/.test(ruleBody(css, "html, body") || "") &&
      /height\s*:\s*100%/.test(ruleBody(css, "#panel-app") || "") &&
      /overflow\s*:\s*hidden/.test(pageRule || "") &&
      css.includes("100vh") === false,
    `${ruleBody(css, "html, body")} | ${ruleBody(css, "#panel-app")} | ${pageRule}`,
  );
  check(
    "内容区吃满剩余高度：.page 是纵向 flex 列，.tab-panel 可收缩（溢出的兜底滚动留在内容区，不回到整页）",
    /display\s*:\s*flex/.test(pageRule || "") &&
      /flex-direction\s*:\s*column/.test(pageRule || "") &&
      /flex\s*:\s*1 1 auto/.test(panelRule || "") &&
      /min-height\s*:\s*0/.test(panelRule || ""),
    `${pageRule} | ${panelRule}`,
  );
  check(
    "矮屏降级：矮于阈值时整页改成自然高度、由窗口滚（不再硬压一屏）",
    mediaIdx >= 0 &&
      /#panel-app\s*\{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody) &&
      /\.page \{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody) &&
      /overflow\s*:\s*visible/.test(mediaBody),
    mediaBody.slice(0, 240),
  );
  check(
    "隐藏页真的不占位：[hidden] 有 display:none 兜底（否则块级 display 会把它顶回来）",
    /display\s*:\s*none\s*!important/.test(ruleBody(css, ".page [hidden]") || ""),
    ruleBody(css, ".page [hidden]") || "(规则不存在)",
  );
}
// ================= ui: 面板视图投影（纯函数） =================
{
  // 这些是从已删除的手写面板里搬出来的字符串 / 档位逻辑（lib/panel-view.js）。
  // 组件不再各自拼一遍文案，所以它们必须能单独验。
  eq(
    "出口念法（受管代理 / 直连 / 其它一律不可用） / 版本号念法（带 v 原样、不带 v 补一个且不出现 vv、空就不编） / 圆点与 key 占位文案",
    [["runtime", "direct", "down"].map((mode) => transportTextOf(mode)), [versionTextOf("v0.4.16"), versionTextOf("0.4.16"), versionTextOf("")], [dotClassOf("ok"), dotClassOf("down"), dotClassOf("idle"), apiKeyPlaceholder(false), apiKeyPlaceholder(true)]],
    [["受管代理", "直连（仅白名单）", "不可用"], ["v0.4.16", "v0.4.16", ""], ["dot ok", "dot down", "dot idle", "未填写", "已填写（留空表示不改）"]],
  );

  const okStatus = {
    enabled: true,
    apiKeySet: true,
    serverUrl: "http://127.0.0.1:8000",
    reach: "ok",
    transport: "runtime",
    health: { version: "0.4.16" },
    ready: { checks: [{ name: "agfs", status: "ok" }] },
  };
  const view = statusView(okStatus, 42);
  eq(
    "已连接：药丸绿、副标题是「出口 · 版本 · 往返」、往返与版本单独成格、检查项从 ready.checks 取",
    [view.pillText, view.pillTone, view.subLine, view.latency, view.version, view.checks.length],
    ["已连接", "ok", "受管代理 · v0.4.16 · 42 ms", "42 ms", "v0.4.16", 1],
  );
  check("总闸开着时说明是「已开启」且不标红", view.masterHint === MASTER_HINT_ON && view.masterHintWarn === false);
  const offView = statusView({ ...okStatus, enabled: false }, 42);
  eq(
    "总闸关着：药丸未启用、说明换成关的那句并标红 / 三种未连接态（缺 key / 连不上 / 待命）与 reach 失败的错误行",
    [[offView.pillText, offView.masterHint, offView.masterHintWarn], [
      statusView({ ...okStatus, apiKeySet: false }, 5).pillText,
      (() => {
        const v = statusView({ ...okStatus, reach: "down" }, null);
        return [v.pillText, v.pillTone, v.latency];
      })(),
      statusView({ ...okStatus, reach: "idle" }, null).pillText,
      statusView({ ...okStatus, reach: "down", error: "ECONNREFUSED" }, 3).error,
    ]],
    [["未启用", MASTER_HINT_OFF, true], ["缺 API Key", ["连不上", "down", "—"], "待命", "ECONNREFUSED"]],
  );
  const readFailed = statusView(okStatus, 42, "网络不通");
  eq(
    "这一轮没读到：药丸说读取失败（不沿用已连接）、错误原文进 readError、不假装有检查项",
    [readFailed.pillText, readFailed.pillTone, readFailed.readError, readFailed.checks],
    ["读取失败", "down", "网络不通", []],
  );

  // ---- peer 行 ----
  eq(
    "peer 行的 meta 文案（本机 / 已排除 / 条数没读到念「—」不念 0 / 数到上限加 +） / peer 行能不能点（本机 / 没名字的不可点，外部可点；本机不进排除名单） / peer 行悬停说明（本机 / 已排除 / 参与中）",
    [[
      peerMetaText({ self: true, count: 3 }),
      peerMetaText({ name: "x", count: 4, excluded: true }),
      peerMetaText({ name: "x", count: null }),
      peerMetaText({ name: "x", count: 500, countCapped: true }),
    ], [
      peerExcluded({ self: true, excluded: true }),
      peerExcluded({ name: "x", excluded: true }),
      peerTappable({ name: "me", self: true }),
      peerTappable({ name: "x" }),
      peerTappable({}),
    ], [peerTitle({ self: true }), peerTitle({ name: "x", excluded: true }), peerTitle({ name: "x" })]],
    [["本机 · 3 条 · 参与召回", "外部 · 4 条 · 已排除", "外部 · — · 参与召回", "外部 · 500+ 条 · 参与召回"], [false, true, false, true, false], ["本机，不参与排除", "已排除，不参与召回，点击恢复", "点击排除，之后召回不再包含它的记忆"]],
  );

  // ---- 日志 ----
  eq(
    "日志计数条（按事件聚合并保序 / 没事件给一句暂无 / kind 当事件名） / 正文空时是（还没有记录） / 正文倒序（最新在上）且一行一条 JSON",
    [[
      logChips([{ event: "a" }, { event: "b" }, { event: "a" }]).map((c) => c.text),
      logChips([]),
      logChips([{ kind: "k" }])[0].text,
    ], logBodyText([]), logBodyText([{ a: 1 }, { a: 2 }]).split("\n")],
    [[["a × 2", "b × 1"], [{ text: "暂无事件", muted: true }], "k × 1"], LOG_EMPTY, ['{"a":2}', '{"a":1}']],
  );

  // ---- 通道测试结果排版 ----
  eq(
    "通道测试：合并与保留（全部成功）",
    formatChannelTest({
      candidates: 3,
      elapsedMs: 12,
      channels: [{ type: "model", ok: true, elapsedMs: 4, scores: [0.5, null], normalized: [1, 0], weight: 2 }],
      merged: [0.4, 0.1],
      kept: [0, 1],
    }).split("\n"),
    [
      "候选 3 条 · 1 路通道 · 12ms",
      "宿主模型 · ok 4ms · 原始 [0.50, —]",
      "宿主模型 · 标准化 [1.00, 0.00] × 权重 2",
      "合并：[0.40, 0.10]",
      "保留：#1, #2",
    ],
  );
  check(
    "通道测试：弃权与回退说明都写出来",
    formatChannelTest({
      candidates: 1,
      channels: [{ type: "rerank", name: "n", ok: false, abstained: true, error: "超时", pairNote: "已改用服务配置" }],
      fallback: true,
    }).includes("精排服务 n · 弃权 0ms · 超时"),
  );
  check(
    "通道测试：全部弃权时说原样保留",
    formatChannelTest({ channels: [], fallback: true }).includes("全部通道弃权，原样保留全部候选"),
  );

  // ---- 下拉补存量值 ----
  eq(
    "下拉补存量值（不在目录里就加一项、在目录里不重复加、空存量值不加） / 空工具函数：读不到时间就不编",
    [[
      withStoredOption([{ value: "", label: "默认" }], "p/m"),
      withStoredOption([{ value: "p/m", label: "x" }], "p/m").length,
      withStoredOption([{ value: "", label: "默认" }], "").length,
    ], readFootText(null)],
    [[[{ value: "", label: "默认" }, { value: "p/m", label: "p/m（不在目录里）" }], 1, 1], ""],
  );
}


// ================= ui: 面板状态机（假 fetch） =================
{
  // 这一块是新的：整页迁到 Vue 之后，「改了就提交 / 失败回滚 / 整单提交」这些
  // 语义都在 lib/panel-store.js 里，由 composables/useConfig.js 套上响应式。
  // 用假 fetch 真跑一遍状态机，比在源码里正则捞字符串靠谱。
  //
  // 注意：createConfig 会替换模块里的单例，后面别再拿旧的 store。
  const backend = {
    "/status": {
      enabled: true,
      apiKeySet: true,
      serverUrl: "http://127.0.0.1:8000",
      reach: "ok",
      transport: "runtime",
      health: { version: "0.4.16" },
      ready: {
        checks: [
          { name: "agfs", status: "ok" },
          { name: "ollama", status: "not_configured" },
        ],
      },
    },
    "/probe": {
      lines: [
        { event: "agent/before-start", at: "t1" },
        { event: "agent/before-start", at: "t2" },
        { event: "provider/before-request", at: "t3" },
      ],
    },
    "/controls": {
      enabled: true,
      probe: true,
      skillRouting: false,
      requestTimeoutMs: 1500,
      injectBudgetTokens: 2500,
    },
    "/conn": {
      serverUrl: "http://127.0.0.1:8000",
      peerPrefix: "lab",
      peerPrefixValid: true,
      apiKeySet: true,
      apiKeyHead: "abcd",
      apiKeyTail: "wxyz",
    },
    "/peers": {
      ok: true,
      peers: [
        { name: "self-one", self: true, count: 3 },
        { name: "peer-a", count: 4, countCapped: true },
        { name: "peer-b", count: null },
      ],
    },
    "/recall-mode": {
      recallGate: "off",
      queryMode: "last",
      gatePrompt: "",
      gateDecisionPrompt: "",
      gateModel: "",
      rerank: "off",
      rerankPrompt: "",
      rerankModel: "",
      // 一行服务已被清空：通道保留但标红，别自动删。
      rerankChannels: [{ type: "rerank", name: "孤儿通道", weight: 2, enabled: true }],
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceTimeoutMs: null,
      // 密钥：GET 只回掩码。
      rerankServiceKeySet: true,
      rerankServiceKeyMasked: "sk-a••••••••7890",
      systemoneServiceUrl: "",
      systemoneServiceModel: "",
      systemoneServiceTimeoutMs: null,
      systemoneServiceKeySet: false,
      systemoneServiceKeyMasked: "",
    },
    "/models": { ok: true, models: [{ provider: "p", id: "m" }] },
  };

  const calls = [];
  let rejectNextPost = "";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const get = async (path) => {
    calls.push({ method: "GET", path });
    const key = path.split("?")[0];
    return clone(backend[key]);
  };
  const post = async (path, body) => {
    calls.push({ method: "POST", path, body });
    if (rejectNextPost) {
      const error = rejectNextPost;
      rejectNextPost = "";
      // 网络错走抛，业务拒走 ok:false —— 两条路都验。
      if (error === "throw") throw new Error("网络不通");
      return { ok: false, error };
    }
    if (path === "/controls") {
      Object.assign(backend["/controls"], body);
      return { ...clone(backend["/controls"]), ok: true };
    }
    if (path === "/conn") {
      Object.assign(backend["/conn"], { peerPrefix: body.peerPrefix }, body);
      return { ...clone(backend["/conn"]), ok: true };
    }
    if (path === "/peers") return { ok: true, excluded: body.excluded };
    if (path === "/recall-mode") {
      const target = backend["/recall-mode"];
      Object.assign(target, body, { rerankChannels: JSON.parse(body.rerankChannels) });
      // 模拟服务端：只回掩码。带明文就换掩码，带的等于当前掩码就不动。
      for (const keyKey of ["rerankServiceKey", "systemoneServiceKey"]) {
        const typed = target[keyKey];
        if (typeof typed !== "string") continue;
        delete target[keyKey];
        if (!typed || typed === target[`${keyKey}Masked`]) continue;
        target[`${keyKey}Set`] = true;
        target[`${keyKey}Masked`] = `${typed.slice(0, 4)}••••••••${typed.slice(-4)}`;
      }
      return { ok: true, ...clone(backend["/recall-mode"]) };
    }
    if (path === "/recall-mode/service-test") {
      return { ok: true, elapsedMs: 12, model: body.model };
    }
    if (path === "/recall-mode/test") {
      return {
        candidates: 2,
        elapsedMs: 9,
        channels: [{ type: "model", ok: true, elapsedMs: 9, scores: [0.5, 0.25], normalized: [1, 0], weight: 1 }],
        merged: [0.5, 0.25],
        kept: [0],
      };
    }
    return { ok: true };
  };

  createConfig({ get, post, sessionKey: async () => "01a1585b-86d2", schedule: () => 0 });
  const ui = useConfig();
  const state = ui.state;

  // ---- 响应式真的接上了（否则组件永远是首屏那份） ----
  {
    const seen = [];
    const stop = vueEffect(() => seen.push(state.status.view.pillText));
    await ui.refresh();
    stop();
    check(
      "状态写入能被 Vue 的 effect 看见（replaceState 接对了）",
      seen.includes("已连接") && seen[0] !== "已连接",
      seen.join(" → "),
    );
  }
  check("首屏读的是带会话的 /status",
    calls.some((call) => call.path === "/status?session=01a1585b-86d2"));
  check("模型目录独立读（/models）", calls.some((call) => call.method === "GET" && call.path === "/models"));

  // ---- 读：状态 / 检查项 / 开关 / 连接 / 召回 ----
  eq(
    "药丸跟着 /status 走 / 检查项摘要（只说比例 / 灰档 / 明细只列问题项） / /controls 与 /status、/conn 读回的值（开关 / 超时预算 / 地址 / key 占位 / 门牌前缀 / 三个下拉） / 提示词框里坐的是默认全文（值是 value 不是 placeholder） / 打分服务读回：地址 / 模型 / 超时留空仍是空 / 密钥框坐掩码（GET 不回明文）/ 没配的为空 / 通道草稿按服务端投影 / 模型目录进来了",
    [[state.status.view.pillText, state.status.view.pillTone], [state.status.checksSummary.text, state.status.checksSummary.tone, state.status.checksSummary.problems], [
      [state.controls.enabled, state.controls.probe, state.controls.skillRouting],
      [state.controls.requestTimeoutMs, state.controls.injectBudgetTokens],
      state.conn.serverUrl,
      state.conn.apiKeyPlaceholder,
      state.conn.peerPrefix,
      [state.form.recallGate, state.form.queryMode, state.form.rerank],
    ], [state.prompts.gate, state.prompts.decision, state.prompts.rerank], [
      state.draft.rerankServiceUrl,
      state.draft.rerankServiceModel,
      state.draft.rerankServiceTimeoutMs,
      state.draft.rerankServiceKey,
      state.draft.systemoneServiceKey,
    ], state.channels.map((channel) => channel.name), ui.store.modelChoices(state.form.gateModel).map((option) => option.value)],
    [["已连接", "ok"], ["服务端 1/2 就绪", "muted", [{ name: "ollama", status: "not_configured", label: "未配置" }]], [
      [true, true, false],
      [1500, 2500],
      "http://127.0.0.1:8000",
      "已填写（留空表示不改）",
      "lab",
      ["off", "last", "off"],
    ], [DEFAULT_GATE_PROMPT, DEFAULT_GATE_DECISION_PROMPT, DEFAULT_RERANK_PROMPT], ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "", "sk-a••••••••7890", ""], ["孤儿通道"], ["", "p/m"]],
  );
  check("目录可用时不显示原因", ui.store.modelHint() === "");
  eq(
    "peer 行：本机不可点 / peer 计数 / 日志页：计数条按事件聚合，正文倒序（最新在上） / 提示位初始是空的",
    [ui.store.peerRows().map((row) => [row.name, row.self, row.tappable]), ui.store.peerCountText(), [ui.store.logChips().map((chip) => chip.text), ui.store.logBody().split("\n")[0]], state.note.text],
    [[
    ["self-one", true, false],
    ["peer-a", false, true],
    ["peer-b", false, true],
  ], "3 个", [["agent/before-start × 2", "provider/before-request × 1"], JSON.stringify(backend["/probe"].lines[2])], ""],
  );
  check("页脚写了上次读取", /^上次读取 /.test(state.foot), state.foot);

  // ---- 过期服务：通道保留但标红（行为第 6 条） ----
  {
    backend["/recall-mode"] = {
      ...backend["/recall-mode"],
      rerankServiceUrl: "",
      rerankServiceModel: "",
    };
    await ui.refresh();
    const row = ui.store.channelView(state.channels[0], 0);
    eq("服务被清空后通道还在", state.channels.length, 1);
    check("通道被标红（运行时不会生效）", row.unavailable === true, JSON.stringify(row));
    eq(
      "类型选项只剩宿主模型 + 一行存量类型（文案说清服务未配置） / 已配服务为空时类型选项只有宿主模型",
      [[row.options.map((option) => option.value), row.options[1].label.includes("服务未配置")], ui.store.channelTypeChoices().map((option) => option.value)],
      [[["model", "rerank"], true], ["model"]],
    );
    backend["/recall-mode"] = {
      ...backend["/recall-mode"],
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
    };
    await ui.refresh();
    eq("服务配回来之后类型选项多一项", ui.store.channelTypeChoices().map((option) => option.value), ["rerank", "model"]);
  }

  // ---- 写：改了就提交，失败回滚（行为第 1、2 条） ----
  {
    const before = calls.filter((call) => call.method === "POST" && call.path === "/recall-mode").length;
    await ui.setForm("queryMode", "context");
    const saves = calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    eq("一次提交只发一单", saves.length - before, 1);
    check(
      "整单一单带走全部字段（两个基础下拉 + 提示词 + 模型 + 通道 JSON 串）",
      saves.at(-1).body.recallGate === "off" && saves.at(-1).body.queryMode === "context" &&
        saves.at(-1).body.gatePrompt === DEFAULT_GATE_PROMPT &&
        saves.at(-1).body.rerankPrompt === DEFAULT_RERANK_PROMPT &&
        typeof saves.at(-1).body.rerankChannels === "string",
      JSON.stringify(Object.keys(saves.at(-1).body)),
    );
    eq(
      "提交成功后控件停在服务端的值上 / 成功提示",
      [state.form.queryMode, [state.note.text, state.note.bad]],
      ["context", ["召回策略已生效", false]],
    );
  }
  {
    rejectNextPost = "queryMode 只能是 last / context";
    await ui.setForm("queryMode", "bogus");
    eq("被拒后控件退回上一次确认的值，提示位显示服务端原文",
      [state.form.queryMode, state.note.text, state.note.bad],
      ["context", "queryMode 只能是 last / context", true]);
  }
  {
    rejectNextPost = "throw";
    await ui.setForm("recallGate", "llm");
    eq("网络错同样回滚、同样提示", [state.form.recallGate, state.note.text, state.note.bad], ["off", "网络不通", true]);
  }
  {
    // 请求在飞时又改一格：不丢这次改动，上一单收笔后再发一单。
    backend["/recall-mode"].queryMode = "last";
    state.form.queryMode = "last";
    state.layers = paintRecallConfig(backend["/recall-mode"]);
    const first = ui.setForm("queryMode", "context");
    const second = ui.setForm("recallGate", "rules");
    await Promise.all([first, second]);
    const saves = calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    eq(
      "两单收笔后最后的值与服务端一致 / 最后一单带着两个键",
      [[state.form.queryMode, state.form.recallGate], [saves.at(-1).body.queryMode, saves.at(-1).body.recallGate]],
      [["context", "rules"], ["context", "rules"]],
    );
  }
  // ---- 拆卡之后仍然是整单（召回卡 / 重排卡两张，但请求只有一单） ----
  {
    // 先把两个键摆到**非默认值**，免得受前面几段留下的状态影响。
    // 为什么必须是非默认值：整单里少了这个键时，normalize 会拿默认值补上，
    // 如果此刻的值正好就是默认值，「补上的默认值」与「此刻的值」相同，断言就看不出来。
    const saves = () => calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    await ui.setForm("recallGate", "off");
    await ui.setForm("queryMode", "context");
    const before = saves().length;
    // 只改召回卡里的那个下拉：整单里必须同时有 queryMode，而且带的是此刻的值。
    await ui.setForm("recallGate", "llm");
    const body = saves().at(-1).body;
    eq(
      "改召回判断时那一单里同时带 queryMode（当前值）",
      [saves().length - before, body.recallGate, body.queryMode, state.form.queryMode],
      [1, "llm", "context", "context"],
    );
  }
  {
    // 只改重排卡里的「结果重排」：请求里仍然要带着召回卡那两个键，值都是此刻的（非默认）。
    const saves = () => calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    await ui.setForm("recallGate", "rules");
    const before = saves().length;
    await ui.setForm("rerank", "llm");
    const body = saves().at(-1).body;
    eq(
      "改重排开关时那一单里同时有 recallGate 与 queryMode",
      [saves().length - before, body.rerank, body.recallGate, body.queryMode, state.form.recallGate, state.form.queryMode],
      [1, "llm", "rules", "context", "rules", "context"],
    );
    // 复位：后面几段按「重排关着」的草稿走。
    await ui.setForm("rerank", "off");
  }
  {
    // 拆的是视图，不是提交：两张卡都只调 store 的动作，谁都不自己发请求。
    const cards = ["components/RecallCard.vue", "components/RerankCard.vue"].map((name) =>
      uiCode(name),
    );
    const offenders = ["post(", "fetch(", "createPanelStore"].filter((needle) =>
      cards.some((code) => code.includes(needle)),
    );
    eq("RecallCard / RerankCard 都不自己发请求（整单没有被拆成三单）", offenders, []);
  }

  // ---- 提示词：恢复默认只填框 + 正常提交（行为第 4 条） ----
  {
    state.prompts.gate = "我的提示词";
    state.prompts.gateTouched = true;
    await ui.setPrompt("gate", "我的提示词");
    eq("自定义提示词提交后仍在框里，状态小字说已修改",
      [state.prompts.gate, ui.gatePromptStatus()], ["我的提示词", "已修改"]);
    await ui.resetPrompt("gate");
    eq("恢复默认把默认全文填回框里，状态说默认",
      [state.prompts.gate, ui.gatePromptStatus()], [DEFAULT_GATE_PROMPT, "当前为默认提示词"]);
    await ui.touchPrompt("gate", "");
    await ui.setPrompt("gate", "");
    eq(
      "清空后状态提醒不拦截 / 清空的值也提交（配置为空）",
      [ui.gatePromptStatus().includes("不会拦截任何召回"), backend["/recall-mode"].gatePrompt],
      [true, ""],
    );
    // 复位，后面的断言按默认草稿走。
    await ui.resetPrompt("gate");
  }

  // ---- 两份判据提示词互不影响 + 第四档只在服务配好后可选 ----
  {
    const saves = () => calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    await ui.setForm("recallGate", "llm");
    await ui.setPrompt("decision", "决策那份：{{message}}");
    await ui.setPrompt("gate", "语言模型那份");
    eq(
      "两份提示词分开存、分开提交：改一份不动另一份，两份都在同一单里",
      [
        state.prompts.gate,
        state.prompts.decision,
        saves().at(-1).body.gatePrompt,
        saves().at(-1).body.gateDecisionPrompt,
      ],
      ["语言模型那份", "决策那份：{{message}}", "语言模型那份", "决策那份：{{message}}"],
    );

    await ui.resetPrompt("decision");
    eq(
      "恢复默认只恢复决策那一份（语言模型那份原样）",
      [state.prompts.decision, ui.decisionPromptStatus(), state.prompts.gate],
      [DEFAULT_GATE_DECISION_PROMPT, "当前为默认提示词", "语言模型那份"],
    );

    // 切档：两份草稿都不丢。
    await ui.setForm("recallGate", "rules");
    await ui.setForm("recallGate", "llm");
    eq(
      "切到别的档再切回来，两份提示词的草稿都还在",
      [state.prompts.gate, state.prompts.decision],
      ["语言模型那份", DEFAULT_GATE_DECISION_PROMPT],
    );

    // 服务没配：下拉里没有第四档；配上之后（GET 回来）才出现。
    eq(
      "决策服务没配时下拉只有三项",
      recallGateOptions(uiDecisionServiceConfigured(state.layers)).map((option) => option.value),
      ["off", "rules", "llm"],
    );
    backend["/recall-mode"] = {
      ...backend["/recall-mode"],
      systemoneServiceUrl: "http://127.0.0.1:8097",
      systemoneServiceModel: "kev-4b",
    };
    await ui.refresh();
    eq(
      "服务配好后第四项出现（重新读 /recall-mode 才解锁）",
      recallGateOptions(uiDecisionServiceConfigured(state.layers)).map((option) => option.value),
      ["off", "rules", "llm", "decision"],
    );
    await ui.setForm("recallGate", "decision");
    eq(
      "服务配好时选 decision 能被接住（投影仍是 decision，不会被洗成 off）",
      [state.form.recallGate, state.layers.recallGate],
      ["decision", "decision"],
    );

    // 选了 decision 之后把服务清空：面板投影回 off，下拉也回到三项。
    backend["/recall-mode"] = {
      ...backend["/recall-mode"],
      recallGate: "decision",
      systemoneServiceUrl: "",
      systemoneServiceModel: "",
    };
    await ui.refresh();
    eq(
      "已选 decision 但服务被清空：面板自己归一化回 off（不在下拉里留假档位）",
      [state.form.recallGate, state.layers.recallGate, recallGateOptions(uiDecisionServiceConfigured(state.layers)).length],
      ["off", "off", 3],
    );

    // 复位，后面的断言按默认草稿走。
    await ui.resetPrompt("gate");
  }

  // ---- 打分服务：地址与模型成对（行为第 5 条） ----
  {
    // 先把这一对清空，再只填地址：这才是「半对」的现场。
    await ui.setServiceField("rerankServiceUrl", "");
    await ui.setServiceField("rerankServiceModel", "");
    await ui.setServiceField("rerankServiceUrl", "http://other:8098");
    // 半对不许出现在任何一单里：两格必须同时有值才提交（服务端也要求成对）。
    check(
      "半对不发服务端（地址与模型成对）",
      calls
        .filter((call) => call.method === "POST" && call.path === "/recall-mode")
        .every((call) => call.body.rerankServiceUrl !== "http://other:8098"),
      JSON.stringify(
        calls
          .filter((call) => call.method === "POST" && call.path === "/recall-mode")
          .map((call) => call.body.rerankServiceUrl),
      ),
    );
    eq("半对留在界面上继续编辑", state.draft.rerankServiceUrl, "http://other:8098");
    check("半对时刷新不会抹掉这一格", (() => {
      const before2 = state.draft.rerankServiceUrl;
      ui.store.applyLayers(backend["/recall-mode"]);
      return state.draft.rerankServiceUrl === before2;
    })());
    await ui.setServiceField("rerankServiceModel", "bge-v2");
    const pairBody = calls.filter((call) => call.method === "POST" && call.path === "/recall-mode").at(-1).body;
    eq("成对后整对发出去", [pairBody.rerankServiceUrl, pairBody.rerankServiceModel],
      ["http://other:8098", "bge-v2"]);
    await ui.setServiceField("rerankServiceUrl", "");
    eq(
      "清空一半时另一半也清掉 / 清空后上一次的测试结果也收掉",
      [[state.draft.rerankServiceUrl, state.draft.rerankServiceModel], state.serviceResults.rerank],
      [["", ""], { tone: "", text: "", pending: false }],
    );
  }

  // ---- 打分服务密钥：掩码回显、清空不提交、新值整单带走 ----
  {
    const saves = () => calls.filter((call) => call.method === "POST" && call.path === "/recall-mode");
    const before = saves().length;

    // 清空不提交：聚焦后框里会变成空串，失焦仍为空就把掩码填回去。
    await ui.setServiceKey("rerankServiceKey", "");
    eq("清空密钥：不发请求，掩码填回框里",
      [saves().length - before, state.draft.rerankServiceKey], [0, "sk-a••••••••7890"]);

    // 空着的时候改别的格：带回去的是掩码，不是空串（不会顺手把 key 删了）。
    state.draft.rerankServiceKey = "";
    await ui.setForm("queryMode", "last");
    eq("空着时提交带的是掩码（不当成清空）", saves().at(-1).body.rerankServiceKey, "sk-a••••••••7890");
    // 回包不硬填：用户手上还清着那一格（飞行期间的状态），掩码由失焦补回。
    eq("空着时回包不抢着填回掩码", state.draft.rerankServiceKey, "");
    state.draft.rerankServiceKey = state.layers.rerankServiceKey;

    // 新值：整单带走，回包里换成新掩码。
    await ui.setServiceKey("rerankServiceKey", "  sk-typed-9999  ");
    const body = saves().at(-1).body;
    eq("新密钥去空白后整单带走，回包后框里换成新掩码",
      [body.rerankServiceKey, state.draft.rerankServiceKey], ["sk-typed-9999", "sk-t••••••••9999"]);
    check(
      "整单仍然把其它字段一起带走",
      ["rerankServiceUrl", "rerankServiceModel", "rerankServiceTimeoutMs", "rerankChannels"].every(
        (key) => key in body,
      ),
      JSON.stringify(Object.keys(body)),
    );

    // 「等于掩码」不发空请求：服务端也把它当没改。
    const settled = saves().length;
    await ui.setServiceKey("rerankServiceKey", "sk-t••••••••9999");
    eq("提交当前掩码不再发请求", saves().length, settled);

    // 测试按钮发的是框里此刻的值（包括密钥）。
    await ui.setServiceField("rerankServiceUrl", "http://127.0.0.1:8098");
    await ui.setServiceField("rerankServiceModel", "bge-reranker-v2-m3");
    await ui.testService("rerank");
    const testBody = calls.filter((call) => call.path === "/recall-mode/service-test").at(-1).body;
    eq("测试请求带着框里的密钥", testBody.key, "sk-t••••••••9999");
    state.draft.rerankServiceKey = "sk-fresh-1234";
    await ui.testService("rerank");
    eq("输入框里换了新密钥，测试也发新的",
      calls.filter((call) => call.path === "/recall-mode/service-test").at(-1).body.key,
      "sk-fresh-1234");
    state.draft.rerankServiceKey = "sk-t••••••••9999";

    // systemone 那组同理，且互不影响。
    await ui.setServiceKey("systemoneServiceKey", "sk-sys-4321");
    eq("两组密钥各管各的", [
      saves().at(-1).body.systemoneServiceKey,
      saves().at(-1).body.rerankServiceKey,
    ], ["sk-sys-4321", "sk-t••••••••9999"]);

    // 把地址 / 模型退回半对状态，不干扰后面「没填全不发请求」那条。
    state.draft.rerankServiceUrl = "http://127.0.0.1:8098";
    state.draft.rerankServiceModel = "";
  }
  {
    // 没填全不许发请求：结果行直接说「先填地址和模型」。
    const before = calls.filter((call) => call.method === "POST").length;
    await ui.testService("rerank");
    eq("没填全时不发请求，结果行说先填地址和模型（灰档）",
      [
        calls.filter((call) => call.method === "POST").length - before,
        state.serviceResults.rerank.text,
        state.serviceResults.rerank.tone,
      ],
      [0, "先填地址和模型", "muted"]);
    await ui.setServiceField("rerankServiceUrl", "http://127.0.0.1:8098");
    await ui.setServiceField("rerankServiceModel", "bge-reranker-v2-m3");
    await ui.testService("rerank");
    eq("测试成功：可用 + 耗时 + 模型、绿档、打完停在 idle",
      [
        state.serviceResults.rerank.text,
        state.serviceResults.rerank.tone,
        state.serviceResults.rerank.pending,
      ],
      ["可用 · 12ms · bge-reranker-v2-m3", "ok", false]);
    rejectNextPost = "connect ECONNREFUSED";
    await ui.testService("rerank");
    eq("服务不可用是红档", state.serviceResults.rerank.tone, "bad");
    check("失败原因原样带上", state.serviceResults.rerank.text.includes("connect ECONNREFUSED"),
      state.serviceResults.rerank.text);
  }

  // ---- 开关：乐观 + 回滚 ----
  {
    rejectNextPost = "写入失败";
    await ui.flip("enabled", false);
    eq("总闸写失败后回滚并有提示",
      [state.controls.enabled, state.note.text, state.note.bad], [true, "写入失败", true]);
    await ui.flip("probe", false);
    eq("探针写成功（乐观生效 + 已保存提示）",
      [state.controls.probe, state.note.text, state.note.bad], [false, "已保存", false]);
    await ui.flip("probe", true);
    eq("再点回来", state.controls.probe, true);
  }

  // ---- 连接三字段 ----
  {
    state.conn.apiKey = "new-key";
    await ui.saveConnection();
    const body = calls.filter((call) => call.method === "POST" && call.path === "/conn").at(-1).body;
    eq("提交带上新 key 与门牌前缀；回包后 key 框清空、门牌前缀原样",
      [body.apiKey, body.peerPrefix, state.conn.apiKey, state.conn.peerPrefix],
      ["new-key", "lab", "", "lab"]);
    backend["/conn"].peerPrefixValid = false;
    backend["/conn"].peerPrefix = "主力机";
    state.conn.peerPrefix = "主力机";
    await ui.saveConnection();
    check("脏前缀被放行时说明它不会生效",
      state.note.text.includes("不会生效") && state.note.text.includes("主力机"),
      state.note.text);
    eq("脏前缀的完整措辞（含「其余设置已保存」）",
      uiPrefixWarn("主力机", "（其余设置已保存）"),
      "门牌前缀「主力机」不会生效，请改成字母、数字或连字符（其余设置已保存）");
    backend["/conn"].peerPrefixValid = true;
  }
  {
    await ui.setControlsNumber("requestTimeoutMs", "3000");
    eq("超时改了就提交", backend["/controls"].requestTimeoutMs, 3000);
    await ui.setControlsNumber("requestTimeoutMs", "");
    const afterClear = backend["/controls"].requestTimeoutMs;
    await ui.setControlsNumber("requestTimeoutMs", "abc");
    eq("清空数字框 / 非数字都不提交（保留旧值）", [afterClear, backend["/controls"].requestTimeoutMs], [3000, 3000]);
  }

  // ---- peer 名单：整单提交 + 乐观回滚（行为第 7 条） ----
  {
    await ui.store.togglePeer("peer-a");
    const body = calls.filter((call) => call.method === "POST" && call.path === "/peers").at(-1).body;
    eq("排除名单整单提交（本机永远不在里面），写成功有提示",
      [body.excluded, body.excluded.includes("self-one"), state.note.text],
      [["peer-a"], false, "排除名单已更新"]);
    rejectNextPost = "写入失败";
    await ui.store.togglePeer("peer-b");
    eq(
      "写失败回滚到点击前 / 写失败有提示",
      [ui.store.peerRows().map((row) => [row.name, row.excluded]), [state.note.text, state.note.bad]],
      [[
      ["self-one", false],
      ["peer-a", true],
      ["peer-b", false],
    ], ["写入失败", true]],
    );
  }

  // ---- 通道：增删 / 权重 / 超时 / 测试 ----
  {
    await ui.addChannel();
    eq("添加通道用当前第一个可选类型", state.channels.at(-1).type, "rerank");
    const index = state.channels.length - 1;
    await ui.setChannelWeight(index, "99");
    const clamped = state.channels[index].weight;
    await ui.setChannelWeight(index, "abc");
    eq("权重收敛到 10，非数字不改", [clamped, state.channels[index].weight], [10, 10]);
    await ui.setChannelTimeout(index, "250");
    const timed = state.channels[index].timeoutMs;
    await ui.setChannelTimeout(index, "");
    eq("超时收成数字，留空 = 删掉这一格", [timed, "timeoutMs" in state.channels[index]], [250, false]);
    await ui.removeChannel(index);
    eq(
      "删除通道后就少了这一行 / 通道计数文案",
      [state.channels.length, ui.store.channelView(state.channels[0], 0).title],
      [1, "通道 1"],
    );
    await ui.testChannels();
    check(
      "通道测试结果：首行是汇总、不是失败文案、也不挂 pending",
      state.channelTest.text.split("\n")[0] === "候选 2 条 · 1 路通道 · 9ms" &&
        state.channelTest.text.startsWith("测试失败") === false &&
        state.channelTest.pending === false,
      state.channelTest.text.split("\n")[0],
    );
    // 无会话时给一句能读的失败，而不是空结果。
    createConfig({ get, post, sessionKey: async () => null, schedule: () => 0 });
    const sessionless = useConfig();
    await sessionless.refresh();
    await sessionless.testChannels();
    eq("没有会话时通道测试说清楚为什么",
      sessionless.state.channelTest.text,
      "测试失败：当前会话还没绑定，先打开一次对话再试");
  }

  // ---- 日志折叠已删 / 编辑中的格子不被刷新覆盖 ----
  {
    createConfig({ get, post, sessionKey: async () => "01a1585b-86d2", schedule: () => 0 });
    const fresh = useConfig();
    await fresh.refresh();
    check(
      "日志只剩尾部数据（折叠状态与切换函数都已删），正文仍由 logBody 投影",
      JSON.stringify(Object.keys(fresh.state.logs)) === JSON.stringify(["lines"]) &&
        typeof fresh.store.toggleLogs === "undefined" &&
        fresh.store.logBody().split("\n")[0] === JSON.stringify(backend["/probe"].lines[2]),
      fresh.store.logBody().slice(0, 80),
    );
    fresh.setFocus("serverUrl");
    backend["/status"].serverUrl = "http://changed:9000";
    await fresh.refresh();
    const whileEditing = fresh.state.conn.serverUrl;
    fresh.setFocus("");
    await fresh.refresh();
    eq("正在改地址时刷新不回写那一格，失焦后正常回写",
      [whileEditing, fresh.state.conn.serverUrl], ["http://127.0.0.1:8000", "http://changed:9000"]);
  }
}

// ================= ui: 召回下拉的收笔逻辑 =================
{
  // 服务端回的投影照着显示；形状不全时回退默认值，别让下拉变空。
  // 服务端回的投影照着显示；缺字段 / null / 脏值都回退默认值，别让下拉变空。
  eq(
    "召回策略投影（合法值照显示，缺字段 / null / 脏值回默认）",
    [
      paintLayers({ recallGate: "rules", queryMode: "context" }),
      paintLayers({}),
      paintLayers(null),
      paintLayers({ recallGate: "on", queryMode: "all" }),
    ],
    [
      { recallGate: "rules", queryMode: "context" },
      { recallGate: "off", queryMode: "last" },
      { recallGate: "off", queryMode: "last" },
      { recallGate: "off", queryMode: "last" },
    ],
  );

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
    eq(
      "成功：一单发完两个键，界面停在服务端值上，提示不是错误",
      [sent, out, shown.at(-1), notes.at(-1)],
      [[next], { ok: true, layers: next }, next, ["召回策略已生效", false]],
    );
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
    eq(
      "被拒：ok false、界面与返回值都退回上次确认的值、面板上有服务端原文",
      [out.ok, shown.at(-1), out.layers, notes.at(-1)],
      [false, paintLayers(next), paintLayers(next), ["queryMode 只能是 last / context", true]],
    );
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
    eq("网络错同样回滚、同样提示、不算成功",
      [shown.at(-1), notes.at(-1), out.ok], [before, ["网络不通", true], false]);
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
    eq("半单被拒：界面只落一次状态，且仍是旧值",
      [shown.length - shownCount, shown.at(-1)], [1, before]);
  }

  // ---- 提示词框的显示与状态（value 当草稿，不靠 placeholder） ----
  eq(
    "两份默认提示词逐字一致 / 提示词草稿（空配置坐默认全文、动过就不再填、自定义照显、超长按截断显示） / 提示词状态小字（等于默认 / 改过 / 清空提醒不拦截，只有空白也算空）",
    [UI_DEFAULT_GATE_PROMPT, [
      promptDraft(""),
      promptDraft("", true),
      promptDraft("我的提示词"),
      promptDraft("字".repeat(GATE_PROMPT_MAX + 5)).length,
    ], [
      promptStatus(DEFAULT_GATE_PROMPT),
      promptStatus("我的提示词"),
      promptStatus("").includes("已修改") && promptStatus("").includes("提示词为空时不会拦截任何召回"),
      promptStatus("   \n ").includes("不会拦截任何召回"),
    ]],
    [DEFAULT_GATE_PROMPT, [DEFAULT_GATE_PROMPT, "", "我的提示词", GATE_PROMPT_MAX], ["当前为默认提示词", "已修改", true, true]],
  );

  // ---- 四档文案与选项：没配决策服务就只有三项 ----
  eq(
    "四档文案与顺序（关闭 / 规则判断 / 语言模型判断 / 决策模型判断）",
    [
      recallGateOptions(true).map((option) => option.value),
      recallGateOptions(true).map((option) => option.label),
      UI_RECALL_GATE_LABELS,
    ],
    [
      ["off", "rules", "llm", "decision"],
      ["关闭", "规则判断", "语言模型判断", "决策模型判断"],
      { off: "关闭", rules: "规则判断", llm: "语言模型判断", decision: "决策模型判断" },
    ],
  );
  eq(
    "决策服务未配置时下拉只有三项 / 配好（地址与模型成对）之后第四项才出现",
    [
      recallGateOptions(false).map((option) => option.value),
      recallGateOptions(
        uiDecisionServiceConfigured({
          systemoneServiceUrl: "http://127.0.0.1:8099",
          systemoneServiceModel: "kev-4b",
        }),
      ).map((option) => option.value),
      recallGateOptions(
        uiDecisionServiceConfigured({ systemoneServiceUrl: "http://127.0.0.1:8099" }),
      ).length,
      recallGateOptions(uiDecisionServiceConfigured({})).length,
    ],
    [["off", "rules", "llm"], ["off", "rules", "llm", "decision"], 3, 3],
  );

  // ---- 决策提示词自己的草稿与三态（与 gatePrompt 同一套，只是另一格） ----
  eq(
    "决策提示词草稿（空配置坐默认问法、动过不再填、自定义照显、超长按码点截断） / 三态小字（默认 / 已修改 / 空＝照常召回）",
    [
      decisionPromptDraft(""),
      decisionPromptDraft("", true),
      decisionPromptDraft("自定义判据"),
      decisionPromptStatus(UI_DEFAULT_GATE_DECISION_PROMPT),
      decisionPromptStatus("自定义判据"),
      decisionPromptStatus("").includes("不会拦截任何召回"),
      decisionPromptStatus("   \n ").includes("不会拦截任何召回"),
      paintDecisionConfig({ gateDecisionPrompt: "字".repeat(GATE_PROMPT_MAX + 10) })
        .gateDecisionPrompt.length,
      paintDecisionConfig({}).gateDecisionPrompt,
    ],
    [
      UI_DEFAULT_GATE_DECISION_PROMPT,
      "",
      "自定义判据",
      "当前为默认提示词",
      "已修改",
      true,
      true,
      GATE_PROMPT_MAX,
      "",
    ],
  );

  // ---- llm 的提示词与判断模型：归一化 + 整单收笔 ----
  eq(
    "llm 配置归一化非法值 / 形状不对的模型标识当空（回到默认通道） / 完整投影包含两层、llm、两份判据提示词、重排配置、通道与打分服务",
    [paintGateConfig({
      gatePrompt: "字".repeat(GATE_PROMPT_MAX + 10),
      gateModel: "  p1/m1  ",
    }), [paintGateConfig({ gateModel: "m1" }).gateModel, paintGateConfig({ gateModel: "/x" }).gateModel], paintRecallConfig({ recallGate: "llm" })],
    [{
      gatePrompt: "字".repeat(GATE_PROMPT_MAX),
      gateModel: "p1/m1",
    }, ["", ""], {
    recallGate: "llm",
    queryMode: "last",
    gatePrompt: "",
    gateModel: "",
    gateDecisionPrompt: "",
    rerank: "off",
    rerankPrompt: "",
    rerankModel: "",
    rerankChannels: [],
    rerankServiceUrl: "",
    rerankServiceModel: "",
    rerankServiceTimeoutMs: null,
    rerankServiceKey: "",
    systemoneServiceUrl: "",
    systemoneServiceModel: "",
    systemoneServiceTimeoutMs: null,
    systemoneServiceKey: "",
  }],
  );

  // ---- 重排配置的归一化与草稿 ----
  eq(
    "重排配置归一化非法值 / 重排配置读到 llm；形状不对的模型标识当空 / 重排草稿（空配置坐默认全文、动过不再填、自定义照显） / 重排状态小字（等于默认 / 改过 / 清空提醒回默认模板）",
    [paintRerankConfig({
      rerank: "on",
      rerankPrompt: "字".repeat(RERANK_PROMPT_MAX + 10),
      rerankModel: "  p1/m1  ",
    }), [paintRerankConfig({ rerank: "llm" }).rerank, paintRerankConfig({ rerankModel: "m1" }).rerankModel], [rerankPromptDraft(""), rerankPromptDraft("", true), rerankPromptDraft("我的重排提示词")], [
      rerankPromptStatus(DEFAULT_RERANK_PROMPT),
      rerankPromptStatus("我的重排提示词"),
      rerankPromptStatus("").includes("已修改") && rerankPromptStatus("").includes("提示词为空时使用默认模板"),
    ]],
    [{
      rerank: "off",
      rerankPrompt: "字".repeat(RERANK_PROMPT_MAX),
      rerankModel: "p1/m1",
      rerankChannels: [],
    }, ["llm", ""], [DEFAULT_RERANK_PROMPT, "", "我的重排提示词"], ["当前为默认提示词", "已修改", true]],
  );

  // ---- 精排通道的界面归一化 ----
  eq(
    "UI 通道：空值 / 非法 JSON 回空数组，合法 JSON 串照收 / UI 通道：保留启用状态 / 权重 / 存量 timeoutMs（不被保存洗掉） / UI 通道：最多 8 行 / 空模板默认 rerank / 通道 JSON 串往返 / 通道完整性（只选类型 / 存量合法 URL / model 留空都算完整，非 http(s) 不算）",
    [[
      normalizeRerankChannels(undefined),
      normalizeRerankChannels("{oops"),
      normalizeRerankChannels(JSON.stringify([{ type: "systemone", url: "http://h", model: "m", weight: 3 }])).length,
    ], [
      normalizeRerankChannels([{ type: "model", enabled: false, weight: 2.5 }])[0].enabled,
      normalizeRerankChannels([{ type: "model", weight: 2.5 }])[0].weight,
      normalizeRerankChannels([{ type: "model", timeoutMs: 120 }])[0].timeoutMs,
    ], normalizeRerankChannels(
    Array.from({ length: 10 }, () => ({ type: "model" })),
  ).length, emptyRerankChannel(), JSON.parse(rerankChannelsText([{ type: "rerank", url: "http://h", model: "m", weight: 2 }]))[0]
      .weight, [
      isCompleteRerankChannel(emptyRerankChannel()),
      isCompleteRerankChannel({ type: "rerank", url: "http://h", model: "m" }),
      isCompleteRerankChannel({ type: "model", model: "" }),
      isCompleteRerankChannel({ type: "systemone", url: "ftp://h", model: "m" }),
    ]],
    [[[], [], 1], [false, 2.5, 120], UI_RERANK_CHANNELS_MAX, {
    type: "rerank",
    name: "",
    url: "",
    model: "",
    weight: 1,
    enabled: true,
  }, 2, [true, true, true, false]],
  );

  // ---- 打分服务：显示归一化与通道类型选项 ----
  eq(
    "打分服务显示值归一化",
    paintScoringConfig({
      rerankServiceUrl: "  http://127.0.0.1:8098///  ",
      rerankServiceModel: "  bge-reranker-v2-m3  ",
      rerankServiceTimeoutMs: "  1200  ",
      // 面板侧只认掩码字段，明文键一律不读（GET 也不回）。
      rerankServiceKey: "should-not-show-up",
      rerankServiceKeyMasked: "abcd••••••••wxyz",
      systemoneServiceUrl: "ftp://nope",
      systemoneServiceModel: "kev-4b",
      systemoneServiceTimeoutMs: "99999",
      systemoneServiceKeyMasked: 42,
    }),
    {
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceTimeoutMs: 1200,
      rerankServiceKey: "abcd••••••••wxyz",
      systemoneServiceUrl: "",
      systemoneServiceModel: "kev-4b",
      systemoneServiceTimeoutMs: null,
      systemoneServiceKey: "",
    },
  );
  // ---- 打分服务的超时：前后端同口径 ----
  eq(
    "超时边界与后端同值 / 超时默认值与后端同值 / 界面侧超时归一与后端同口径（合法照收，越界 / 非数字 / 空都回 null） / 输入框取值（没配 / 越界给空串，配了给数字串）",
    [UI_SERVICE_TIMEOUT_LIMITS, [
    UI_SERVICE_TIMEOUT_LIMITS.rerank.fallback,
    UI_SERVICE_TIMEOUT_LIMITS.systemone.fallback,
  ], [
      uiNormalizeServiceTimeout(" 1200 ", "rerank"),
      uiNormalizeServiceTimeout("99999", "rerank"),
      uiNormalizeServiceTimeout("abc", "systemone"),
      uiNormalizeServiceTimeout("", "rerank"),
    ], [
      uiServiceTimeoutInput(null, "rerank"),
      uiServiceTimeoutInput(1200, "systemone"),
      uiServiceTimeoutInput("99999", "rerank"),
    ]],
    [SERVICE_TIMEOUT_LIMITS, [800, 3500], [1200, null, null, null], ["", "1200", ""]],
  );

  // ---- 打分服务描述表：渲染完全由数据驱动 ----
  eq(
    "服务描述表恰好两项（精排 / 决策），各带一个可选密钥键",
    [SCORING_SERVICES.map((service) => service.kind), SCORING_SERVICES.map((service) => service.keyKey)],
    [["rerank", "systemone"], ["rerankServiceKey", "systemoneServiceKey"]],
  );
  for (const service of SCORING_SERVICES) {
    const required = [
      "kind",
      "label",
      "urlKey",
      "modelKey",
      "timeoutKey",
      "keyKey",
      "defaultTimeoutMs",
      "hint",
    ];
    check(
      `${service.kind} 描述字段完整（kind / label / 四键 / 默认超时 / 说明）`,
      required.every((key) => service[key] !== undefined && service[key] !== ""),
      JSON.stringify(service),
    );
  }
  eq("默认超时与后端边界同值", [
    SCORING_SERVICES[0].defaultTimeoutMs,
    SCORING_SERVICES[1].defaultTimeoutMs,
  ], [800, 3500]);

  const layout = scoringServiceLayout();
  eq(
    "渲染计划：有标题、恰好两行且顺序与表一致、服务名照表 / 每项四个输入框 + 一个测试按钮（测试按钮在 #header-extra） / 行内 id 就是配置键（旧 id 不跑）",
    [[layout.title, layout.rows.map((row) => row.kind), layout.rows.map((row) => row.label)], [
    layout.rows[0].url.label,
    layout.rows[0].model.label,
    layout.rows[0].timeout.label,
    layout.rows[0].key.label,
    layout.rows[0].testId,
  ], [
    layout.rows.map((row) => row.url.id),
    layout.rows.map((row) => row.model.id),
    layout.rows.map((row) => row.timeout.id),
    layout.rows.map((row) => row.key.id),
  ]],
    [["打分服务", ["rerank", "systemone"], ["精排", "决策"]], ["地址", "模型", "超时", "密钥", "rerankServiceTest"], [
    ["rerankServiceUrl", "systemoneServiceUrl"],
    ["rerankServiceModel", "systemoneServiceModel"],
    ["rerankServiceTimeoutMs", "systemoneServiceTimeoutMs"],
    ["rerankServiceKey", "systemoneServiceKey"],
  ]],
  );
  // 密钥那一格：password + 可点开看 + placeholder 写「可选」。
  eq(
    "密钥格是 password，可点开查看，placeholder 写可选 / 超时的 placeholder 与上下限跟着类型 / 列表下方只有一段总说明 / 说明在渲染计划里只出现一次（不重复到每行）",
    [layout.rows.map((row) => [row.key.type, row.key.showPasswordOn, row.key.placeholder]), layout.rows.map((row) => [row.timeout.placeholder, row.timeout.min, row.timeout.max]), layout.note, JSON.stringify(layout).split(layout.note).length - 1],
    [[
      ["password", "click", "可选"],
      ["password", "click", "可选"],
    ], [
      ["800 ms", 100, 10000],
      ["3500 ms", 100, 8000],
    ], "交叉编码器走 /v1/rerank，决策模型走 /v1/systemone。地址与模型成对；超时留空用默认（精排 800ms、决策 3500ms）；密钥可选，留空表示该服务没开鉴权。留空的类型不会出现在精排通道里。", 1],
  );

  // 往表里临时插一项假服务：行数变三，证明渲染确实按表走。
  const fakeService = {
    kind: "fake",
    label: "假服务",
    urlKey: "fakeServiceUrl",
    modelKey: "fakeServiceModel",
    timeoutKey: "fakeServiceTimeoutMs",
    defaultTimeoutMs: 1234,
    hint: "假服务走 /v1/fake",
    urlPlaceholder: "http://fake:1",
    modelPlaceholder: "fake-model",
  };
  const withFake = scoringServiceLayout([...SCORING_SERVICES, fakeService]);
  eq(
    "插一行假服务就渲染出三行 / 假服务行自动拿到 id / 默认超时 / 测试位",
    [withFake.rows.map((row) => row.kind), [
      withFake.rows[2].url.id,
      withFake.rows[2].timeout.placeholder,
      withFake.rows[2].testId,
      withFake.rows[2].resultId,
    ]],
    [[
    "rerank",
    "systemone",
    "fake",
  ], ["fakeServiceUrl", "1234 ms", "fakeServiceTest", "fakeServiceResult"]],
  );
  check("假服务也会进那一段总说明", withFake.note.includes("假服务走 /v1/fake") &&
    withFake.note.includes("假服务 1234ms"));
  eq(
    "表驱动契约：插行不改原表、总说明可单独生成、单行与整表同源、每行五个控件 / 每行都有地址 / 模型 / 超时 / 密钥的 placeholder，且测试位与结果位互不重复 / 反转描述表，行的顺序跟着反转",
    [[
      SCORING_SERVICES.length,
      scoringServicesNote(SCORING_SERVICES) === layout.note,
      scoringServiceRow(SCORING_SERVICES[0]).kind,
      layout.rows.map((row) => [row.url, row.model, row.timeout, row.key].filter(Boolean).length + 1),
    ], [
      layout.rows.every(
        (row) =>
          row.url.placeholder && row.model.placeholder && row.timeout.placeholder && row.key.placeholder,
      ),
      new Set(layout.rows.flatMap((row) => [row.testId, row.resultId])).size,
      layout.note.split("地址与模型成对").length - 1,
    ], scoringServiceLayout([...SCORING_SERVICES].reverse()).rows.map((row) => row.kind)],
    [[2, true, "rerank", [5, 5]], [true, 4, 1], ["systemone", "rerank"]],
  );
  check("临时插入的假服务不会溜进原表渲染", layout.rows.every((row) => row.kind !== "fake"));


  // ---- 「测试」按钮的两件纯逻辑：发什么、怎么显示 ----
  eq(
    "测试请求用界面此刻的值，地址去尾斜杠、超时归一 / 超时没填就不带这个键（服务端按类型给默认值） / 测试请求带上框里的密钥（去空白） / 密钥空着就不带这个键（不发空的 Bearer） / 界面侧密钥归一与后端同口径（去空白 / 换行丢弃 / 截断 512） / 界面侧掩码只认字符串 / 地址与模型都填了才算可测",
    [uiServiceTestBody("rerank", {
      url: "  http://127.0.0.1:8098///  ",
      model: "  bge-reranker-v2-m3  ",
      timeoutMs: "1200",
    }), "timeoutMs" in uiServiceTestBody("systemone", { url: "http://h:1", model: "kev-4b" }), uiServiceTestBody("rerank", { url: "http://h:1", model: "bge", key: "  sk-test-1234  " }).key, [
      "key" in uiServiceTestBody("rerank", { url: "http://h:1", model: "bge" }),
      "key" in uiServiceTestBody("rerank", { url: "http://h:1", model: "bge", key: "   " }),
    ], [
      uiNormalizeServiceKey("  sk-abc  "),
      uiNormalizeServiceKey("sk-abc\ndef"),
      Array.from(uiNormalizeServiceKey("k".repeat(UI_SERVICE_KEY_MAX + 9))).length,
      uiNormalizeServiceKey(1),
    ], [uiServiceKeyMask("abc"), uiServiceKeyMask(1), uiServiceKeyMask(null)], [
      uiServiceTestReady({ url: "http://h:1", model: "kev-4b" }),
      uiServiceTestReady({ url: "http://h:1", model: "  " }),
      uiServiceTestReady({ url: "", model: "kev-4b" }),
      uiServiceTestReady(null),
    ]],
    [{
      kind: "rerank",
      url: "http://127.0.0.1:8098",
      model: "bge-reranker-v2-m3",
      timeoutMs: 1200,
    }, false, "sk-test-1234", [false, false], ["sk-abc", "", UI_SERVICE_KEY_MAX, ""], [
    "abc",
    "",
    "",
  ], [true, false, false, false]],
  );

  eq(
    "成功行：可用 · 187ms · 服务端返回的模型名 / 成功行：服务端不回模型名就用配的那个 / 成功行：两边都没有就不编一个模型名 / 失败行：原文照抄错误 / 失败行：错误截到 120 字 / 失败行：没错误原文也不空着 / 未配置行：先填地址和模型 / 三档开头词与文案常量一致",
    [uiServiceTestView({ ok: true, elapsedMs: 187, model: "bge-reranker-v2-m3" }, "configured"), uiServiceTestView({ ok: true, elapsedMs: 42, model: null }, "kev-4b"), uiServiceTestView({ ok: true, elapsedMs: 9, model: null }, ""), uiServiceTestView({ ok: false, elapsedMs: 12, error: "connect ECONNREFUSED 127.0.0.1:8098" }), Array.from(
      uiServiceTestView({ ok: false, error: "x".repeat(200) }).text.replace("不可用 · ", ""),
    ).length, uiServiceTestView({ ok: false }).text, uiServiceTestView(null), [UI_SERVICE_TEST_TEXT.ok, UI_SERVICE_TEST_TEXT.bad, UI_SERVICE_TEST_TEXT.missing]],
    [{ tone: "ok", text: "可用 · 187ms · bge-reranker-v2-m3" }, { tone: "ok", text: "可用 · 42ms · kev-4b" }, { tone: "ok", text: "可用 · 9ms" }, { tone: "bad", text: "不可用 · connect ECONNREFUSED 127.0.0.1:8098" }, 120, "不可用 · 失败", {
    tone: "muted",
    text: "先填地址和模型",
  }, ["可用", "不可用", "先填地址和模型"]],
  );

  eq(
    "通道类型选项跟着已配服务走（只配精排 / 只配决策 / 都配 / 都不配） / 选项文案就是服务名",
    [[
      channelTypeOptions({ rerankServiceUrl: "http://h:8098" }).map((option) => option.value),
      channelTypeOptions({ systemoneServiceUrl: "http://h:8097" }).map((option) => option.value),
      channelTypeOptions({
        rerankServiceUrl: "http://h:8098",
        systemoneServiceUrl: "http://h:8097",
      }).map((option) => option.value),
      channelTypeOptions({}).map((option) => option.value),
    ], channelTypeOptions({
      rerankServiceUrl: "http://h:8098",
      systemoneServiceUrl: "http://h:8097",
    }).map((option) => option.label)],
    [[["rerank", "model"], ["systemone", "model"], ["rerank", "systemone", "model"], ["model"]], ["精排服务", "决策服务", "宿主模型"]],
  );

  // 服务被清空：已有通道保留，只标记不可用，不自动删。
  const clearedServiceChannels = parseRerankChannels(
    JSON.stringify([{ type: "rerank" }, { type: "model" }]),
  );
  eq(
    "服务清空后通道仍保留 / 缺服务的通道被标记不可用 / 服务配上后同一通道变为可用",
    [clearedServiceChannels.length, clearedServiceChannels.map((channel) => channelServiceMissing(channel, {})), channelServiceMissing(clearedServiceChannels[0], {
      rerankServiceUrl: "http://h:8098",
    })],
    [2, [true, false], false],
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
  const endpointsOf = (channel, switches) => {
    const { url, model } = resolveRerankChannel(channel, switches);
    return [url, model];
  };
  eq(
    "端点优先级（通道自带 > 服务配置；服务地址为空时孤立模型不生效） / 决策服务只看 systemone 那组；宿主模型不受打分服务影响",
    [[
      endpointsOf(
        { type: "rerank", url: "http://channel:1", model: "channel-model" },
        { rerankServiceUrl: "http://service:2", rerankServiceModel: "service-model" },
      ),
      endpointsOf(
        { type: "rerank", url: "", model: "" },
        { rerankServiceUrl: "http://service:2", rerankServiceModel: "service-model" },
      ),
      endpointsOf({ type: "rerank" }, { rerankServiceModel: "orphan-model" }),
    ], [
      endpointsOf(
        { type: "systemone" },
        {
          rerankServiceUrl: "http://r:1",
          rerankServiceModel: "r",
          systemoneServiceUrl: "http://s:2",
          systemoneServiceModel: "s",
        },
      ),
      endpointsOf({ type: "model", model: "p/m" }, { rerankServiceUrl: "http://r:1", rerankServiceModel: "r" }),
    ]],
    [[["http://channel:1", "channel-model"], ["http://service:2", "service-model"], ["", ""]], [["http://s:2", "s"], ["", "p/m"]]],
  );

  // 服务级密钥：跟着 type 走，调用点不用再拿 switches。
  eq(
    "服务密钥跟着通道类型走（精排取 rerank / 决策取 systemone / 宿主模型没有 / 没配是空串）",
    [
      resolveRerankChannel({ type: "rerank" }, { rerankServiceUrl: "http://r:1", rerankServiceKey: " sk-rerank " }).serviceKey,
      resolveRerankChannel({ type: "systemone" }, { rerankServiceKey: "sk-r", systemoneServiceKey: "sk-s" }).serviceKey,
      "serviceKey" in resolveRerankChannel({ type: "model", model: "p/m" }, { rerankServiceKey: "sk-r" }),
      resolveRerankChannel({ type: "rerank" }, { rerankServiceUrl: "http://r:1" }).serviceKey,
    ],
    ["sk-rerank", "sk-s", false, ""],
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
    eq("整对都在：地址与模型都用通道自己的，且不显示回退说明",
      [both.url, both.model, both.pairNote], ["http://channel:1", "channel-model", undefined]);
  }
  {
    // 老配置：只填了地址，没填模型名。整对改用服务配置。
    const urlOnly = resolveRerankChannel(
      { type: "rerank", url: "http://channel:1" },
      serviceRerank,
    );
    eq(
      "只给地址：整对改用服务配置，并给出回退说明 / 回退说明就是任务书那句 / 前后两份回退说明逐字一致（模型那半）",
      [[urlOnly.url, urlOnly.model, urlOnly.pairNote], CHANNEL_PAIR_NOTE_MODEL, CHANNEL_PAIR_NOTE_MODEL],
      [["http://service:2", "service-model", CHANNEL_PAIR_NOTE_MODEL], "通道自带的模型名为空，已改用服务配置", UI_CHANNEL_PAIR_NOTE_MODEL],
    );
  }
  {
    const modelOnly = resolveRerankChannel(
      { type: "systemone", model: "kev-4b" },
      {
        systemoneServiceUrl: "http://service:3",
        systemoneServiceModel: "service-model",
      },
    );
    eq(
      "只给模型：整对改用服务配置（不拿孤立模型去拼），说明写的是地址为空 / 前后两份回退说明逐字一致（地址那半）",
      [[modelOnly.url, modelOnly.model, modelOnly.pairNote], CHANNEL_PAIR_NOTE_URL],
      [["http://service:3", "service-model", CHANNEL_PAIR_NOTE_URL], UI_CHANNEL_PAIR_NOTE_URL],
    );
  }
  {
    const orphan = resolveRerankChannel({ type: "rerank", url: "http://channel:1" }, {});
    eq(
      "只给地址且服务也没配：整对为空 / 这种时候不说「已改用服务配置」",
      [[orphan.url, orphan.model], orphan.pairNote],
      [["", ""], undefined],
    );
  }
  eq(
    "界面侧的整对说明与后端同一口径（只给地址） / 界面侧的整对说明与后端同一口径（只给模型） / 界面侧：整对都在时不显示说明 / 界面侧：服务也没配时不显示说明（那一行已经标红了） / 界面侧：宿主模型通道不参与整对回退",
    [uiChannelPairNote({ type: "rerank", url: "http://channel:1" }, serviceRerank), uiChannelPairNote({ type: "systemone", model: "kev-4b" }, {
      systemoneServiceUrl: "http://service:3",
    }), uiChannelPairNote(
      { type: "rerank", url: "http://channel:1", model: "channel-model" },
      serviceRerank,
    ), uiChannelPairNote({ type: "rerank", url: "http://channel:1" }, {}), uiChannelPairNote({ type: "model", url: "http://channel:1" }, serviceRerank)],
    [CHANNEL_PAIR_NOTE_MODEL, CHANNEL_PAIR_NOTE_URL, "", "", ""],
  );

  // ---- 超时优先级：三层逐一验（读值，不发请求） ----
  eq(
    "超时优先级（通道自带压过服务配置；通道没填用服务配置；两边都没配就不塞这个键） / systemone 服务超时压过自适应 / 没配服务超时时 systemone 仍按候选数自适应 / 存量里越界的服务超时当没配（回到自适应）",
    [[
      resolveRerankChannel({ type: "rerank", timeoutMs: 1200 }, { ...serviceRerank, rerankServiceTimeoutMs: 900 }).timeoutMs,
      resolveRerankChannel(
        { type: "systemone" },
        { systemoneServiceUrl: "http://s:2", systemoneServiceModel: "m", systemoneServiceTimeoutMs: 2000 },
      ).timeoutMs,
      "timeoutMs" in resolveRerankChannel({ type: "systemone" }, {}),
    ], systemoneTimeoutFor(
      resolveRerankChannel({ type: "systemone" }, { systemoneServiceTimeoutMs: 2000 }),
      5,
    ), systemoneTimeoutFor(resolveRerankChannel({ type: "systemone" }, {}), 6), systemoneTimeoutFor(
      resolveRerankChannel({ type: "systemone" }, { systemoneServiceTimeoutMs: 99999 }),
      5,
    )],
    [[1200, 2000, false], 2000, 4200, 3500],
  );

  // 模型目录 -> 选项：一步选到位，文案带 provider，值形如 provider/id。
  eq(
    "模型目录 → 选项（值形如 provider/id、文案带 provider、同名靠 provider 区分） / 坏目录条目一律丢掉（形状不全 / 重复标识 / 非数组） / 下拉首项是默认",
    [[
      modelOptions([
        { provider: "deepseek", id: "deepseek-flash", name: "DeepSeek Flash" },
        { provider: "opencode-go", id: "glm-5.2", name: "GLM-5.2" },
      ]),
      modelOptions([
        { provider: "a", id: "flash" },
        { provider: "b", id: "flash" },
      ]).map((option) => option.label),
    ], [
      modelOptions([{ id: "no-provider" }, { provider: "p" }, null, 1]),
      modelOptions([
        { provider: "p", id: "m" },
        { provider: "p", id: "m" },
      ]).length,
      modelOptions(undefined),
    ], DEFAULT_MODEL_OPTION],
    [[
      [
        { value: "deepseek/deepseek-flash", label: "deepseek · deepseek-flash" },
        { value: "opencode-go/glm-5.2", label: "opencode-go · glm-5.2" },
      ],
      ["a · flash", "b · flash"],
    ], [[], 1, []], { value: "", label: "默认（宿主辅助模型）" }],
  );

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
    eq(
      "llm 整单带上四个字段 / llm 成功收在服务端四字段上 / llm 成功也算成功",
      [sent[0], shown.at(-1), out.ok],
      [extendedNext, extendedNext, true],
    );
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
    eq(
      "llm 被拒时提示词回滚 / llm 被拒时判断模型也回滚 / llm 被拒不算成功",
      [shown.at(-1).gatePrompt, shown.at(-1).gateModel, out.ok],
      ["旧提示词", "p/m", false],
    );
  }
}

// ================= 通道选项：只看地址是否合法 =================
{
  eq(
    "类型选项只认合法的服务地址（ftp / 缺协议当作没配），配了地址没填模型也照样出现",
    [
      channelTypeOptions({ rerankServiceUrl: "ftp://h", systemoneServiceUrl: "127.0.0.1:8097" }).map(
        (option) => option.value,
      ),
      channelTypeOptions({ systemoneServiceUrl: "ftp://s", rerankServiceUrl: "http://h:8098" }).map(
        (option) => option.value,
      ),
    ],
    [["model"], ["rerank", "model"]],
  );
  eq(
    "通道停用只认明确的 false（缺省 / 0 / 空串都算启用）",
    [
      normalizeRerankChannel({ type: "model" }).enabled,
      normalizeRerankChannel({ type: "model", enabled: false }).enabled,
      normalizeRerankChannel({ type: "model", enabled: 0 }).enabled,
      normalizeRerankChannel({ type: "model", enabled: "" }).enabled,
    ],
    [true, false, true, true],
  );
}

// ================= 保存收笔：掩码重绘 / 服务端回值 / 归一化边界 =================
{
  // 掩码在「服务端投影 → 画一遍 → commitLayers 再画一遍」的两道过滤里都不能被洗掉。
  const painted = paintScoringConfig({ rerankServiceKeyMasked: "sk-a••••••••7890" });
  eq(
    "掩码重绘一次还在（第二道过滤不会把密钥框清空）",
    [painted.rerankServiceKey, paintScoringConfig(painted).rerankServiceKey],
    ["sk-a••••••••7890", "sk-a••••••••7890"],
  );

  const applied = [];
  const served = await commitLayers({
    before: { recallGate: "off", queryMode: "last" },
    next: { recallGate: "rules", queryMode: "context" },
    // 服务端回的形状坏了：界面必须显示归一化后的值，不能照抄脏值。
    send: async () => ({ ok: true, recallGate: "banana", queryMode: "上下文" }),
    apply: (value) => applied.push(value),
    flash: () => {},
  });
  eq(
    "服务端回脏值时界面收的是归一化后的投影（脏值回默认，不照抄）",
    [served.ok, served.layers, applied.at(-1)],
    [true, { recallGate: "off", queryMode: "last" }, { recallGate: "off", queryMode: "last" }],
  );

  const blankApplied = [];
  const blankFlash = [];
  const noBody = await commitLayers({
    before: { recallGate: "rules", queryMode: "context" },
    next: { recallGate: "off", queryMode: "last" },
    send: async () => undefined,
    apply: (value) => blankApplied.push(value),
    flash: (text, bad) => blankFlash.push([text, Boolean(bad)]),
  });
  eq(
    "服务端没回包也当失败：整单回滚到上一次确认的值，并给一句非空原因",
    [
      noBody.ok,
      blankApplied.at(-1),
      blankFlash.at(-1)?.[1],
      typeof blankFlash.at(-1)?.[0] === "string" && blankFlash.at(-1)[0].length > 0,
    ],
    [false, { recallGate: "rules", queryMode: "context" }, true, true],
  );

  const thrownApplied = [];
  const thrownFlash = [];
  const stringError = await commitLayers({
    before: { recallGate: "off", queryMode: "last" },
    next: { recallGate: "llm", queryMode: "last" },
    send: async () => {
      throw "网关超时";
    },
    apply: (value) => thrownApplied.push(value),
    flash: (text, bad) => thrownFlash.push([text, Boolean(bad)]),
  });
  eq(
    "抛的不是 Error（字符串）也照样回滚，提示就是那句原文",
    [stringError.ok, thrownApplied.at(-1), thrownFlash.at(-1)],
    [false, { recallGate: "off", queryMode: "last" }, ["网关超时", true]],
  );

  eq(
    "服务超时的边界值：正好 min 收，min 以下 / 非整数越界都当没配（向下取整不夹边界）",
    [
      normalizeServiceTimeout(100, "rerank"),
      normalizeServiceTimeout(100.9, "rerank"),
      normalizeServiceTimeout(99.9, "rerank"),
      normalizeServiceTimeout("100.9", "systemone"),
    ],
    [100, 100, null, 100],
  );
  eq(
    "服务地址超上限（512 字符）当未配置，边界内照收",
    [
      normalizeServiceUrl(`http://h/${"a".repeat(520)}`),
      normalizeServiceUrl(`http://h/${"a".repeat(500)}`).startsWith("http://h/"),
    ],
    ["", true],
  );
  const emojiPrompt = normalizeGatePrompt("😀".repeat(GATE_PROMPT_MAX + 3));
  eq(
    "提示词按码点截断，代理对不会被劈成半个字符",
    [Array.from(emojiPrompt).length, emojiPrompt.includes("\uFFFD")],
    [GATE_PROMPT_MAX, false],
  );
  check(
    "截断后没有落单的代理项（否则 JSON 序列化会把它换成问号）",
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emojiPrompt),
  );
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

  eq(
    "四行记录 / 第一个事件名 / before-start 记了 prompt 长度 / 同一会话第二次计数为 2 / payload 里数出 messages / payload 顶层键 / gate 事件名 / gate 记了查询长度 / gate 记了查询头部 / gate 记了原因",
    [lines.length, lines[0].event, lines[0].shape.promptChars, lines[2].count, lines[1].shape.messageCount, lines[1].shape.payloadKeys, lines[3].event, lines[3].shape.queryChars, lines[3].shape.queryHead, lines[3].shape.reason],
    [4, "agent/before-start", 8, 2, 2, ["system", "messages"], "recall/gate-skip", 4, "运行测试", "short-operation-command"],
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= inject/plan =================
{
  const block = "<openviking-memory>\npeer mbp-hanako 说：周三要交稿\n</openviking-memory>";

  eq(
    "stripInjected 去掉注入块 / stripInjected 对纯文本不动 / stripInjected 对非字符串给空串",
    [stripInjected(`${block}\n\n这条怎么改？`), stripInjected("纯文本"), stripInjected(null)],
    ["这条怎么改？", "纯文本", ""],
  );

  const payloadString = {
    model: "x",
    system: "sys",
    messages: [
      { role: "user", content: "第一句" },
      { role: "assistant", content: "答复" },
      { role: "user", content: "第二句" },
    ],
  };

  eq(
    "lastUserText 取最后一条用户消息 / lastUserText 会剥掉既往注入",
    [lastUserText(payloadString), lastUserText({ messages: [{ role: "user", content: `${block}\n\n原话` }] })],
    ["第二句", "原话"],
  );

  // ---- context 查询：去重 / 3 条上限 / 300 字截断方向 / 空退回 last ----
  eq(
    "context 最多拼 3 条 / context 总长上限 300",
    [CONTEXT_MESSAGES_MAX, CONTEXT_CHARS_MAX],
    [3, 300],
  );

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
    "查询模式（没有用户文本给空 / 拼不出东西退回 last / 单条与 last 一致 / last 只用最后一句 / 不认识的模式按 last）",
    [
      contextQuery({ messages: [{ role: "assistant", content: "嗯" }] }),
      recallQuery({ messages: [{ role: "assistant", content: "嗯" }] }, "context"),
      recallQuery({ messages: [{ role: "user", content: "只有一句" }] }, "context"),
      recallQuery({ messages: [{ role: "user", content: "第一句" }, { role: "user", content: "最后一句" }] }, "last"),
      recallQuery({ messages: [{ role: "user", content: "第一句" }, { role: "user", content: "最后一句" }] }, "bogus"),
    ],
    ["", "", "只有一句", "最后一句", "最后一句"],
  );

  const injected = injectMemory(payloadString, block);
  check(
    "injectMemory：返回新对象、不改原 payload、条数不变、记忆块在用户消息前、原话仍在末尾、system 未动",
    injected !== null && payloadString.messages[2].content === "第二句" &&
      injected.messages.length === 3 &&
      injected.messages[2].content.startsWith("<openviking-memory>") &&
      injected.messages[2].content.endsWith("第二句") &&
      injected.system === "sys",
  );

  const partsPayload = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "用 parts 的" }] },
    ],
  };
  const partsInjected = injectMemory(partsPayload, block);
  eq(
    "parts 形态也能注，且不新增 part / 没有 messages / 没有用户消息都返回 null",
    [[partsInjected?.messages[0].parts[0].text.startsWith("<openviking-memory>"), partsInjected.messages[0].parts.length], [injectMemory({ model: "x" }, block), injectMemory({ messages: [{ role: "assistant" }] }, block)]],
    [[true, 1], [null, null]],
  );

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
  eq(
    "find 命中数 / find 带出 name / find 走 skills/find",
    [foundBody.count, foundBody.skills[0].name, calls[0].url],
    [1, "pdf-table", "http://h:1/api/v1/skills/find"],
  );

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
  eq(
    "新会话无覆盖值 / 新会话召回计数为 0",
    [empty.overrides, empty.recall.turns],
    [{}, 0],
  );

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
  eq(
    "覆盖后只读生效 / 未覆盖的跟随全局",
    [merged.readOnly, merged.autoRecall],
    [true, true],
  );
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
    "sessionKeyOf: 路径取文件名里的 uuid / sessionKeyOf: 已经是 key 就原样 / sessionKeyOf: sess_ 稳定 id 映射不到 / sessionKeyOf: 空串 / sessionKeyOf: 非字符串 / sessionKeyOf: 反斜杠路径也认",
    [sessionKeyOf("/a/agents/blueflower/sessions/2026-01-01T00-00-00-000Z_01a1585b-86d2.jsonl"), sessionKeyOf("01a1585b-86d2"), sessionKeyOf("sess_0mvgejpps_97df7c693a452f408c2c"), sessionKeyOf(""), sessionKeyOf(null), sessionKeyOf("C:\\a\\agents\\x\\sessions\\2026-01-01T00-00-00-000Z_01a1585b-86d2.jsonl")],
    ["01a1585b-86d2", "01a1585b-86d2", "", "", "", "01a1585b-86d2"],
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
    "sessionKeyOf: 非 uuid 形态的路径不再当 key / sessionKeyOf: 任意字符串不造 key",
    [sessionKeyOf("/a/agents/x/sessions/abc-123.jsonl"), sessionKeyOf("foo")],
    ["", ""],
  );
  // 这条是本次收紧要堵的原始症状：以前 basename 是 passwd，会在 sessions 里建文件。
  eq(
    "sessionKeyOf: 路径穿越不落地 / sessionKeyOf: 子会话路径同样取 basename",
    [sessionKeyOf("../../etc/passwd"), sessionKeyOf("/a/agents/x/subagent-sessions/direct/01a1585b-86d2-7c64-b8ac-edbe7099d0a1.jsonl")],
    ["", "01a1585b-86d2-7c64-b8ac-edbe7099d0a1"],
  );

  // 前端 sessionKeyOf(active) 吃整个 getActive() 快照：key 取 sessionPath，不吃 sessionId。
  const active = {
    sessionId: "sess_0mvgejpps_97df7c693a452f408c2c",
    sessionPath: "/Users/u/.hanako/agents/blueflower/sessions/2026-10-20T08-09-15-730Z_01a1585b-86d2-7c64-b8ac-edbe7099d0a1.jsonl",
    title: "一段对话",
    agentId: "blueflower",
  };
  eq(
    "前端与后端算出同一个 key / 前端 key 落地形态 / 前端拿不到 sessionPath 时不编 key / 前端 null 快照不炸",
    [uiSessionKeyOf(active), uiSessionKeyOf(active), uiSessionKeyOf({ sessionId: "sess_x" }), uiSessionKeyOf(null)],
    [sessionKeyOf(active.sessionPath), "01a1585b-86d2-7c64-b8ac-edbe7099d0a1", "", ""],
  );
  // 前端与后端必须是同一条规则：非 uuid 形态一致给空串。
  eq(
    "前端与后端对 foo 一致 / 前端与后端对路径穿越一致 / 前端 +08-00 形态与后端剥出同一个 key",
    [uiSessionKeyOf({ sessionPath: "foo" }), uiSessionKeyOf({ sessionPath: "../../etc/passwd" }), uiSessionKeyOf({
      sessionPath: "/a/agents/x/sessions/2026-01-01T00-00-00-000+08-00_01a1585b-86d2.jsonl",
    })],
    ["", "", sessionKeyOf("/a/agents/x/sessions/2026-01-01T00-00-00-000+08-00_01a1585b-86d2.jsonl")],
  );

  // hook 侧不用改：invocation.session.sessionId 就是路径里的 uuid。这条断言锁住
  // "换 key 规则不会让 agentDir 的写入落到另一份文件上"。
  const hookDir = path.join(import.meta.dirname, ".tmp-key-agree");
  fs.rmSync(hookDir, { recursive: true, force: true });
  const hookSessionId = "01a1585b-86d2-7c64-b8ac-edbe7099d0a1";
  touchSession(hookDir, hookSessionId, agentDirFromSessionPath(active.sessionPath));
  eq(
    "hook 写入的身份能被路径查询读到 / 状态文件名就是 hook 的 sessionId",
    [readSession(hookDir, sessionKeyOf(active.sessionPath)).agentDir, fs.readdirSync(path.join(hookDir, "sessions"))],
    ["blueflower", [`${hookSessionId}.json`]],
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
  check(
    "中文前缀被拒 400、理由讲清可用字符、且不落库",
    chinese.status === 400 && String(chinese.body.error).includes("字母、数字和连字符") && writes.length === 0,
    chinese.body.error,
  );

  const tooLong = await post({ peerPrefix: "a".repeat(33) });
  eq("超长前缀被拒 400 且不落库", [tooLong.status, writes.length], [400, 0]);

  // 同一次提交里的其他字段也不能先一步落库。
  const mixed = await post({ serverUrl: "http://h:9", peerPrefix: "主力机", apiKey: "k" });
  eq("一处不合法就整单被拒，同单其他字段也不落库",
    [mixed.status, writes.length, store.serverUrl], [400, 0, undefined]);

  const normalized = await post({ peerPrefix: " My MBP " });
  eq("归一化后再落库（回显与落库都是归一化后的值）",
    [normalized.body.peerPrefix, store.peerPrefix], ["my-mbp", "my-mbp"]);

  const trailing = await post({ peerPrefix: "mbp-" });
  eq("尾部连字符去掉", trailing.body.peerPrefix, "mbp");

  const cleared = await post({ peerPrefix: "" });
  eq("空串表示清除前缀，且照常落库", [cleared.body.peerPrefix, store.peerPrefix], ["", ""]);

  // ---- 存量脏前缀：未变化就放行，改成另一个脏值则整单拒 ----
  const getConn = () => handlers["GET /conn"]({ json: (payload, status) => ({ body: payload, status }) });

  store.peerPrefix = "主力机";
  writes.length = 0;

  const keepDirty = await post({ serverUrl: "http://h:7", peerPrefix: "主力机" });
  check(
    "未变化的脏前缀不阻断整单：serverUrl 照常落库、脏前缀原样留着且不被写回、applied 不声称改了前缀",
    keepDirty.status === 200 && store.serverUrl === "http://h:7" && store.peerPrefix === "主力机" &&
      !writes.some(([key]) => key === "peerPrefix") && keepDirty.body.applied?.includes("peerPrefix") === false,
    JSON.stringify(writes),
  );

  writes.length = 0;
  const dirtyToDirty = await post({ peerPrefix: "主力机2" });
  eq("改成另一个脏值仍被拒、零写入、旧脏值没被改掉",
    [dirtyToDirty.status, writes.length, store.peerPrefix], [400, 0, "主力机"]);

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
  eq(
    "GET 缺省时都是默认值（off / last / off / 空提示词 / 决策那份是默认问法 / 空模型）",
    [
      defaults.body.recallGate,
      defaults.body.queryMode,
      defaults.body.rerank,
      defaults.body.rerankPrompt,
      defaults.body.gateDecisionPrompt,
      defaults.body.rerankModel,
    ],
    ["off", "last", "off", "", DEFAULT_GATE_DECISION_PROMPT, ""],
  );

  store.recallGate = "bogus";
  store.queryMode = 3;
  const dirty = await get();
  eq("GET 把存量非法值收敛成默认值", [dirty.body.recallGate, dirty.body.queryMode], ["off", "last"]);

  const saved = await post({ recallGate: "rules", queryMode: "context" });
  eq(
    "合法值落库 / applied 列出两个键 / POST 回显当前值",
    [[store.recallGate, store.queryMode], saved.body.applied, [saved.body.recallGate, saved.body.queryMode]],
    [["rules", "context"], ["recallGate", "queryMode"], ["rules", "context"]],
  );

  // 整单校验：一非法就 400，且一个键都不写（同一单里的合法键也不能先落库）。
  writes.length = 0;
  const bad = await post({ recallGate: "on", queryMode: "context" });
  const badType = await post({ queryMode: 1 });
  eq("非法值 / 类型不对整单被拒，且零写入（另一个键也没改）",
    [bad.status, badType.status, writes.length, store.queryMode],
    [400, 400, 0, "context"]);

  const partial = await post({ queryMode: "last" });
  eq(
    "只提交一个键也能改 / 另一个键保持原值",
    [partial.status, store.recallGate],
    [200, "rules"],
  );

  // ---- decision 档：写入口认这第四档，且不要求 gatePrompt / gateModel ----
  // 第四档要有判据来源才有意义，所以先把决策服务配上（成对）。
  await post({
    systemoneServiceUrl: "http://127.0.0.1:8097",
    systemoneServiceModel: "kev-4b",
  });
  writes.length = 0;
  const decision = await post({ recallGate: "decision" });
  eq(
    "recallGate=decision 能落库（服务配好时枚举多了第四档），不要求 gatePrompt 与 gateModel",
    [decision.status, store.recallGate, decision.body.gatePrompt, decision.body.gateModel, writes.length],
    [200, "decision", "", "", 1],
  );

  // ---- 第四档的落库口径：服务没配 → 落库前就回退 off，并记进 applied ----
  writes.length = 0;
  const unconfiguredDecision = await post({
    recallGate: "decision",
    systemoneServiceUrl: "",
    systemoneServiceModel: "",
  });
  eq(
    "POST 把 recallGate 写成 decision 而决策服务同一单被清空：落库是 off、applied 里也有它（没有「存 decision 显示 off」）",
    [
      unconfiguredDecision.status,
      store.recallGate,
      unconfiguredDecision.body.recallGate,
      unconfiguredDecision.body.applied.includes("recallGate"),
    ],
    [200, "off", "off", true],
  );

  writes.length = 0;
  const halfConfiguredDecision = await post({
    recallGate: "decision",
    systemoneServiceUrl: "http://127.0.0.1:8097",
  });
  eq(
    "只填一半地址（缺模型）整单被拒 400：decision 不会落库，也不留下半对配置",
    [halfConfiguredDecision.status, store.recallGate, store.systemoneServiceUrl, store.systemoneServiceModel],
    [400, "off", "", ""],
  );

  // 已存 decision、服务被清空：同一单里把档位改回 off（状态不许自相矛盾）。
  await post({ systemoneServiceUrl: "http://127.0.0.1:8097", systemoneServiceModel: "kev-4b" });
  await post({ recallGate: "decision" });
  writes.length = 0;
  const clearedService = await post({ systemoneServiceUrl: "", systemoneServiceModel: "" });
  eq(
    "已选 decision 但这一单把服务清空：档位跟着回退并落库为 off",
    [clearedService.status, store.recallGate, clearedService.body.recallGate],
    [200, "off", "off"],
  );

  // ---- llm 档与提示词 / 判断模型 ----
  writes.length = 0;
  const llm = await post({
    recallGate: "llm",
    gatePrompt: "自定义提示词",
    gateModel: "",
  });
  eq(
    "llm 档可写：档位 / 提示词落库，空模型 = 默认通道，GET 照原样回显",
    [store.recallGate, store.gatePrompt, store.gateModel, llm.body.gatePrompt, llm.body.gateModel],
    ["llm", "自定义提示词", "", "自定义提示词", ""],
  );

  writes.length = 0;
  const custom = await post({ gateModel: "  p1/m1  " });
  eq(
    "模型标识落库 / 回显也去空白",
    [store.gateModel, custom.body.gateModel],
    ["p1/m1", "p1/m1"],
  );

  // 模型标识的形状校验：缺 provider / 缺 model / 类型不对，三种都 400 且零写入。
  writes.length = 0;
  const badRef = await post({ gateModel: "m1" });
  const badRef2 = await post({ gateModel: "p1/" });
  const badRefType = await post({ gateModel: 7 });
  eq("模型标识三种坏形状都 400、零写入，被拒后旧值还在",
    [badRef.status, badRef2.status, badRefType.status, writes.length, store.gateModel],
    [400, 400, 400, 0, "p1/m1"]);

  // 旧键彻底不认：提交它们不该被当成合法写入。
  writes.length = 0;
  await post({ gateModelMode: "custom", gateProvider: "p9" });
  eq("旧键不再落库", writes.length, 0);

  writes.length = 0;
  const longPrompt = await post({ gatePrompt: "字".repeat(GATE_PROMPT_MAX + 1) });
  const badPrompt = await post({ gatePrompt: 1 });
  eq("超长 / 类型不对的提示词都 400、零写入",
    [longPrompt.status, badPrompt.status, writes.length], [400, 400, 0]);

  // ---- 决策判据是独立一份：分开存、分开提交，改一份不动另一份 ----
  writes.length = 0;
  const decisionPrompt = await post({ gateDecisionPrompt: "先查历史吗：{{message}}" });
  eq(
    "gateDecisionPrompt 可写：落库与回显都是原值 / 同一单里 gatePrompt 一个字节都没动",
    [
      decisionPrompt.status,
      store.gateDecisionPrompt,
      decisionPrompt.body.gateDecisionPrompt,
      store.gatePrompt,
      decisionPrompt.body.gatePrompt,
    ],
    [200, "先查历史吗：{{message}}", "先查历史吗：{{message}}", "自定义提示词", "自定义提示词"],
  );

  writes.length = 0;
  const promptBack = await post({ gatePrompt: "语言模型那份改回来" });
  eq(
    "改 gatePrompt 不动 gateDecisionPrompt（两份互不影响）",
    [promptBack.status, store.gatePrompt, store.gateDecisionPrompt],
    [200, "语言模型那份改回来", "先查历史吗：{{message}}"],
  );

  writes.length = 0;
  const longDecisionPrompt = await post({ gateDecisionPrompt: "字".repeat(GATE_PROMPT_MAX + 1) });
  const badDecisionPrompt = await post({ gateDecisionPrompt: 1 });
  eq("决策提示词超长 / 类型不对都 400、零写入",
    [longDecisionPrompt.status, badDecisionPrompt.status, writes.length, store.gateDecisionPrompt],
    [400, 400, 0, "先查历史吗：{{message}}"]);

  writes.length = 0;
  const clearedDecisionPrompt = await post({ gateDecisionPrompt: "" });
  eq(
    "决策提示词可以清空（空 = 没有判据，照常召回），清空也不影响 gatePrompt",
    [clearedDecisionPrompt.status, store.gateDecisionPrompt, clearedDecisionPrompt.body.gateDecisionPrompt, store.gatePrompt],
    [200, "", "", "语言模型那份改回来"],
  );

  // ---- 服务端投影与运行时 / 面板同一判据：存着 decision 但服务没配 → off ----
  {
    const savedGate = store.recallGate;
    store.recallGate = "decision";
    store.systemoneServiceUrl = "";
    store.systemoneServiceModel = "";
    const unconfiguredView = await get();
    store.systemoneServiceUrl = "http://127.0.0.1:8097";
    store.systemoneServiceModel = "kev-4b";
    const configuredView = await get();
    store.recallGate = savedGate;
    store.systemoneServiceUrl = "";
    store.systemoneServiceModel = "";
    eq(
      "已选 decision 但服务被清空：settings / 路由 GET / 面板投影三处同值 off；服务配好三处同值 decision",
      [
        resolveRecallGate("decision", {}),
        unconfiguredView.body.recallGate,
        paintLayers({ recallGate: "decision" }).recallGate,
        resolveRecallGate("decision", {
          systemoneServiceUrl: "http://127.0.0.1:8097",
          systemoneServiceModel: "kev-4b",
        }),
        configuredView.body.recallGate,
        paintLayers({
          recallGate: "decision",
          systemoneServiceUrl: "http://127.0.0.1:8097",
          systemoneServiceModel: "kev-4b",
        }).recallGate,
      ],
      ["off", "off", "off", "decision", "decision", "decision"],
    );
  }

  // ---- 结果重排：开关 / 提示词 / 模型三个字段 ---------
  writes.length = 0;
  const rerankOk = await post({
    rerank: "llm",
    rerankPrompt: "重排模板 {{message}} {{candidates}}",
    rerankModel: "" ,
  });
  const rerankStored = ["llm", "重排模板 {{message}} {{candidates}}", ""];
  eq(
    "重排档可写：档位 / 提示词落库，空模型 = 默认通道，GET 照原样回显",
    [
      store.rerank,
      store.rerankPrompt,
      store.rerankModel,
      [rerankOk.body.rerank, rerankOk.body.rerankPrompt, rerankOk.body.rerankModel],
    ],
    [...rerankStored, rerankStored],
  );

  // 重排的四种坏输入（枚举外 / 超长提示词 / 提示词类型 / 模型缺 provider）：400 且零写入。
  writes.length = 0;
  const badRerank = await post({ rerank: "rules" });
  const badRerankPrompt = await post({ rerankPrompt: "字".repeat(RERANK_PROMPT_MAX + 1) });
  const badRerankPromptType = await post({ rerankPrompt: 1 });
  const badRerankRef = await post({ rerankModel: "m1" });
  eq("重排四种坏输入都 400、零写入，被拒后旧 rerank 还在",
    [badRerank.status, badRerankPrompt.status, badRerankPromptType.status, badRerankRef.status, writes.length, store.rerank],
    [400, 400, 400, 400, 0, "llm"]);

  writes.length = 0;
  const rerankRef = await post({ rerankModel: "  p2/m2  " });
  eq(
    "重排模型标识落库 / 重排模型回显也去空白",
    [store.rerankModel, rerankRef.body.rerankModel],
    ["p2/m2", "p2/m2"],
  );

  // 整单校验：重排字段不合法时，同一单里的合法字段也不能落库。
  writes.length = 0;
  const rerankMixed = await post({ rerank: "llm", rerankModel: "bad" });
  eq(
    "重排整单被拒 / 重排整单被拒时零写入",
    [rerankMixed.status, writes.length],
    [400, 0],
  );

  // 只改别的键不该被存量模型配置连坐。
  store.gateModel = "p1/m1";
  const untouched = await post({ queryMode: "context" });
  eq(
    "只改 queryMode 不受模型配置影响 / 模型配置原样还在",
    [untouched.status, store.gateModel],
    [200, "p1/m1"],
  );

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
    systemoneServiceUrl: "http://127.0.0.1:8097",
    systemoneServiceModel: "  kev-4b  ",
  });
  const servicesEcho = ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "http://127.0.0.1:8097", "kev-4b"];
  eq(
    "服务四字段可写：落库去尾斜杠 / 去空白，GET 回显同样的四个值",
    [
      servicesOk.status,
      store.rerankServiceUrl,
      store.systemoneServiceModel,
      [servicesOk.body.rerankServiceUrl, servicesOk.body.rerankServiceModel, servicesOk.body.systemoneServiceUrl, servicesOk.body.systemoneServiceModel],
    ],
    [200, "http://127.0.0.1:8098", "kev-4b", servicesEcho],
  );
  check("applied 列出服务字段",
    ["rerankServiceUrl", "rerankServiceModel", "systemoneServiceUrl", "systemoneServiceModel"]
      .every((key) => asList(servicesOk.body.applied).includes(key)));

  // 服务字段的六种坏输入：全部 400 + 零写入，且不会静默清空旧值。
  writes.length = 0;
  const badServices = [
    await post({ rerankServiceUrl: "ftp://nope", rerank: "llm" }),
    await post({ systemoneServiceUrl: "127.0.0.1:8097" }),
    await post({ rerankServiceUrl: 8098 }),
    await post({ rerankServiceModel: "m".repeat(SERVICE_MODEL_MAX + 1) }),
    await post({ systemoneServiceModel: 1 }),
    await post({ rerankServiceModel: "a\u0000b" }),
  ];
  eq("服务字段六种坏输入（非 http(s) / 缺协议 / 类型不对 / 超长 / 控制字符）都 400、零写入",
    [badServices.map((res) => res.status), writes.length, store.rerankServiceUrl],
    [Array(6).fill(400), 0, "http://127.0.0.1:8098"]);

  writes.length = 0;
  const emptyService = await post({ rerankServiceUrl: "", rerankServiceModel: "" });
  eq(
    "服务可以清空 / 清空后落库为空串",
    [emptyService.status, [store.rerankServiceUrl, store.rerankServiceModel]],
    [200, ["", ""]],
  );

  // ---- 精排通道的读写与整单校验 ----
  eq("GET 缺省时通道为空数组", (await get()).body.rerankChannels, []);

  writes.length = 0;
  const channelJson = JSON.stringify([
    { type: "rerank", name: "r", url: "http://h:1/", model: "m", weight: 2, enabled: true },
    { type: "model", name: "host", model: "", enabled: false },
  ]);
  const channelsOk = await post({ rerankChannels: channelJson });
  eq(
    "通道 JSON 可写：落库仍是 JSON 串、落库时重算形状并去尾斜杠，回显是数组",
    [
      channelsOk.status,
      typeof store.rerankChannels,
      [JSON.parse(store.rerankChannels).length, JSON.parse(store.rerankChannels)[0].url],
      asList(channelsOk.body.rerankChannels).length,
    ],
    [200, "string", [2, "http://h:1"], 2],
  );
  check("applied 列出 rerankChannels", asList(channelsOk.body.applied).includes("rerankChannels"));

  // 通道 JSON 的三种坏形状：坏 JSON / 不是字符串 / 不是数组。
  writes.length = 0;
  const badChannels = [
    await post({ rerankChannels: "{oops" }),
    await post({ rerankChannels: 1 }),
    await post({ rerankChannels: '{"type":"model"}' }),
  ];
  eq("通道三种坏形状（坏 JSON / 不是字符串 / 不是数组）都 400、零写入",
    [badChannels.map((res) => res.status), writes.length], [Array(3).fill(400), 0]);

  writes.length = 0;
  const badChannelsItem = await post({
    rerankChannels: JSON.stringify([{ type: "rerank", url: "ftp://h" }]),
  });
  eq(
    "通道 URL 非法 400 / 通道 URL 非法零写入",
    [badChannelsItem.status, writes.length],
    [400, 0],
  );

  writes.length = 0;
  const typeOnlyChannels = await post({
    rerankChannels: JSON.stringify([{ type: "rerank" }, { type: "systemone" }]),
  });
  eq(
    "只写类型的通道可写（端点走打分服务） / 只写类型的通道落库 / 只写类型的通道 url / model 为空",
    [typeOnlyChannels.status, JSON.parse(store.rerankChannels).length, [
      JSON.parse(store.rerankChannels)[0].url,
      JSON.parse(store.rerankChannels)[0].model,
    ]],
    [200, 2, ["", ""]],
  );

  writes.length = 0;
  const tooManyChannels = await post({
    rerankChannels: JSON.stringify(
      Array.from({ length: RERANK_CHANNELS_MAX + 1 }, () => ({ type: "model", model: "" })),
    ),
  });
  eq(
    "通道超过 8 路 400 / 通道超过 8 路零写入",
    [tooManyChannels.status, writes.length],
    [400, 0],
  );

  writes.length = 0;
  const clearedChannels = await post({ rerankChannels: "" });
  eq(
    "空串清空通道 / 清空后落库为空串 / 清空后回显空数组",
    [clearedChannels.status, store.rerankChannels, clearedChannels.body.rerankChannels],
    [200, "", []],
  );

  // ---- 地址与模型成对：有地址无模型 400、零写入 ----
  writes.length = 0;
  const urlOnly = await post({ rerankServiceUrl: "http://127.0.0.1:8098" });
  check(
    "有地址无模型 400、零写入、理由写明配了地址就要填模型名",
    urlOnly.status === 400 && writes.length === 0 && (store.rerankServiceUrl ?? "") === "" &&
      String(urlOnly.body.error || "").includes("配了地址就要填模型名"),
    `${urlOnly.status} / ${writes.length} / ${urlOnly.body.error}`,
  );

  // 只给模型、不给地址同样拒绝：孤立的模型名运行时会整对回退静默忽略。
  store.systemoneServiceUrl = "";
  writes.length = 0;
  const modelOnly = await post({ systemoneServiceModel: "isolated-model" });
  eq(
    "只给模型不给地址也 400、零写入，理由写明配了模型名就要填地址",
    [modelOnly.status, writes.length, modelOnly.body.error, store.systemoneServiceModel],
    [400, 0, "systemoneServiceUrl 配了模型名就要填地址", "kev-4b"],
  );

  // 地址与模型要一次成对提交，服务端不会停在半对上。
  writes.length = 0;
  const oneShot = await post({
    rerankServiceUrl: "http://127.0.0.1:8098",
    rerankServiceModel: "bge-reranker-v2-m3",
  });
  eq(
    "一次提交成对写入（服务端不会停在半对上）",
    [oneShot.status, store.rerankServiceUrl, store.rerankServiceModel],
    [200, "http://127.0.0.1:8098", "bge-reranker-v2-m3"],
  );

  // 存量里已经有「有地址缺模型」时，改别的键不能被连坐。
  store.systemoneServiceUrl = "http://127.0.0.1:8097";
  store.systemoneServiceModel = "";
  writes.length = 0;
  const otherKey = await post({ queryMode: "last" });
  eq("没动那一对时不被存量老配置连坐", otherKey.status, 200);
  store.systemoneServiceUrl = "";

  // 清空时两个一起清。
  writes.length = 0;
  const clearedPair = await post({ rerankServiceUrl: "", rerankServiceModel: "" });
  eq("成对清空（两个都是空串）",
    [clearedPair.status, store.rerankServiceUrl, store.rerankServiceModel],
    [200, "", ""]);

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
  eq(
    "超时可写：落库成数字串、GET 回显为数字",
    [
      timeoutOk.status,
      [store.rerankServiceTimeoutMs, store.systemoneServiceTimeoutMs],
      [timeoutOk.body.rerankServiceTimeoutMs, timeoutOk.body.systemoneServiceTimeoutMs],
    ],
    [200, ["1200", "2000"], [1200, 2000]],
  );
  check(
    "applied 列出超时字段",
    asList(timeoutOk.body.applied).includes("rerankServiceTimeoutMs") &&
      asList(timeoutOk.body.applied).includes("systemoneServiceTimeoutMs"),
  );

  writes.length = 0;
  const timeoutOutOfRange = await post({ rerankServiceTimeoutMs: "99999" });
  eq(
    "超时越界不报错，落库为空串（= 回默认值），GET 回 null",
    [timeoutOutOfRange.status, store.rerankServiceTimeoutMs, timeoutOutOfRange.body.rerankServiceTimeoutMs],
    [200, "", null],
  );

  // systemone 上限 8000：9000 按越界回退成空串，不夹到 8000。
  writes.length = 0;
  const systemoneTooHigh = await post({ systemoneServiceTimeoutMs: "9000" });
  eq(
    "决策超时 9000 越界（上限 8000）：不报错、回退空串、GET 回 null",
    [systemoneTooHigh.status, store.systemoneServiceTimeoutMs, systemoneTooHigh.body.systemoneServiceTimeoutMs],
    [200, "", null],
  );

  writes.length = 0;
  const systemoneAtLimit = await post({ systemoneServiceTimeoutMs: "8000" });
  eq("决策超时正好 8000 可写（边界值不越界）",
    [systemoneAtLimit.status, store.systemoneServiceTimeoutMs], [200, "8000"]);

  writes.length = 0;
  const timeoutNumeric = await post({ systemoneServiceTimeoutMs: "abc" });
  eq("非数字超时不报错，也不留在配置里",
    [timeoutNumeric.status, store.systemoneServiceTimeoutMs], [200, ""]);

  writes.length = 0;
  const timeoutBadType = await post({ rerankServiceTimeoutMs: { ms: 1200 } });
  eq("超时类型不对（对象）400 且零写入", [timeoutBadType.status, writes.length], [400, 0]);

  // 面板清空那一格时发的是 null（归一化之后的形状），不能当成类型错。
  writes.length = 0;
  const timeoutCleared = await post({ rerankServiceTimeoutMs: null });
  eq(
    "null = 清空这一格（落库空串，GET 回 null）",
    [timeoutCleared.status, store.rerankServiceTimeoutMs, timeoutCleared.body.rerankServiceTimeoutMs],
    [200, "", null],
  );

  // ---- 打分服务密钥：GET 只回掩码，POST 三条保存规则 ----
  eq(
    "GET 缺省时两个密钥都是未填、掩码为空",
    await get().then((res) => [
      res.body.rerankServiceKeySet,
      res.body.rerankServiceKeyMasked,
      res.body.systemoneServiceKeySet,
      res.body.systemoneServiceKeyMasked,
    ]),
    [false, "", false, ""],
  );

  writes.length = 0;
  const keySet = await post({
    rerankServiceKey: "  sk-abcdef1234567890  ",
    systemoneServiceKey: "sk-abc123",
  });
  eq(
    "密钥可写：落库去空白，短密钥也照存 / GET 只回 Set + 掩码，不回明文",
    [[keySet.status, store.rerankServiceKey, store.systemoneServiceKey], [
      keySet.body.rerankServiceKeySet,
      keySet.body.rerankServiceKeyMasked,
      keySet.body.rerankServiceKey,
      keySet.body.systemoneServiceKeyMasked,
    ]],
    [[200, "sk-abcdef1234567890", "sk-abc123"], [true, "sk-a••••••••7890", undefined, "••••••••c123"]],
  );
  check("applied 列出密钥字段",
    asList(keySet.body.applied).includes("rerankServiceKey") &&
      asList(keySet.body.applied).includes("systemoneServiceKey"));
  // 上面的 eq 只看「值是 undefined」；这里再钉一遍「连这个键都没有」——
  // 将来谁把 current() 改成展开整份配置，值可能是 undefined 而键还在。
  check(
    "GET 回包里没有明文密钥字段（不是空值，是不存在）",
    !("rerankServiceKey" in keySet.body) && !("systemoneServiceKey" in keySet.body),
    JSON.stringify(Object.keys(keySet.body)),
  );

  // 1) 字段缺省：一个都不动。
  writes.length = 0;
  const keyAbsent = await post({ queryMode: "context" });
  eq(
    "缺省密钥字段不报错：不进 applied、一个都不写、旧密钥还在",
    [
      keyAbsent.status,
      keyAbsent.body.applied?.includes("rerankServiceKey") ||
        keyAbsent.body.applied?.includes("systemoneServiceKey"),
      writes.some(([key]) => key === "rerankServiceKey" || key === "systemoneServiceKey"),
      [store.rerankServiceKey, store.systemoneServiceKey],
    ],
    [200, false, false, ["sk-abcdef1234567890", "sk-abc123"]],
  );

  // 2) 等于当前掩码：视为没改（面板整单提交，没动过的格子带回来的就是掩码）。
  writes.length = 0;
  const keyMasked = await post({
    rerankServiceKey: "sk-a••••••••7890",
    systemoneServiceKey: "••••••••c123",
  });
  eq(
    "提交当前掩码 = 没改：不报错、零写入、掩码不会被存成真 key",
    [keyMasked.status, writes.length, store.rerankServiceKey],
    [200, 0, "sk-abcdef1234567890"],
  );

  // 3) 空串：明确要删。
  writes.length = 0;
  const keyCleared = await post({ rerankServiceKey: "" });
  eq(
    "空串 = 明确要删：落库空串、GET 说没填、只动这一个键",
    [
      keyCleared.status,
      store.rerankServiceKey,
      [keyCleared.body.rerankServiceKeySet, keyCleared.body.rerankServiceKeyMasked],
      store.systemoneServiceKey,
    ],
    [200, "", [false, ""], "sk-abc123"],
  );

  // 只有空白的串也是「删」，不是「存一串空格」。
  writes.length = 0;
  await post({ rerankServiceKey: "   " });
  eq("纯空白当清空", store.rerankServiceKey, "");

  // 4) 非法（带换行 / 非字符串）：丢弃、保留原值、不打断整单。
  await post({ rerankServiceKey: "sk-keep-123456" });
  writes.length = 0;
  const keyNewline = await post({ rerankServiceKey: "sk-abc\ndef", queryMode: "last" });
  check(
    "带换行的密钥：整单不被打断、密钥整条丢弃保留原值、同一单其它字段照常落库",
    keyNewline.status === 200 && store.rerankServiceKey === "sk-keep-123456" &&
      asList(keyNewline.body.applied).includes("queryMode"),
    `${keyNewline.status} / ${store.rerankServiceKey}`,
  );

  writes.length = 0;
  await post({ systemoneServiceKey: "sk-before" });
  const keyCarriage = await post({ systemoneServiceKey: "sk-before\r\nX-Injected: 1" });
  eq("带 \\r\\n 的密钥不报错且保留原值",
    [keyCarriage.status, store.systemoneServiceKey], [200, "sk-before"]);

  writes.length = 0;
  const keyBadType = await post({ rerankServiceKey: 12345 });
  eq("密钥类型不对不报错、零写入、保留原值",
    [keyBadType.status, writes.length, store.rerankServiceKey], [200, 0, "sk-keep-123456"]);

  // 超长截断到 512，不截断也不报错。
  writes.length = 0;
  await post({ rerankServiceKey: "k".repeat(SERVICE_KEY_MAX + 10) });
  eq("超长密钥截断到 512", Array.from(store.rerankServiceKey).length, SERVICE_KEY_MAX);

  // 5) 新值覆盖（两条服务各管各的）。
  writes.length = 0;
  const keyOverwrite = await post({ rerankServiceKey: "sk-new-key-9999" });
  eq(
    "新值覆盖：落库、掩码跟着变、不动另一组",
    [store.rerankServiceKey, keyOverwrite.body.rerankServiceKeyMasked, store.systemoneServiceKey],
    ["sk-new-key-9999", "sk-n••••••••9999", "sk-before"],
  );
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
  eq(
    "测试端点成功 / 测试端点回候选数 / 测试端点回每路分数 / 测试端点回标准化分 / 测试端点回合并分 / 测试端点回保留索引（标准化后的末位不丢） / 测试端点不写配置 / 测试端点走当前配置的 URL",
    [tested.body.ok, tested.body.candidates, asList(tested.body.channels)[0]?.scores, asList(tested.body.channels)[0]?.normalized, tested.body.merged, tested.body.kept, store.rerankChannels.startsWith("["), calls[0].url],
    [true, 2, [0.8, 0.1], [1, 0], [1, 0], [0, 1], true, "http://127.0.0.1:9/v1/rerank"],
  );

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
  check(
    "rerank 测试成功：给 elapsedMs 与一句话 detail，模型名取服务端返回的那个",
    rerankOk.body.ok === true && Number.isFinite(rerankOk.body.elapsedMs) &&
      rerankOk.body.model === "bge-reranker-v2-m3" &&
      typeof rerankOk.body.detail === "string" && rerankOk.body.detail.length > 0,
    JSON.stringify(rerankOk.body),
  );
  eq(
    "rerank 请求形状（POST 到 /v1/rerank、地址去尾斜杠、body 带模型 + 固定 query + 固定文档）",
    [calls[0].url, calls[0].init.method, calls[0].body.model, calls[0].body.query, calls[0].body.documents],
    ["http://127.0.0.1:8098/v1/rerank", "POST", "bge-reranker-v2-m3", "连通性测试", ["这是一条用于测试的文档"]],
  );

  // 服务端不回 model 时给 null，面板那边回退到配置里的模型名。
  respond = async () => jsonOf({ results: [{ index: 0, score: 0.1 }] });
  const rerankNoModel = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq("score 也能当成有分，服务端不回 model 时给 null",
    [rerankNoModel.body.ok, rerankNoModel.body.model], [true, null]);

  // ---- 2. rerank 结构不对：200 也不算可用 ----
  respond = async () => jsonOf({ results: [] });
  const rerankEmpty = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  check(
    "空 results 不算可用，错误写明返回结构不符合预期（并点出 results）",
    rerankEmpty.body.ok === false &&
      String(rerankEmpty.body.error).includes("返回结构不符合预期") &&
      String(rerankEmpty.body.error).includes("results"),
    rerankEmpty.body.error,
  );

  respond = async () => jsonOf({ data: [{ index: 0, relevance_score: 0.3 }] });
  const rerankWrongShape = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  respond = async () => jsonOf({ results: [{ index: 0 }] });
  const rerankNoScore = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  respond = async () => jsonOf({ error: "boom" }, 500);
  const rerank500 = await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  eq(
    "三种结构不对都不算可用（缺 results / 结果项缺分 / HTTP 500）",
    [rerankWrongShape.body.ok, rerankNoScore.body.ok, rerank500.body.ok],
    [false, false, false],
  );
  check(
    "错误信息分别点出 relevance_score 与状态码",
    String(rerankNoScore.body.error).includes("relevance_score") &&
      String(rerank500.body.error).includes("500"),
    `${rerankNoScore.body.error} | ${rerank500.body.error}`,
  );

  // ---- 3. rerank 连不上：错误原文照抄 ----
  respond = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8098");
  };
  const refused = await test({ kind: "rerank", url: "http://127.0.0.1:8098", model: "bge" });
  check(
    "连不上：不可用、错误原文保留 ECONNREFUSED、仍给 elapsedMs、不带 model 字段",
    refused.body.ok === false && String(refused.body.error).includes("ECONNREFUSED") &&
      Number.isFinite(refused.body.elapsedMs) && refused.body.model === undefined,
    `${refused.body.error} / ${refused.body.model}`,
  );

  // ---- 4. systemone 成功 ----
  calls.length = 0;
  respond = async () => jsonOf({ answers: { q: { noul: 0.83 } } });
  const systemoneOk = await test({
    kind: "systemone",
    url: "http://127.0.0.1:8097",
    model: "kev-4b",
    timeoutMs: 3500,
  });
  eq(
    "systemone 测试：可用、打到自己的端点、body 带模型 + text state + 一个 noul 问题；不回 model 时给 null",
    [
      systemoneOk.body.ok,
      calls[0].url,
      calls[0].body.model,
      calls[0].body.state,
      Object.keys(calls[0].body.questions ?? {}),
      calls[0].body.questions?.q?.type,
      systemoneOk.body.model,
    ],
    [true, "http://127.0.0.1:8097/v1/systemone", "kev-4b", { type: "text", content: "连通性测试" }, ["q"], "noul", null],
  );

  // ---- 5. systemone 结构不对 ----
  respond = async () => jsonOf({ answers: {} });
  const systemoneWrong = await test({ kind: "systemone", url: "http://h:2", model: "kev-4b" });
  check(
    "缺 answers.q 不算可用，错误写明缺 answers.q",
    systemoneWrong.body.ok === false && String(systemoneWrong.body.error).includes("answers.q"),
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
  check(
    "超时就是不可用，错误以 TIMEOUT 开头并带上限",
    timedOut.body.ok === false && /^TIMEOUT 100ms/.test(String(timedOut.body.error)),
    timedOut.body.error,
  );

  // ---- 7. 入参校验：全 400，零写入 ----
  writes.length = 0;
  const badKind = await test({ kind: "model", url: "http://h:1", model: "bge" });
  eq("kind 只认两类", badKind.status, 400);
  writes.length = 0;
  const noUrl = await test({ kind: "rerank", url: "", model: "bge" });
  const ftpUrl = await test({ kind: "rerank", url: "ftp://h", model: "bge" });
  eq("没地址 / 非 http(s) 地址都 400", [noUrl.status, ftpUrl.status], [400, 400]);
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
  eq(
    "body 不是 JSON 也 400 / 测试路由全程零写入",
    [badJson.status, writes.length],
    [400, 0],
  );

  // 请求体里的值说了算：存着的配置不影响这一单。
  store.rerankServiceUrl = "http://saved:1";
  store.rerankServiceModel = "saved-model";
  calls.length = 0;
  respond = async () => jsonOf({ results: [{ index: 0, relevance_score: 0.5 }] });
  await test({ kind: "rerank", url: "http://typed:2", model: "typed-model" });
  eq("测试用请求体里的地址与模型，不用已保存的",
    [calls[0].url, calls[0].body.model], ["http://typed:2/v1/rerank", "typed-model"]);

  // ---- 密钥：非空才加 Authorization，空就不发这个头 ----
  calls.length = 0;
  respond = async () => jsonOf({ results: [{ index: 0, relevance_score: 0.5 }] });
  await test({ kind: "rerank", url: "http://h:1", model: "bge", key: "  sk-test-1234  " });
  eq("带密钥时发 Authorization: Bearer，content-type 没被顶掉",
    [calls[0].init.headers.Authorization, calls[0].init.headers["content-type"]],
    ["Bearer sk-test-1234", "application/json"]);

  calls.length = 0;
  await test({ kind: "rerank", url: "http://h:1", model: "bge" });
  check(
    "不带密钥时请求头里没有 Authorization",
    !("Authorization" in calls[0].init.headers) && !("authorization" in calls[0].init.headers),
    JSON.stringify(calls[0].init.headers),
  );

  calls.length = 0;
  await test({ kind: "rerank", url: "http://h:1", model: "bge", key: "   " });
  check(
    "只有空白的密钥也不发 Authorization（不发空的 Bearer）",
    !("Authorization" in calls[0].init.headers),
    JSON.stringify(calls[0].init.headers),
  );

  calls.length = 0;
  await test({ kind: "systemone", url: "http://h:2", model: "kev-4b", key: "sk-sys-1234" });
  eq("systemone 那一路也带 Authorization", calls[0].init.headers.Authorization, "Bearer sk-sys-1234");

  // 掩码不是密钥：输入框里坐的若是当前掩码，就去取已存的值试一把。
  store.rerankServiceKey = "sk-stored-abcdef";
  calls.length = 0;
  await test({ kind: "rerank", url: "http://h:1", model: "bge", key: maskString(store.rerankServiceKey) });
  eq("掩码当占位时用已存的密钥", calls[0].init.headers.Authorization, "Bearer sk-stored-abcdef");

  calls.length = 0;
  await test({ kind: "rerank", url: "http://h:1", model: "bge", key: "sk-typed-9999" });
  eq("输入框里是真 key 时用输入的那个", calls[0].init.headers.Authorization, "Bearer sk-typed-9999");
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
  eq(
    "models 成功时原样透传 / models 成功时状态 200",
    [ok.body, ok.status],
    [{ ok: true, models: catalog }, 200],
  );

  mode = "throw";
  const failed = await get();
  eq(
    "models 失败时仍是 200 / models 失败时 ok 为 false",
    [failed.status, failed.body.ok],
    [200, false],
  );
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
  eq("有 agentDir 时 peer 是绑定的，来源是 session",
    [bound.body.peer, bound.body.peerSource], ["openhanako-agent-x", "session"]);

  const unbound = await getSession(UNBOUND_KEY);
  eq("没 agentDir 时 peer 为 null，来源是 unbound",
    [unbound.body.peer, unbound.body.peerSource], [null, "unbound"]);

  // mergeMemory 打开时，就算没有 agentDir 也能给出身份，但来源必须是 merged。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true }));
  const merged = await getSession(UNBOUND_KEY);
  eq("合并时 peer 带 -merged，来源是 merged",
    [merged.body.peer, merged.body.peerSource], ["openhanako-merged", "merged"]);

  // 带前缀时合并身份也带前缀。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true, peerPrefix: "mbp" }));
  const prefixed = await getSession(UNBOUND_KEY);
  eq("带前缀的合并身份", prefixed.body.peer, "mbp-openhanako-merged");

  // 合并把“是哪个助手”盖住了，但接口仍能把助手名单独带出来。
  registerSessionRoutes(app, ctxWith({ mergeMemory: true }));
  const mergedBound = await getSession(BOUND_KEY);
  eq("合并时来源仍是 merged，也能看到助手是谁",
    [mergedBound.body.peerSource, mergedBound.body.peerAgentDir], ["merged", "agent-x"]);
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
  eq("路径查询映射到同一个 key，仍能说出会话身份",
    [byPath.body.sessionId, byPath.body.peer], [BOUND_KEY, "openhanako-agent-x"]);

  const filesBefore = fs.readdirSync(path.join(dir, "sessions")).sort();
  check("先有会话状态文件", filesBefore.includes(`${BOUND_KEY}.json`));

  const bogusRead = await getSession("sess_0mvgejpps_97df7c693a452f408c2c");
  eq(
    "sess_ 形式只读：400 + ok:false + 明确原因 + 未绑定，且不建文件 / sess_ 形式的读取不建文件",
    [[bogusRead.status, bogusRead.body.ok, bogusRead.body.error, bogusRead.body.peerSource], fs.readdirSync(path.join(dir, "sessions")).sort()],
    [[400, false, "unknown session key", "unbound"], filesBefore],
  );

  const bogusWrite = await postSession("sess_0mvgejpps_97df7c693a452f408c2c", {
    overrides: { autoRecall: false },
  });
  eq(
    "sess_ 形式只写：400 + ok:false + 明确原因，且不建状态文件 / 被拒时不建状态文件",
    [[bogusWrite.status, bogusWrite.body.ok, bogusWrite.body.error], fs.readdirSync(path.join(dir, "sessions")).sort()],
    [[400, false, "unknown session key"], filesBefore],
  );

  // 形状不对的任意字符串同样不消费：400 + ok:false，且目录列表一个字节不变。
  const fooRead = await getSession("foo");
  const fooWrite = await postSession("foo", { overrides: { autoRecall: false } });
  eq(
    "非 uuid 形态的读写都 400 + ok:false + 明确原因，且一个文件都不建",
    [
      [fooRead.status, fooRead.body.ok, fooRead.body.error],
      [fooWrite.status, fooWrite.body.ok, fooWrite.body.error],
      fs.readdirSync(path.join(dir, "sessions")).sort(),
    ],
    [
      [400, false, "unknown session key"],
      [400, false, "unknown session key"],
      filesBefore,
    ],
  );

  // 路径形式的写入必须落到同一个 key 上，不能另起一份。
  const filesBeforePathWrite = fs.readdirSync(path.join(dir, "sessions")).sort();
  const pathWrite = await postSession(
    `/Users/u/.hanako/agents/agent-x/sessions/2026-10-20T08-09-15-730Z_${BOUND_KEY}.jsonl`,
    { overrides: { autoCapture: false } },
  );
  eq(
    "路径写入落到同一个 key、写的是同一份状态、且没有多出一份文件",
    [
      pathWrite.body.sessionId,
      readSession(dir, BOUND_KEY).overrides.autoCapture,
      fs.readdirSync(path.join(dir, "sessions")).sort(),
    ],
    [BOUND_KEY, false, filesBeforePathWrite],
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
  eq(
    "默认提示词全文 / 占位符字面量",
    [DEFAULT_GATE_PROMPT, GATE_MESSAGE_PLACEHOLDER],
    [expectedPrompt, "{{message}}"],
  );
  check("默认模板含 {{message}}", DEFAULT_GATE_PROMPT.includes(GATE_MESSAGE_PLACEHOLDER));
  check("默认模板以占位符结尾", DEFAULT_GATE_PROMPT.endsWith(GATE_MESSAGE_PLACEHOLDER));
  // 空提示词不再是“用默认”：没有判据就不拦。
  eq(
    "提示词为空时没有提示词 / 只有空白的提示词也算空 / 没传这个键也算空 / 自定义提示词原样用 / gate 超时 600ms / gate 只要 8 个 token",
    [gatePromptOf({ gatePrompt: "" }), gatePromptOf({ gatePrompt: "  \n " }), gatePromptOf({}), gatePromptOf({ gatePrompt: "  自定义  " }), GATE_TIMEOUT_MS, GATE_MAX_TOKENS],
    ["", "", "", "自定义", 600, 8],
  );

  // ---- 模板渲染：占位符替换 / 无占位符追加 / 空模板 / 消息里的占位符字样 ----
  eq(
    "占位符被消息替换 / 多处占位符全部替换 / 占位符在中间也替换 / 无占位符时消息接在末尾并隔一空行 / 空模板返回空串 / 非字符串模板也返回空串 / 消息里的占位符字样不被二次替换 / 消息原样插入不裁剪 / 默认模板渲染出完整提示词",
    [renderGatePrompt("判断：{{message}}", "运行测试"), renderGatePrompt("{{message}} 和 {{message}}", "运行测试"), renderGatePrompt("前 {{message}} 后", "运行测试"), renderGatePrompt("只判断", "运行测试"), renderGatePrompt("", "运行测试"), renderGatePrompt(null, "运行测试"), renderGatePrompt("判断：{{message}}", "{{message}}"), renderGatePrompt("判断：{{message}}", "  原样  "), renderGatePrompt(DEFAULT_GATE_PROMPT, "运行测试")],
    ["判断：运行测试", "运行测试 和 运行测试", "前 运行测试 后", "只判断\n\n运行测试", "", "", "判断：{{message}}", "判断：  原样  ", `${expectedPrompt.slice(0, -GATE_MESSAGE_PLACEHOLDER.length)}运行测试`],
  );

  // 顺序不能反：「不需要」里含「需要」。
  eq(
    "解析：不需要 -> 跳过 / 解析：不需要优先于需要 / 解析：需要 -> 召回 / 解析：空串安全召回 / 解析：非字符串也安全召回 / 解析：跑题安全召回",
    [gateAnswerRecalls("不需要"), gateAnswerRecalls("不需要，虽然看起来需要"), gateAnswerRecalls("需要"), gateAnswerRecalls(""), gateAnswerRecalls(null), gateAnswerRecalls("今天天气不错")],
    [false, false, true, true, true, true],
  );

  // 判据 1：trim 后长度 ≤ 8
  eq(
    "长度判据：≤8 字才算短指令（trim 后算，超过 8 字不跳过）",
    [
      isShortOperationCommand("运行测试"),
      isShortOperationCommand("  运行测试  "),
      isShortOperationCommand("重启开发服务器进程"),
    ],
    [true, true, false],
  );

  // 判据 2：不含问号
  eq("带问号（半角 / 全角）不跳过",
    [isShortOperationCommand("运行测试?"), isShortOperationCommand("运行测试？")], [false, false]);

  // 判据 3：不含疑问词
  eq("带疑问词 / 指代词都不跳过",
    ["怎么运行", "为什么", "把这个删了", "继续"].map((text) => isShortOperationCommand(text)),
    [false, false, false, false]);

  // 判据 4：不含指代词

  // 任务书里的四个举例
  eq(
    "运行测试 -> 跳过 / 把这个删了 -> 召回 / 继续 -> 召回 / 那为啥不是默认开启? -> 召回",
    [shouldSkipRecall("运行测试", "rules"), shouldSkipRecall("把这个删了", "rules"), shouldSkipRecall("继续", "rules"), shouldSkipRecall("那为啥不是默认开启?", "rules")],
    [true, false, false, false],
  );

  // ---- 口语疑问词：书面词表漏掉的那批 ----
  // 这几句都很短、也没有问号，但都是问事，必须召回；只靠「为什么/怎么」收不住它们。
  eq(
    "口语疑问词一律召回（啥 / 咋 / 为啥 / 干嘛 / 几 / 何 / 怎样 / 为什么）",
    ["啥意思", "咋办", "为啥", "干嘛呢", "几号", "如何", "怎样", "为什么"].map((text) =>
      shouldSkipRecall(text, "rules"),
    ),
    Array(8).fill(false),
  );

  // 反例：补词只能多召回，不能把真正的操作指令也放进来。
  // 这五句都是「说完就完、不指向任何东西」的短指令，仍然该跳过。
  // 反例：补词只能多召回，不能把真正的操作指令也放进来。
  eq(
    "真正的短操作指令仍然跳过（不指向任何历史内容）",
    ["运行测试", "重启一下服务", "看看日志", "嗯", "好"].map((text) => shouldSkipRecall(text, "rules")),
    Array(5).fill(true),
  );

  // 指代 / 问号本来就召回，补了口语词之后不能反过来变成跳过。
  eq(
    "指代 / 问号本来该召回，补了口语词之后不能反过来变成跳过",
    ["这啥", "它在哪", "那为啥不是默认开启?"].map((text) => shouldSkipRecall(text, "rules")),
    Array(3).fill(false),
  );

  // 词表本身：口语词确实在里面，不是靠别的判据蒙对的。
  check(
    "口语疑问词都在表里",
    ["啥", "咋", "干嘛", "干吗", "几", "何", "怎样"].every((w) => GATE_QUESTION_WORDS.includes(w)),
  );

  // off / 非法值永远不跳
  eq(
    "off 永远不跳过 / 非法 gate 也不跳过 / 空文本不跳过",
    [shouldSkipRecall("运行测试", "off"), shouldSkipRecall("运行测试", "banana"), isShortOperationCommand("   ")],
    [false, false, false],
  );
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

  eq(
    "gate 跳过时返回 undefined / gate 跳过时不发请求",
    [await handler({ payload, session }), mock.calls.length],
    [undefined, 0],
  );
  check(
    "gate 跳过时日志有一行 gate: skipped",
    infos.some((m) => m.includes("gate: skipped")),
  );
  eq("gate 跳过时探针记一次，带事件名 / 查询原文 / 原因",
    [probes.length, probes[0].event, probes[0].invocation.query, probes[0].invocation.reason],
    [1, "recall/gate-skip", "运行测试", "short-operation-command"]);

  await handler({ payload, session });
  eq("同一句第二次：不再记 gate 日志、也不再写探针",
    [infos.filter((m) => m.includes("gate: skipped")).length, probes.length], [1, 1]);

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
    eq("用例1 rules+context+短指令：跳过时不干预、请求数 0", [r, m.calls.length], [undefined, 0]);
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
    eq(
      "用例2 rules+context+指代词：照常召回、请求数 1 / 用例2 发出的查询是拼接结果",
      [[Boolean(r?.payload), m.calls.length], JSON.parse(m.calls[0].init.body).query],
      [[true, 1], joinedGate],
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
    eq("用例3 rules+last+短指令：跳过时不干预、请求数 0", [r, m.calls.length], [undefined, 0]);
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
    eq(
      "用例4 off+context+短指令：照常召回、请求数 1 / 用例4 发出的查询是拼接结果",
      [[Boolean(r?.payload), m.calls.length], JSON.parse(m.calls[0].init.body).query],
      [[true, 1], `${gateHistory[0].content}\n${gateHistory[2].content}\n重启一下服务`],
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

// ================= 召回判断：模型来源与短指令边界 =================
{
  // 两层各自的模型标识都是「空 = 宿主辅助模型」，非空才去解析。
  eq(
    "模型来源（空 = 宿主辅助模型；非空去空白；非字符串当没配）",
    [
      [gateModelOf({ gateModel: "  p/m  " }), gateModelOf({ gateModel: "" }), gateModelOf({}), gateModelOf({ gateModel: 1 })],
      [rerankModelOf({ rerankModel: " p/m " }), rerankModelOf({}), rerankModelOf({ rerankModel: null })],
    ],
    [["p/m", "", "", ""], ["p/m", "", ""]],
  );
  eq(
    "提示词来源：判断层空串 = 不拦（没有判据就不拦），重排层空串 = 用内置模板",
    [gatePromptOf({ gatePrompt: "   " }), rerankPromptOf({ rerankPrompt: "  " })],
    ["", DEFAULT_RERANK_PROMPT],
  );
  eq(
    "provider/model 解析：按第一个斜杠切，模型 id 里允许再有斜杠，缺一半回 null",
    [
      parseModelRef("p/m"),
      parseModelRef("  p  /  m  "),
      parseModelRef("p/a/b"),
      parseModelRef("m"),
      parseModelRef("/m"),
      parseModelRef("p/"),
      parseModelRef(""),
      parseModelRef(null),
    ],
    [
      { provider: "p", model: "m" },
      { provider: "p", model: "m" },
      { provider: "p", model: "a/b" },
      null,
      null,
      null,
      null,
      null,
    ],
  );
  // 词表是判据的全部：表里每个词单独出现都必须召回，不然加词等于白加。
  eq(
    "疑问词表里每个词单独出现都召回（书面词 + 口语词）",
    GATE_QUESTION_WORDS.map((word) => shouldSkipRecall(word, "rules")),
    GATE_QUESTION_WORDS.map(() => false),
  );
  eq(
    "指代词表里每个词单独出现都召回",
    ["这", "那", "它", "其", "刚才", "上次", "之前", "继续", "还", "再"].map((word) =>
      shouldSkipRecall(word, "rules"),
    ),
    Array(10).fill(false),
  );
  eq(
    "短指令边界：正好 8 字算短、9 字不算；上限可调但问号判据不变",
    [
      isShortOperationCommand("重启开发服务进程"),
      isShortOperationCommand("重启开发服务器进程"),
      isShortOperationCommand("重启开发服务器进程", 9),
      isShortOperationCommand("重启开发服务器进程？", 9),
    ],
    [true, false, true, false],
  );
  check(
    "判据可枚举：每个疑问词塞进短句里都不再算短指令",
    GATE_QUESTION_WORDS.every((word) => isShortOperationCommand(`跑${word}`) === false),
    GATE_QUESTION_WORDS.filter((word) => isShortOperationCommand(`跑${word}`)).join(", "),
  );
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
    // 空提示词已经不再回退成默认，要跑语言模型判断就得真存一份提示词。
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
    eq(
      "llm 说不需时返回 undefined / llm 说不需时不发召回 / default 走 utility / default 不走 stream",
      [result, mock.calls.length, fake.calls.utility.length, fake.calls.stream.length],
      [undefined, 0, 1, 0],
    );
    const req = fake.calls.utility[0];
    check(
      "utility requestId 非空",
      typeof req.requestId === "string" && req.requestId.length > 0,
    );
    eq(
      "utility 请求形状（scope=app / 一条 user 消息且是渲染后的默认模板 / 不传 systemPrompt / maxTokens 8 / temperature 0 / 不传 provider-model） / llm 跳过探针记一次，带 by=llm 与 reason",
      [[
        req.scope,
        [req.messages.length, req.messages[0].role],
        req.messages[0].content === renderGatePrompt(DEFAULT_GATE_PROMPT, "运行测试"),
        "systemPrompt" in req,
        [req.maxTokens, req.temperature],
        ["provider" in req, "model" in req],
      ], [probes.length, probes[0].invocation.by, probes[0].invocation.reason]],
      [["app", [1, "user"], true, false, [8, 0], [false, false]], [1, "llm", "llm-no-need"]],
    );
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
    eq("custom 走 stream 不走 utility", [fake.calls.stream.length, fake.calls.utility.length], [1, 0]);
    const req = fake.calls.stream[0];
    eq(
      "stream 请求形状（provider/model / 一条 user 消息且是渲染后的自定义模板 / 不传 systemPrompt 与 scope / maxTokens 与 temperature） / 需要时确实发了召回",
      [[
        [req.provider, req.model],
        [req.messages.length, req.messages[0].role],
        req.messages[0].content,
        ["systemPrompt" in req, "scope" in req],
        [req.maxTokens, req.temperature],
      ], mock.calls.length],
      [[["p1", "m1"], [1, "user"], "自定义判断：上次那个决定是什么", [false, false], [8, 0]], 1],
    );
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
    eq("空提示词：一次模型都没问、也不发 cancel、照常召回并发请求",
      [fake.calls.utility.length, fake.calls.cancel.length, Boolean(result?.payload), mock.calls.length],
      [0, 0, true, 1]);
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
    eq("空回答也照常召回并发了召回请求", [Boolean(result?.payload), mock.calls.length], [true, 1]);
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
    eq("模型抛错：照常召回、发了召回请求、cancel 一次",
      [Boolean(result?.payload), mock.calls.length, fake.calls.cancel.length], [true, 1, 1]);
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
    eq("error 事件后：照常召回、发了召回请求、cancel 一次",
      [Boolean(result?.payload), mock.calls.length, fake.calls.cancel.length], [true, 1, 1]);
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
    check(
      "超时：2 秒内收手、照常召回并发了请求、cancel 一次",
      elapsed < 2000 && Boolean(result?.payload) && mock.calls.length === 1 && fake.calls.cancel.length === 1,
      `elapsed=${elapsed}`,
    );
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

// ================= recall gate: decision =================
//
// 这一档走决策模型（/v1/systemone，type=choice + criteria），与 llm 档（宿主生成式模型）是两条路。
// 两路响应分开给：/v1/systemone 回 answers.q.choice + answers.q.confidence，其余（召回）回 OpenViking 的形状。
{
  const dir = path.join(import.meta.dirname, ".tmp-recall-gate-decision");
  fs.rmSync(dir, { recursive: true, force: true });
  const recallBody = { status: "ok", result: { rendered: "该召回" } };
  const values = {
    enabled: true,
    apiKey: "k",
    serverUrl: "http://h:1",
    recallGate: "decision",
    systemoneServiceUrl: "http://127.0.0.1:8099",
    systemoneServiceModel: "kev-4b",
    systemoneServiceKey: "",
    probe: true,
  };

  const jsonOf = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });

  const decisionFetch = ({
    choice = "need",
    confidence = 0.8,
    payload,
    systemoneStatus = 200,
    hang = false,
  } = {}) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const target = String(url);
      calls.push({ url: target, init });
      if (!target.includes("/v1/systemone")) return jsonOf(recallBody);
      if (hang) return new Promise(() => {});
      if (systemoneStatus !== 200) return jsonOf({ error: "boom" }, systemoneStatus);
      return jsonOf(payload ?? { answers: { q: { choice, confidence } } });
    };
    const systemone = () => calls.filter((call) => call.url.includes("/v1/systemone"));
    return { calls, fetchImpl, systemone };
  };

  // ---- need + 0.8：需要召回 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.8 });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "上次那个决定是什么" }] },
      session: { sessionId: "decision-recall" },
    });
    const call = request.systemone()[0];
    const body = JSON.parse(call?.init?.body || "{}");
    eq(
      "decision need+0.8 判为需要召回：照常召回并发一次 /v1/systemone / 请求体是 choice 形态（model + text state + q.type=choice）",
      [
        Boolean(result?.payload),
        request.systemone().length,
        call?.url,
        body.model,
        body.state,
        body.questions?.q?.type,
      ],
      [
        true,
        1,
        "http://127.0.0.1:8099/v1/systemone",
        "kev-4b",
        { type: "text", content: "上次那个决定是什么" },
        "choice",
      ],
    );
    eq(
      "decision 请求体带 criteria 的两个键（need / standalone），两段描述都不是空串——缺了服务端直接 400",
      [
        Object.keys(body.questions?.q?.criteria || {}),
        Array.isArray(body.questions?.q?.criteria),
        typeof body.questions?.q?.criteria?.need,
        typeof body.questions?.q?.criteria?.standalone,
        JSON.stringify(body.questions?.q?.criteria),
      ],
      [
        ["need", "standalone"],
        false,
        "string",
        "string",
        JSON.stringify(DECISION_GATE_CRITERIA),
      ],
    );
    check(
      "criteria 是内置的两条描述：need 提到指代 / 省略，standalone 提到自己把话说完整",
      DECISION_GATE_CRITERIA.need.includes("指代或省略") &&
        DECISION_GATE_CRITERIA.standalone.includes("把话说完整") &&
        DECISION_GATE_CRITERIA.need.length > 50 &&
        DECISION_GATE_CRITERIA.standalone.length > 50,
      JSON.stringify(DECISION_GATE_CRITERIA),
    );
    check(
      "没配 gateDecisionPrompt 时用默认题面（默认句不含占位符，所以 instructions 就是这句话本身，消息在 state 里不重复）",
      body.questions?.q?.instructions === DEFAULT_GATE_DECISION_PROMPT &&
        body.questions?.q?.instructions === DECISION_PROMPT_TEXT &&
        !DEFAULT_GATE_DECISION_PROMPT.includes("{{message}}") &&
        body.state?.content === "上次那个决定是什么",
      body.questions?.q?.instructions,
    );
    eq(
      "decision 空密钥不发 Authorization（content-type 照发）/ 判据是最后一条用户原话",
      ["Authorization" in call.init.headers, call.init.headers["content-type"], body.state?.content],
      [false, "application/json", "上次那个决定是什么"],
    );
  }

  // ---- 判定的四条行为：choice 与 confidence 两维合起来决定跳不跳 ----
  // 需要召回 ⇔ choice === "need" 且 confidence >= 0.45；其余一律跳过召回（任务书的口径）。
  // 方向与 llm 档同源：need（有指代 / 省略）= 得靠上文 → 召回；
  // standalone（自己把话说完整）= 不靠上文 → 跳过。
  // 形状坏的答案（缺 confidence / choice 不认识 / noul 旧格式）不是「不需要」，
  // 而是「没问出结果」，一律照常召回，不能变成漏召回。
  // 注意：need 但置信度低于阈值这一格按任务书的公式算「不需要」，会跳过——
  // 这是唯一一个「模型其实偏 need、我们仍然不查」的口子，改口径就改 decisionGateSkips 一处。
  {
    const cases = [
      { label: "need+0.8", choice: "need", confidence: 0.8 },
      { label: "need+0.3", choice: "need", confidence: 0.3 },
      { label: "standalone+0.9", choice: "standalone", confidence: 0.9 },
      { label: "缺 confidence", payload: { answers: { q: { choice: "need" } } } },
      { label: "choice 是别的值", payload: { answers: { q: { choice: "maybe", confidence: 0.9 } } } },
      { label: "noul 旧格式", payload: { answers: { q: { noul: 0.1 } } } },
    ];
    const outcomes = [];
    for (const item of cases) {
      const request = decisionFetch({ choice: item.choice, confidence: item.confidence, payload: item.payload });
      const handler = createRecallHandler(
        recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
      );
      const result = await handler({
        payload: { messages: [{ role: "user", content: `判定用例 ${item.label}` }] },
        session: { sessionId: `decision-case-${item.label}` },
      });
      outcomes.push({
        label: item.label,
        skipped: result === undefined,
        systemone: request.systemone().length,
        total: request.calls.length,
      });
    }
    eq(
      "decision 判定：need+0.8 需要召回（发召回）/ need+0.3 低于 0.45 不算需要召回（跳过）/ standalone+0.9 跳过 / 缺 confidence 照常召回 / choice 别的值照常召回 / noul 旧格式不再算有效答案、照常召回",
      outcomes,
      [
        { label: "need+0.8", skipped: false, systemone: 1, total: 2 },
        { label: "need+0.3", skipped: true, systemone: 1, total: 1 },
        { label: "standalone+0.9", skipped: true, systemone: 1, total: 1 },
        { label: "缺 confidence", skipped: false, systemone: 1, total: 2 },
        { label: "choice 是别的值", skipped: false, systemone: 1, total: 2 },
        { label: "noul 旧格式", skipped: false, systemone: 1, total: 2 },
      ],
    );
  }

  // ---- 判据是渲染后的题面：{{message}} 被替换，state 里仍是原话 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.9 });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, gateDecisionPrompt: "先查记忆吗？{{message}} 只回一个选择。" },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "上次那个决定是什么" }] },
      session: { sessionId: "decision-rendered-prompt" },
    });
    const body = JSON.parse(request.systemone()[0]?.init?.body || "{}");
    eq(
      "decision 的 instructions 是渲染后的题面（{{message}} 被替换进去）/ state.content 仍是最后一条用户消息 / 题型是 choice",
      [
        Boolean(result?.payload),
        body.questions?.q?.instructions,
        body.state?.content,
        body.questions?.q?.type,
      ],
      [true, "先查记忆吗？上次那个决定是什么 只回一个选择。", "上次那个决定是什么", "choice"],
    );
  }

  // ---- 空判据：没有判据就不拦，一次请求都不发 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.1 });
    const infos = [];
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, gateDecisionPrompt: "   " },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
        logger: { info: (m) => infos.push(m) },
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "空提示词也要召回" }] },
      session: { sessionId: "decision-empty-prompt" },
    });
    eq(
      "decision 空提示词 = 没有判据：一次判断请求都不发、照常召回",
      [Boolean(result?.payload), request.systemone().length, request.calls.length],
      [true, 0, 1],
    );
    check(
      "空提示词日志说清照常召回（gate: decision prompt empty, recall anyway）",
      infos.some((m) => m.includes("gate: decision prompt empty") && m.includes("recall anyway")),
      infos.join(" | "),
    );
  }

  eq(
    "gateDecisionPromptOf：缺项 / 只有空白给空串（没有判据），自定义去首尾空白",
    [
      gateDecisionPromptOf({}),
      gateDecisionPromptOf({ gateDecisionPrompt: "  \n " }),
      gateDecisionPromptOf({ gateDecisionPrompt: "  自定义  " }),
    ],
    ["", "", "自定义"],
  );

  // ---- need + 0.2：低于阈值 -> 跳过召回 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.2 });
    const infos = [];
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({
        values,
        fetchImpl: request.fetchImpl,
        dataDir: dir,
        logger: { info: (m) => infos.push(m) },
      }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "运行测试" }] },
      session: { sessionId: "decision-skip" },
    });
    eq(
      "decision need+0.2 判为不需要召回：返回 undefined、只发那一发 /v1/systemone、不发召回",
      [result, request.calls.length, request.systemone().length],
      [undefined, 1, 1],
    );
    eq(
      "decision 跳过日志与探针带 by=decision / reason=decision-no-need",
      [
        infos.some((m) => m.includes("gate: skipped") && m.includes("by=decision")),
        probes.length,
        probes[0]?.invocation.by,
        probes[0]?.invocation.reason,
      ],
      [true, 1, "decision", "decision-no-need"],
    );
  }

  // ---- 阈值与超时读数：等于阈值算「需要召回」（跳过要求严格小于）；配了超时也受这一档自己的上限管 ----
  eq(
    "decision 阈值 0.45：need+0.8 不跳过、need+0.45 不跳过、need+0.44 跳过、standalone 跳过、形状坏不跳过 / 超时：没配用 1200，配了也不超过 2000",
    [
      DECISION_GATE_THRESHOLD,
      decisionGateSkips({ choice: "need", confidence: 0.8 }),
      decisionGateSkips({ choice: "need", confidence: 0.45 }),
      decisionGateSkips({ choice: "need", confidence: 0.44 }),
      decisionGateSkips({ choice: "standalone", confidence: 0.9 }),
      decisionGateSkips(null),
      decisionGateSkips({ choice: "need" }),
      decisionGateSkips({ choice: "need", confidence: Number.NaN }),
      decisionGateServiceOf({}).timeoutMs,
      decisionGateServiceOf({ systemoneServiceTimeoutMs: 8000 }).timeoutMs,
      decisionGateServiceOf({ systemoneServiceTimeoutMs: 300 }).timeoutMs,
    ],
    [0.45, false, false, true, true, false, false, false, DECISION_GATE_TIMEOUT_MS, DECISION_GATE_TIMEOUT_MAX_MS, 300],
  );

  // ---- 题面渲染：写了占位符才内联，没写就只发题面（state 里已经是这条消息，不能发两遍）----
  eq(
    "decision 题面渲染：{{message}} 就地替换、没写就只发题面、空模板回空串",
    [
      renderDecisionPrompt(DECISION_PROMPT_TEXT, "在吗"),
      renderDecisionPrompt("需要查记忆吗？{{message}}", "在吗"),
      renderDecisionPrompt("{{message}} 要不要查", "在吗"),
      renderDecisionPrompt("", "在吗"),
      renderDecisionPrompt(null, "在吗"),
    ],
    [
      DECISION_PROMPT_TEXT,
      "需要查记忆吗？在吗",
      "在吗 要不要查",
      "",
      "",
    ],
  );

  // ---- 服务未配置：档位在读取侧就归一化成 off，一次判断请求都不发 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.1 });
    const sdk = recallSdk({
      values: { ...values, systemoneServiceUrl: "", systemoneServiceModel: "" },
      fetchImpl: request.fetchImpl,
      dataDir: dir,
    });
    const handler = createRecallHandler(sdk);
    // 运行时读到的档位已经不是 decision 了：没配服务就没有这一档（与路由 GET / 面板同一条判据）。
    const live = await readSwitches(sdk);
    const result = await handler({
      payload: { messages: [{ role: "user", content: "没配服务也要召回" }] },
      session: { sessionId: "decision-unconfigured" },
    });
    eq(
      "decision 服务未配置：readSwitches 归一化回 off，一次判断请求都不发、照常召回",
      [live.recallGate, Boolean(result?.payload), request.systemone().length, request.calls.length],
      ["off", true, 0, 1],
    );
  }

  // ---- 只填一半（地址有、模型空）：整对当没配 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.1 });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, systemoneServiceModel: "" },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "半对配置也要召回" }] },
      session: { sessionId: "decision-half-pair" },
    });
    eq(
      "decision 地址与模型只填一半：按未配置处理，照常召回",
      [Boolean(result?.payload), request.systemone().length],
      [true, 0],
    );
  }

  // ---- 请求失败：照常召回 ----
  {
    const request = decisionFetch({ systemoneStatus: 500 });
    const infos = [];
    const handler = createRecallHandler(
      recallSdk({
        values,
        fetchImpl: request.fetchImpl,
        dataDir: dir,
        logger: { info: (m) => infos.push(m) },
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "服务 500 也要召回" }] },
      session: { sessionId: "decision-http-500" },
    });
    eq(
      "decision 请求失败：照常召回并发起召回请求",
      [Boolean(result?.payload), request.systemone().length, request.calls.length],
      [true, 1, 2],
    );
    check(
      "失败日志与 llm 档同形（gate: decision failed, recall anyway）",
      infos.some((m) => m.includes("gate: decision failed") && m.includes("recall anyway")),
    );
  }

  // ---- 超时：按配置超时收手，照常召回 ----
  {
    const request = decisionFetch({ hang: true });
    const infos = [];
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, systemoneServiceTimeoutMs: "100" },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
        logger: { info: (m) => infos.push(m) },
      }),
    );
    const started = Date.now();
    const result = await handler({
      payload: { messages: [{ role: "user", content: "超时也要召回" }] },
      session: { sessionId: "decision-timeout" },
    });
    const elapsed = Date.now() - started;
    check(
      "decision 超时：1.5 秒内收手、照常召回，日志带 TIMEOUT",
      elapsed < 1500 &&
        Boolean(result?.payload) &&
        infos.some((m) => m.includes("gate: decision failed") && m.includes("TIMEOUT")),
      `elapsed=${elapsed}`,
    );
  }

  // ---- 返回结构不认识：照常召回 ----
  {
    const request = decisionFetch({ payload: { answers: {} } });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "结构不认识也要召回" }] },
      session: { sessionId: "decision-shape" },
    });
    eq(
      "decision 返回里没有 answers.q.choice / confidence：照常召回",
      [Boolean(result?.payload), request.systemone().length, request.calls.length],
      [true, 1, 2],
    );

    let threw = null;
    try {
      await askDecisionGate(
        recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
        values,
        "问一句",
        DEFAULT_GATE_DECISION_PROMPT,
      );
    } catch (error) {
      threw = error;
    }
    check(
      "askDecisionGate 读不到 q.choice / q.confidence 时抛错，由调用方当成判断失败",
      String(threw?.message).includes("answers.q.choice") &&
        String(threw?.message).includes("confidence"),
    );
  }

  // ---- 旧格式（noul）不再被当成有效答案 ----
  {
    let threw = null;
    try {
      const request = decisionFetch({ payload: { answers: { q: { noul: 0.1 } } } });
      await askDecisionGate(
        recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
        values,
        "旧格式",
        DEFAULT_GATE_DECISION_PROMPT,
      );
    } catch (error) {
      threw = error;
    }
    check(
      "noul 旧格式响应（只有一个概率）不再被当成有效答案，askDecisionGate 直接抛",
      threw instanceof Error && String(threw.message).includes("answers.q.choice"),
      String(threw?.message),
    );
  }

  // ---- confidence 是数字串也认（noulScoreOf 的老规矩） ----
  {
    const request = decisionFetch({ payload: { answers: { q: { choice: "need", confidence: "0.9" } } } });
    const handler = createRecallHandler(
      recallSdk({ values, fetchImpl: request.fetchImpl, dataDir: dir }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "数字串也认" }] },
      session: { sessionId: "decision-string-score" },
    });
    check("decision confidence 是数字串 0.9 时判为需要召回", Boolean(result?.payload));
  }

  // ---- 配了密钥就发 Bearer ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.9 });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, systemoneServiceKey: "sk-sys-1" },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
      }),
    );
    await handler({
      payload: { messages: [{ role: "user", content: "带密钥的判断" }] },
      session: { sessionId: "decision-key" },
    });
    eq(
      "decision 配了密钥就发 Authorization: Bearer（复用打分服务的密钥）",
      request.systemone()[0]?.init?.headers?.Authorization,
      "Bearer sk-sys-1",
    );
  }

  // ---- decision 与 llm 是两条路：llm 档一次 /v1/systemone 都不发 ----
  {
    const request = decisionFetch({ choice: "need", confidence: 0.1 });
    const fake = modelSdk({ utility: () => ({ text: "不需要" }) });
    const handler = createRecallHandler(
      recallSdk({
        values: { ...values, recallGate: "llm", gatePrompt: DEFAULT_GATE_PROMPT },
        fetchImpl: request.fetchImpl,
        dataDir: dir,
        models: fake.models,
      }),
    );
    const result = await handler({
      payload: { messages: [{ role: "user", content: "llm 档没有被改坏" }] },
      session: { sessionId: "decision-llm-untouched" },
    });
    eq(
      "llm 档仍然只问宿主模型，一次 /v1/systemone 都不发",
      [result, request.systemone().length, fake.calls.utility.length],
      [undefined, 0, 1],
    );
  }

  // ---- 枚举：新增 decision 一档，非法值仍然回退 off ----
  eq(
    "recallGate 枚举多了 decision 一档 / 非法值（含旧叫法 systemone）仍然回退 off",
    ["decision", "rules", "systemone", "", null].map((raw) => normalizeRecallGate(raw)),
    ["decision", "rules", "off", "off", "off"],
  );

  // ---- 面板状态行：纯函数给文案（未配置时每轮都召回） ----
  eq(
    "决策服务状态行：配好了给地址与模型 / 只填一半或没配都给一句提示",
    [
      decisionServiceView({
        systemoneServiceUrl: "http://127.0.0.1:8099/",
        systemoneServiceModel: "  kev-4b  ",
      }),
      decisionServiceView({ systemoneServiceUrl: "http://127.0.0.1:8099" }),
      decisionServiceView({}),
    ],
    [
      { configured: true, text: "决策服务：http://127.0.0.1:8099 · kev-4b" },
      {
        configured: false,
        text: "决策服务还没配置，先在全局配置里填决策服务（未配置时每轮都召回）",
      },
      {
        configured: false,
        text: "决策服务还没配置，先在全局配置里填决策服务（未配置时每轮都召回）",
      },
    ],
  );
  eq(
    "面板下拉值归一化：服务配好时保留 decision / 服务没配时回退 off（不在界面上留假档位）",
    [
      paintLayers({
        recallGate: "decision",
        systemoneServiceUrl: "http://127.0.0.1:8099",
        systemoneServiceModel: "kev-4b",
      }).recallGate,
      paintLayers({ recallGate: "decision" }).recallGate,
      paintLayers({ recallGate: "decision", systemoneServiceUrl: "http://127.0.0.1:8099" }).recallGate,
    ],
    ["decision", "off", "off"],
  );

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= recall rerank: 纯函数 =================
{
  // ---- 候选条目：保留边界，extractRecallText 仍按旧规则拼回去 ----
  eq(
    "条目：rendered 视为单条 / 条目：空 rendered 让位给 digest（仍是单条） / 条目：entries 逐条保留并跳过空项 / 条目：字符串也是一条 / 条目：未知形状给空数组 / 条目：null 给空数组 / extractRecallText 语义未变（entries 用空行连接）",
    [extractRecallItems({ rendered: "渲染块", digest: "摘要", entries: [{ text: "条目" }] }), extractRecallItems({ rendered: "  ", digest: "只有摘要", entries: [{ text: "条目" }] }), extractRecallItems({ entries: [{ text: "第一条" }, { text: "" }, { text: "第二条" }] }), extractRecallItems("  一段记忆  "), extractRecallItems({ total: 0 }), extractRecallItems(null), extractRecallText({ entries: [{ text: "甲" }, { text: "" }, { text: "乙" }] })],
    [[{ text: "渲染块" }], [{ text: "只有摘要" }], [{ text: "第一条" }, { text: "第二条" }], [{ text: "一段记忆" }], [], [], "甲\n\n乙"],
  );

  // ---- 渲染：两个占位符、缺 candidates、空模板 ----
  eq(
    "渲染：两个占位符都替换 / 渲染：缺 candidates 接在末尾 / 渲染：空模板给空串 / 渲染：消息里的占位符不二次展开 / 候选摘要取首 120 字 / 候选摘要压平换行",
    [renderRerankPrompt("问：{{message}}\n候选：\n{{candidates}}", "这句话", [
      { text: "甲" },
      { text: "乙" },
    ]), renderRerankPrompt("只问 {{message}}", "消息", ["甲"]), renderRerankPrompt("", "消息", ["甲"]), renderRerankPrompt("{{message}}|{{candidates}}", "消息里有 {{candidates}}", ["甲"]), Array.from(candidateSummary("字".repeat(200))).length, candidateSummary("第一行\n第二行")],
    ["问：这句话\n候选：\n1. 甲\n2. 乙", "只问 消息\n\n1. 甲", "", "消息里有 {{candidates}}|1. 甲", 120, "第一行 第二行"],
  );
  check(
    "默认重排模板带两个占位符",
    DEFAULT_RERANK_PROMPT.includes("{{message}}") &&
      DEFAULT_RERANK_PROMPT.includes("{{candidates}}"),
  );
  eq(
    "空配置用默认重排模板 / 只有空白也用默认重排模板 / 自定义重排模板原样返回",
    [rerankPromptOf({ rerankPrompt: "" }), rerankPromptOf({ rerankPrompt: "   " }), rerankPromptOf({ rerankPrompt: " 自定义 " })],
    [DEFAULT_RERANK_PROMPT, DEFAULT_RERANK_PROMPT, "自定义"],
  );

  // ---- 解析：任务书里的六种输入 + 边界 ----
  // 解析模型回答：编号转下标、超范围丢、重复去重；一个合法编号都没有（含空 / 跑题 / 非字符串）算失败。
  eq(
    "解析重排回答（编号转下标 / 越界丢 / 去重 / 一个都没有算失败） / 超时常量 600ms / 重排 maxTokens 32",
    [[
      parseRerankAnswer("1,3", 5),
      parseRerankAnswer("无", 5),
      parseRerankAnswer("3", 5),
      parseRerankAnswer("1,9,99", 5),
      parseRerankAnswer("", 5),
      parseRerankAnswer("我觉得都还行", 5),
      parseRerankAnswer("9,99", 2),
      parseRerankAnswer("2,2,1", 3),
      parseRerankAnswer("无 1", 2),
      parseRerankAnswer("1", 0),
      parseRerankAnswer(null, 3),
    ], RERANK_TIMEOUT_MS, RERANK_MAX_TOKENS],
    [[[0, 2], [], [2], [0], null, null, null, [0, 1], [0], null, null], 600, 32],
  );
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
    check(
      "默认关：照常注入、模型一次都没调、内容全保留",
      Boolean(result?.payload) && fake.calls.utility.length === 0 && fake.calls.stream.length === 0 &&
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
    eq("rerank 走 utility 一次、不走 stream", [fake.calls.utility.length, fake.calls.stream.length], [1, 0]);
    const req = fake.calls.utility[0];
    eq(
      "rerank maxTokens / rerank temperature / rerank scope app / rerank 只有一条 user 消息",
      [req.maxTokens, req.temperature, req.scope, req.messages.length],
      [RERANK_MAX_TOKENS, 0, "app", 1],
    );
    check(
      "rerank 提示词带消息与编号候选",
      req.messages[0].content.includes("挑出有用的两条") &&
        req.messages[0].content.includes("1. 第一条") &&
        req.messages[0].content.includes("3. 第三条"),
    );
    eq(
      "rerank 探针（一次 / 事件名 / 候选数 / 保留数 / 正常解析不算兜底 / 有耗时 / 模型通道 scoreScale=probability）",
      [
        probes.length,
        probes[0].event,
        probes[0].invocation.candidates,
        probes[0].invocation.kept,
        probes[0].invocation.fallback,
        typeof probes[0].invocation.elapsedMs === "number",
        probes[0].invocation.channels[0].scoreScale,
      ],
      [1, "recall/rerank", 3, 2, false, true, "probability"],
    );
  }

  // ---- 精排服务返回 logit：探针把这一批标成 logit ----
  {
    const logitBody = {
      results: [
        { index: 0, relevance_score: 2.5 },
        { index: 1, relevance_score: -1.2 },
        { index: 2, relevance_score: 0.4 },
      ],
    };
    const fetchImpl = async (url) => {
      const body = String(url).includes("/v1/rerank")
        ? logitBody
        : bodyWith(entries);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const probes = [];
    const handler = createRecallHandler(
      recallSdk({
        values: {
          ...values,
          rerankChannels: JSON.stringify([
            {
              type: "rerank",
              url: "http://127.0.0.1:9999",
              model: "bge-reranker",
              weight: 1,
              enabled: true,
            },
          ]),
        },
        fetchImpl,
        dataDir: dir,
      }),
      { probe: async (event, invocation) => probes.push({ event, invocation }) },
    );
    await handler({
      payload: { messages: [{ role: "user", content: "精排服务返回 logit" }] },
      session: { sessionId: "rerank-logit-probe" },
    });
    eq(
      "rerank 探针记一次（logit） / 精排通道的探针 scoreScale 是 logit",
      [probes.length, probes[0].invocation.channels[0].scoreScale],
      [1, "logit"],
    );
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
    eq(
      "自选重排走 stream / 自选重排不走 utility",
      [fake.calls.stream.length, fake.calls.utility.length],
      [1, 0],
    );
    const req = fake.calls.stream[0];
    eq(
      "重排 stream provider/model / 重排 stream temperature",
      [[req.provider, req.model], req.temperature],
      [["p1", "m1"], 0],
    );
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
    eq(
      "零候选时不注入 / 零候选时一次模型都没调",
      [result, fake.calls.utility.length + fake.calls.stream.length],
      [undefined, 0],
    );
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
    eq(
      "模型说无时本轮不注入 / 模型说无时召回请求照发 / 探针记保留数为 0 / 模型明确说无不算兜底",
      [result, mock.calls.length, probes[0].invocation.kept, probes[0].invocation.fallback],
      [undefined, 1, 0, false],
    );
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
    eq(
      "解析失败探针记兜底 / 解析失败探针保留数等于候选数",
      [probes[0].invocation.fallback, probes[0].invocation.kept],
      [true, 3],
    );
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
      "rerank 第一层：通道自带的超时压过服务配置 / rerank 第二层：没填通道超时时用服务配置 / rerank 第三层：两边都没配时用 800",
      [await timeoutOf(
        { type: "rerank", url: "http://h:1", model: "m", timeoutMs: 1200 },
        { rerankServiceTimeoutMs: 900 },
        rerankBody,
      ), await timeoutOf(
        { type: "rerank", url: "http://h:1", model: "m" },
        { rerankServiceTimeoutMs: 900 },
        rerankBody,
      ), await timeoutOf({ type: "rerank", url: "http://h:1", model: "m" }, {}, rerankBody)],
      [1200, 900, RERANK_CHANNEL_TIMEOUT_MS],
    );

    eq(
      "systemone 第一层：通道自带的超时压过服务配置 / systemone 第二层：没填通道超时时用服务配置 / systemone 第三层：两边都没配时按候选数自适应（2 条 = 基础值 3500）",
      [await timeoutOf(
        { type: "systemone", url: "http://h:2", model: "m", timeoutMs: 2000 },
        { systemoneServiceTimeoutMs: 1200 },
        systemoneBody,
      ), await timeoutOf(
        { type: "systemone", url: "http://h:2", model: "m" },
        { systemoneServiceTimeoutMs: 1200 },
        systemoneBody,
      ), await timeoutOf({ type: "systemone", url: "http://h:2", model: "m" }, {}, systemoneBody)],
      [2000, 1200, SYSTEMONE_CHANNEL_TIMEOUT_MS],
    );
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= recall rerank: 多路通道 =================
{
  const r2 = (values) => values.map((value) => Math.round(value * 100) / 100);

  // ---- 每路先标准化，再加权合并 ----
  // 合并：先各自标准化，再按权重加权；弃权那一路不进分母，全弃权回 null。
  eq(
    "合并规则（同分落两端 / 分歧按权重 / 一路弃权不归零 / 全弃权与空结果回 null）",
    [
      mergeRerankScores(
        [
          { ok: true, scores: [1, 0.5], weight: 1 },
          { ok: true, scores: [1, 0.5], weight: 1 },
        ],
        2,
      ),
      mergeRerankScores(
        [
          { ok: true, scores: [1, 0], weight: 3 },
          { ok: true, scores: [0, 1], weight: 1 },
        ],
        2,
      ),
      mergeRerankScores([{ ok: false, weight: 1 }, { ok: true, scores: [0.2, 0.8], weight: 2 }], 2),
      mergeRerankScores([{ ok: false, weight: 1 }, { ok: false, weight: 2 }], 2),
      mergeRerankScores([], 2),
    ],
    [[1, 0], [0.75, 0.25], [0, 1], null, null],
  );

  // ---- 标准化：min-max 把一路拉平到 0..1 ----
  {
    const scaled = normalizeChannelScores([0.82, 0.85]);
    eq(
      "标准化：min-max 拉平到 0..1 并带出原区间；同分 / 单条 / 非数字都回 null（这一路弃权）",
      [
        r2(scaled.normalized),
        [scaled.min, scaled.max],
        normalizeChannelScores([0.5, 0.5]),
        normalizeChannelScores([0.77]),
        normalizeChannelScores([0.3, "x"]),
      ],
      [[0, 1], [0.82, 0.85], null, null, null],
    );
  }

  // ---- 量纲差很多：标准化后的结论与“两路都说乙更好”一致 ----
  {
    const wide = { ok: true, weight: 1, scores: [0.82, 0.85] }; // 窄区间，尺子短
    const narrow = { ok: true, weight: 1, scores: [0.12, 0.88] }; // 宽区间，尺子长
    const naive = wide.scores.map((value, index) => (value + narrow.scores[index]) / 2);
    const scaled = mergeRerankScores([wide, narrow], 2);
    eq(
      "量纲差：直接加权被长尺子带走 / 量纲差：标准化后两路等权 / 量纲差：排序仍是乙在前",
      [r2(naive), r2(scaled), rankRerankIndexes(scaled)],
      [[0.47, 0.87], [0, 1], [1, 0]],
    );
  }

  // ---- 一路分数全相同 -> 该路弃权，另一路照旧 ----
  {
    const flat = { ok: true, weight: 3, scores: [0.4, 0.4] };
    const alive = { ok: true, weight: 1, scores: [0.2, 0.9] };
    eq(
      "同分那一路单独算就是 null / 同分那一路不影响另一路 / 同分那一路被标成弃权",
      [mergeRerankScores([flat], 2), mergeRerankScores([flat, alive], 2), mergeRerankScores([{ ...flat, abstained: true }, alive], 2)],
      [null, [0, 1], [0, 1]],
    );
  }

  // ---- 二值通道与连续通道混跑：二值不再无届放大 ----
  {
    const binary = { ok: true, weight: 1, scores: [1, 0] }; // 挑中甲
    const smooth = { ok: true, weight: 1, scores: [0.85, 0.9] }; // 几乎平手，偏好乙
    const naive = binary.scores.map((value, index) => (value + smooth.scores[index]) / 2);
    const scaled = mergeRerankScores([binary, smooth], 2);
    eq(
      "二值直加：1 与 0 的落差盖过 0.05 的偏好 / 二值标准化：两路各投一票，平手",
      [r2(naive), r2(scaled)],
      [[0.93, 0.45], [0.5, 0.5]],
    );
  }

  eq(
    "排序：降序且同分保持原序 / 取舍规则（只有所有通道原始分都是 0 才丢；标准化后的 0 与弃权那一路都不算反对票）",
    [rankRerankIndexes([0.2, 0.9, 0.9, 0]), [
      dropRejectedIndexes([0, 1, 2], [
        { ok: true, scores: [0, 1, 0] },
        { ok: true, scores: [0.4, 0.9, 0] },
      ]),
      [normalizeChannelScores([0, 0]).allZero, normalizeChannelScores([0, 0]).normalized],
      dropRejectedIndexes([0, 1], [{ ok: true, scores: [0.85, 0.9] }]),
      dropRejectedIndexes([0, 1], [{ ok: true, scores: [0.2, 0.8] }, { ok: false, abstained: true, scores: [0, 0] }]),
    ]],
    [[1, 2, 0, 3], [[0, 1], [true, [0, 0]], [0, 1], [0, 1]]],
  );

  // ---- 没配置通道时退回旧的 rerankPrompt / rerankModel 那一路 ----
  const legacy = rerankChannelsOf({
    rerankChannels: [],
    rerankModel: "p1/m1",
    rerankPrompt: "",
  });
  eq(
    "空通道退回一路 model 兜底（沿用 rerankModel、权重 1） / 全部通道都停用时也退回兜底",
    [[legacy.length, legacy[0].type, legacy[0].legacy, legacy[0].model, legacy[0].weight], rerankChannelsOf({
      rerankChannels: [
        { type: "rerank", url: "http://h", model: "m", weight: 1, enabled: false },
      ],
    })[0].legacy],
    [[1, "model", true, "p1/m1", 1], true],
  );
  const configured = rerankChannelsOf({
    rerankChannels: [{ type: "model", model: "", weight: 4, enabled: true }],
  });
  eq(
    "有启用通道就按配置跑 / 配置通道不带 legacy 标记",
    [[configured.length, configured[0].weight], configured[0].legacy],
    [[1, 4], undefined],
  );

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
    eq(
      "rerank 请求形状：一条 POST 打到 /v1/rerank，body 带 model / query / documents（截到 800 字） / rerank 分数按 relevance_score 读 / 0..1 相关度在探针里标为 probability",
      [[
        calls.length,
        calls[0].url,
        calls[0].init.method,
        [calls[0].body.model, calls[0].body.query, asList(calls[0].body.documents).length],
        Array.from(asText(asList(calls[0].body.documents)[0])).length,
      ], outcome.channels[0].scores, outcome.channels[0].scoreScale],
      [[1, "http://127.0.0.1:9999/v1/rerank", "POST", ["bge-reranker", "用户问题", 3], RERANK_DOCUMENT_CHARS], [0.9, 0.25, 0], "probability"],
    );
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
        "logit 里没有被 clamp 成 1 的 / 缺项保持 null",
        [rounded(squashRerankScores([7.8827, 3.1])), squashRerankScores([2.5, null], [2.5]).map((value) => (value === null ? null : Number(value.toFixed(3))))],
        [[0.9996, 0.9569], [0.924, null]],
      );
    }
    eq(
      "rerank 标准化后合并（0.9/0.25/0 拉成 1/0.28/0） / 探针同时留下标准化分 / rerank 0 分候选被丢掉",
      [outcome.merged.map((value) => Number(value.toFixed(2))), outcome.channels[0].normalized.map((value) => Number(value.toFixed(2))), outcome.indexes],
      [[1, 0.28, 0], [1, 0.28, 0], [0, 1]],
    );
  }

  // ---- rerank 返回越界值：探针标为 logit，说明这批过了 sigmoid ----
  {
    resetRuntimeTransport();
    const logitBody = {
      results: [
        { index: 0, relevance_score: 2.5 },
        { index: 1, relevance_score: -1.2 },
        { index: 2, relevance_score: 0.4 },
      ],
    };
    const sdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async () =>
        new Response(JSON.stringify(logitBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [], rerankPrompt: "", rerankModel: "" },
      query: "用户问题",
      items,
      channels: [
        {
          type: "rerank",
          name: "logit 服务",
          url: "http://127.0.0.1:9999",
          model: "bge-reranker",
          weight: 1,
          enabled: true,
        },
      ],
    });
    eq("越界值在探针里标为 logit", outcome.channels[0].scoreScale, "logit");
    check(
      "logit 那一路的分已过 sigmoid（0..1）",
      outcome.channels[0].scores.every((value) => value > 0 && value < 1),
      JSON.stringify(outcome.channels[0].scores),
    );
    resetRuntimeTransport();
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
    eq(
      "通道不写 URL / 模型时用打分服务配置（端点与模型都补齐），照常出分",
      [calls[0].url, calls[0].body.model, outcome.channels[0].ok],
      ["http://127.0.0.1:8098/v1/rerank", "bge-reranker-v2-m3", true],
    );
  }

  // ---- 服务密钥：非空才带 Authorization，三条调用点各一条断言 ----
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
    const switchesWithKey = {
      rerankChannels: [],
      rerankPrompt: "",
      rerankModel: "",
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceKey: "sk-svc-1234",
    };
    const rerankChannel = [{ type: "rerank", name: "服务", url: "", model: "", weight: 1 }];
    await runRerankChannels({
      sdk,
      switches: switchesWithKey,
      query: "用户问题",
      items,
      channels: rerankChannel,
    });
    eq(
      "精排通道带 Authorization: Bearer，且 content-type 没被顶掉",
      [calls[0].init.headers.Authorization, calls[0].init.headers["content-type"]],
      ["Bearer sk-svc-1234", "application/json"],
    );

    calls.length = 0;
    await runRerankChannels({
      sdk,
      switches: { ...switchesWithKey, rerankServiceKey: "" },
      query: "用户问题",
      items,
      channels: rerankChannel,
    });
    check(
      "没配密钥时精排请求头里没有 Authorization",
      !("Authorization" in calls[0].init.headers),
      JSON.stringify(calls[0].init.headers),
    );

    calls.length = 0;
    await runRerankChannels({
      sdk,
      switches: { ...switchesWithKey, rerankServiceKey: "  " },
      query: "用户问题",
      items,
      channels: rerankChannel,
    });
    check(
      "密钥只有空白也不发空的 Bearer",
      !("Authorization" in calls[0].init.headers),
      JSON.stringify(calls[0].init.headers),
    );

    // systemone 那一路：同一个 resolve 出来的 serviceKey 也要落到头上。
    calls.length = 0;
    const sysSdk = recallSdk({
      values: {},
      dataDir: dir,
      fetchImpl: async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return new Response(
          JSON.stringify({ answers: { r1: { noul: 0.9 }, r2: { noul: 0.1 }, r3: { noul: 0.4 } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    await runRerankChannels({
      sdk: sysSdk,
      switches: {
        rerankChannels: [],
        rerankPrompt: "",
        rerankModel: "",
        systemoneServiceUrl: "http://127.0.0.1:8097",
        systemoneServiceModel: "kev-4b",
        systemoneServiceKey: "sk-sys-5678",
      },
      query: "用户问题",
      items,
      channels: [{ type: "systemone", name: "决策", url: "", model: "", weight: 1 }],
    });
    eq("决策通道也带 Authorization", calls[0].init.headers.Authorization, "Bearer sk-sys-5678");
  }
  {
    // 受管运行时出口信封：额外头同样要并进去，content-type 不被顶掉。
    const calls = [];
    setRuntimeTransport({
      send: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, headers: {}, data: okBody };
      },
    });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    await runRerankChannels({
      sdk,
      switches: {
        rerankChannels: [],
        rerankPrompt: "",
        rerankModel: "",
        rerankServiceUrl: "http://127.0.0.1:8098",
        rerankServiceModel: "bge-reranker-v2-m3",
        rerankServiceKey: "sk-rt-0001",
      },
      query: "用户问题",
      items,
      channels: [{ type: "rerank", name: "服务", url: "", model: "", weight: 1 }],
    });
    eq("运行时出口：密钥也带上，content-type 没被顶掉",
      [calls[0].init.headers.Authorization, calls[0].init.headers["content-type"]],
      ["Bearer sk-rt-0001", "application/json"]);
    resetRuntimeTransport();
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
    check(
      "服务未配置的通道失败、原因写明「打分服务未配置」、整轮原样保留",
      outcome.channels[0].ok === false &&
        String(outcome.channels[0].error || "").includes("打分服务未配置") &&
        outcome.fallback === true,
      outcome.channels[0].error,
    );
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
          url: "http://127.0.0.1:8080",
          model: "m",
          weight: 1,
          timeoutMs: 321,
        },
      ],
    });
    eq(
      "通道走受管运行时出口：URL 由通道自己给、信封带这一路超时、body 仍是 rerank 形状、返回值被读成分数",
      [
        calls.length,
        calls[0].url,
        calls[0].init.timeoutMs,
        calls[0].body.model,
        outcome.merged.map((value) => Number(value.toFixed(2))),
      ],
      [1, "http://127.0.0.1:8080/v1/rerank", 321, "m", [1, 0.28, 0]],
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
    eq(
      "systemone 一次请求覆盖全部候选：POST /v1/systemone，state 带问题与编号候选，questions 键为 r1..rN / systemone 每题都是 noul 且带序号 / systemone 序号跟着候选走 / systemone answers.rN 还原到候选下标、标准化后拉平、走默认自适应超时（2 条 = 3500）",
      [[
        calls.length,
        calls[0].url,
        calls[0].body.model,
        calls[0].body.state,
        Object.keys(calls[0].body.questions ?? {}),
      ], calls[0].body.questions?.r1, calls[0].body.questions?.r2?.instructions, [outcome.channels[0].scores, outcome.merged, calls[0].init.timeoutMs]],
      [[1, "http://127.0.0.1:8080/v1/systemone", "small", "用户问题：用户问题\n候选列表：\n1. 甲\n2. 乙", ["r1", "r2"]], { type: "noul", instructions: "第 1 条候选能帮助回答用户的问题吗" }, systemoneInstructions(2), [[0.6, 0.9], [0, 1], 3500]],
    );
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
    eq(
      "systemone 缺项：该条记 null、不参与标准化、仍占位（只有这一路时排末位） / 缺项那条只由另一路定夺 / 没人打分的那条不算反对票",
      [[outcome.channels[0].scores, outcome.channels[0].normalized, outcome.merged], mergeRerankScores(
        [
          { ok: true, weight: 1, normalized: [0, 1, null] },
          { ok: true, weight: 1, normalized: [1, 1, 1] },
        ],
        3,
      ), dropRejectedIndexes([0, 1, 2], [{ ok: true, scores: [0.2, 0.8, null] }])],
      [[[0.2, 0.8, null], [0, 1, null], [0, 1, 0]], [0.5, 1, 1], [0, 1, 2]],
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
      Object.keys(calls[0].body.questions ?? {}).length,
      SYSTEMONE_MAX_CANDIDATES,
    );
    check(
      "systemone state 只列前 5 条",
      asText(calls[0].body.state).includes(`${SYSTEMONE_MAX_CANDIDATES}. 候选${SYSTEMONE_MAX_CANDIDATES}`) &&
        !asText(calls[0].body.state).includes(`6. 候选6`),
      asText(calls[0].body.state).split("\n").slice(-1)[0],
    );
    eq(
      "systemone 超出的候选记为 null / systemone 候选上限是 5",
      [outcome.channels[0].scores, SYSTEMONE_MAX_CANDIDATES],
      [[0.1, 0.2, 0.3, 0.4, 0.5, null], 5],
    );
    resetRuntimeTransport();
  }

  // ---- systemone：不手动配超时时按候选数自适应 ----
  {
    // 自适应：基础 3500，超过 5 条每条 +700，压在上限 8000；手动配了就压上限、不夹边界。
    eq(
      "systemone 超时自适应（1/5/6/8/12 条，手动配置优先，空串 / 非数字当没配）",
      [
        systemoneTimeoutFor({}, 1),
        systemoneTimeoutFor({}, 5),
        systemoneTimeoutFor({}, 6),
        systemoneTimeoutFor({}, 8),
        systemoneTimeoutFor({}, 12),
        systemoneTimeoutFor({ timeoutMs: 2000 }, 5),
        systemoneTimeoutFor({ timeoutMs: 99999 }, 5),
        systemoneTimeoutFor({ timeoutMs: "" }, 5),
        systemoneTimeoutFor({ timeoutMs: "abc" }, 5),
      ],
      [3500, 3500, 4200, 5600, 8000, 2000, 8000, 3500, 3500],
    );
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
    eq(
      "systemone 默认 3500ms 超时常量 / systemone 超时上限 8000ms / rerank 默认仍是 800ms / model 默认仍是 1500ms",
      [SYSTEMONE_CHANNEL_TIMEOUT_MS, SYSTEMONE_TIMEOUT_MAX_MS, RERANK_CHANNEL_TIMEOUT_MS, RERANK_MODEL_CHANNEL_TIMEOUT_MS],
      [3500, 8000, 800, 1500],
    );
  }

  // ---- systemone：state 拼装的两条边界（单条 500 字、总长 12000） ----
  {
    const single = buildSystemOneState("问题", [{ text: "甲".repeat(900) }]);
    eq(
      "state 单条候选截到 500 字",
      [single.count, Array.from(single.state).length],
      [1, Array.from("用户问题：问题\n候选列表：\n1. ").length + SYSTEMONE_DOCUMENT_CHARS],
    );
    const many = buildSystemOneState(
      "问题",
      Array.from({ length: 40 }, () => ({ text: "乙".repeat(600) })),
    );
    check(
      "state 边界：单条候选 500 字、总长不超过 12000、装不下时只截断尾部",
      SYSTEMONE_DOCUMENT_CHARS === 500 &&
        Array.from(many.state).length <= SYSTEMONE_STATE_MAX_CHARS &&
        many.count > 0 && many.count < 40,
      `single=${SYSTEMONE_DOCUMENT_CHARS} total=${Array.from(many.state).length} count=${many.count}`,
    );
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
    const request = fake.calls.utility[0];
    check(
      "model 通道：只问一次宿主、列编号候选、挑中记 1 未挑中记 0、只保留挑中的",
      fake.calls.utility.length === 1 &&
        request.messages[0].content.includes("1. 甲") &&
        request.messages[0].content.includes("3. 丙") &&
        JSON.stringify(outcome.merged) === JSON.stringify([0, 1, 0]) &&
        JSON.stringify(outcome.indexes) === JSON.stringify([1]),
      `${fake.calls.utility.length} / ${JSON.stringify(outcome.merged)} / ${JSON.stringify(outcome.indexes)}`,
    );
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
    check(
      "超时那一路弃权、原因写进探针（统一的 TIMEOUT 句）；另一路照常成功并参与合并",
      slow.ok === false && String(slow.error).startsWith("TIMEOUT ") && fast.ok === true &&
        JSON.stringify(outcome.merged.map((value) => Number(value.toFixed(2)))) === JSON.stringify([1, 0.28, 0]) &&
        outcome.fallback === false,
      `${slow.error} / ${JSON.stringify(outcome.merged)}`,
    );
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
    eq(
      "同分那一路弃权且原因写进探针；另一路照常成功、合并等于它的标准化分、排序不受影响",
      [
        [flat.ok, flat.abstained],
        String(flat.error).includes("同分"),
        live.ok,
        outcome.merged.map((value) => Number(value.toFixed(2))),
        outcome.indexes,
        outcome.fallback,
      ],
      [[false, true], true, true, [1, 0.28, 0], [0, 1], false],
    );
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
    eq("全部弃权：回 fallback、索引原样、保留全部",
      [outcome.fallback, outcome.indexes, outcome.kept.length], [true, [0, 1, 2], 3]);
  }

  // ---- 最近一轮候选样本：测试按钮的数据源 ----
  {
    writeRerankSample({ dataDir: dir }, "sample-session", { query: "问过什么", items });
    const sample = readRerankSample({ dataDir: dir }, "sample-session");
    eq(
      "样本往返（查询 / 候选条数 / 候选仍是正文），没有样本回 null",
      [sample.query, sample.items.length, sample.items[0].text.length, readRerankSample({ dataDir: dir }, "missing-session")],
      ["问过什么", 3, RERANK_DOCUMENT_CHARS, null],
    );
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= 精排合并：全票否决与整轮取舍 =================
{
  // 所有成功通道都给 0 分 = 明确说一条都不要：本轮不注入，且不算兜底。
  resetRuntimeTransport();
  const dir = path.join(import.meta.dirname, ".tmp-rerank-allzero");
  fs.rmSync(dir, { recursive: true, force: true });
  const sdk = recallSdk({
    values: {},
    dataDir: dir,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          results: [
            { index: 0, relevance_score: 0 },
            { index: 1, relevance_score: 0 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  const outcome = await runRerankChannels({
    sdk,
    switches: { rerankChannels: [] },
    query: "一条都别要",
    items: [{ text: "甲" }, { text: "乙" }],
    channels: [{ type: "rerank", url: "http://127.0.0.1:9999", model: "m", weight: 1 }],
  });
  eq(
    "全 0 分：这一路不弃权（全 0 是明确拒绝，不是没有区分力），整轮丢掉全部候选且不算兜底",
    [outcome.channels[0].abstained, outcome.fallback, outcome.indexes, outcome.kept],
    [false, false, [], []],
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// ================= 精排合并：弃权与权重的边界 =================
{
  // 失败只弃权、不归零：失败那一路不进分母，权重再大也不该把别人的票拉平。
  // 这一条是「一路失败按 0 分参与合并」那个改法的守门人。
  eq(
    "一路失败不归零（权重 5 的失败路 vs 权重 1 的成功路，合并仍是成功路的标准化分）",
    [
      mergeRerankScores(
        [{ ok: false, weight: 5, scores: [0, 0] }, { ok: true, weight: 1, scores: [0.2, 0.9] }],
        2,
      ),
      mergeRerankScores(
        [
          { ok: true, weight: 5, abstained: true, scores: [0, 0] },
          { ok: true, weight: 1, scores: [0.2, 0.9] },
        ],
        2,
      ),
    ],
    [[0, 1], [0, 1]],
  );
  eq(
    "权重非法（0 / 负 / 非数字）的路不投票；总条数非正 / 结果不是数组回 null",
    [
      mergeRerankScores(
        [{ ok: true, weight: 0, scores: [1, 0] }, { ok: true, weight: 1, scores: [0.2, 0.9] }],
        2,
      ),
      mergeRerankScores(
        [{ ok: true, weight: -2, scores: [1, 0] }, { ok: true, weight: 1, scores: [0.2, 0.9] }],
        2,
      ),
      mergeRerankScores([{ ok: true, weight: "x", scores: [1, 0] }], 2),
      mergeRerankScores([{ ok: true, weight: 1, scores: [1, 0] }], 0),
      mergeRerankScores(null, 2),
    ],
    [[0, 1], [0, 1], null, null, null],
  );
  eq(
    "预标准化数组长度对不上时退回原始分重算（不拿半截数组错位相乘）",
    mergeRerankScores([{ ok: true, weight: 1, normalized: [1], scores: [0.1, 0.9] }], 2),
    [0, 1],
  );
  eq(
    "量纲判定（0..1 = probability，出现越界值 = logit，非数字不参与判定）",
    [
      rerankScoreScale([]),
      rerankScoreScale([0, 0.5, 1]),
      rerankScoreScale([-0.2]),
      rerankScoreScale([1.2]),
      rerankScoreScale([null, "x", 0.4]),
    ],
    ["probability", "probability", "logit", "logit", "probability"],
  );
  eq(
    "没有原始分的路不算反对票（弃权 / 失败 / 没带 scores 都不进取舍）",
    [
      dropRejectedIndexes([0, 1], [{ ok: true }]),
      dropRejectedIndexes([0, 1], [{ ok: false, scores: [0, 0] }]),
      dropRejectedIndexes([0, 1], [{ ok: true, abstained: true, scores: [0, 0] }]),
    ],
    [[0, 1], [0, 1], [0, 1]],
  );
  eq(
    "权重边界：0.1 与 10 都收，越界整项丢弃（服务端与界面同一口径）",
    [
      parseRerankChannel({ type: "model", weight: 0.1 }).weight,
      parseRerankChannel({ type: "model", weight: 10 }).weight,
      parseRerankChannel({ type: "model", weight: 0.09 }),
      parseRerankChannel({ type: "model", weight: 10.01 }),
    ],
    [0.1, 10, null, null],
  );
  {
    // 零候选：不排序、不崩，保留空数组，算兜底。
    resetRuntimeTransport();
    const dir = path.join(import.meta.dirname, ".tmp-rerank-edge");
    fs.rmSync(dir, { recursive: true, force: true });
    const sdk = recallSdk({ values: {}, dataDir: dir });
    const outcome = await runRerankChannels({
      sdk,
      switches: { rerankChannels: [] },
      query: "没有问题",
      items: [],
      channels: [{ type: "model", weight: 1 }],
    });
    eq(
      "零候选：不崩、索引与保留都是空、算兜底",
      [outcome.fallback, outcome.indexes, outcome.kept],
      [true, [], []],
    );
    fs.rmSync(dir, { recursive: true, force: true });
    resetRuntimeTransport();
  }
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
  const firstMessages = asList(first?.payload?.messages);
  const firstTail = asText(firstMessages[2]?.content);
  check(
    "召回成功：条数不变、最后一条用户消息前面挂记忆块且原话仍在末尾、助手消息与原 payload 都不动",
    Boolean(first?.payload) &&
      firstMessages.length === 3 &&
      firstTail.startsWith("<openviking-memory>") &&
      firstTail.endsWith("我记得是周三？") &&
      firstTail.includes("周三要交稿。") &&
      asText(firstMessages[1]?.content) === "我查一下" &&
      JSON.stringify(payload) === before,
    JSON.stringify(first?.payload?.messages?.[2]?.content).slice(0, 160),
  );
  eq("只发了一次召回请求", calls.length, 1);

  const reqBody = JSON.parse(calls[0].init.body);
  eq(
    "召回请求形状（context 模式 / 默认跨门牌 / 预算取上限 / 查询剥注入 / 带会话自己的 peer）",
    [
      reqBody.mode,
      reqBody.peer_scope,
      reqBody.max_tokens,
      reqBody.query,
      calls[0].init.headers["X-OpenViking-Actor-Peer"],
    ],
    ["context", "all", MEMORY_MAX_TOKENS, "我记得是周三？", "openhanako-agent-x"],
  );

  const again = await handler({ payload: first.payload, session });
  eq("同一句第二次：不干预、也不发请求", [again, calls.length], [undefined, 1]);

  const otherText = { messages: [{ role: "user", content: "换个问题" }] };
  const other = await handler({ payload: otherText, session });
  check("不同文本仍会召回并发第二次请求", Boolean(other?.payload) && calls.length === 2);

  const state = readSession(dir, "recall-dedupe");
  check(
    "状态记了轮次 / 注入 token / 最后召回时间",
    state.recall.turns === 2 && state.recall.injectedTokens > 0 &&
      typeof state.recall.lastAt === "string",
    JSON.stringify(state.recall),
  );

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
  const offResult = await off({ payload, session });
  eq("总闸关时返回 undefined 且不发请求", [offResult, boom.calls], [undefined, 0]);

  const noKey = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没 key 时返回 undefined 且不发请求", [await noKey({ payload, session }), boom.calls], [undefined, 0]);

  const noUrl = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没 serverUrl 时返回 undefined 且不发请求", [await noUrl({ payload, session }), boom.calls], [undefined, 0]);

  const noSession = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq("没有 sessionId 时返回 undefined 且不发请求", [await noSession({ payload }), boom.calls], [undefined, 0]);

  const empty = createRecallHandler(
    recallSdk({
      values: { enabled: true, apiKey: "k", serverUrl: "http://h:1" },
      fetchImpl: boom.fetchImpl,
      dataDir: dir,
    }),
  );
  eq(
    "没有用户文本时返回 undefined 且不发请求",
    [await empty({ payload: { messages: [{ role: "assistant", content: "嗯" }] }, session }), boom.calls],
    [undefined, 0],
  );

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
  eq("没有 messages 时：不抛、不联网、返回 undefined",
    [threw, boom.calls, result], [null, 0, undefined]);

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
    "响应无文本时返回 undefined / 响应无文本时 payload 原样",
    [await emptyBody({ payload, session: { sessionId: "shape-2" } }), payload.messages[0].content],
    [undefined, "有没有记忆"],
  );

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
  eq(
    "网络失败：不抛、返回 undefined、payload 深度相等（调用者手里还是原引用）、只记一次请求",
    [threw, result, JSON.stringify(payload), before, payload.messages[0].content, calls],
    [null, undefined, before, before, "断网时问一句", 1],
  );

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
    "会话关掉 autoRecall 时返回 undefined 且不发请求",
    [await offHandler({ payload, session: { sessionId: "ov-off" } }), autoOff.calls.length],
    [undefined, 0],
  );

  patchSession(dir, "ov-scope", { overrides: { recallPeerScope: "all", readOnly: true } });
  const scoped = mockFetch({ body: { status: "ok", result: { rendered: "跨门牌的记忆" } } });
  const scopeHandler = createRecallHandler(
    recallSdk({ values, fetchImpl: scoped.fetchImpl, dataDir: dir }),
  );
  const scopedResult = await scopeHandler({
    payload: { messages: [{ role: "user", content: "别的机器说过什么" }] },
    session: { sessionId: "ov-scope" },
  });
  check("只读模式不影响召回，会话可以覆盖召回范围",
    Boolean(scopedResult?.payload) && JSON.parse(scoped.calls[0].init.body).peer_scope === "all",
    JSON.stringify(JSON.parse(scoped.calls[0].init.body).peer_scope));

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
  const renderedText = asText(asList(renderedResult?.payload?.messages)[0]?.content);
  check(
    "rendered 形状：注入成功、正文进块、且优先于 digest 与 entries",
    Boolean(renderedResult?.payload) &&
      renderedText.includes(renderedXml) &&
      !renderedText.includes("摘要不该赢") &&
      !renderedText.includes("条目不该赢"),
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
  const digestText = asText(asList(digestResult?.payload?.messages)[0]?.content);
  check(
    "digest 兜底：空 rendered 让位给 digest，且不再看 entries",
    Boolean(digestResult?.payload) &&
      digestText.includes("只有摘要") &&
      !digestText.includes("条目也不该赢"),
  );

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
  const entriesText = asText(asList(entriesResult?.payload?.messages)[0]?.content);
  check(
    "entries 兜底：注入成功，用空行拼起来且跳过空项",
    Boolean(entriesResult?.payload) &&
      entriesText.includes("第一条\n\n第二条"),
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
  check(
    "未知形状告警一次，且含「响应形状未识别」与键名",
    warnings.length === 1 && warnings[0].includes("响应形状未识别") &&
      warnings[0].includes("total") && warnings[0].includes("stats"),
    warnings.join(" | "),
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
    "关闸时一轮只记一条 skip: disabled / 12 次步调用总共只记一条日志",
    [infos.filter((m) => m.includes("skip: disabled")).length, infos.length],
    [1, 1],
  );

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
  const firstClaim = [deduper.claim("a"), deduper.claim("a")];
  deduper.claim("b");
  deduper.claim("c");
  deduper.claim("d");
  eq(
    "占键语义（首次成功 / 重复失败）与容量（超容量按最旧淘汰、新键保留、不超过上限）",
    [firstClaim, deduper.has("a"), deduper.has("d"), deduper.size],
    [[true, false], false, true, 3],
  );
  check("默认容量常量可用", DEDUP_LIMIT >= 100);

  // 响应 → 文本：字符串 / rendered / digest / entries 四档，其余一律空串；旧猜测键不再猜。
  eq(
    "响应取文本（字符串 / rendered 优先 / 空 rendered 落 digest / 拼 entries / 其余空串）",
    [
      extractRecallText("  一段记忆  "),
      extractRecallText({ rendered: "渲染块", digest: "摘要", entries: [{ text: "条目" }] }),
      extractRecallText({ rendered: "  ", digest: "只有摘要", entries: [{ text: "条目" }] }),
      extractRecallText({ entries: [{ text: "第一条" }, { text: "" }, { text: "第二条" }] }),
      extractRecallText({ context: "旧形状" }),
      extractRecallText({ total: 0 }),
      extractRecallText(null),
    ],
    ["一段记忆", "渲染块", "只有摘要", "第一条\n\n第二条", "", "", ""],
  );

  const block = memoryBlock("啊".repeat(400), 20);
  check("记忆块带开关标记", block.startsWith("<openviking-memory>") && block.endsWith("</openviking-memory>"));
  check("超预算时截断且标记完整", block.includes("…") && block.endsWith("</openviking-memory>"));
}

// ================= 设置页：GET /conn 响应 → 字段（纯逻辑） =================
{
  // 「输入框是空的」曾被当成数据没填进去。真实原因是深色主题把文字洗成了
  // 近白色（见上面的 theme 断言）；这里把「拿到响应 → 填字段」钉住，
  // 将来真的丢了值会立刻红。
  const real = {
    serverUrl: "http://127.0.0.1:8000",
    peerPrefix: "desktop",
    peerPrefixValid: true,
    apiKeySet: true,
    apiKeyHead: "ov-1",
    apiKeyTail: "9f3c",
  };
  const fields = connFields(real);
  eq(
    "服务地址被填进去 / 门牌前缀被填进去 / API Key 填的是掩码，不是明文 / 掩码与「没改过」的判据一致 / 有 key 时用「已保存」那档说明",
    [fields.serverUrl, fields.peerPrefix, fields.apiKey, fields.mask, fields.keyHint],
    ["http://127.0.0.1:8000", "desktop", "ov-1••••••••9f3c", fields.apiKey, HINT_SET],
  );

  // GET /conn 没有 ok 字段：不能因为缺 ok 就把响应当失败（那才会真的不填）。
  eq(
    "没有 ok 字段的响应照样能填字段 / 没有 ok 字段时门牌前缀也照填",
    [connFields({ serverUrl: "http://h:1", peerPrefix: "mbp" }).serverUrl, connFields({ serverUrl: "http://h:1", peerPrefix: "mbp" }).peerPrefix],
    ["http://h:1", "mbp"],
  );

  const empty = connFields({
    serverUrl: "",
    peerPrefix: "",
    peerPrefixValid: true,
    apiKeySet: false,
    apiKeyHead: "",
    apiKeyTail: "",
  });
  eq(
    "没填时服务地址是空串 / 没填时门牌前缀是空串 / 没 key 时掩码是空串 / 没 key 时用默认说明",
    [empty.serverUrl, empty.peerPrefix, empty.apiKey, empty.keyHint],
    ["", "", "", HINT_DEFAULT],
  );

  // 形状脏了也不能把 undefined 显示进输入框。
  eq(
    "空气响应不吐 undefined / null 响应不吐 undefined / 非字符串的 serverUrl 当空",
    [connFields(undefined).serverUrl, connFields(null).peerPrefix, connFields({ serverUrl: 42 }).serverUrl],
    ["", "", ""],
  );

  eq(
    "掩码：头四位 + 圆点 × 8 + 后四位 / 短 key 只有后四位（后端不给 head） / 没填时掩码为空串 / tail 缺失时掩码为空串 / 掩码里的圆点正好八个",
    [buildMask("abcd", "wxyz"), buildMask("", "wxyz"), buildMask("abcd", ""), buildMask("abcd", undefined), (buildMask("abcd", "wxyz").match(/•/g) || []).length],
    ["abcd••••••••wxyz", "••••••••wxyz", "", "", 8],
  );

  // 亮色主题：文字色交回 naive-ui 默认，只留品牌色与中性底。
  eq(
    "品牌绿仍是主色 / 成功色不变 / 错误色不变",
    [lightThemeOverrides.common?.primaryColor, lightThemeOverrides.common?.successColor, lightThemeOverrides.common?.errorColor],
    ["#6f8f68", "#5d7d56", "#b8564d"],
  );
}

// ================= 边栏会话卡：覆盖语义（纯函数） =================
{
  // 卡不在一屏面板里，但语义最密：三项开关 + 召回范围都改会话覆盖，
  // 「跟随全局」提交 null 而不是 false。这里只验纯函数的输入输出，不看组件结构。
  eq(
    "会话卡的四个键（三个布尔 + 一个范围）覆盖后端白名单里的同名键",
    [CARD_BOOL_KEYS, CARD_SCOPE_KEY, CARD_OVERRIDE_KEYS],
    [["autoRecall", "autoCapture", "readOnly"], "recallPeerScope", ["autoRecall", "autoCapture", "readOnly", "recallPeerScope"]],
  );
  check(
    "卡上四个键都在后端的 OVERRIDE_KEYS 白名单里",
    CARD_OVERRIDE_KEYS.every((key) => OVERRIDE_KEYS.includes(key)),
    CARD_OVERRIDE_KEYS.filter((key) => OVERRIDE_KEYS.includes(key) === false).join(", "),
  );

  // 「跟随全局」= 提交 null 让后端删键，不是把值写成 false。
  eq(
    "交回全局提交 null（不是 false）并保留其它覆盖值；改一项只合并这一项 / 覆盖判据：null 不算覆盖，false 算覆盖",
    [[cardResetOverride({ autoRecall: false, readOnly: true }, "autoRecall"), cardWithOverride({ autoRecall: true }, "autoCapture", false)], [hasCardOverride({ autoRecall: null }, "autoRecall"), hasCardOverride({ autoRecall: false }, "autoRecall")]],
    [[{ autoRecall: null, readOnly: true }, { autoRecall: true, autoCapture: false }], [false, true]],
  );

  eq(
    "小字两态（跟随全局 / 本会话） / 统计行（召回 / 写回 / 钩子；没有就只写两段） / 提示位三档（总闸关着给红警告 / 有覆盖给提示 / 没覆盖不给空话） / peer 归属：优先显示宿主断言的会话归属，拿不到身份时不编门牌 / 没有活动会话时的标题",
    [[cardNoteView(false), cardNoteView(true)], [
      cardStatsText({
        state: { recall: { turns: 2 }, capture: { turns: 1 } },
        probe: { events: { "provider/before-request": 2, "agent/before-start": 1 } },
      }),
      cardStatsText({ state: { recall: { turns: 0 }, capture: { turns: 0 } }, probe: { events: {} } }),
    ], [
      cardHintView({ overrides: {}, enabled: false, status: { enabled: false, probe: true } }),
      cardHintView({ overrides: { autoRecall: false }, enabled: true, status: { probe: false } }),
      cardHintView({ overrides: { autoRecall: false }, enabled: true, status: { probe: true } }),
      cardHintView({ overrides: {}, enabled: true, status: { probe: true } }).text,
    ], [
      cardPeerView({ peer: "ov-mbp", peerSource: "session" }, "hermes").text,
      cardPeerView({ peer: null, peerSource: "unbound" }, "").text,
    ], cardSessionView(null)],
    [[{ text: "跟随全局", title: "当前跟随全局" }, { text: "本会话", title: "点击交回全局" }], ["召回 2 · 写回 1 · 钩子 3", "召回 0 · 写回 0"], [
      { text: "全局总闸关着，这里的开关不会生效。", warn: true },
      { text: "有本会话设置；点小字交回全局。", warn: false },
      { text: "实心小字是本会话设置，点它交回全局。", warn: false },
      "",
    ], ["hermes", "未绑定助手"], { sessionKey: null, sessionOwner: "", title: "无活动会话", titleTitle: "" }],
  );
  const active = cardSessionView({
    sessionPath: "/tmp/sessions/2026-10-20T08-09-15-730Z_01a1585b-1f3e-4b2b-9d9a-5c5d5e5f5a5b.jsonl",
    title: "",
    agentId: "hermes",
  });
  eq(
    "活动会话：key 取路径里的 uuid、没标题时显示 key 末八位、归属来自 agentId / 交回全局后控件立刻显示全局值（范围取 recallScope，布尔取总闸，都没有就删掉这一项）",
    [[active.sessionKey, active.title, active.sessionOwner], [
      cardOptimisticReset({ autoRecall: false }, "autoRecall", { autoRecall: true }).autoRecall,
      cardOptimisticReset({ recallPeerScope: "all" }, "recallPeerScope", { recallScope: "self" }).recallPeerScope,
      "autoCapture" in cardOptimisticReset({ autoCapture: true }, "autoCapture", {}),
    ]],
    [["01a1585b-1f3e-4b2b-9d9a-5c5d5e5f5a5b", "5e5f5a5b", "hermes"], [true, "self", false]],
  );
}
// ================= 源码与产物：不含私有网段地址 =================
// 占位符、文案、manifest 描述、测试假数据里都不许出现内网网段：那是某个人家里的拓扑，
// 不该进仓库。只扫源码与构建产物；ui/assets/app-ui.js 是宿主下发的压缩代码，扫它没意义。
const PRIVATE_ADDR_RE =
  /(?:^|[^\d.])(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?:[^\d]|$)/;
const REPO_ROOT = path.join(import.meta.dirname, "..");
const PRIVATE_SCAN_DIRS = ["ui-src/src", "src", "routes", "docs", "dev"];
const PRIVATE_SCAN_FILES = ["manifest.json", "AGENTS.md"];
const PRIVATE_SCAN_SKIP = new Set(["node_modules", ".git", "dist", "app-ui.js"]);
const PRIVATE_SCAN_EXT = /\.(?:js|vue|mjs|md|json)$/;

/** 递归收集要扫的文件：目录里的源码 + 手挑的根文件 + ui/assets 下的构建产物。 */
function privateScanFiles() {
  const files = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (PRIVATE_SCAN_SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (PRIVATE_SCAN_EXT.test(entry.name)) files.push(full);
    }
  };
  for (const dir of PRIVATE_SCAN_DIRS) walk(path.join(REPO_ROOT, dir));
  for (const name of PRIVATE_SCAN_FILES) files.push(path.join(REPO_ROOT, name));
  const assetDir = path.join(REPO_ROOT, "ui/assets");
  for (const name of fs.readdirSync(assetDir)) {
    if (name.endsWith(".js") && !PRIVATE_SCAN_SKIP.has(name)) files.push(path.join(assetDir, name));
  }
  return files;
}

/** 扫描结果：每个命中一条 `相对路径:行号: 片段`，没命中为空。 */
function privateAddrHits(files) {
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!PRIVATE_ADDR_RE.test(line)) return;
      hits.push(`${path.relative(REPO_ROOT, file)}:${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  return hits;
}

// 自检：正则得真能认出样例，也不能把回环 / 版本号错当成私有网段。
const privateSample = ["192", "168", "50", "1"].join(".");
check("私有网段正则认得出样例", PRIVATE_ADDR_RE.test(`http://${privateSample}:8097/`), privateSample);
check("私有网段正则不误伤回环", PRIVATE_ADDR_RE.test("http://127.0.0.1:8098") === false);
check("私有网段正则不误伤版本号", PRIVATE_ADDR_RE.test("naive-ui 2.10.0.0") === false);

const privateScanList = privateScanFiles();
check("源码与产物都进了扫描范围", privateScanList.length > 40, `${privateScanList.length} 个文件`);
const privateHits = privateAddrHits(privateScanList);
check(
  "源码与产物里没有私有网段地址",
  privateHits.length === 0,
  privateHits.length ? `共 ${privateHits.length} 处，第一处 ${privateHits[0]}` : "",
);
check(
  "placeholder 用占位式写法（http://主机:端口）而不是具体地址",
  SCORING_SERVICES.every((service) => service.urlPlaceholder === "http://主机:端口"),
  SCORING_SERVICES.map((service) => service.urlPlaceholder).join(" / "),
);

// ================= 安全：密钥不外泄 =================
{
  // 三类出口都可能漏明文：GET 响应、日志、探针。三处各验一次。
  const handlers = {};
  const app = {
    get: (route, handler) => { handlers[`GET ${route}`] = handler; },
    post: (route, handler) => { handlers[`POST ${route}`] = handler; },
  };
  const dir = path.join(import.meta.dirname, ".tmp-security");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const apiKey = "sk-status-secret-0001";
  const connStore = {
    enabled: true,
    serverUrl: "http://127.0.0.1:8000",
    apiKey,
    peerPrefix: "",
    rerankServiceUrl: "http://127.0.0.1:8098",
    rerankServiceModel: "bge-reranker-v2-m3",
    rerankServiceKey: "sk-rerank-secret-0002",
    systemoneServiceKey: "sk-sys-secret-0003",
  };
  const ctx = {
    dataDir: dir,
    config: { get: async (key) => connStore[key], set: async (key, value) => { connStore[key] = value; } },
    network: { fetch: async () => { throw new Error("不该联网"); } },
  };
  registerStatusRoutes(app, ctx);
  registerConnRoutes(app, ctx);
  const get = (route, query = {}) =>
    handlers[`GET ${route}`]({
      json: (body, status) => ({ body, status }),
      req: { query: (key) => query[key] ?? "" },
    });

  resetRuntimeTransport();
  const status = await get("/status");
  const conn = await get("/conn");
  eq(
    "/status 与 /conn 的 GET 都不回明文密钥（字段不存在，值也不在响应里）",
    [
      ["apiKey" in status.body, "rerankServiceKey" in status.body, "systemoneServiceKey" in status.body],
      ["apiKey" in conn.body],
      JSON.stringify(status.body).includes(apiKey),
      JSON.stringify(conn.body).includes(apiKey),
      [status.body.apiKeySet, conn.body.apiKeySet],
    ],
    [[false, false, false], [false], false, false, [true, true]],
  );

  // 召回链路失败时只把原因写进日志 / 探针，不把密钥带出去。
  const logs = [];
  const probes = [];
  const secret = "sk-channel-secret-0004";
  const sdk = recallSdk({
    values: {
      enabled: true,
      apiKey: "k",
      serverUrl: "http://h:1",
      rerank: "llm",
      rerankServiceUrl: "http://127.0.0.1:9999",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceKey: secret,
      probe: true,
    },
    dataDir: dir,
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  const handler = createRecallHandler(sdk, {
    probe: async (event, invocation) => probes.push(invocation),
  });
  await handler({
    payload: { messages: [{ role: "user", content: "密钥不该出现在日志里" }] },
    session: { sessionId: "01a1585b-86d2-7c64-b8ac-edbe7099d0a9" },
  });
  eq(
    "渠道失败日志与探针里都没有密钥明文（探针只留端点 / 模型 / 超时）",
    [
      logs.length > 0,
      logs.some((message) => message.includes(secret)),
      JSON.stringify(probes).includes(secret),
    ],
    [true, false, false],
  );

  fs.rmSync(dir, { recursive: true, force: true });
  resetRuntimeTransport();
}

// ================= 结果 =================
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);

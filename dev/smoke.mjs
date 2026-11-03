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
  DEFAULT_GATE_PROMPT as UI_DEFAULT_GATE_PROMPT,
  DEFAULT_MODEL_OPTION,
  DEFAULT_RERANK_PROMPT as UI_DEFAULT_RERANK_PROMPT,
  RERANK_CHANNEL_LABELS,
  RERANK_CHANNELS_MAX as UI_RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TIMEOUT_DEFAULTS as UI_RERANK_CHANNEL_TIMEOUT_DEFAULTS,
  SCORING_SERVICES,
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
// 面板状态机（无 vue、无 DOM）：假 fetch 直接跑「改了就提交 / 失败回滚」。
import { createPanelStore, serviceKindOfField, servicePartnerOf } from "../ui-src/src/lib/panel-store.js";
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

// ---- ui-src 源码读取：整页迁到 Vue 之后，结构断言改读组件 ----
const UI_SRC_DIR = path.join(import.meta.dirname, "../ui-src/src");
const uiSrcRaw = (name) => fs.readFileSync(path.join(UI_SRC_DIR, name), "utf8");
// 去掉注释再断言：解释性注释里会出现 darkTheme / placeholder / 服务未配置 这类词，
// 拿注释当证据等于自己骗自己。
const uiCode = (name) =>
  uiSrcRaw(name)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*/gm, "");
const uiProjectRaw = (name) =>
  fs.readFileSync(path.join(import.meta.dirname, "../ui-src", name), "utf8");
const panelHtml = () =>
  fs.readFileSync(path.join(import.meta.dirname, "../ui/panel.html"), "utf8");
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
  eq("health 返回顶层字段", result, { status: "ok", healthy: true, version: "v0.4.16" });
  eq("health 里能拿到版本", result?.version, "v0.4.16");
  eq("base 去掉尾部斜杠", client.baseUrl, "http://127.0.0.1:8000");
  eq("health 走 GET", calls[0].init.method, "GET");
  eq("health URL", calls[0].url, "http://127.0.0.1:8000/health");
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
    serverUrl: "http://127.0.0.1:8000/",
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
  eq("信封 url", envelope.url, "http://127.0.0.1:8000/api/v1/search/search");
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

// ================= ui: 面板结构（组件） =================
{
  // 这一块以前读 ui/panel.html 的 DOM。整页迁到 Vue 之后 HTML 只剩一个挂载点，
  // 断言改成读组件源码（ui-src/src/**）：验的还是同一件事——
  // 哪个控件在哪一块、两块谁先谁后、CSS 规则有没有在搬家时丢掉。
  const html = panelHtml();
  const css = panelCss();
  const app = uiCode("App.vue");
  const globalPanel = uiCode("components/GlobalPanel.vue");
  const master = uiCode("components/MasterCard.vue");
  const hub = uiCode("components/HubIdentity.vue");
  const prelude = uiCode("components/PreludeCard.vue");
  const logsPanel = uiCode("components/LogsPanel.vue");
  const memoryPanel = uiCode("components/MemoryPanel.vue");
  const recall = uiCode("components/RecallCard.vue");
  const peerList = uiCode("components/PeerList.vue");
  const skillPanel = uiCode("components/SkillPanel.vue");
  const globalSources = [globalPanel, master, hub, prelude];
  const memorySources = [memoryPanel, recall, peerList, uiCode("components/ChannelList.vue")];

  // ---- panel.html：只剩挂载点，只引构建产物 panel.js ----
  check("panel.html 只剩挂载点", html.includes('<div id="panel-app"></div>'), html);
  eq(
    "panel.html 只引一个 module script（构建产物 panel.js）",
    [...html.matchAll(/<script type="module" src="\.\/assets\/([^"]+)"><\/script>/g)].map(
      (match) => match[1],
    ),
    ["panel.js"],
  );
  check(
    "panel.html 里不再写死面板 DOM",
    ["masterCard", "recallGate", "peerList", "tab-global", "scoringServices", "logBody"].every(
      (needle) => html.includes(needle) === false,
    ),
    html,
  );
  check("panel.html 仍挂静态 panel.css（不改成构建产出）",
    html.includes('href="./assets/panel.css"'));
  check("panel.html 没有内联样式块", html.includes("<style") === false);
  // ---- 哪一块在哪个组件里（卡片都是 n-card，所以认 id / title / class） ----
  for (const needle of [
    'id="masterCard"',
    'id="prelude"',
    'id="scoringServices"',
    'class="cols"',
  ]) {
    check(
      `全局页（组件）包含 ${needle}`,
      globalSources.some((source) => source.includes(needle)),
      needle,
    );
  }
  check(
    "日志页（组件）包含卡片壳 / 计数条 / 正文",
    ['class="logs"', 'id="logChips"', 'id="logBody"'].every((needle) =>
      logsPanel.includes(needle),
    ),
    logsPanel.slice(0, 200),
  );
  check(
    "全局页（组件）里不再出现日志相关任何字样",
    ["LogsCard", "日志", "logBody", "logChips"].every(
      (needle) => uiSrcRaw("components/GlobalPanel.vue").includes(needle) === false,
    ),
    uiSrcRaw("components/GlobalPanel.vue"),
  );
  check(
    "LogsCard.vue 文件已删（不是留着没人引用的死文件）",
    fs.existsSync(path.join(UI_SRC_DIR, "components/LogsCard.vue")) === false,
  );
  for (const needle of [
    'class="scoped-note"',
    'class="recall"',
    "id: 'recallGate'",
    "id: 'queryMode'",
    "id: 'rerank'",
    'id="peerList"',
  ]) {
    check(
      `记忆页（组件）包含 ${needle}`,
      memorySources.some((source) => source.includes(needle)),
      needle,
    );
  }
  for (const needle of ["recallGate", "peerList", "skillRouting", 'class="recall"']) {
    check(`全局页（组件）不包含 ${needle}`, globalSources.every((src) => src.includes(needle) === false), needle);
  }
  check("记忆页（组件）不包含总闸", memorySources.every((src) => src.includes('id="masterCard"') === false));
  check("记忆页（组件）不包含打分服务", memorySources.every((src) => src.includes('id="scoringServices"') === false));
  check("前置里没有技能路由", prelude.includes("skillRouting") === false);
  check("前置里不含下拉", prelude.includes("<select") === false);
  check("前置里只有一个开关（探针）", (prelude.match(/<NSwitch\b/g) || []).length === 1,
    String((prelude.match(/<NSwitch\b/g) || []).length));
  check("技能页（组件）只剩 SkillRoute 外壳",
    skillPanel.includes("<SkillRoute") && skillPanel.includes('id="skill-route-app"'));
  check("技能页不再写死技能路由 DOM",
    ['data-key="skillRouting"', 'id="skillRoute"', 'class="switch"'].every(
      (needle) => skillPanel.includes(needle) === false,
    ));

  // ---- 页面内顺序 ----
  const globalOrder = ["<MasterCard", "<HubIdentity", "<PreludeCard"].map((needle) =>
    globalPanel.indexOf(needle),
  );
  check(
    "全局页内顺序：总闸 → 中枢 / 身份 → 前置",
    globalOrder.every((value, index) => value > 0 && (index === 0 || value > globalOrder[index - 1])),
    globalOrder.join(" < "),
  );
  check(
    "记忆页顺序：按会话说明 → 召回管理",
    memoryPanel.indexOf('class="scoped-note"') > 0 &&
      memoryPanel.indexOf('class="scoped-note"') < memoryPanel.indexOf("<RecallCard"),
    memoryPanel,
  );
  check(
    "根组件按 标签栏 → 全局 → 记忆 → 技能 → 日志 排列",
    app.indexOf("<TabBar") < app.indexOf('id="panel-global"') &&
      app.indexOf('id="panel-global"') < app.indexOf('id="panel-memory"') &&
      app.indexOf('id="panel-memory"') < app.indexOf('id="panel-skill"') &&
      app.indexOf('id="panel-skill"') < app.indexOf('id="panel-logs"'),
    app,
  );
  check("四页都在根组件里挂载（不是切页才创建）",
    ["<GlobalPanel", "<MemoryPanel", "<SkillPanel", "<LogsPanel"].every((needle) => app.includes(needle)));

  // ---- 中枢 / 身份两栏：NGrid 两列 > 两张 NCard ----
  check(
    "HubIdentity 是两栏 NGrid（1 700:2，跟旧 760px 断点对齐）",
    /<NGrid class="cols" cols="1 700:2" responsive="screen"/.test(hub),
    hub.slice(0, 200),
  );
  check("两栏栅格用 screen 断点（不是 self，避免首帧单列闪烁）",
    /<NGrid class="cols"[^>]*responsive="screen"/.test(hub));
  eq("两栏里恰好两张卡", (hub.match(/<NCard\b/g) || []).length, 2);
  eq("两栏各自一格 NGridItem", (hub.match(/<NGridItem>/g) || []).length >= 2, true);
  check("两栏标题是「中枢」「身份」", hub.includes('title="中枢"') && hub.includes('title="身份"'));
  check(
    "中枢在前、身份在后",
    hub.indexOf('title="中枢"') < hub.indexOf('title="身份"'),
    hub.indexOf('title="中枢"'),
  );
  check(
    "检查项摘要留在中枢卡里（身份卡之前）",
    hub.indexOf('id="checksSummary"') > hub.indexOf('title="中枢"') &&
      hub.indexOf('id="checksSummary"') < hub.indexOf('title="身份"'),
  );
  check("中枢卡里没有 peer 列表", hub.includes('id="peerList"') === false);
  check("记忆页的 peer 名单不在两栏里", hub.includes("<PeerList") === false);
  check("报错行与提示位在中枢卡里",
    hub.indexOf('id="reachError"') > hub.indexOf('title="中枢"') &&
      hub.indexOf('id="saveHint"') > hub.indexOf('id="reachError"'));
  check("中枢卡有地址 / key / 三个事实",
    ["serverUrl", "apiKey", "latency", "version", "transport"].every((needle) =>
      hub.includes(`id: '${needle}'`) || hub.includes(`id="${needle}"`),
    ));
  check("身份卡有门牌前缀 / 超时 / 预算",
    ["peerPrefix", "timeoutMs", "budgetTokens"].every((needle) =>
      hub.includes(`id: '${needle}'`) || hub.includes(`id="${needle}"`),
    ));
  // 超时 / 预算两格交给 NGrid :cols="2"，手写的成对栅格规则已经删掉。
  check("超时与预算同排一行（NGrid :cols=\"2\"）",
    /<NGrid :cols="2" :x-gap="10" :y-gap="8">/.test(hub), hub.slice(-900));
  const pairGridIdx = hub.indexOf('<NGrid :cols="2"');
  check("两格都在同一个 NGrid 里",
    ["timeoutMs", "budgetTokens"].every((needle) => hub.indexOf(`id: '${needle}'`) > pairGridIdx));
  check("手写的成对栅格规则已从 panel.css 删掉",
    /\.field\.pair\s*\{/.test(css) === false && /\.fact\.wide\s*\{/.test(css) === false);

  // ---- 事实行也交给 n-grid（不写手写三列 / 不再单独给 .facts 做 520px 降级） ----
  const factsGrid = /<NGrid[^>]*class="facts"[^>]*cols="1 520:3"[^>]*responsive="screen"/.exec(hub)?.[0] ?? "";
  check("中枢事实行是 NGrid（cols=\"1 520:3\" + screen 断点）",
    factsGrid !== "", hub.slice(hub.indexOf("facts"), hub.indexOf("facts") + 200));
  const factsStart = hub.indexOf('class="facts"');
  const factsBlock = factsStart < 0 ? "" : hub.slice(factsStart, hub.indexOf("</NGrid>", factsStart));
  eq("事实行三个 NGridItem", (factsBlock.match(/<NGridItem>/g) || []).length, 3);
  check("事实行仍是往返 / 版本 / 出口（id 与顺序不变）",
    factsBlock.indexOf('id="latency"') >= 0 &&
      factsBlock.indexOf('id="latency"') < factsBlock.indexOf('id="version"') &&
      factsBlock.indexOf('id="version"') < factsBlock.indexOf('id="transport"'),
    factsBlock);
  check(".facts 不再写手写栅格列",
    /grid-template-columns/.test(ruleBody(css, ".facts") || "") === false,
    ruleBody(css, ".facts") || "");
  const narrowIdx = css.indexOf("@media (max-width: 520px)");
  const narrowBody = narrowIdx < 0 ? "" : css.slice(narrowIdx, css.lastIndexOf("}"));
  check("520px 降级里不再给 .facts 改列",
    narrowIdx >= 0 && /\.facts\b/.test(narrowBody) === false, narrowBody);

  // ---- 摘要行：一行静态文字，不可点 ----
  const summaryStart = hub.indexOf('id="checksSummary"');
  const summaryLine = hub.slice(hub.lastIndexOf("<div", summaryStart), hub.indexOf(">", summaryStart) + 1);
  check("摘要行不是 button", summaryLine.includes("<button") === false, summaryLine);
  check("摘要行没有 aria-expanded", (app + hub).includes("aria-expanded") === false);
  check("摘要行不可点", /cursor\s*:\s*pointer/.test(ruleBody(css, ".checks-summary") || "") === false);
  check("摘要行没有箭头伪元素", css.includes(".checks-summary::before") === false);
  check("箭头字符已经不在了", css.includes("▸") === false && css.includes("▾") === false);
  check("折叠状态的 open 类不再用", css.includes(".checks-summary.open") === false);
  check("摘要行按档位上色（tone 直接当类名）", /:class="checksSummary\.tone"/.test(hub));
  check("问题项按 statusTone 上色", hub.includes("statusTone(problem.status)"));
  check("问题项的 details 只进 title", hub.includes("details.map(") && hub.includes(":title="));

  // ---- CSS：这一轮没改样式文件，规则必须原样还在 ----
  check("明细列表的规则还在", ruleBody(css, ".checks") !== null);
  check(
    "明细改成竖向一行一项（不再是横排胶囊）",
    /display\s*:\s*grid/.test(ruleBody(css, ".checks") || "") &&
      !/flex-wrap\s*:\s*wrap/.test(ruleBody(css, ".checks") || ""),
    ruleBody(css, ".checks") || "",
  );
  check("摘要行的规则在", ruleBody(css, ".checks-summary") !== null);
  check("状态词规则在", ruleBody(css, ".checks li .check-status") !== null);
  check(
    "状态词不叠 opacity（父项 li 已经半透，再乘一层就看不见了）",
    /opacity/.test(ruleBody(css, ".checks li .check-status") || "") === false,
    ruleBody(css, ".checks li .check-status") || "",
  );
  check("状态词前有分隔点", /content\s*:\s*"·/.test(ruleBody(css, ".checks li .check-status::before") || ""));

  // hidden 的兜底：display:grid / flex 不能再把 hidden 顶掉。
  const hiddenRule = ruleBody(css, ".page [hidden]");
  check("hidden 兜底规则在", hiddenRule !== null);
  check("hidden 兜底是 display:none !important", /display\s*:\s*none\s*!important/.test(hiddenRule || ""),
    hiddenRule || "");
  check(
    "hidden 兜底在 .checks 之前（先定规矩）",
    css.indexOf(".page [hidden] {") < css.indexOf(".checks {"),
  );

  // ---- 打分服务：容器在组件里，行由描述表驱动 ----
  check("打分服务容器在前置卡里", prelude.includes('id="scoringServices"'));
  check("前置卡在全局页里、中枢之后", globalPanel.indexOf("<PreludeCard") > globalPanel.indexOf("<HubIdentity"));
  check("打分服务容器本身不是写死的两行",
    prelude.includes('v-for="row in layout.rows"') && prelude.includes("scoringServiceLayout("));
  check("静态 HTML 里没有两组服务的写死块", html.includes('class="service-grid"') === false);
  check("打分服务有样式", /\n\.services \{/.test(css));
  // 服务行改成一条一条的 NGrid：五格（服务名 / 地址 / 模型 / 超时 / 测试），
  // 窄屏自己收成一列（700px 断点跟旧 760px 对齐）。列宽不走五等分，见下面那条。
  check("服务行是一条 NGrid（cols 1 700:5）",
    /<NGrid cols="1 700:5" responsive="screen"/.test(prelude), prelude.slice(0, 400));
  // 五格 + 结果行那一格（结果行也必须包一层 NGridItem：responsive 模式下 naive-ui
  // 会把非 NGridItem 的子节点直接丢掉，裸 <p> 放进去整行不渲染）。
  const serviceGridBody = prelude.slice(
    prelude.indexOf('cols="1 700:5"'),
    prelude.indexOf("</NGrid>", prelude.indexOf('cols="1 700:5"')),
  );
  eq("服务行是五格 + 结果行一格，六格都是 NGridItem",
    (serviceGridBody.match(/<NGridItem/g) || []).length, 6);
  check("服务行用小间距", /:x-gap="6" :y-gap="4"/.test(prelude));
  // 列宽表：服务名列压成内容宽 + 左对齐，地址列吃剩余宽度。“精排 / 决策”
  // 两个汉字等宽，不存在右对齐原本要防的“换类型时左边跟着抖”。
  check("服务名左对齐并贴底",
    /\.service-name \{[\s\S]{0,200}justify-content:\s*flex-start/.test(css) &&
      prelude.includes('class="service-name"'));
  const serviceCols = ruleBody(css, ".service > .n-grid") || "";
  check("服务行五列列宽表（auto / 1fr / .8fr / 92px / auto）",
    /grid-template-columns:\s*auto minmax\(0, 1fr\) minmax\(0, 0\.8fr\) 92px auto/.test(serviceCols),
    serviceCols);
  // NGrid 把 grid-template-columns 写成行内样式，只有 !important 能盖过它。
  // 允许三处：列宽表 + 结果行起点（两处都盖 NGridItem 的行内 grid-column）
  // + .page [hidden] 的 display 兜底。
  // panelCss() 会把注释剥掉，所以“注释里写了原因”这一半要看原文件。
  check("列宽表用 !important 盖过 NGrid 的行内样式（注释写了原因）",
    /grid-template-columns:[^;]*!important/.test(serviceCols) &&
      /NGrid 把 grid-template-columns 写成\*\*行内样式\*\*[\s\S]{0,200}!important/.test(
        panelCss({ keepComments: true }),
      ));
  eq("panel.css 里 !important 只有三处（hidden 兜底 + NGrid 列宽 + 结果行起点）",
    (css.match(/!important/g) || []).length, 3);
  // 断点跟 NGrid 的 `700:` 前缀同一个数；700px 以下不覆盖（那时 NGrid 自己
  // 就是 repeat(1, …)，单列不该被列宽表碰到）。
  check("列宽表只在 @media (min-width: 700px) 里",
    /@media \(min-width: 700px\) \{\s*\.service > \.n-grid \{/.test(css) &&
      (css.match(/grid-template-columns/g) || []).length === 1);
  // 结果行在这张 NGrid 里；span 只给宽度，起点由 CSS 盖成第 2 列。
  check("结果行在服务行 NGrid 内，span 1 700:4",
    /<NGridItem span="1 700:4" class="service-result-cell">[\s\S]{0,160}:id="row\.resultId"/.test(serviceGridBody) &&
      prelude.indexOf(':id="row.resultId"') < prelude.indexOf("</NGrid>", prelude.indexOf('cols="1 700:5"')));
  check("结果行起点盖成第 2 列（与地址列左边缘对齐）",
    /\.service > \.n-grid > \.service-result-cell \{\s*grid-column:\s*2 \/ -1 !important/.test(css),
    ruleBody(css, ".service > .n-grid > .service-result-cell") || "(规则不存在)");
  check("结果行常驻占位（不定高跳动）", /\.service-result \{[\s\S]{0,160}min-height:\s*15px/.test(css));
  check("列表下方只有一段总说明的样式", /\n\.services-note \{/.test(css));
  check("旧的两栏栅格样式已拆掉", css.includes(".service-grid") === false);
  check("测试按钮靠底对齐", /\.field\.service-test \{[\s\S]{0,120}align-items:\s*flex-end/.test(css));
  for (const tone of ["ok", "bad", "muted"]) {
    check(`结果行的 ${tone} 档有样式`, new RegExp(`\\.service-result\\.${tone} \\{`).test(css));
  }
  check("结果行样式存在", /\n\.service-result \{/.test(css));
  check("整对回退说明有样式", /\n\.channel-pair-note \{/.test(css));

  // ---- 顶部身份条与页脚（根组件里） ----
  check("顶部条有圆点 / 药丸 / 副标题 / 两个按钮",
    ["id=\"dot\"", "id=\"statePill\"", "id=\"subLine\"", "id=\"testBtn\"", "id=\"refreshBtn\""].every(
      (needle) => app.includes(needle),
    ));
  check("页脚在根组件里", app.includes('<footer id="foot" class="foot"'));
  check("根组件用 data-hana-app-ui 标记面板根", /data-hana-app-ui/.test(app));
  check("顶部条文案取自 statusView（不在模板里拼字符串）",
    app.includes("view.pillText") && app.includes("view.subLine"));
  check("刷新按钮在读取中禁用", /:disabled="refreshing"/.test(app));
  check("测试连接按钮有测试中文案", app.includes('"测试中…"') && app.includes("测试连接"));
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
    url: "http://127.0.0.1:8000/health",
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
  ], [100, 8000]);
  eq("超时字符串归一成数字", normalizeServiceTimeout(" 1200 ", "rerank"), 1200);
  eq("数字也能归一", normalizeServiceTimeout(1200, "rerank"), 1200);
  eq("小数向下取整", normalizeServiceTimeout("1200.9", "rerank"), 1200);
  eq("空串 = 没配（null，不是 800）", normalizeServiceTimeout("   ", "rerank"), null);
  eq("非数字 = 没配", normalizeServiceTimeout("abc", "rerank"), null);
  eq("低于下限 = 没配", normalizeServiceTimeout(99, "rerank"), null);
  eq("高于上限 = 没配", normalizeServiceTimeout(10001, "rerank"), null);
  eq("决策那组的上限也是 8000（与运行时上限一致）", normalizeServiceTimeout(8000, "systemone"), 8000);
  eq("决策超时 8001 越界", normalizeServiceTimeout(8001, "systemone"), null);
  eq("同一个值对精排越界", normalizeServiceTimeout(12000, "rerank"), null);
  eq("认不出的类型按精排那组", normalizeServiceTimeout("99999", "nope"), null);
  eq("未配置取默认值", [
    serviceTimeoutOrDefault("", "rerank"),
    serviceTimeoutOrDefault(null, "systemone"),
  ], [800, 3500]);
  eq("配了就用自己的", [
    serviceTimeoutOrDefault("1200", "rerank"),
    serviceTimeoutOrDefault(8000, "systemone"),
  ], [1200, 8000]);
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
    "只给模型 400 理由写明配了模型名就要填地址",
    servicePairError("", "bge", "rerankServiceUrl", "rerankServiceModel"),
    "rerankServiceUrl 配了模型名就要填地址",
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

// ================= ui: 召回策略在主面板（组件 + 状态机） =================
{
  // 手写版已删除；整页现在只有 Vue 实现：
  //   控件在 components/RecallCard.vue / ChannelList.vue / PreludeCard.vue；
  //   读 / 写 / 回滚在 lib/panel-store.js（冒烟后面用假 fetch 真跑一遍）。
  const html = panelHtml();
  const css = panelCss();
  const recall = uiCode("components/RecallCard.vue");
  const channels = uiCode("components/ChannelList.vue");
  const prelude = uiCode("components/PreludeCard.vue");
  const hub = uiCode("components/HubIdentity.vue");
  const memoryPanel = uiCode("components/MemoryPanel.vue");
  const storeJs = uiSrcRaw("lib/panel-store.js");
  const layersJs = uiSrcRaw("lib/recall-layers.js");
  const settingsHtml = fs.readFileSync(path.join(import.meta.dirname, "../ui/settings.html"), "utf8");
  const settingsAppSrc = uiSrcRaw("SettingsApp.vue");

  // 五个 NSelect 的 id 都走 :input-props（裸 id 会落到外层 div，label for 就指空了）。
  const gateIdx = recall.indexOf("id: 'recallGate'");
  const modeIdx = recall.indexOf("id: 'queryMode'");
  const rerankIdx = recall.indexOf("id: 'rerank'");
  check("面板上有召回判断下拉", gateIdx > 0, `idx=${gateIdx}`);
  check("面板上有召回查询下拉", modeIdx > 0, `idx=${modeIdx}`);
  check("面板上有结果重排下拉", rerankIdx > 0, `idx=${rerankIdx}`);
  check(
    "召回判断三个选项齐全（{label,value} 形状）",
    /\{ label: "不判断（每轮都召回）", value: "off" \}/.test(recall) &&
      /\{ label: "规则跳过（极短的纯操作指令）", value: "rules" \}/.test(recall) &&
      /\{ label: "模型判断（用宿主模型）", value: "llm" \}/.test(recall),
  );
  check("召回查询两个选项齐全（{label,value} 形状）",
    /\{ label: "最后一句", value: "last" \}/.test(recall) &&
      /\{ label: "带上文（最近三条）", value: "context" \}/.test(recall));
  check(
    "结果重排只有关 / 开启两项",
    /\{ label: "关", value: "off" \}/.test(recall) &&
      /\{ label: "开启", value: "llm" \}/.test(recall),
    recall.slice(rerankIdx, rerankIdx + 320),
  );
  check("召回判断在前、召回查询在后", gateIdx < modeIdx);
  check("结果重排排在召回查询之后", modeIdx < rerankIdx);
  // 这一栏的主栅格恰好三个下拉；两个展开区各只有一个模型下拉。
  check(
    "召回判断 / 查询 / 重排是三个主下拉",
    (recall.slice(0, recall.indexOf('id="gateAdvanced"')).match(/<NSelect\b/g) || []).length === 3,
  );
  const advancedIdx = recall.indexOf('id="gateAdvanced"');
  const rerankAdvancedIdx = recall.indexOf('id="rerankAdvanced"');
  check(
    "llm 判断展开区只有一个模型下拉（不再分两层）",
    (recall.slice(advancedIdx, rerankAdvancedIdx).match(/<NSelect\b/g) || []).length === 1,
  );
  check(
    "重排展开区只有一个模型下拉",
    (recall.slice(rerankAdvancedIdx, recall.indexOf('<div class="recall-sep"')).match(/<NSelect\b/g) || [])
      .length === 1,
  );
  check("下拉与名单之间有分隔", /class="recall-sep"/.test(recall));
  check("召回管理一栏在记忆页里", memoryPanel.includes("<RecallCard />"));
  // 三个下拉与 peer 名单在同一张卡里（同一栏）。
  const recallStart = recall.indexOf('class="recall"');
  const recallEnd = recall.lastIndexOf("</NCard>");
  check(
    "三个下拉与 peer 列表在同一张卡内",
    [gateIdx, modeIdx, rerankIdx].every((idx) => idx > recallStart && idx < recallEnd) &&
      recall.indexOf("<PeerList") > recallStart &&
      recall.indexOf("<PeerList") < recallEnd,
  );
  check("计数也在这一栏里（仍算 peer 个数）", recall.includes('id="peerCount"'));
  check("计数在卡的 #header-extra 里（折叠 / 滚动都还看得见）",
    /<template #header-extra>[\s\S]{0,120}id="peerCount"/.test(recall));
  eq(
    "这一栏的标题是「召回管理」",
    /title="([^"]*)"/.exec(recall)?.[1],
    "召回管理",
  );
  check("面板没有为召回单设保存按钮",
    recall.includes("recallSave") === false &&
      (recall.match(/保存/g) || []).length === 0,
    recall.match(/.{0,20}保存.{0,20}/g)?.join(" | ") ?? "");
  check("说明小字用 field-hint", (recall.match(/class="field-hint"/g) || []).length >= 4);
  check("规则跳过的说明在组件里", recall.includes("≤8 字") && recall.includes("指代词"));
  check("带上文的说明在组件里",
    recall.includes("300 字符") && recall.includes("最新一句保持完整"));
  check(
    "名单底部说明串起两件事",
    uiCode("components/PeerList.vue").includes("点一下任意一行可以排除这个 peer") &&
      uiCode("components/PeerList.vue").includes("不再参与上面的召回"),
  );
  check("旧的独立 recall-row 区块已经不在", !recall.includes("recall-row") && !css.includes(".recall-row"));
  check("下拉那一行是 NGrid（cols 1 700:3）",
    /<NGrid class="recall-grid" cols="1 700:3" responsive="screen"/.test(recall),
    recall.slice(0, 400));
  check("召回那三个下拉并排（一行三列，700px 以下收成一列）",
    /<NGrid class="recall-grid" cols="1 700:3"/.test(recall) &&
      recall.includes(':x-gap="10"'),
    recall.slice(recall.indexOf('class="recall-grid"'), recall.indexOf('class="recall-grid"') + 160));
  check("主下拉的栅格本身就是置灰层（.dim 挂在 NGrid 上）",
    /class="recall-grid"[^>]*:class="\{ dim: !enabled \}"/.test(recall));
  check("分隔线有样式", /\n\.recall-sep \{/.test(css));
  check("peer 名单样式还在", /\n\.peer-list \{/.test(css));
  check("下拉用 n-select（原生 select 已清零）",
    /<NSelect\b/.test(recall) && recall.includes("<select") === false);

  // ---- 即时生效：改了就发，没有保存按钮 ----
  check(
    "三个主下拉都绑 update:value 即时提交",
    (recall.match(/@update:value="\(value\) => onSelect\('(recallGate|queryMode|rerank)'/g) || []).length === 3,
    (recall.match(/@update:value="\(value\) => onSelect\(/g) || []).length,
  );
  check("select 的 update:value 走 store.setForm", recall.includes("setForm(key, value)"));
  check(
    "setForm 改完立刻 saveLayers",
    /function setForm\(key, value\)[\s\S]{0,120}saveLayers\(\)/.test(storeJs),
  );
  check("面板读取召回策略", storeJs.includes('get("/recall-mode")'));
  check("面板提交召回策略", storeJs.includes('post("/recall-mode"'));
  check("提交把通道数组转成 JSON 串", storeJs.includes("rerankChannelsText(rerankChannels)"));
  check(
    "整单提交走 commitLayers 的 apply 链",
    storeJs.includes("commitLayers({") &&
      storeJs.includes("apply: (layers) =>") &&
      storeJs.includes("normalize: paintRecallConfig"),
  );
  check(
    "一次只发一单（请求在飞时改动记 dirty）",
    storeJs.includes("layersPending") && storeJs.includes("layersDirty"),
  );

  // ---- llm 展开块：显隐由值决定，提示词是 value 不是 placeholder ----
  check("llm 展开块存在", advancedIdx > 0);
  check(
    "展开块显隐由召回判断决定",
    /id="gateAdvanced"[\s\S]{0,200}:hidden="!gateOpen"/.test(recall) &&
      recall.includes('state.form.recallGate === "llm"'),
    recall.slice(advancedIdx, advancedIdx + 220),
  );
  const promptTag = /<NInput\b[\s\S]*?id: 'gatePrompt'[\s\S]*?\/>/.exec(recall)?.[0] ?? "";
  check("提示词框是 n-input textarea（4~8 行自适应）",
    /type="textarea"/.test(promptTag) && /autosize="\{ minRows: 4, maxRows: 8 \}"/.test(promptTag), promptTag);
  check("提示词框有长度上限 2000", /:maxlength="2000"/.test(promptTag), promptTag);
  // 默认提示词靠 value 填，不靠 placeholder：placeholder 一敲键盘就消失，当不了草稿。
  // （placeholder 里只允许放“留空会怎样”的提示，不允许放模板本身。）
  check("提示词框的 placeholder 只是一句空态提示，不是模板",
    /placeholder="留空则用内置默认模板"/.test(promptTag) &&
      recall.includes(`placeholder="${DEFAULT_GATE_PROMPT}`) === false,
    promptTag);
  check("提示词框绑的是 value（草稿坐在框里）", /:value="state\.prompts\.gate"/.test(promptTag), promptTag);
  check("默认提示词不写进组件", recall.includes(DEFAULT_GATE_PROMPT) === false);
  check(
    "恢复默认按钮在",
    /id="gateResetPrompt"[\s\S]{0,200}@click="resetPrompt\('gate'\)"/.test(recall),
  );
  check(
    "恢复默认只填框、走正常提交",
    /function resetPrompt\(which\)[\s\S]{0,260}saveLayers\(\)/.test(storeJs) &&
      storeJs.includes("touchPrompt(which, value)"),
  );
  check("提示词状态位在", recall.includes('id="gatePromptStatus"'));
  check("状态小字由 promptStatus 生成",
    recall.includes("gateStatus") && storeJs.includes("promptStatus(state.prompts.gate)"));
  check(
    "提示词框下有占位符说明",
    recall.includes("用 {{message}} 表示当前这条用户消息；没写它的话，消息会自动接在末尾。"),
  );
  check(
    "提示词框绑 update:value 时标记 touched",
    /@update:value="onPromptInput\('gate'/.test(recall) &&
      storeJs.includes("state.prompts.gateTouched = true"),
  );
  check("空提示词不再写“留空使用默认”", recall.includes("留空使用默认提示词") === false);
  check("没有模型来源两个单选", recall.includes('name="gateModelMode"') === false);
  check("没有第二层 provider 下拉", recall.includes('id="gateProvider"') === false);
  check("没有可展开的自选区", recall.includes('id="gateCustom"') === false);
  check("判断模型只有一个下拉",
    (recall.match(/<NSelect\b[\s\S]{0,240}?id: 'gateModel'/g) || []).length === 1);
  check(
    "模型下拉选项来自目录（首项是默认）",
    /:options="gateModelOptions"/.test(recall) &&
      storeJs.includes("[DEFAULT_MODEL_OPTION, ...modelOptions(state.models.models)]"),
  );
  check("目录坏了只留默认项", storeJs.includes("[DEFAULT_MODEL_OPTION]"));
  check("模型下拉不预设禁用", /id="gateModel"[^>]*disabled/.test(recall) === false);
  check("目录读不到时留原因位", recall.includes('id="gateModelsHint"'));
  check("面板读模型目录", storeJs.includes('get("/models")'));
  check("新控件有样式", /\n\.gate-advanced \{/.test(css));
  check("提示词框走 naive-ui 的 textarea 自适应（不再吃 .field textarea 样式）",
    /autosize="\{ minRows: 4, maxRows: 8 \}"/.test(recall) && !/\n\.field textarea \{/.test(css));

  // ---- 结果重排：下拉、展开块、提示词与模型 ----
  check("重排展开块存在", rerankAdvancedIdx > 0);
  check(
    "重排展开块显隐由结果重排决定",
    /id="rerankAdvanced"[\s\S]{0,200}:hidden="!rerankOpen"/.test(recall) &&
      recall.includes('state.form.rerank === "llm"'),
  );
  const rerankPromptTag = /<NInput\b[\s\S]*?id: 'rerankPrompt'[\s\S]*?\/>/.exec(recall)?.[0] ?? "";
  check("重排提示词框是 n-input textarea（4~8 行自适应）",
    /type="textarea"/.test(rerankPromptTag) &&
      /autosize="\{ minRows: 4, maxRows: 8 \}"/.test(rerankPromptTag));
  check("重排提示词框的 placeholder 也是一句空态提示",
    /placeholder="留空则用内置默认模板"/.test(rerankPromptTag), rerankPromptTag);
  check("重排提示词框绑的是 value", /:value="state\.prompts\.rerank"/.test(rerankPromptTag));
  check(
    "重排恢复默认按钮在",
    /id="rerankResetPrompt"[\s\S]{0,200}@click="resetPrompt\('rerank'\)"/.test(recall),
  );
  check("重排提示词状态位在", recall.includes('id="rerankPromptStatus"'));
  check("重排状态小字由 rerankPromptStatus 生成",
    storeJs.includes("rerankPromptStatus(state.prompts.rerank)"));
  check(
    "重排提示词框下有占位符说明",
    recall.includes("用 {{message}} 表示当前这条用户消息") &&
      recall.includes("用 {{candidates}} 表示候选清单"),
  );
  check(
    "重排提示词框绑 update:value 时标记 touched",
    /@update:value="onPromptInput\('rerank'/.test(recall) &&
      storeJs.includes("state.prompts.rerankTouched = true"),
  );
  check("重排模型只有一个下拉",
    (recall.match(/<NSelect\b[\s\S]{0,240}?id: 'rerankModel'/g) || []).length === 1);
  check("重排模型下拉选项来自目录", /:options="rerankModelOptions"/.test(recall));
  check("重排模型下拉不预设禁用", /id="rerankModel"[^>]*disabled/.test(recall) === false);
  check("重排目录读不到时留原因位", recall.includes('id="rerankModelsHint"'));
  check("重排展开区里放着通道列表", /<ChannelList \/>/.test(recall) &&
    recall.indexOf("<ChannelList") > rerankAdvancedIdx);

  // ---- 精排通道：列表、添加、空态、测试 ----
  check("面板有通道列表", channels.includes('id="rerankChannelList"'));
  check("通道行由 channelView 生成", channels.includes("channelView(channel, index)"));
  check("面板有添加通道按钮", /id="rerankAddChannel"[\s\S]{0,220}添加通道/.test(channels));
  check("通道为空时有空态文案", channels.includes("还没有通道，精排不会生效"));
  check("面板有测试按钮", /id="rerankTestBtn"[\s\S]{0,220}测试/.test(channels));
  check("面板有测试结果位", channels.includes('id="rerankTestResult"'));
  check("通道类型选项按已配服务生成", channels.includes("channelTypeChoices()") &&
    storeJs.includes("channelTypeOptions(state.layers)"));
  check("通道行不再有 URL 与模型输入",
    ["row.channel.url", "row.channel.model", 'placeholder="http'].every(
      (needle) => channels.includes(needle) === false,
    ));
  check("服务未配置的通道会标红", channels.includes("row.unavailable") &&
    channels.includes("服务未配置，不会生效") &&
    storeJs.includes("channelServiceMissing(channel, state.layers)"));
  check("两个服务都没配时添加按钮禁用",
    channels.includes(":disabled=\"addDisabled\"") &&
      /noService = computed\(\(\) => typeOptions\.value\.every/.test(channels));
  check("删除按钮在通道行里", channels.includes(">删除</NButton>"));
  check("权重输入有边界", channels.includes(':min="0.1"') && channels.includes(':max="10"'));
  check("权重收敛在 store 里", /Math\.min\(10, Math\.max\(0\.1, parsed\)\)/.test(storeJs));
  check("添加通道用空模板", storeJs.includes("emptyRerankChannel(firstType)"));
  check(
    "服务端投影落地时通道行跟着重画（没填完的行留在草稿里）",
    /const pending = state\.channels\.filter\(\(channel\) => !isCompleteRerankChannel\(channel\)\)/.test(storeJs) &&
      /state\.channels = \[\.\.\.state\.layers\.rerankChannels, \.\.\.pending\]/.test(storeJs),
  );
  check(
    "打分服务字段的 change 也走整单提交",
    /function setServiceField\(key, value\)[\s\S]{0,400}return saveLayers\(\)/.test(storeJs),
  );
  check(
    "改一格就重算上一次的测试结果（旧结论作废）",
    /const kind = serviceKindOfField\(key\);/.test(storeJs),
  );
  check("通道上限来自 lib", channels.includes("RERANK_CHANNELS_MAX") && storeJs.includes("RERANK_CHANNELS_MAX"));
  check("测试按钮打通道测试端点", storeJs.includes('post("/recall-mode/test"'));
  check("通道行是一张 n-card（小号）",
    /<NCard\b[\s\S]{0,200}size="small"/.test(channels) && channels.includes('class="channel-card"'));
  check("通道卡正文是四格 NGrid（520 两列 / 700 四列）",
    /<NGrid cols="1 520:2 700:4" responsive="screen"/.test(channels));
  check("通道列表外面套 NScrollbar（条目多时区内滚）",
    /<NScrollbar class="channel-scroll">/.test(channels) &&
      /id="rerankChannelList"[\s\S]{0,80}<NScrollbar/.test(channels));
  check("测试结果有样式", /\n\.channel-result \{/.test(css));
  eq("通道上限与后端一致", UI_RERANK_CHANNELS_MAX, RERANK_CHANNELS_MAX);
  eq("三种通道都有下拉文案", Object.keys(RERANK_CHANNEL_LABELS), ["rerank", "systemone", "model"]);
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
    channels.includes("默认 5 条") && channels.includes(`只问前 ${SYSTEMONE_MAX_CANDIDATES}`) === false,
  );
  check("通道行能编辑超时", channels.includes("超时（ms）"));
  check(
    "超时那一格注明候选越多越慢",
    channels.includes("候选越多越慢") && channels.includes("SYSTEMONE_TIMEOUT_STEP"),
  );
  check(
    "通道说明写清超时三层优先级",
    channels.includes("通道自带 &gt; 服务配置 &gt; 类型默认值"),
  );
  check(
    "通道说明写清地址与模型成对",
    channels.includes("通道自带的地址与模型成对生效，只填一半就整对改用服务配置"),
  );
  check("通道行会画整对回退说明", channels.includes("row.pairNote") &&
    storeJs.includes("channelPairNote(channel, state.layers)"));
  check("添加通道旁提示指向上面", channels.includes("先在上面配好打分服务"));
  check("提示不写“先在下面”", channels.includes("先在下面配好打分服务") === false);

  // ---- 打分服务的接线点 ----
  check("面板往 service-test 发请求", storeJs.includes('post("/recall-mode/service-test"'));
  check("面板有服务测试的执行函数", /async function testService\(kind\)/.test(storeJs));
  check("服务测试按钮进 loading 并禁用",
    prelude.includes(":disabled=\"resultOf(row.kind).pending\"") && prelude.includes("测试中…"));
  check(
    "测试按钮由描述表推出",
    prelude.includes('v-for="row in layout.rows"') &&
      prelude.includes(":id=\"row.testId\"") &&
      prelude.includes("@click=\"onTest(row.kind)\"") &&
      prelude.includes("testService(kind)"),
    prelude.slice(prelude.indexOf("<button"), prelude.indexOf("<button") + 200),
  );
  check("结果行按 tone 上色", prelude.includes(':class="resultOf(row.kind).tone"'));
  check(
    "结果行常驻（空着也占位，不设 hidden）",
    /class="service-result"[\s\S]{0,120}:class="resultOf\(row\.kind\)\.tone"/.test(prelude) &&
      prelude.includes(":hidden") === false,
  );
  check("结果行文案来自 serviceTestView",
    storeJs.includes("serviceTestView(out, body.model)") &&
      storeJs.includes("serviceTestView(null)"));
  check("改一格就收掉上一次的测试结果",
    /state\.serviceResults\[kind\] = \{ tone: "", text: "", pending: false \}/.test(storeJs));
  check("服务字段按描述表渲染", prelude.includes("scoringServiceLayout()") &&
    prelude.includes("state.draft[row.url.key]"));
  check("服务地址与模型成对（半对不发）", storeJs.includes("readServicePair(service)") &&
    /if \(Boolean\(url\) !== Boolean\(model\)\) return \{\}/.test(storeJs));
  check("清空一半时另一半也清掉", storeJs.includes("servicePartnerOf(key)") &&
    /if \(partner && !draftOf\(key\)\.trim\(\)\) state\.draft\[partner\] = ""/.test(storeJs));
  check("置灰覆盖到召回下拉", /class="recall-grid"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(recall));
  check("置灰覆盖到两个展开区",
    (recall.match(/:class="\{ dim: !enabled \}"/g) || []).length >= 3);
  check("总闸关着时打分服务也置灰",
    /class="services"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(prelude));
  check("总闸关着时探针也置灰",
    /class="toggle"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(prelude));
  check("总闸关着时技能路由也置灰",
    /:class="\{ dim: !enabled \}"/.test(uiCode("components/SkillRoute.vue")));

  // ---- 两份默认模板：lib 里各一份，组件与 HTML 里零份 ----
  check("判断默认模板不在 HTML 里", html.includes(DEFAULT_GATE_PROMPT) === false);
  check("重排默认模板不在 HTML 里", html.includes(DEFAULT_RERANK_PROMPT) === false);
  eq("判断默认模板在 lib 里只有一份", layersJs.split(DEFAULT_GATE_PROMPT).length - 1, 1);
  eq("重排默认模板在 lib 里只有一份", layersJs.split(DEFAULT_RERANK_PROMPT).length - 1, 1);
  eq("两份重排默认提示词逐字一致", UI_DEFAULT_RERANK_PROMPT, DEFAULT_RERANK_PROMPT);
  eq("两份判断默认提示词逐字一致", UI_DEFAULT_GATE_PROMPT, DEFAULT_GATE_PROMPT);

  // ---- Vue 组件与构建链 ----
  const appVue = uiCode("App.vue");
  const settingsAppVue = uiCode("SettingsApp.vue");
  const settingsEntry = uiSrcRaw("entries/settings.js");
  const panelEntry = uiSrcRaw("entries/panel.js");
  const themeJs = uiSrcRaw("theme.js");
  const connFieldsJs = uiSrcRaw("conn-fields.js");
  const builtPanelJs = fs.readFileSync(
    path.join(import.meta.dirname, "../ui/assets/panel.js"),
    "utf8",
  );
  const builtSettingsJs = fs.readFileSync(
    path.join(import.meta.dirname, "../ui/assets/settings.js"),
    "utf8",
  );

  check(
    "根组件把主题对齐到面板色板（n-config-provider + lightThemeOverrides + theme.js）",
    /<NConfigProvider\b/.test(appVue) &&
      appVue.includes("lightThemeOverrides") &&
      appVue.includes('from "./theme.js"'),
    appVue.slice(0, 160),
  );
  check(
    "构建产物把整页挂到 #panel-app",
    builtPanelJs.includes('mount("#panel-app")') &&
      /["']\.\/chunk-vue\.js["']/.test(builtPanelJs),
    builtPanelJs.slice(0, 120),
  );
  check(
    "设置页构建产物只负责把组件挂到挂载点",
    builtSettingsJs.includes('mount("#settings-app")') &&
      /["']\.\/chunk-vue\.js["']/.test(builtSettingsJs) &&
      /["']\.\/sdk\.js["']/.test(builtSettingsJs),
    builtSettingsJs.slice(0, 120),
  );
  check(
    "面板入口只做接线 + 挂载",
    panelEntry.includes('mount("#panel-app")') &&
      panelEntry.includes('from "../App.vue"') &&
      panelEntry.includes("createConfig({") &&
      panelEntry.includes('from "../api.js"') &&
      panelEntry.includes("/recall-mode") === false,
    panelEntry.slice(0, 240),
  );
  check(
    "设置页入口文件只做挂载",
    settingsEntry.includes('mount("#settings-app")') &&
      settingsEntry.includes('from "../SettingsApp.vue"') &&
      settingsEntry.includes("/recall-mode") === false,
    settingsEntry.slice(0, 160),
  );
  check(
    "theme.js 导出共用的 lightThemeOverrides",
    /export const lightThemeOverrides\s*=/.test(themeJs) &&
      themeJs.includes("darkThemeOverrides") === false,
  );
  check(
    "面板与设置页共同 import theme.js（不各写一份）",
    appVue.includes('from "./theme.js"') &&
      settingsAppVue.includes('from "./theme.js"') &&
      appVue.includes("const themeOverrides") === false &&
      settingsAppVue.includes("const themeOverrides") === false,
  );
  check(
    "主题色对齐手写 CSS（accent / ok / bad）",
    ["#6f8f68", "#7ea176", "#5f7d59", "#5d7d56", "#b8564d"].every((color) =>
      themeJs.includes(color),
    ),
  );

  // ---- 亮色主题：浅色字打在浅色底上，会让「有值」的输入框看着像空的 ----
  // 断言只看代码，不看注释：解释「为什么不用深色主题」的注释里会提到 darkTheme。
  const codeOnly = (source) =>
    source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/[^\n]*/gm, "");
  const appCode = codeOnly(uiSrcRaw("App.vue"));
  const settingsCode = codeOnly(uiSrcRaw("SettingsApp.vue"));
  const themeCode = codeOnly(themeJs);
  check(
    "theme.js 不 import darkTheme（不回 naive-ui 借深色底）",
    /^\s*import\b/m.test(themeCode) === false && themeCode.includes("darkTheme") === false,
    themeCode.slice(0, 160),
  );
  check(
    "亮色主题不再覆盖文字/标签颜色",
    themeCode.includes("labelTextColor") === false &&
      themeCode.includes("textColor") === false &&
      themeCode.includes("236, 236, 236") === false,
  );
  eq("Form 不再覆盖 labelTextColor", lightThemeOverrides.Form, undefined);
  eq("Input 不再覆盖 textColor", lightThemeOverrides.Input?.textColor, undefined);
  eq("Button 不再覆盖文案颜色", lightThemeOverrides.Button?.textColor, undefined);
  eq(
    "Switch 交给 naive-ui 亮色默认（白钮自带阴影，不再写死 #f6f6f6）",
    lightThemeOverrides.Switch,
    undefined,
  );
  // 组件级覆盖与 common.borderRadius 全部删掉：naive-ui 自己的亮色默认值就是
  // 我们要的样子，再钉一遍等于把它当画板重画。
  eq("Input 不再有组件级覆盖（底色 / 边框 / 圆角全交给 naive-ui）",
    lightThemeOverrides.Input, undefined);
  eq("Button 不再有组件级覆盖", lightThemeOverrides.Button, undefined);
  eq("Alert 不再有组件级覆盖", lightThemeOverrides.Alert, undefined);
  eq("common 不再覆盖 borderRadius", lightThemeOverrides.common?.borderRadius, undefined);
  check(
    "主题只剩品牌色（common 里的 primary / success / error 三组）",
    Object.keys(lightThemeOverrides).join(",") === "common" &&
      Object.keys(lightThemeOverrides.common).every((key) =>
        /^(primary|success|error)Color(Hover|Pressed|Suppl)?$/.test(key),
      ),
    Object.keys(lightThemeOverrides.common).join(","),
  );
  check("品牌色一个都没少",
    ["#6f8f68", "#7ea176", "#5f7d59", "#5d7d56", "#b8564d"].every((color) =>
      Object.values(lightThemeOverrides.common).includes(color),
    ),
    Object.values(lightThemeOverrides.common).join(","));
  check(
    "两个组件都不传 :theme，只用 theme-overrides",
    [appCode, settingsCode].every(
      (source) =>
        /<NConfigProvider\b/.test(source) &&
        source.includes(':theme-overrides="lightThemeOverrides"') &&
        source.includes(":theme=") === false &&
        source.includes("darkTheme") === false,
    ),
    `${appCode.slice(0, 80)} | ${settingsCode.slice(0, 80)}`,
  );
  check(
    "构建产物里也没有浅色文字值（亮色主题真的进了 bundle）",
    builtSettingsJs.includes("rgba(236, 236, 236") === false &&
      builtPanelJs.includes("rgba(236, 236, 236") === false,
  );
  check(
    "SettingsApp 用 n-form / n-form-item / n-input / n-button / n-alert",
    ["NForm", "NFormItem", "NInput", "NButton", "NAlert"].every((name) =>
      new RegExp(`<${name}\\b`).test(settingsAppVue),
    ),
  );
  check(
    "SettingsApp 读写 /conn，只提交一次",
    (settingsAppVue.match(/hana\.api\.fetch\(/g) || []).length === 2 &&
      settingsAppVue.includes('hana.api.fetch("/conn"') &&
      settingsAppVue.includes('hana.api.fetch("/conn", {'),
  );
  check(
    "SettingsApp 字段名仍是 serverUrl / apiKey / peerPrefix",
    ["serverUrl", "apiKey", "peerPrefix"].every((name) =>
      new RegExp(`\\b${name}\\b`).test(settingsAppVue),
    ),
  );
  check(
    "SettingsApp 不再碰召回配置",
    ["/recall-mode", "recallGate", "queryMode", "<select"].every(
      (needle) => settingsAppVue.includes(needle) === false,
    ),
  );
  check(
    "API Key 掩码行为保持不变（聚焦清空 / 失焦恢复 / 等于掩码视为没改）",
    settingsAppVue.includes("buildMask") === false &&
      connFieldsJs.includes("buildMask") &&
      connFieldsJs.includes('"•".repeat(8)') &&
      settingsAppVue.includes("apiKey.value === mask") &&
      settingsAppVue.includes('apiKey.value.trim() === "" && mask') &&
      settingsAppVue.includes("typed !== mask") &&
      settingsAppVue.includes('placeholder="未填写"'),
  );
  check(
    "保存成功/失败的状态文案不变，失败显示服务端错误",
    settingsAppVue.includes('setStatus("保存中…")') &&
      settingsAppVue.includes('setStatus("已保存", "ok")') &&
      settingsAppVue.includes("data.error") &&
      settingsAppVue.includes('type="error"'),
  );
  check(
    "vue 单独成块（chunk-vue.js 存在）",
    fs.existsSync(path.join(import.meta.dirname, "../ui/assets/chunk-vue.js")),
  );
  check(
    "产物保留宿主的 sdk.js 外链（不把宿主文件打进 bundle）",
    /["']\.\/sdk\.js["']/.test(builtPanelJs),
  );
  check("toggleGrid 容器已拆掉", html.includes('id="toggleGrid"') === false);

  // ---- ui-src 构建链：依赖、产物位置与几个不能再丢的设定 ----
  const uiPackage = JSON.parse(uiProjectRaw("package.json"));
  const viteConfig = uiProjectRaw("vite.config.mjs");
  eq("ui-src 工程名", uiPackage.name, "hanako-openviking-ui");
  eq("ui-src 的构建命令", uiPackage.scripts?.build, "vite build");
  check(
    "ui-src 依赖版本与参照工程一致（vue 3.5 / naive-ui 2.45 / vite 6）",
    /^\^3\.5\./.test(uiPackage.dependencies?.vue ?? "") &&
      /^\^2\.45\./.test(uiPackage.dependencies?.["naive-ui"] ?? "") &&
      /^\^6\./.test(uiPackage.devDependencies?.vite ?? "") &&
      /^\^5\.2\./.test(uiPackage.devDependencies?.["@vitejs/plugin-vue"] ?? ""),
    JSON.stringify(uiPackage.dependencies) + JSON.stringify(uiPackage.devDependencies),
  );
  check("不引 pinia / vue-router",
    uiPackage.dependencies?.pinia === undefined &&
      uiPackage.dependencies?.["vue-router"] === undefined &&
      [storeJs, uiSrcRaw("composables/useConfig.js")].every(
        (source) => /from\s+["']pinia["']/.test(source) === false &&
          /from\s+["']vue-router["']/.test(source) === false,
      ));
  check(
    "构建不清空 ui/assets（里面还有宿主下发的 sdk.js / app-ui.*）",
    /emptyOutDir:\s*false/.test(viteConfig),
  );
  check(
    "sdk.js 保持外链且相对产物目录解析",
    /external:\s*\["\.\/sdk\.js"\]/.test(viteConfig) &&
      /makeAbsoluteExternalsRelative:\s*false/.test(viteConfig),
  );
  check(
    "产物文件名不带 hash、vue 单独成块、目标 es2020",
    /entryFileNames:\s*"\[name\]\.js"/.test(viteConfig) &&
      /chunkFileNames:\s*"chunk-\[name\]\.js"/.test(viteConfig) &&
      /manualChunks:\s*\{\s*vue:\s*\["vue"\]\s*\}/.test(viteConfig) &&
      /target:\s*"es2020"/.test(viteConfig),
  );
  const assetsDir = path.join(import.meta.dirname, "../ui/assets");
  check(
    "构建入口用页面名（panel / settings / card）",
    /"panel":\s*resolve\(here, "src\/entries\/panel\.js"\)/.test(viteConfig) &&
      /"settings":\s*resolve\(here, "src\/entries\/settings\.js"\)/.test(viteConfig) &&
      /"card":\s*resolve\(here, "src\/entries\/card\.js"\)/.test(viteConfig) &&
      /-vue":\s/.test(viteConfig) === false,
    viteConfig.slice(viteConfig.indexOf("input:"), viteConfig.indexOf("output:")),
  );
  check(
    "构建产物：panel.js / settings.js / card.js",
    ["panel.js", "settings.js", "card.js"].every((name) =>
      fs.existsSync(path.join(assetsDir, name)),
    ),
  );
  check(
    "手写副本已删除：只剩构建产物与本轮保留的静态 CSS",
    ["recall-layers.js", "tabs.js", "check-summary.js", "check-tone.js", "session-key.js"].every(
      (name) => fs.existsSync(path.join(assetsDir, name)) === false,
    ) && fs.existsSync(path.join(assetsDir, "card.css")),
  );
  check(
    "设置页 HTML 只引用构建产物 settings.js",
    settingsHtml.includes('src="./assets/settings.js"') &&
      settingsHtml.includes("-vue") === false,
  );
  // 参考工程的 assetFileNames 是 [name].[ext]：SFC 里一旦写 <style>，
  // 构建就会把整份手写 panel.css 覆盖成只剩这一页的几条规则。
  check(
    "SFC 里不写 <style>（样式集中在手写的 panel.css / card.css）",
    ["components/TabBar.vue", "components/GlobalPanel.vue", "components/MemoryPanel.vue", "components/SkillPanel.vue", "App.vue", "SettingsApp.vue", "CardApp.vue", "components/CardRow.vue"].every(
      (name) => /^\s*<style[\s>]/m.test(uiSrcRaw(name)) === false,
    ),
  );
  check("CSS 仍是手写的静态文件（构建不产出 panel.css）",
    !viteConfig.includes('"panel.css"') && !/input:\s*\{[^}]*panel\.css/.test(viteConfig));

  // ---- 设置页只剩连接 ----
  const settingsVue = uiSrcRaw("SettingsApp.vue");
  check("设置页不再有召回判断", settingsHtml.includes("recallGate") === false);
  check("设置页不再有召回查询", settingsHtml.includes("queryMode") === false);
  check("设置页不再有下拉", settingsHtml.includes("<select") === false);
  check("设置页不再有召回分组标题", settingsHtml.includes("group-title") === false);
  check(
    "设置页只剩 Vue 挂载点（连接三字段已移进 SettingsApp.vue）",
    settingsHtml.includes('<div id="settings-app"></div>') &&
      /<input\b/.test(settingsHtml) === false &&
      ["serverUrl", "apiKey", "peerPrefix"].every((name) =>
        new RegExp(`\\b${name}\\b`).test(settingsVue),
      ),
    settingsHtml.slice(settingsHtml.indexOf("<main"), settingsHtml.indexOf("</main>")),
  );
  check(
    "设置页说明仍指向 OpenViking 页面，字段说明没有丢",
    settingsHtml.includes("「OpenViking」页面") &&
      settingsVue.includes("本机直连用默认值即可") &&
      settingsVue.includes("同机不同助手各自一个门牌"),
  );
  check("SettingsApp.vue 不再调 /recall-mode", settingsAppSrc.includes("/recall-mode") === false);
  check("SettingsApp.vue 不再有召回下拉的状态", settingsAppSrc.includes("recallGate") === false);
  check(
    "SettingsApp.vue 保存只走 /conn",
    (settingsAppSrc.match(/hana\.api\.fetch\(/g) || []).length === 2 &&
      settingsAppSrc.includes('hana.api.fetch("/conn", {'),
  );

  // ---- manifest 声明 ----
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
      String(props.systemoneServiceTimeoutMs?.description).includes("8000"),
    JSON.stringify([props.rerankServiceTimeoutMs?.description, props.systemoneServiceTimeoutMs?.description]),
  );
  check(
    "manifest 里每个 DEFAULTS 键都有声明（新增配置不能只活在代码里）",
    Object.keys(DEFAULTS).every((key) => props[key] !== undefined),
    Object.keys(DEFAULTS).filter((key) => props[key] === undefined).join(", "),
  );
  check("manifest 声明 app/models.infer", manifest.capabilities.includes("app/models.infer"));
}

// ================= ui: 面板标签页（组件） =================
{
  // 标签栏现在是 TabBar.vue，四块内容在 App.vue 里始终挂载、用 hidden 切显隐。
  // 键名 / 默认页 / 非法值回退 / 键盘换页 / storage 容错全部在 lib/tabs.js（纯逻辑，下面直接验）。
  const app = uiCode("App.vue");
  const tabBar = uiCode("components/TabBar.vue");
  const logsPanel = uiCode("components/LogsPanel.vue");
  const css = panelCss();
  const storeJs = uiSrcRaw("lib/panel-store.js");

  const panelTag = (name) =>
    new RegExp(`<div[\\s\\S]{0,120}id="panel-${name}"[\\s\\S]{0,240}?>`).exec(app)?.[0] ?? "";

  // ---- 标签按钮 ----
  check(
    "TabBar 用 TABS 渲染（不是写死四个按钮）",
    tabBar.includes('v-for="tab in TABS"') && tabBar.includes('from "../lib/tabs.js"'),
  );
  check("四个标签 id 由 TABS 生成", tabBar.includes(":id=\"`tab-${tab}`\""), tabBar.slice(0, 200));
  check(
    "四个标签文案齐全（日志排最后）",
    ["全局配置", "记忆配置", "共享技能", "日志"].every((label) => tabBar.includes(label)) &&
      tabBar.indexOf('global: "全局配置"') < tabBar.indexOf('logs: "日志"'),
    tabBar.slice(0, 400),
  );
  check("标签栏只有一个 tablist", (tabBar.match(/role="tablist"/g) || []).length === 1);
  eq("每枚标签都是 role=tab", (tabBar.match(/role="tab"/g) || []).length, 1);
  check(
    "选中态跟 active 走（aria-selected 仍是字符串 true/false）",
    tabBar.includes(":aria-selected=\"props.active === tab ? 'true' : 'false'\""),
  );
  check("未选中的标签 tabindex=-1", tabBar.includes(":tabindex=\"props.active === tab ? 0 : -1\""));
  check("aria-controls 指向 panel-<name>", tabBar.includes(":aria-controls=\"`panel-${tab}`\""));
  check("data-tab 带着页名", tabBar.includes(":data-tab=\"tab\""));
  check("点击发 select", tabBar.includes('@click="select(tab)"'));
  check(
    "键盘左右 / Home / End 都能换（映射在 lib/tabs.js 的 nextTab，下面直接测）",
    tabBar.includes("nextTab") && tabBar.includes("event.key") &&
      ["ArrowRight", "ArrowLeft", "Home", "End"].every((key) => tabBar.includes(key) === false),
    tabBar.slice(0, 200),
  );
  check("键盘切换后焦点跟着走", tabBar.includes(".focus?.()"));

  // ---- tabpanel ----
  eq("role=tabpanel 恰好四块", (app.match(/role="tabpanel"/g) || []).length, 4);
  for (const name of TABS) {
    const tag = panelTag(name);
    check(`${name} 内容块有 id`, tag.includes(`id="panel-${name}"`), tag);
    check(`${name} 内容块用对应 tab 标注`, tag.includes(`aria-labelledby="tab-${name}"`), tag);
    check(`${name} 内容块有 tab-panel 类`, /class="tab-panel"/.test(tag), tag);
    check(`${name} 内容块按当前页切 hidden`, tag.includes(`:hidden="tab !== '${name}'"`), tag);
  }
  check("四页都挂在根组件里", ["<GlobalPanel", "<MemoryPanel", "<SkillPanel", "<LogsPanel"].every((n) => app.includes(n)));
  eq("四页的 tabpanel 主键齐全", ["global", "memory", "skill", "logs"].map((name) => panelTag(name).includes(`id="panel-${name}"`)), [true, true, true, true]);
  check("切页用 hidden，不用 v-if（隐藏页的节点不能消失）", /v-if="tab\b/.test(app) === false);

  // ---- 切页接线 ----
  check("启动时读上次停的页", app.includes("readTab(safeLocalStorage())"));
  check("非法值回退走 normalizeTab", app.includes("normalizeTab(name ?? DEFAULT_TAB)"));
  check("点击切页会持久化", app.includes("writeTab(safeLocalStorage(), active)"));
  check("storage 取不到 / 抛错不崩", app.includes("function safeLocalStorage()") && app.includes("catch"));
  check(
    "启动时先摆好上次停的页、再开始读数据",
    app.indexOf("readTab(safeLocalStorage())") > 0 &&
      app.indexOf("readTab(safeLocalStorage())") < app.lastIndexOf("refresh()"),
    `${app.indexOf("readTab(safeLocalStorage())")} < ${app.lastIndexOf("refresh()")}`,
  );
  const selectTabBody = app.match(/function selectTab\(name\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  check("selectTab 函数取到了", selectTabBody.length > 0, app.slice(0, 120));
  check(
    "selectTab 不触发重算或写入",
    ["refresh", "saveLayers", "applyLayers", "rerankChannels", "patchControls"].every(
      (name) => selectTabBody.includes(name) === false,
    ),
    selectTabBody,
  );

  // ---- 日志页（折叠已彻底删除，行为第 9 条只剩数据与区内滚） ----
  check("日志页有正文与计数条", logsPanel.includes('id="logBody"') && logsPanel.includes('id="logChips"'));
  check("折叠控件彻底删掉（NCollapse / NCollapseItem / 折叠按钮 / logToggle）",
    ["NCollapse", "NCollapseItem", "NButton", "logToggle", "onExpanded"].every(
      (needle) => logsPanel.includes(needle) === false),
    logsPanel.slice(0, 200));
  check("正文在 NScrollbar 里（区内滚）",
    /<NScrollbar class="log">[\s\S]{0,120}id="logBody"/.test(logsPanel));
  check("计数条 #logChips 在卡的 #header-extra 里（标题在左、计数在右）",
    /<template #header-extra>[\s\S]{0,160}id="logChips"/.test(logsPanel));
  check("后端没有清空接口，所以日志页没有清空 / 刷新按钮",
    /<NButton\b|<button\b/.test(logsPanel) === false);
  check("日志计数条来自 logChips", logsPanel.includes("chips") && storeJs.includes("logChips(state.logs.lines)"));
  check("日志正文来自 logBodyText", storeJs.includes("logBodyText(state.logs.lines)"));
  check("折叠状态与切换函数已从 store 删干净",
    ["toggleLogs", "logs.open"].every((needle) => storeJs.includes(needle) === false));
  check("useLogs 不再返回 open / toggle",
    ["open:", "toggle:"].every((needle) => uiSrcRaw("composables/useLogs.js").includes(needle) === false),
    uiSrcRaw("composables/useLogs.js"));

  // ---- 置灰覆盖三页（行为第 8 条） ----
  const dimBindings = [
    ["探针", /class="toggle"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(uiCode("components/PreludeCard.vue"))],
    ["打分服务", /class="services"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(uiCode("components/PreludeCard.vue"))],
    ["召回下拉", /class="recall-grid"[\s\S]{0,80}:class="\{ dim: !enabled \}"/.test(uiCode("components/RecallCard.vue"))],
    ["两个展开区", (uiCode("components/RecallCard.vue").match(/class="gate-advanced"[\s\S]{0,80}:class="\{ dim: !enabled \}"/g) || []).length === 2],
    ["技能路由", /class="skill-route"[\s\S]{0,240}:class="\{ dim: !enabled \}"/.test(uiCode("components/SkillRoute.vue"))],
  ];
  for (const [label, ok] of dimBindings) check(`置灰覆盖 ${label}`, ok);
  check(
    "置灰判据只有一个：总闸（store.enabled）",
    storeJs.includes("const enabled = () => state.controls.enabled !== false") &&
      uiSrcRaw("composables/useConfig.js").includes("enabled: computed(() => store.enabled())"),
  );
  check(
    "总闸关着时总闸卡自己也是灰底（data-off）",
    /:data-off="state\.controls\.enabled \? 'false' : 'true'"/.test(uiCode("components/MasterCard.vue")),
  );
  // ---- localStorage 键与归一化（纯逻辑，直接验） ----
  eq("tab 记忆键", TAB_KEY, "hanako-openviking:tab");
  check("tab 记忆键带 app 前缀", TAB_KEY.startsWith("hanako-openviking:"));
  eq("默认页", DEFAULT_TAB, "global");
  eq("四个页名", TABS, ["global", "memory", "skill", "logs"]);
  for (const value of [null, undefined, "", "nope", "Global", "MEMORY", " memory ", "log", "Logs", "LOGS"]) {
    eq(`非法值 ${JSON.stringify(value)} 回默认页`, normalizeTab(value), "global");
  }
  for (const value of ["global", "memory", "skill", "logs"]) {
    eq(`合法值 ${value} 原样返回`, normalizeTab(value), value);
  }
  // 键盘换页：左右成圈、Home / End 到两端（纯函数，能看到第四个真的参与循环）。
  eq("ArrowRight 从第四页绕回第一页", nextTab("logs", "ArrowRight"), "global");
  eq("ArrowRight 从第三页到第四页", nextTab("skill", "ArrowRight"), "logs");
  eq("ArrowLeft 从第四页到第三页", nextTab("logs", "ArrowLeft"), "skill");
  eq("ArrowLeft 从第一页绕到第四页", nextTab("global", "ArrowLeft"), "logs");
  eq("Home 回第一页", nextTab("logs", "Home"), "global");
  eq("End 落到第四页", nextTab("global", "End"), "logs");
  eq("End 在第四页保持第四页", nextTab("logs", "End"), "logs");
  eq("别的键不换页", nextTab("global", "Enter"), null);
  eq("空 storage 回默认页", readTab(null), "global");
  eq("storage 读不到回默认页", readTab({ getItem: () => null }), "global");
  eq("storage 读到合法值", readTab({ getItem: () => "memory" }), "memory");
  eq("storage 读到第四页 logs", readTab({ getItem: () => "logs" }), "logs");
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
    writeTab(fake, "logs");
    eq("writeTab 认第四页 logs", [store.get(TAB_KEY), store.size], ["logs", 1]);
    eq("writeTab 之后 readTab 能读回 logs", readTab(fake), "logs");
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

  // ---- CSS ----
  check("标签栏样式存在", /\n\.tabs \{/.test(css));
  check("选中标签样式存在", /\n\.tab\[aria-selected="true"\] \{/.test(css));
  check("内容块样式存在", /\n\.tab-panel \{/.test(css));
  const tabsRule = ruleBody(css, ".tabs");
  check("标签栏一行不换行", /flex-wrap:\s*nowrap/.test(tabsRule || ""), tabsRule || "");
  const panelRule = ruleBody(css, ".tab-panel");
  check(
    "内容块是 flex 列 + 8px 间距（吃满剩余高度）",
    /display:\s*flex/.test(panelRule || "") &&
      /flex-direction:\s*column/.test(panelRule || "") &&
      /gap:\s*8px/.test(panelRule || ""),
    panelRule || "",
  );
  const tabRule = ruleBody(css, ".tab");
  check("标签字号沿用 12px", /font-size:\s*12px/.test(tabRule || ""), tabRule || "");
}

// ================= ui: 面板一屏布局（静态） =================
{
  // 这一块守的是「整页不滚」的静态契约：高度基准、根容器、内容区、
  // 两个区内滚动点，以及矮屏降级。样式仍是手写的 ui/assets/panel.css
  // （构建不产出它），所以规则断言一条没改；变的只是「哪个组件挂哪个类」。
  const css = panelCss();
  const app = uiCode("App.vue");
  const master = uiCode("components/MasterCard.vue");
  const hub = uiCode("components/HubIdentity.vue");
  const prelude = uiCode("components/PreludeCard.vue");
  const logsPanel = uiCode("components/LogsPanel.vue");
  const skillPanel = uiCode("components/SkillPanel.vue");

  // 高度基准：宿主把整页 iframe 装进定高容器，html/body 的 100% 就是它给的高度。
  // app-ui.css 里没有 html 选择器，这两条只能由面板自己写。
  const rootRule = ruleBody(css, "html, body");
  check("html/body 有高度规则", rootRule !== null);
  check("html/body 取 100%（宿主定高容器的百分比，不是 100vh）",
    /height\s*:\s*100%/.test(rootRule || ""), rootRule || "");
  check("不用 100vh 当高度基准", css.includes("100vh") === false);

  // Vue 的挂载层 #panel-app 也在这一条高度链上：只把 body 定高，
  // .page 的 100% 会按内容解析，一屏契约整条落空。
  const mountRule = ruleBody(css, "#panel-app");
  check("挂载层 #panel-app 也定高（与 .page 同属一屏链）",
    /height\s*:\s*100%/.test(mountRule || ""), mountRule || "");

  // 根容器：吃满高度、自己不出滚动条、纵向 flex。
  const pageRule = ruleBody(css, ".page");
  check("根容器规则在", pageRule !== null);
  check(
    "根容器高度 100% + 纵向 flex",
    /height\s*:\s*100%/.test(pageRule || "") &&
      /display\s*:\s*flex/.test(pageRule || "") &&
      /flex-direction\s*:\s*column/.test(pageRule || ""),
    pageRule || "",
  );
  check("根容器不自滚（overflow: hidden）", /overflow\s*:\s*hidden/.test(pageRule || ""), pageRule || "");
  check("根容器带 box-sizing: border-box（padding 不算进高度）",
    /box-sizing\s*:\s*border-box/.test(pageRule || ""), pageRule || "");
  check("根容器就是 .page（Vue 挂载在 #panel-app 里）",
    /<main class="page" data-hana-app-ui>/.test(app), app.slice(app.indexOf("<main"), app.indexOf("<main") + 60));

  // 内容区：吃掉剩余高度；min-height: 0 是让子元素能收缩的关键。
  const panelRule = ruleBody(css, ".tab-panel");
  check("内容区规则在", panelRule !== null);
  check("内容区 flex: 1 1 auto", /flex\s*:\s*1 1 auto/.test(panelRule || ""), panelRule || "");
  check("内容区 min-height: 0", /min-height\s*:\s*0/.test(panelRule || ""), panelRule || "");
  check("内容区纵向 flex 列", /flex-direction\s*:\s*column/.test(panelRule || ""), panelRule || "");

  // 四页各自的内容区都要吃满剩余高度，而不是只有全局页。
  for (const name of TABS) {
    const tag = new RegExp(`<div[\\s\\S]{0,120}id="panel-${name}"[\\s\\S]{0,240}?>`).exec(app)?.[0] ?? "";
    check(`panel-${name} 挂的是同一套 tab-panel 契约`, /class="tab-panel"/.test(tag), tag);
  }
  check(
    "全局页上两块按内容定高，前置卡吃掉余量但不会被压扁",
    [".master", ".cols"].every((sel) =>
      new RegExp(`#panel-global > \\${sel}`).test(css),
    ) &&
      /#panel-global > \.prelude \{[\s\S]{0,80}flex\s*:\s*1 0 auto/.test(css) &&
      /#panel-global > \.prelude \{[\s\S]{0,160}min-height\s*:\s*0/.test(css),
  );
  check("前置卡的说明行贴到卡底（margin-top: auto）",
    /margin-top\s*:\s*auto/.test(ruleBody(css, ".services-note") || ""),
    ruleBody(css, ".services-note") || "");
  check("前置卡内部的链能吃满：卡 → 内容区 → NSpace → 服务块",
    /#panel-global > \.prelude > \.n-card-content \{[\s\S]{0,160}min-height\s*:\s*0/.test(css) &&
      /#panel-global > \.prelude > \.n-card-content > \.n-space \{[\s\S]{0,80}flex\s*:\s*1 1 auto/.test(css) &&
      /#panel-global > \.prelude \.services \{[\s\S]{0,80}flex\s*:\s*1 1 auto/.test(css));
  // 这三块现在是组件的根节点：n-card / n-grid 的根元素都接 attrs，
  // 所以 #panel-global > .master 这类选择器仍然落在同一个位置。
  check("总闸组件根节点是 n-card.master（title=总闸）",
    /<NCard\b[\s\S]{0,240}class="master"/.test(master) && master.includes('title="总闸"'));
  check("前置组件根节点是 n-card.prelude（id=prelude）",
    /<NCard\b[\s\S]{0,240}id="prelude"/.test(prelude) && prelude.includes('title="前置"'));
  check("两栏组件根节点是 n-grid.cols", /<NGrid class="cols"/.test(hub));
  check("日志组件根节点是 n-card.logs（title=日志）",
    /<NCard\b[\s\S]{0,240}class="logs"/.test(logsPanel) && logsPanel.includes('title="日志"'));

  const recallRule = ruleBody(css, ".recall");
  check("召回管理吃满记忆页剩余高度", /flex\s*:\s*1 1 auto/.test(recallRule || ""), recallRule || "");
  check("召回管理内部可收缩", /min-height\s*:\s*0/.test(recallRule || ""), recallRule || "");
  check("召回管理溢出时自己滚（两段展开 + 通道多也不会裁掉按钮）",
    /overflow-y\s*:\s*auto/.test(recallRule || ""), recallRule || "");
  check(
    "技能页不为了填满拉伸（拉伸约束落在挂载点上）",
    /#panel-skill > #skill-route-app \{[\s\S]{0,80}flex\s*:\s*0 0 auto/.test(css) &&
      /<div id="skill-route-app">/.test(skillPanel),
  );

  // 日志页：自己不自滚（#panel-logs 盖掉 .tab-panel 的 overflow-y），卡吃满页，
  // 正文吃满卡片内容区并在 NScrollbar 里自己滚。
  const logPanelRule = ruleBody(css, "#panel-logs");
  check("日志页规则在", logPanelRule !== null);
  check("日志页不允许整页滚（overflow: hidden）",
    /overflow\s*:\s*hidden/.test(logPanelRule || ""), logPanelRule || "");
  const logsRule = ruleBody(css, ".logs");
  check("日志卡吃满日志页（flex: 1 1 auto + min-height:0）",
    /flex\s*:\s*1 1 auto/.test(logsRule || "") && /min-height\s*:\s*0/.test(logsRule || ""),
    logsRule || "");
  check("日志卡内容区也是 flex 列 + min-height:0（正文才拿得到确定高度）",
    /\.logs > \.n-card-content \{[\s\S]{0,200}flex-direction\s*:\s*column[\s\S]{0,120}min-height\s*:\s*0/.test(css));
  const logRule = ruleBody(css, ".log");
  check("日志区规则在", logRule !== null);
  check("日志区吃满剩余高度（flex: 1 1 auto）",
    /flex\s*:\s*1 1 auto/.test(logRule || ""), logRule || "");
  check("日志区可收缩（min-height: 0）", /min-height\s*:\s*0/.test(logRule || ""), logRule || "");
  check("日志区不再钉 120px / 64px（折叠盒的遗产）",
    /height\s*:\s*120px/.test(logRule || "") === false &&
      /min-height\s*:\s*64px/.test(logRule || "") === false,
    logRule || "");
  check("日志区用 n-scrollbar 内滚",
    logsPanel.includes("<NScrollbar") && logsPanel.includes('class="log"'),
    logsPanel.slice(0, 240));
  check("日志正文在 n-scrollbar 里（内层 pre 保留 id）",
    /<NScrollbar[\s\S]*id="logBody"/.test(logsPanel));

  // peer 名单：NScrollbar 接管滚动，.peer-list 只负责「吃满剩余高度 + 能收缩」。
  const peerRule = ruleBody(css, ".peer-list");
  check("peer 名单规则在", peerRule !== null);
  check("peer 名单吃满召回管理剩余高度", /flex\s*:\s*1 1 auto/.test(peerRule || ""), peerRule || "");
  check("peer 名单是 flex 列（NScrollbar 才拿得到确定高度）",
    /display\s*:\s*flex/.test(peerRule || "") && /flex-direction\s*:\s*column/.test(peerRule || ""),
    peerRule || "");
  check("peer 名单不再自己写 overflow（滚动交给 NScrollbar）",
    /overflow-y/.test(peerRule || "") === false, peerRule || "");
  check("peer 名单不再用固定 max-height", /max-height/.test(peerRule || "") === false, peerRule || "");

  // 通道列表：上限落在 naive-ui 的滚动容器上（父级高度是 auto）。
  const channelScrollRule = ruleBody(css, ".channel-scroll .n-scrollbar-container");
  check("通道列表条目多时区内滚",
    /max-height\s*:\s*220px/.test(channelScrollRule || ""), channelScrollRule || "");

  // 矮屏降级：640px 以下允许整页滚（压一屏会把控件挤成一条线）。
  const mediaIdx = css.indexOf("@media (max-height: 640px)");
  check("矮屏媒体查询存在且阈值是 640px", mediaIdx >= 0);
  check("矮屏阈值不是别的数", /@media \(max-height: (?!640px\))/.test(css) === false);
  const mediaBody = mediaIdx < 0 ? "" : css.slice(mediaIdx, css.lastIndexOf("}"));
  check("矮屏下挂载层也放开高度",
    /#panel-app\s*\{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody), mediaBody.slice(0, 200));
  check(
    "矮屏下 html/body 放开高度与滚动",
    /html,\s*\n?\s*body \{[\s\S]{0,120}height\s*:\s*auto/.test(mediaBody) &&
      /html,\s*\n?\s*body \{[\s\S]{0,160}overflow\s*:\s*visible/.test(mediaBody),
    mediaBody.slice(0, 200),
  );
  check("矮屏下根容器改回自适应高度", /\.page \{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody),
    mediaBody.slice(0, 200));
  check("矮屏下 peer 名单退回固定高度上限",
    /\.peer-list \{[\s\S]{0,120}max-height/.test(mediaBody));
  check("矮屏下日志区退回固定上限 200px + 自己滚",
    /\.logs \.log \{[^}]*flex\s*:\s*none[^}]*height\s*:\s*200px/.test(mediaBody),
    mediaBody.slice(0, 400));
}

// ================= ui: naive-ui 控件替换（原生控件清零） =================
{
  const componentsDir = path.join(UI_SRC_DIR, "components");
  const vueFiles = [
    "App.vue",
    "SettingsApp.vue",
    ...fs
      .readdirSync(componentsDir)
      .filter((name) => name.endsWith(".vue"))
      .sort()
      .map((name) => `components/${name}`),
  ];
  const sources = Object.fromEntries(vueFiles.map((name) => [name, uiCode(name)]));

  // 全页原生控件清零（peer 行与标签栏本来就没有控件；日志改用 n-scrollbar）。
  for (const [name, source] of Object.entries(sources)) {
    for (const tag of ["select", "input", "textarea"]) {
      check(
        `${name} 没有原生 <${tag}>`,
        source.includes(`<${tag}`) === false,
        (source.match(new RegExp(`<${tag}[^>]*>`, "g")) || []).join(" | "),
      );
    }
  }

  const recall = sources["components/RecallCard.vue"];
  const channels = sources["components/ChannelList.vue"];
  const prelude = sources["components/PreludeCard.vue"];
  const logs = sources["components/LogsPanel.vue"];
  const app = sources["App.vue"];
  const settings = sources["SettingsApp.vue"];
  const hub = sources["components/HubIdentity.vue"];

  // 下拉一律 n-select；options 显式来自 { label, value } 表或 store 的投影函数。
  check("召回页五个下拉都是 n-select", (recall.match(/<NSelect\b/g) || []).length === 5);
  check("通道行类型下拉是 n-select",
    /<NSelect\b[\s\S]{0,200}:options="row\.options"/.test(channels));
  check(
    "三个固定下拉的 options 都是 { label, value } 形状",
    ["GATE_OPTIONS", "QUERY_MODE_OPTIONS", "RERANK_OPTIONS"].every((name) => {
      const body =
        new RegExp(`${name} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`).exec(recall)?.[0] ?? "";
      return /\{ label: [^}]+, value: [^}]+ \}/.test(body);
    }),
  );
  check("模型下拉的 options 来自 modelChoices（store 已保证 {label,value}）",
    /:options="gateModelOptions"/.test(recall) &&
      /:options="rerankModelOptions"/.test(recall));
  check("设置页仍是 n-input / n-button", /<NInput\b/.test(settings) && /<NButton\b/.test(settings));

  // 每个控件都绑 update:value，提交仍走原来的 store 动作（不引确认步骤）。
  check("召回下拉用 update:value 提交",
    (recall.match(/@update:value="\(value\) => onSelect\(/g) || []).length === 5 &&
      /@update:value="\(value\) => onType\(/.test(channels));
  check("打分服务文本框用 update:value 写草稿",
    (prelude.match(/@update:value="onFieldInput\(/g) || []).length >= 2);
  check("通道数字框用 update:value",
    (channels.match(/@update:value="\(value\) => on(Weight|Timeout)\(/g) || []).length === 2);
  check("按钮一律 n-button（日志页无按钮：后端没有清空 / 刷新接口）",
    ["<NButton", "</NButton>"].every(
      (needle) =>
        app.includes(needle) &&
        recall.includes(needle) &&
        channels.includes(needle) &&
        prelude.includes(needle),
    ) && /<NButton\b|<button\b/.test(logs) === false);

  // 数值框清空：n-input-number 给 null，不提交 0（沿用上一轮的取舍）。
  check("预算 / 超时清空（null）收成空串交给 setControlsNumber",
    /value === null \|\| value === undefined \? "" : value/.test(hub));
  check("权重清空（null）不提交",
    /if \(value === null \|\| value === undefined\) return;/.test(channels));
  check("数字框不在输入途中逐字提交（updateValueOnInput=false）",
    ["components/HubIdentity.vue", "components/ChannelList.vue", "components/PreludeCard.vue"].every(
      (name) => (sources[name].match(/:update-value-on-input="false"/g) || []).length > 0,
    ));

  // 一屏布局四项：根容器 overflow:hidden / .tab-panel min-height:0 / 日志内滚 / 640px 降级。
  const css = panelCss();
  check("一屏：根容器仍 overflow:hidden",
    /overflow\s*:\s*hidden/.test(ruleBody(css, ".page") || ""));
  check("一屏：.tab-panel 仍 min-height:0",
    /min-height\s*:\s*0/.test(ruleBody(css, ".tab-panel") || ""));
  check("一屏：日志区吃满剩余高度并在 n-scrollbar 里内滚",
    logs.includes("<NScrollbar") &&
      /flex\s*:\s*1 1 auto/.test(ruleBody(css, ".log") || "") &&
      /min-height\s*:\s*0/.test(ruleBody(css, ".log") || ""));
  check("一屏：640px 降级还在", css.includes("@media (max-height: 640px)"));
}

// ================= ui: 面板视图投影（纯函数） =================
{
  // 这些是从已删除的手写面板里搬出来的字符串 / 档位逻辑（lib/panel-view.js）。
  // 组件不再各自拼一遍文案，所以它们必须能单独验。
  eq("出口念法：受管代理", transportTextOf("runtime"), "受管代理");
  eq("出口念法：直连", transportTextOf("direct"), "直连（仅白名单）");
  eq("出口念法：其它一律不可用", transportTextOf("down"), "不可用");
  eq("版本号带 v 就原样", versionTextOf("v0.4.16"), "v0.4.16");
  eq("版本号不带 v 就补一个（不出现 vv）", versionTextOf("0.4.16"), "v0.4.16");
  eq("版本号空就不编", versionTextOf(""), "");
  eq("圆点：ok", dotClassOf("ok"), "dot ok");
  eq("圆点：down", dotClassOf("down"), "dot down");
  eq("圆点：其它是 idle", dotClassOf("idle"), "dot idle");
  eq("key 占位：没填", apiKeyPlaceholder(false), "未填写");
  eq("key 占位：已填只说留空不改", apiKeyPlaceholder(true), "已填写（留空表示不改）");

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
  eq("已连接时药丸是绿的", [view.pillText, view.pillTone], ["已连接", "ok"]);
  eq("副标题：出口 · 版本 · 往返", view.subLine, "受管代理 · v0.4.16 · 42 ms");
  eq("往返只在 ok 时念", view.latency, "42 ms");
  eq("版本单独一格", view.version, "v0.4.16");
  eq("总闸开着时说明是“已开启”", view.masterHint, MASTER_HINT_ON);
  check("总闸开着时说明不标红", view.masterHintWarn === false);
  eq("检查项从 ready.checks 取", view.checks.length, 1);
  const offView = statusView({ ...okStatus, enabled: false }, 42);
  eq("总闸关着：药丸未启用", offView.pillText, "未启用");
  eq("总闸关着：说明换成关的那句", offView.masterHint, MASTER_HINT_OFF);
  eq("总闸关着：说明标红", offView.masterHintWarn, true);
  eq("缺 key：药丸提示缺 API Key", statusView({ ...okStatus, apiKeySet: false }, 5).pillText, "缺 API Key");
  eq("连不上：药丸连不上 + 红档", (() => {
    const v = statusView({ ...okStatus, reach: "down" }, null);
    return [v.pillText, v.pillTone, v.latency];
  })(), ["连不上", "down", "—"]);
  eq("待命：既没 ok 也没 down", statusView({ ...okStatus, reach: "idle" }, null).pillText, "待命");
  eq("reach 失败时的错误进 error 行", statusView({ ...okStatus, reach: "down", error: "ECONNREFUSED" }, 3).error, "ECONNREFUSED");
  const readFailed = statusView(okStatus, 42, "网络不通");
  eq("这一轮没读到：药丸说读取失败，不沿用已连接", [readFailed.pillText, readFailed.pillTone], ["读取失败", "down"]);
  eq("这一轮没读到：错误原文进 readError", readFailed.readError, "网络不通");
  eq("没读到时不假装有检查项", readFailed.checks, []);

  // ---- peer 行 ----
  eq("本机行：本机 + 条数 + 参与召回", peerMetaText({ self: true, count: 3 }), "本机 · 3 条 · 参与召回");
  eq(
    "外部行被排除：已排除",
    peerMetaText({ name: "x", count: 4, excluded: true }),
    "外部 · 4 条 · 已排除",
  );
  eq("条数没读到念「—」不念 0", peerMetaText({ name: "x", count: null }), "外部 · — · 参与召回");
  eq("数到上限加一个 +", peerMetaText({ name: "x", count: 500, countCapped: true }), "外部 · 500+ 条 · 参与召回");
  eq("本机不会被当成已排除", peerExcluded({ self: true, excluded: true }), false);
  eq("外部被排除就是已排除", peerExcluded({ name: "x", excluded: true }), true);
  eq("本机不可点", peerTappable({ name: "me", self: true }), false);
  eq("外部可点", peerTappable({ name: "x" }), true);
  eq("没名字的不可点", peerTappable({}), false);
  eq("本机悬停说明", peerTitle({ self: true }), "本机，不参与排除");
  eq("已排除悬停说明", peerTitle({ name: "x", excluded: true }), "已排除，不参与召回，点击恢复");
  eq("参与中悬停说明", peerTitle({ name: "x" }), "点击排除，之后召回不再包含它的记忆");

  // ---- 日志 ----
  eq("计数条按事件聚合并保序", logChips([{ event: "a" }, { event: "b" }, { event: "a" }]).map((c) => c.text),
    ["a × 2", "b × 1"]);
  eq("没有事件给一句暂无事件", logChips([]), [{ text: "暂无事件", muted: true }]);
  eq("kind 当事件名用", logChips([{ kind: "k" }])[0].text, "k × 1");
  eq("正文空时是（还没有记录）", logBodyText([]), LOG_EMPTY);
  eq(
    "正文倒序（最新在上）且一行一条 JSON",
    logBodyText([{ a: 1 }, { a: 2 }]).split("\n"),
    ['{"a":2}', '{"a":1}'],
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
    "存量值不在目录里也要留住",
    withStoredOption([{ value: "", label: "默认" }], "p/m"),
    [{ value: "", label: "默认" }, { value: "p/m", label: "p/m（不在目录里）" }],
  );
  eq("存量值在目录里就不重复加", withStoredOption([{ value: "p/m", label: "x" }], "p/m").length, 1);
  eq("空存量值不加", withStoredOption([{ value: "", label: "默认" }], "").length, 1);
  eq("空工具函数：读不到时间就不编", readFootText(null), "");
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
      gateModel: "",
      rerank: "off",
      rerankPrompt: "",
      rerankModel: "",
      // 一行服务已被清空：通道保留但标红，别自动删。
      rerankChannels: [{ type: "rerank", name: "孤儿通道", weight: 2, enabled: true }],
      rerankServiceUrl: "http://127.0.0.1:8098",
      rerankServiceModel: "bge-reranker-v2-m3",
      rerankServiceTimeoutMs: null,
      systemoneServiceUrl: "",
      systemoneServiceModel: "",
      systemoneServiceTimeoutMs: null,
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
      Object.assign(backend["/recall-mode"], body, {
        rerankChannels: JSON.parse(body.rerankChannels),
      });
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
  eq("药丸跟着 /status 走", [state.status.view.pillText, state.status.view.pillTone], ["已连接", "ok"]);
  eq("检查项摘要只说比例", state.status.checksSummary.text, "服务端 1/2 就绪");
  eq("检查项档位是灰（只是没配）", state.status.checksSummary.tone, "muted");
  eq("检查项明细只列问题项", state.status.checksSummary.problems, [
    { name: "ollama", status: "not_configured", label: "未配置" },
  ]);
  eq("开关从 /controls 读回", [state.controls.enabled, state.controls.probe, state.controls.skillRouting], [true, true, false]);
  eq("超时与预算从 /controls 读回", [state.controls.requestTimeoutMs, state.controls.injectBudgetTokens], [1500, 2500]);
  eq("地址从 /status 读回（key 不回显）", state.conn.serverUrl, "http://127.0.0.1:8000");
  eq("key 占位说「留空表示不改」", state.conn.apiKeyPlaceholder, "已填写（留空表示不改）");
  eq("门牌前缀从 /conn 读回", state.conn.peerPrefix, "lab");
  eq("三个下拉读回服务端的值", [state.form.recallGate, state.form.queryMode, state.form.rerank], ["off", "last", "off"]);
  eq("提示词框里坐的是默认全文（值是 value 不是 placeholder）",
    state.prompts.gate, DEFAULT_GATE_PROMPT);
  eq("重排提示词框同理", state.prompts.rerank, DEFAULT_RERANK_PROMPT);
  eq("打分服务地址读回", state.draft.rerankServiceUrl, "http://127.0.0.1:8098");
  eq("打分服务模型读回", state.draft.rerankServiceModel, "bge-reranker-v2-m3");
  eq("超时留空仍是空（placeholder 显示默认值）", state.draft.rerankServiceTimeoutMs, "");
  eq("通道草稿按服务端投影", state.channels.map((channel) => channel.name), ["孤儿通道"]);
  eq("模型目录进来了", ui.store.modelChoices(state.form.gateModel).map((option) => option.value), ["", "p/m"]);
  check("目录可用时不显示原因", ui.store.modelHint() === "");
  eq("peer 行：本机不可点", ui.store.peerRows().map((row) => [row.name, row.self, row.tappable]), [
    ["self-one", true, false],
    ["peer-a", false, true],
    ["peer-b", false, true],
  ]);
  eq("peer 计数", ui.store.peerCountText(), "3 个");
  eq("日志计数条", ui.store.logChips().map((chip) => chip.text), [
    "agent/before-start × 2",
    "provider/before-request × 1",
  ]);
  eq("日志正文倒序", ui.store.logBody().split("\n")[0], JSON.stringify(backend["/probe"].lines[2]));
  eq("提示位初始是空的", state.note.text, "");
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
    eq("类型选项只剩宿主模型（加一行存量类型）", row.options.map((option) => option.value), ["model", "rerank"]);
    check("存量类型的文案说清服务未配置", row.options[1].label.includes("服务未配置"), row.options[1].label);
    eq("已配服务为空时类型选项只有宿主模型", ui.store.channelTypeChoices().map((option) => option.value), ["model"]);
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
      "整单把两个基础下拉一起带走（行为第 3 条）",
      saves.at(-1).body.recallGate === "off" && saves.at(-1).body.queryMode === "context",
      JSON.stringify(saves.at(-1).body),
    );
    check(
      "提示词与模型也在同一单里",
      saves.at(-1).body.gatePrompt === DEFAULT_GATE_PROMPT &&
        saves.at(-1).body.rerankPrompt === DEFAULT_RERANK_PROMPT,
      JSON.stringify({ gate: saves.at(-1).body.gatePrompt.slice(0, 8), rerank: saves.at(-1).body.rerankPrompt.slice(0, 8) }),
    );
    check("通道以 JSON 串提交", typeof saves.at(-1).body.rerankChannels === "string");
    eq("提交成功后控件停在服务端的值上", state.form.queryMode, "context");
    eq("成功提示", [state.note.text, state.note.bad], ["召回策略已生效", false]);
  }
  {
    rejectNextPost = "queryMode 只能是 last / context";
    await ui.setForm("queryMode", "bogus");
    eq("被拒后控件退回上一次确认的值", state.form.queryMode, "context");
    eq("被拒后提示位显示服务端原文", [state.note.text, state.note.bad],
      ["queryMode 只能是 last / context", true]);
  }
  {
    rejectNextPost = "throw";
    await ui.setForm("recallGate", "llm");
    eq("网络错同样回滚", state.form.recallGate, "off");
    eq("网络错同样提示", [state.note.text, state.note.bad], ["网络不通", true]);
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
    eq("两单收笔后最后的值与服务端一致", [state.form.queryMode, state.form.recallGate], ["context", "rules"]);
    eq("最后一单带着两个键", [saves.at(-1).body.queryMode, saves.at(-1).body.recallGate], ["context", "rules"]);
  }

  // ---- 提示词：恢复默认只填框 + 正常提交（行为第 4 条） ----
  {
    state.prompts.gate = "我的提示词";
    state.prompts.gateTouched = true;
    await ui.setPrompt("gate", "我的提示词");
    eq("自定义提示词提交后仍在框里", state.prompts.gate, "我的提示词");
    eq("状态小字说已修改", ui.gatePromptStatus(), "已修改");
    await ui.resetPrompt("gate");
    eq("恢复默认把默认全文填回框里", state.prompts.gate, DEFAULT_GATE_PROMPT);
    eq("恢复默认后状态说默认", ui.gatePromptStatus(), "当前为默认提示词");
    await ui.touchPrompt("gate", "");
    await ui.setPrompt("gate", "");
    eq("清空后状态提醒不拦截", ui.gatePromptStatus().includes("不会拦截任何召回"), true);
    eq("清空的值也提交（配置为空）", backend["/recall-mode"].gatePrompt, "");
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
    eq("清空一半时另一半也清掉", [state.draft.rerankServiceUrl, state.draft.rerankServiceModel], ["", ""]);
    eq("清空后上一次的测试结果也收掉", state.serviceResults.rerank, { tone: "", text: "", pending: false });
  }
  {
    // 没填全不许发请求：结果行直接说「先填地址和模型」。
    const before = calls.filter((call) => call.method === "POST").length;
    await ui.testService("rerank");
    eq("没填全时不发请求", calls.filter((call) => call.method === "POST").length, before);
    eq("结果行说先填地址和模型", state.serviceResults.rerank.text, "先填地址和模型");
    eq("结果行是灰档", state.serviceResults.rerank.tone, "muted");
    await ui.setServiceField("rerankServiceUrl", "http://127.0.0.1:8098");
    await ui.setServiceField("rerankServiceModel", "bge-reranker-v2-m3");
    await ui.testService("rerank");
    eq("测试成功念可用 + 耗时 + 模型", state.serviceResults.rerank.text, "可用 · 12ms · bge-reranker-v2-m3");
    eq("成功是绿档", state.serviceResults.rerank.tone, "ok");
    eq("测试打完停在 idle", state.serviceResults.rerank.pending, false);
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
    eq("总闸写失败后回滚", state.controls.enabled, true);
    eq("总闸写失败有提示", [state.note.text, state.note.bad], ["写入失败", true]);
    await ui.flip("probe", false);
    eq("探针写成功", state.controls.probe, false);
    eq("探针写成功有提示", [state.note.text, state.note.bad], ["已保存", false]);
    await ui.flip("probe", true);
    eq("再点回来", state.controls.probe, true);
  }

  // ---- 连接三字段 ----
  {
    state.conn.apiKey = "new-key";
    await ui.saveConnection();
    const body = calls.filter((call) => call.method === "POST" && call.path === "/conn").at(-1).body;
    eq("提交带上新 key 与门牌前缀", [body.apiKey, body.peerPrefix], ["new-key", "lab"]);
    eq("提交后 key 框清空（不留在界面上）", state.conn.apiKey, "");
    eq("门牌前缀原样", state.conn.peerPrefix, "lab");
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
    eq("清空数字框不提交（保留旧值）", backend["/controls"].requestTimeoutMs, 3000);
    await ui.setControlsNumber("requestTimeoutMs", "abc");
    eq("非数字也不提交", backend["/controls"].requestTimeoutMs, 3000);
  }

  // ---- peer 名单：整单提交 + 乐观回滚（行为第 7 条） ----
  {
    await ui.store.togglePeer("peer-a");
    const body = calls.filter((call) => call.method === "POST" && call.path === "/peers").at(-1).body;
    eq("排除名单整单提交", body.excluded, ["peer-a"]);
    eq("本机永远不在排除名单里", body.excluded.includes("self-one"), false);
    eq("写成功有提示", state.note.text, "排除名单已更新");
    rejectNextPost = "写入失败";
    await ui.store.togglePeer("peer-b");
    eq("写失败回滚到点击前", ui.store.peerRows().map((row) => [row.name, row.excluded]), [
      ["self-one", false],
      ["peer-a", true],
      ["peer-b", false],
    ]);
    eq("写失败有提示", [state.note.text, state.note.bad], ["写入失败", true]);
  }

  // ---- 通道：增删 / 权重 / 超时 / 测试 ----
  {
    await ui.addChannel();
    eq("添加通道用当前第一个可选类型", state.channels.at(-1).type, "rerank");
    const index = state.channels.length - 1;
    await ui.setChannelWeight(index, "99");
    eq("权重收敛到 10", state.channels[index].weight, 10);
    await ui.setChannelWeight(index, "abc");
    eq("权重非数字不改", state.channels[index].weight, 10);
    await ui.setChannelTimeout(index, "250");
    eq("超时收成数字", state.channels[index].timeoutMs, 250);
    await ui.setChannelTimeout(index, "");
    eq("超时留空 = 删掉这一格", "timeoutMs" in state.channels[index], false);
    await ui.removeChannel(index);
    eq("删除通道后就少了这一行", state.channels.length, 1);
    eq("通道计数文案", ui.store.channelView(state.channels[0], 0).title, "通道 1");
    await ui.testChannels();
    eq("通道测试结果有首行", state.channelTest.text.split("\n")[0], "候选 2 条 · 1 路通道 · 9ms");
    check("通道测试结果不是失败文案", state.channelTest.text.startsWith("测试失败") === false);
    eq("测试结果不再挂 pending", state.channelTest.pending, false);
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
    eq("store 里日志只剩尾部数据（折叠状态已删）", Object.keys(fresh.state.logs), ["lines"]);
    eq("折叠切换函数已从 store 删除", typeof fresh.store.toggleLogs, "undefined");
    check("日志正文仍由 logBody 投影（数据没跟着折叠一起丢）",
      fresh.store.logBody().split("\n")[0] === JSON.stringify(backend["/probe"].lines[2]),
      fresh.store.logBody().slice(0, 80));
    fresh.setFocus("serverUrl");
    backend["/status"].serverUrl = "http://changed:9000";
    await fresh.refresh();
    eq("正在改地址时刷新不回写那一格", fresh.state.conn.serverUrl, "http://127.0.0.1:8000");
    fresh.setFocus("");
    await fresh.refresh();
    eq("失焦后刷新正常回写", fresh.state.conn.serverUrl, "http://changed:9000");
  }
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

  // ---- 打分服务描述表：渲染完全由数据驱动 ----
  eq("服务描述表恰好两项（精排 / 决策）", SCORING_SERVICES.map((service) => service.kind), [
    "rerank",
    "systemone",
  ]);
  for (const service of SCORING_SERVICES) {
    const required = [
      "kind",
      "label",
      "urlKey",
      "modelKey",
      "timeoutKey",
      "defaultTimeoutMs",
      "hint",
    ];
    check(
      `${service.kind} 描述字段完整（kind / label / 三键 / 默认超时 / 说明）`,
      required.every((key) => service[key] !== undefined && service[key] !== ""),
      JSON.stringify(service),
    );
  }
  eq("默认超时与后端边界同值", [
    SCORING_SERVICES[0].defaultTimeoutMs,
    SCORING_SERVICES[1].defaultTimeoutMs,
  ], [800, 3500]);

  const layout = scoringServiceLayout();
  eq("渲染计划有标题", layout.title, "打分服务");
  eq("渲染计划恰好两行，顺序与表一致", layout.rows.map((row) => row.kind), [
    "rerank",
    "systemone",
  ]);
  eq("两行的服务名", layout.rows.map((row) => row.label), ["精排", "决策"]);
  eq("每行四个控件：地址 / 模型 / 超时 / 测试", [
    layout.rows[0].url.label,
    layout.rows[0].model.label,
    layout.rows[0].timeout.label,
    layout.rows[0].testId,
  ], ["地址", "模型", "超时", "rerankServiceTest"]);
  eq("行内 id 就是配置键（旧 id 不跑）", [
    layout.rows.map((row) => row.url.id),
    layout.rows.map((row) => row.model.id),
    layout.rows.map((row) => row.timeout.id),
  ], [
    ["rerankServiceUrl", "systemoneServiceUrl"],
    ["rerankServiceModel", "systemoneServiceModel"],
    ["rerankServiceTimeoutMs", "systemoneServiceTimeoutMs"],
  ]);
  eq(
    "超时的 placeholder 与上下限跟着类型",
    layout.rows.map((row) => [row.timeout.placeholder, row.timeout.min, row.timeout.max]),
    [
      ["800 ms", 100, 10000],
      ["3500 ms", 100, 8000],
    ],
  );
  eq(
    "列表下方只有一段总说明",
    layout.note,
    "交叉编码器走 /v1/rerank，决策模型走 /v1/systemone。地址与模型成对；超时留空用默认（精排 800ms、决策 3500ms）。留空的类型不会出现在精排通道里。",
  );
  eq("说明在渲染计划里只出现一次（不重复到每行）",
    JSON.stringify(layout).split(layout.note).length - 1, 1);

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
  eq("插一行假服务就渲染出三行", withFake.rows.map((row) => row.kind), [
    "rerank",
    "systemone",
    "fake",
  ]);
  eq(
    "假服务行自动拿到 id / 默认超时 / 测试位",
    [
      withFake.rows[2].url.id,
      withFake.rows[2].timeout.placeholder,
      withFake.rows[2].testId,
      withFake.rows[2].resultId,
    ],
    ["fakeServiceUrl", "1234 ms", "fakeServiceTest", "fakeServiceResult"],
  );
  check("假服务也会进那一段总说明", withFake.note.includes("假服务走 /v1/fake") &&
    withFake.note.includes("假服务 1234ms"));
  eq("临时插行不改原表", SCORING_SERVICES.length, 2);
  eq("总说明也可以单独生成", scoringServicesNote(SCORING_SERVICES), layout.note);
  eq("单行渲染与整表渲染同源", scoringServiceRow(SCORING_SERVICES[0]).kind, "rerank");
  eq(
    "每行固定四个控件（地址 / 模型 / 超时 / 测试）",
    layout.rows.map((row) => [row.url, row.model, row.timeout].filter(Boolean).length + 1),
    [4, 4],
  );
  eq(
    "每行的测试位与结果位互不重复",
    new Set(layout.rows.flatMap((row) => [row.testId, row.resultId])).size,
    4,
  );
  eq(
    "每行都带了地址 / 模型 / 超时的 placeholder",
    layout.rows.every(
      (row) => row.url.placeholder && row.model.placeholder && row.timeout.placeholder,
    ),
    true,
  );
  eq("成对规则在总说明里只说一次", layout.note.split("地址与模型成对").length - 1, 1);
  eq(
    "反转描述表，行的顺序跟着反转",
    scoringServiceLayout([...SCORING_SERVICES].reverse()).rows.map((row) => row.kind),
    ["systemone", "rerank"],
  );
  check("临时插入的假服务不会溜进原表渲染", layout.rows.every((row) => row.kind !== "fake"));


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
    systemoneServiceUrl: "http://127.0.0.1:8097",
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
    ["http://127.0.0.1:8098", "bge-reranker-v2-m3", "http://127.0.0.1:8097", "kev-4b"],
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
  const missingScheme = await post({ systemoneServiceUrl: "127.0.0.1:8097" });
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

  // 只给模型、不给地址同样拒绝：孤立的模型名运行时会整对回退静默忽略。
  store.systemoneServiceUrl = "";
  writes.length = 0;
  const modelOnly = await post({ systemoneServiceModel: "isolated-model" });
  eq("只给模型不给地址 400", modelOnly.status, 400);
  eq(
    "拒绝理由写明配了模型名就要填地址",
    modelOnly.body.error,
    "systemoneServiceUrl 配了模型名就要填地址",
  );
  eq("只给模型零写入", writes.length, 0);
  eq("孤立模型名没有落库", store.systemoneServiceModel, "kev-4b");

  // 地址与模型要一次成对提交，服务端不会停在半对上。
  writes.length = 0;
  const oneShot = await post({
    rerankServiceUrl: "http://127.0.0.1:8098",
    rerankServiceModel: "bge-reranker-v2-m3",
  });
  eq("一次提交成对写入", oneShot.status, 200);
  eq(
    "成对的值落库",
    [store.rerankServiceUrl, store.rerankServiceModel],
    ["http://127.0.0.1:8098", "bge-reranker-v2-m3"],
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

  // systemone 上限 8000：9000 按越界回退成空串，不夹到 8000。
  writes.length = 0;
  const systemoneTooHigh = await post({ systemoneServiceTimeoutMs: "9000" });
  eq("决策超时填 9000 不报错", systemoneTooHigh.status, 200);
  eq("决策超时填 9000 回退为空串（= 用默认 3500）", store.systemoneServiceTimeoutMs, "");
  eq("回退后 GET 回 null", systemoneTooHigh.body.systemoneServiceTimeoutMs, null);

  writes.length = 0;
  const systemoneAtLimit = await post({ systemoneServiceTimeoutMs: "8000" });
  eq("决策超时正好 8000 可写", systemoneAtLimit.status, 200);
  eq("8000 落库", store.systemoneServiceTimeoutMs, "8000");

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
    url: "http://127.0.0.1:8097",
    model: "kev-4b",
    timeoutMs: 3500,
  });
  eq("service-test systemone 可用", systemoneOk.body.ok, true);
  eq("systemone 打到自己的端点", calls[0].url, "http://127.0.0.1:8097/v1/systemone");
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
    eq("模型通道的探针 scoreScale 是 probability",
      probes[0].invocation.channels[0].scoreScale, "probability");
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
    eq("rerank 探针记一次（logit）", probes.length, 1);
    eq("精排通道的探针 scoreScale 是 logit",
      probes[0].invocation.channels[0].scoreScale, "logit");
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
    eq(
      "0..1 相关度在探针里标为 probability",
      outcome.channels[0].scoreScale,
      "probability",
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
          url: "http://127.0.0.1:8080",
          model: "m",
          weight: 1,
          timeoutMs: 321,
        },
      ],
    });
    eq("通道走受管运行时出口", calls.length, 1);
    eq("运行时出口接收通道自己的 URL", calls[0].url, "http://127.0.0.1:8080/v1/rerank");
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
  eq("服务地址被填进去", fields.serverUrl, "http://127.0.0.1:8000");
  eq("门牌前缀被填进去", fields.peerPrefix, "desktop");
  eq("API Key 填的是掩码，不是明文", fields.apiKey, "ov-1••••••••9f3c");
  eq("掩码与「没改过」的判据一致", fields.mask, fields.apiKey);
  eq("有 key 时用「已保存」那档说明", fields.keyHint, HINT_SET);

  // GET /conn 没有 ok 字段：不能因为缺 ok 就把响应当失败（那才会真的不填）。
  eq(
    "没有 ok 字段的响应照样能填字段",
    connFields({ serverUrl: "http://h:1", peerPrefix: "mbp" }).serverUrl,
    "http://h:1",
  );
  eq(
    "没有 ok 字段时门牌前缀也照填",
    connFields({ serverUrl: "http://h:1", peerPrefix: "mbp" }).peerPrefix,
    "mbp",
  );

  const empty = connFields({
    serverUrl: "",
    peerPrefix: "",
    peerPrefixValid: true,
    apiKeySet: false,
    apiKeyHead: "",
    apiKeyTail: "",
  });
  eq("没填时服务地址是空串", empty.serverUrl, "");
  eq("没填时门牌前缀是空串", empty.peerPrefix, "");
  eq("没 key 时掩码是空串", empty.apiKey, "");
  eq("没 key 时用默认说明", empty.keyHint, HINT_DEFAULT);

  // 形状脏了也不能把 undefined 显示进输入框。
  eq("空气响应不吐 undefined", connFields(undefined).serverUrl, "");
  eq("null 响应不吐 undefined", connFields(null).peerPrefix, "");
  eq("非字符串的 serverUrl 当空", connFields({ serverUrl: 42 }).serverUrl, "");

  eq("掩码：头四位 + 圆点 × 8 + 后四位", buildMask("abcd", "wxyz"), "abcd••••••••wxyz");
  eq("短 key 只有后四位（后端不给 head）", buildMask("", "wxyz"), "••••••••wxyz");
  eq("没填时掩码为空串", buildMask("abcd", ""), "");
  eq("tail 缺失时掩码为空串", buildMask("abcd", undefined), "");
  eq("掩码里的圆点正好八个", (buildMask("abcd", "wxyz").match(/•/g) || []).length, 8);

  // 亮色主题：文字色交回 naive-ui 默认，只留品牌色与中性底。
  eq(
    "品牌绿仍是主色",
    lightThemeOverrides.common?.primaryColor,
    "#6f8f68",
  );
  eq("成功色不变", lightThemeOverrides.common?.successColor, "#5d7d56");
  eq("错误色不变", lightThemeOverrides.common?.errorColor, "#b8564d");
}

// ================= ui: 组件容器化（naive-ui 说了算） =================
{
  // 这一轮把「手绘卡片 / 栅格 / peer 行 / 日志壳」全甩给 naive-ui：
  // 结构断言查组件（NCard / NGrid / NList / NScrollbar / title / clickable），
  // 样式只查四条一屏硬规矩与行数上限。手写类名（.card / .card-title / .cols /
  // .service-row / .peer-row / .channel-row / .logs-head / .skill-route 之类）
  // 一律不再出现，出现的只能是它们的组件替身。
  const css = panelCss();
  const app = uiCode("App.vue");
  const master = uiCode("components/MasterCard.vue");
  const hub = uiCode("components/HubIdentity.vue");
  const prelude = uiCode("components/PreludeCard.vue");
  const recall = uiCode("components/RecallCard.vue");
  const channels = uiCode("components/ChannelList.vue");
  const logsPanel = uiCode("components/LogsPanel.vue");
  const peers = uiCode("components/PeerList.vue");
  const skillRoute = uiCode("components/SkillRoute.vue");
  const tabBar = uiCode("components/TabBar.vue");

  // ---- panel.css 行数上限：瘦身的硬指标 ----
  const cssLines = css.replace(/\n$/, "").split("\n").length;
  check("panel.css 行数 < 600（组件接管后样式只剩布局与状态色）",
    cssLines < 600,
    `${cssLines} 行`);
  const deadSelectors = [
    "\n.card {", ".card-title", "\n.cols {", ".service-row", ".peer-row",
    ".channel-row", ".logs-head", ".skill-route-head", "\n.recall-grid {",
  ];
  check("panel.css 不再有手写卡片 / 栅格 / 行壳的选择器",
    deadSelectors.every((needle) => css.includes(needle) === false),
    deadSelectors.filter((needle) => css.includes(needle)).join(", "));
  // `#panel-global > .cols` 那一条要留着：它是「不为了填满视野而拉伸」的约束；
  // 前置卡则相反，它要吃掉本页剩余高度（日志挪走后不再留白）。
  check("全局页：总闸 / 两栏按内容定高，前置卡吃掉余量",
    /#panel-global > \.master/.test(css) &&
      /#panel-global > \.cols/.test(css) &&
      /#panel-global > \.prelude \{[\s\S]{0,80}flex\s*:\s*1 0 auto/.test(css));

  // ---- 一屏四条：必须同时成立，任一条掉了都会破版 ----
  const rootRule = ruleBody(css, "html, body");
  const pageRule = ruleBody(css, ".page");
  const panelRule = ruleBody(css, ".tab-panel");
  const mediaIdx = css.indexOf("@media (max-height: 640px)");
  const mediaBody = mediaIdx < 0 ? "" : css.slice(mediaIdx, css.lastIndexOf("}"));
  check("一屏四条同时成立（高度基准 + 根容器 + 内容区 + 640px 降级）",
    /\bheight\s*:\s*100%/.test(rootRule || "") &&
      /#panel-app\s*\{[\s\S]{0,80}height\s*:\s*100%/.test(css) &&
      /height\s*:\s*100%/.test(pageRule || "") &&
      /overflow\s*:\s*hidden/.test(pageRule || "") &&
      /display\s*:\s*flex/.test(pageRule || "") &&
      /flex-direction\s*:\s*column/.test(pageRule || "") &&
      /box-sizing\s*:\s*border-box/.test(pageRule || "") &&
      /flex\s*:\s*1 1 auto/.test(panelRule || "") &&
      /min-height\s*:\s*0/.test(panelRule || "") &&
      mediaIdx >= 0 &&
      /html,\s*\n?\s*body \{[\s\S]{0,120}height\s*:\s*auto/.test(mediaBody) &&
      /#panel-app\s*\{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody) &&
      /\.page \{[\s\S]{0,80}height\s*:\s*auto/.test(mediaBody),
    `${rootRule} | ${pageRule} | ${panelRule} | ${mediaBody.slice(0, 120)}`);
  check("整份 panel.css 里没有任何视口高度单位",
    /100vh|100dvh|100svh/.test(css) === false,
    (css.match(/.{0,20}(100vh|100dvh|100svh).{0,20}/g) || []).join(" | "));
  check("根容器 .page 不许自己滚（滚动只发生在内容区 / 日志 / 名单）",
    /overflow\s*:\s*hidden/.test(pageRule || "") && /overflow-y\s*:\s*auto/.test(panelRule || ""));
  check("hidden 兜底仍在（flex / grid 不能把 hidden 顶掉）",
    /display\s*:\s*none\s*!important/.test(ruleBody(css, ".page [hidden]") || ""));

  // ---- 卡片全是 NCard，title 一个都不能少 ----
  const titledCards = [
    ["总闸", /<NCard\b[\s\S]{0,240}title="总闸"/, master],
    ["中枢", /<NCard\b[\s\S]{0,240}title="中枢"/, hub],
    ["身份", /<NCard\b[\s\S]{0,240}title="身份"/, hub],
    ["前置", /<NCard\b[\s\S]{0,240}title="前置"/, prelude],
    ["日志", /<NCard\b[\s\S]{0,240}title="日志"/, logsPanel],
    ["召回管理", /<NCard\b[\s\S]{0,240}title="召回管理"/, recall],
    ["技能路由", /<NCard\b[\s\S]{0,240}title="技能路由"/, skillRoute],
  ];
  check("七张卡都是 NCard 且都有 title",
    titledCards.every(([, pattern, source]) => pattern.test(source)),
    titledCards.filter(([, pattern, source]) => pattern.test(source) === false).map(([name]) => name).join(", "));
  check("技能卡的 aria-label 还在",
    /<NCard\b[\s\S]{0,300}aria-label="技能路由"/.test(skillRoute), skillRoute.slice(0, 360));
  check("需要右侧附件的地方用 #header-extra（总闸开关 / peer 计数 / 日志计数 / 技能开关）",
    [/<template #header-extra>[\s\S]{0,160}<NSwitch/.test(master),
      /<template #header-extra>[\s\S]{0,160}id="peerCount"/.test(recall),
      /<template #header-extra>[\s\S]{0,160}id="logChips"/.test(logsPanel),
      /<template #header-extra>[\s\S]{0,200}<NSwitch/.test(skillRoute)].every(Boolean));
  check("NCard 不降到 tiny（压内边距，不压字号）",
    /size="tiny"/.test([master, hub, prelude, recall, channels, logsPanel, skillRoute].join("\n")) === false &&
      [master, prelude, recall, logsPanel, skillRoute].every((source) => source.includes('size="small"')));
  check("手写 .card / .card-title 彻底不在模板里",
    [master, hub, prelude, recall, channels, logsPanel, skillRoute, peers].every(
      (source) => /class="card\b/.test(source) === false && source.includes("card-title") === false,
    ));

  // ---- 栅格：NGrid 用 screen 断点 + 数字断点，不写自定义列宽 ----
  const grids = [
    ["中枢 / 身份两栏", hub, 'cols="1 700:2"'],
    ["召回三个主下拉", recall, 'cols="1 700:3"'],
    ["两个展开区", recall, 'cols="1 700:2"'],
    ["通道四格", channels, 'cols="1 520:2 700:4"'],
    ["服务五格", prelude, 'cols="1 700:5"'],
  ];
  for (const [label, source, cols] of grids) {
    check(`${label}用 ${cols}`,
      source.includes(cols) && /responsive="screen"/.test(source), cols);
  }
  // responsive="screen" 是按**断点名**取值的（vooks 的 useBreakpoints 返回名字数组），
  // 断点表里没有 "700" 这个键，cols 里的 `700:` 就永远落到默认值 1 —— 整页栅格
  // 会退成单列。所以断点表必须把键写成数字，且只在 lib 里定义一次。
  check("断点表把键写成数字（0 / 520 / 700），组件里的 cols 才匹配得到",
    /export const BREAKPOINTS = Object\.freeze\(\{[\s\S]{0,120}0: 0,[\s\S]{0,80}520: 520,[\s\S]{0,80}700: 700/.test(
      uiSrcRaw("lib/grid-breakpoints.js"),
    ),
    uiSrcRaw("lib/grid-breakpoints.js").slice(0, 200));
  check("断点表接到 NConfigProvider 上（一份，两页共用）",
    /:breakpoints="BREAKPOINTS"/.test(app) && app.includes('from "./lib/grid-breakpoints.js"'));
  check("cols 里用到的断点都在断点表里",
    [520, 700].every((width) =>
      /(^|[^\d])520: 520/.test(uiSrcRaw("lib/grid-breakpoints.js")) &&
      /(^|[^\d])700: 700/.test(uiSrcRaw("lib/grid-breakpoints.js")),
    ) && [hub, recall, channels, prelude].every((source) => /responsive="screen"/.test(source)));

  check("NGrid 的每个直接子节点都是 NGridItem（否则 naive-ui 直接不渲染）",
    [hub, recall, channels, prelude].every((source) => {
      const cells = (source.match(/<NGrid\b/g) || []).length;
      const items = (source.match(/<NGridItem>/g) || []).length;
      return cells > 0 && items >= cells;
    }));
  check("没有自定义列宽的 v-bind:cols（统一走响应式字符串）",
    [hub, recall, channels, prelude].every((source) => /:cols=/.test(source) === false ||
      /:cols="2"/.test(source)));

  // ---- peer 名单：NScrollbar > NList(clickable) > NListItem ----
  check("peer 名单是 NScrollbar > NList(clickable) > NListItem",
    /<NScrollbar[\s\S]{0,120}<NList clickable/.test(peers) &&
      /<NListItem\b/.test(peers),
    peers.slice(peers.indexOf("<NScrollbar"), peers.indexOf("<NScrollbar") + 120));
  check("peer 名单的滚动 / 计数外壳仍是 NScrollbar（名单自己滚）",
    /<NScrollbar v-else class="peer-scroll">/.test(peers));
  check("本机行不挂 click / role / tabindex",
    /function rowAttrs\(row\) \{[\s\S]{0,120}if \(!row\.tappable\) return \{\};/.test(peers) &&
      /v-bind="rowAttrs\(row\)"/.test(peers) &&
      /row\.tappable \? "button" : undefined/.test(peers) === false,
    peers.slice(peers.indexOf("function rowAttrs"), peers.indexOf("function rowAttrs") + 200));
  check("可点行才有 role=button / tabindex=0 / Enter·Space",
    /role: "button"/.test(peers) && /tabindex: 0/.test(peers) &&
      peers.includes('"Enter"') && peers.includes('" "'));
  check("参与 / 排除用圆点表达（实心 / 空心），名字是本机正常色、外机灰",
    /<span class="peer-dot" :class="\{ off: row\.excluded \}"/.test(peers) &&
      /\.peer-dot \{[\s\S]{0,160}background:\s*#6f8f68/.test(css) &&
      /\.peer-dot\.off \{[\s\S]{0,120}background:\s*transparent/.test(css) &&
      /\.peer-item\.other \.peer-name \{[^}]*rgba\(128, 128, 128/.test(css));
  check("本机行额外挂一枚「本机」NTag",
    /<NTag v-if="row\.self" size="small"/.test(peers) && peers.includes(">本机</NTag>"));
  check('meta 用 NText depth="3"', /<NText depth="3"/.test(peers));
  check("名单外壳的契约没变（id / title / 空态 / 提示句）",
    peers.includes('id="peerList"') &&
      /:title="listTitle"/.test(peers) &&
      /state\.peers\.error \|\| undefined/.test(peers) &&
      peers.includes('class="peer-empty"') &&
      /:title="row\.title"/.test(peers) &&
      /id="peerHint"[\s\S]{0,80}:hidden="!hintVisible"/.test(peers));
  check("pending 时行不可点", /if \(!row\.tappable \|\| pending\.value\) return;/.test(peers));

  // ---- 日志页：NCard > NScrollbar > pre，折叠已删 ----
  check("日志页是 NCard > NScrollbar > pre",
    /<NCard\b[\s\S]{0,700}<NScrollbar\b[\s\S]{0,200}id="logBody"/.test(logsPanel),
    logsPanel.slice(logsPanel.indexOf("<NCard"), logsPanel.indexOf("<NCard") + 200));
  check("折叠组件与开关彻底不在日志页里",
    ["NCollapse", "NCollapseItem", "NButton", "logToggle"].every(
      (needle) => logsPanel.includes(needle) === false));
  check("日志正文只走 store 投影（没有自建状态）",
    logsPanel.includes("useLogs()") && /\bref\(/.test(logsPanel) === false);

  // ---- 召回 5 个 NSelect：id 一律走 :input-props，不许裸 id= ----
  const selectTags = recall.match(/<NSelect\b[\s\S]*?\/>/g) || [];
  eq("召回卡里恰好 5 个 NSelect", selectTags.length, 5);
  check("5 个 NSelect 都没有裸 id=（裸 id 会落到外层 div，label for 指空）",
    selectTags.every((tag) => /\bid="/.test(tag) === false),
    selectTags.map((tag) => (/\bid="/.exec(tag) || [""])[0]).join(" | "));
  check("5 个 NSelect 都用 :input-props 带 id",
    ["recallGate", "queryMode", "rerank", "gateModel", "rerankModel"].every((id) =>
      new RegExp(`:input-props="\\{ id: '${id}' }"`).test(recall),
    ),
    ["recallGate", "queryMode", "rerank", "gateModel", "rerankModel"]
      .filter((id) => new RegExp(`:input-props="\\{ id: '${id}' }"`).test(recall) === false)
      .join(", "));
  // ---- 五个下拉的标签：纯文本 + 控件 aria-label ----
  // 事实（naive-ui 2.45）：非 filterable 的 NSelect 走 _internal/selection 的非 filterable
  // 分支，那个分支不创建内部 <input>；Select.mjs 也没有 role=combobox / aria-*；
  // FormItem 也不写 for / aria。所以 <label for> 在这个组件上只能指到外层 div，等于指空。
  // 定论：纯文本标签 + 控件自带 aria-label，文字逐字不变（不改 filterable）。
  const selectLabels = [
    ["recallGate", "召回判断"],
    ["queryMode", "召回查询"],
    ["rerank", "结果重排"],
    ["gateModel", "判断模型"],
    ["rerankModel", "兜底模型（无启用通道时）"],
  ];
  const selectTagFor = (id) =>
    selectTags.find((tag) => tag.includes(`:input-props="{ id: '${id}' }"`)) || "";
  eq("五个下拉都能按 id 定位到各自的 NSelect tag",
    selectLabels.filter(([id]) => selectTagFor(id) === "").map(([id]) => id), []);
  check("五个下拉都带 aria-label，文字与旁边的纯文本标签逐字一致",
    selectLabels.every(([id, text]) =>
      selectTagFor(id).includes(`aria-label="${text}"`) &&
      recall.includes(`<span class="field-label">${text}</span>`)),
    selectLabels
      .filter(([id, text]) =>
        selectTagFor(id).includes(`aria-label="${text}"`) === false ||
        recall.includes(`<span class="field-label">${text}</span>`) === false)
      .map(([id, text]) => `${id}=${text}`)
      .join(", "));
  check("五个下拉的标签控件不再是 label（no <label for> 指空）",
    selectLabels.every(([id]) => recall.includes(`for="${id}"`) === false) &&
      (recall.match(/<label\b/g) || []).length === 2,
    selectLabels.filter(([id]) => recall.includes(`for="${id}"`)).map(([id]) => id).join(", "));

  // ---- 标签关联的全量体检（ui-src/src/components 下每一个 .vue） ----
  // 三条规矩：
  //   1) <label for=id> 的 id 必须在同一个组件的 :input-props 里出现（真控件、真关联）；
  //   2) 不带 for 的 <label> 只允许「包住控件」那一种写法（channel-cell 三格）；
  //   3) 裸 label（既没 for 也没包控件）为 0。
  const componentFiles = fs
    .readdirSync(path.join(UI_SRC_DIR, "components"))
    .filter((name) => name.endsWith(".vue"));
  check("面板组件清单不是空的（体检样本）", componentFiles.length >= 10, `${componentFiles.length} 个`);
  const reEscape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forTargets = [];
  const forIssues = [];
  const wrappingLabels = [];
  const bareLabels = [];
  for (const file of componentFiles) {
    const code = uiCode(`components/${file}`);
    for (const match of code.matchAll(/<label\b([^>]*)>/g)) {
      const attrs = match[1];
      // 先认 :for=，再认静态 for=（\b 在 :for= 的冒号后也成立，顺序反了会把动态当成静态）
      const dynamicFor = /:for="([^"]+)"/.exec(attrs);
      const staticFor = dynamicFor ? null : /(?<!:)for="([^"]+)"/.exec(attrs);
      const target = staticFor ? staticFor[1] : dynamicFor ? dynamicFor[1] : null;
      if (target) {
        forTargets.push([file, target]);
        // :input-props="{ id: 'x' }" / "{ id: row.x.id, ... }" / "{ id: row.x.id }" 都算
        const bound = new RegExp(`id:\\s*${staticFor ? `'${reEscape(target)}'` : reEscape(target)}\\s*[,}]`).test(code);
        if (bound === false) forIssues.push(`${file} for=${target}`);
        continue;
      }
      // 没有 for：唯一允许的是包住控件（且必须是 channel-cell 那三格）
      const classAttr = /\bclass="([^"]*)"/.exec(attrs);
      const classes = classAttr ? classAttr[1].split(/\s+/) : [];
      const body = code.slice(match.index + match[0].length, code.indexOf("</label>", match.index));
      if (classes.includes("channel-cell") && /<NInput\b|<NInputNumber\b/.test(body)) {
        wrappingLabels.push(`${file}:${classes.join(".")}`);
      } else {
        bareLabels.push(`${file} <label${attrs}>`);
      }
    }
  }
  eq("面板组件里没有裸 label（既没 for 也没包住控件）", bareLabels, []);
  eq("不带 for 的 label 只剩 channel-cell 三格（名称 / 权重 / 超时）", wrappingLabels.length, 3);
  eq("每个 label for 的目标都能在同类组件的 :input-props 里找到", forIssues, []);
  check("label for 目标清单非空（HubIdentity 五处 + RecallCard 两个提示词框 + PreludeCard 三处）",
    forTargets.length === 10, forTargets.map(([file, id]) => `${file}:${id}`).join(", "));
  // 黑名单：这五个 id 的控件拿不到程序化关联，任何组件里都不许再为它们写 for=
  const NO_FOR_IDS = selectLabels.map(([id]) => id);
  check("五个下拉的 id 在「禁止出现 for=」的黑名单里，且面板组件里确实没有引用",
    NO_FOR_IDS.every((id) =>
      forTargets.every(([, target]) => target !== id) &&
      componentFiles.every((file) => uiCode(`components/${file}`).includes(`for="${id}"`) === false)),
    NO_FOR_IDS.filter((id) => forTargets.some(([, target]) => target === id)).join(", "));

  // ---- 通道列表：类型那格改 div + aria-label，名称 / 权重 / 超时仍是包控件的 label ----
  check("精排通道标题是纯文本 span.field-label",
    channels.includes('<span class="field-label">精排通道</span>'));
  check("类型那格是 div.channel-cell + NSelect 自带 aria-label=\"类型\"",
    /<div class="channel-cell">[\s\S]{0,240}?aria-label="类型"/.test(channels));
  eq("名称 / 权重 / 超时三格仍是包住控件的 label.channel-cell",
    (channels.match(/<label class="channel-cell">/g) || []).length, 3);
  check("channel-cell 的样式仍对 div / label 两种标签生效（选择器按 class 走）",
    /\.channel-cell \{/.test(css) && /\.channel-cell > span \{/.test(css));

  // ---- .field-label 的排版必须与原 label 一致（改标签等于改字号是破版） ----
  const fieldLabelRule = ruleBody(css, ".field .field-label") || "";
  check(".field-label 继承了原来 label 的字号 / 行高 / 透明度",
    /\bfont-size:\s*11\.5px/.test(fieldLabelRule) &&
      /\bline-height:\s*1\.35/.test(fieldLabelRule) &&
      /\bopacity:\s*0\.62/.test(fieldLabelRule),
    fieldLabelRule || "缺 .field .field-label 规则");
  check("原来的 .field label 规则还在（NInput / NInputNumber 的真 label 照旧）",
    css.includes(".field label,"));
  const promptFieldLabelRule = ruleBody(css, ".prompt-head .field-label") || "";
  check(".prompt-head 里的 .field-label 也补了 margin:0（和原 label 同排版）",
    /\bmargin\s*:\s*0/.test(promptFieldLabelRule),
    promptFieldLabelRule || "缺 .prompt-head .field-label 规则");

  // ---- 行为六条：控件一律直绑 store，没有本地副本 ----
  check("三个主下拉直绑 state.form（失败时跟着 store 退回）",
    /:value="state\.form\.recallGate"/.test(recall) &&
      /:value="state\.form\.queryMode"/.test(recall) &&
      /:value="state\.form\.rerank"/.test(recall));
  check("两个模型下拉也直绑 state.form",
    /:value="state\.form\.gateModel"/.test(recall) &&
      /:value="state\.form\.rerankModel"/.test(recall));
  check("提示词框直绑 state.prompts（配置为空时坐的是默认全文）",
    /:value="state\.prompts\.gate"/.test(recall) &&
      /:value="state\.prompts\.rerank"/.test(recall));
  check("打分服务草稿直绑 state.draft",
    /:value="state\.draft\[row\.url\.key\]"/.test(prelude) &&
      /:value="state\.draft\[row\.model\.key\]"/.test(prelude));
  check("总闸 / 探针 / 技能路由直绑 controls",
    /:value="state\.controls\.enabled"/.test(master) &&
      /:value="state\.controls\.probe"/.test(prelude) &&
      /:value="routing"/.test(skillRoute));

  // ---- TabBar 仍是手写 tablist（n-tabs 保不住现有 aria 契约） ----
  check("TabBar 仍是手写 role=tab 按钮，而不是 n-tabs",
    tabBar.includes('role="tab"') && tabBar.includes('role="tablist"') &&
      tabBar.includes("<button") && /<NTabs\b/.test(tabBar) === false);
  check("TabBar 的注释写清了为什么不用 n-tabs",
    /n-tabs/.test(uiSrcRaw("components/TabBar.vue")) && /aria-controls/.test(uiSrcRaw("components/TabBar.vue")));
}


// ================= ui: 边栏会话卡（Vue + naive-ui） =================
{
  // 这张卡不在一屏面板里，但语义最密：三项开关 + 召回范围都改会话覆盖，
  // 「跟随全局」提交 null 而不是 false。结构断言读组件源码，语义断言读纯函数。
  const cardHtml = fs.readFileSync(path.join(import.meta.dirname, "../ui/card.html"), "utf8");
  const cardApp = uiCode("CardApp.vue");
  const cardRow = uiCode("components/CardRow.vue");
  const cardEntry = uiCode("entries/card.js");
  const cardCss = fs
    .readFileSync(path.join(import.meta.dirname, "../ui/assets/card.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // ---- HTML：只剩挂载点，宿主识别标记还在，只引构建产物 card.js ----
  check("card.html 只剩 #card-app 挂载点", cardHtml.includes('<div id="card-app"></div>'), cardHtml);
  check("card.html 的 main 仍带 data-hana-app-ui", /<main\b[^>]*\bdata-hana-app-ui\b[^>]*>/.test(cardHtml), cardHtml);
  eq(
    "card.html 只引一个 module script（card.js）",
    [...cardHtml.matchAll(/<script type="module" src="\.\/assets\/([^"]+)"><\/script>/g)].map(
      (match) => match[1],
    ),
    ["card.js"],
  );
  check("card.html 仍挂静态 card.css", cardHtml.includes('href="./assets/card.css"'));
  check("card.html 没有内联样式块", cardHtml.includes("<style") === false);
  check("入口只负责挂载 CardApp", /\.mount\("#card-app"\)/.test(cardEntry), cardEntry);

  // ---- 四个键：名字必须与后端 OVERRIDE_KEYS 对得上 ----
  eq("会话卡三个布尔键", CARD_BOOL_KEYS, ["autoRecall", "autoCapture", "readOnly"]);
  eq("会话卡范围键", CARD_SCOPE_KEY, "recallPeerScope");
  eq("会话卡覆盖键集合", CARD_OVERRIDE_KEYS, ["autoRecall", "autoCapture", "readOnly", "recallPeerScope"]);
  check("四个键都出现在组件里",
    CARD_OVERRIDE_KEYS.every((key) => cardApp.includes(`"${key}"`) || cardApp.includes(`'${key}'`)),
    CARD_OVERRIDE_KEYS.join(", "));

  // ---- 控件：三个开关 + 一组 radio-button；窄栏里 radio 换到第二行 ----
  eq("三个开关都是 n-switch", (cardApp.match(/<NSwitch\b/g) || []).length, 3);
  check("召回范围是 n-radio-group + 两枚 n-radio-button",
    /<NRadioGroup\b/.test(cardApp) &&
      (cardApp.match(/<NRadioButton\b/g) || []).length === 2 &&
      cardApp.includes('value="all"') && cardApp.includes('value="self"'));
  check("召回范围的两枚按钮在宽行里换行（240px 侧边栏放不进同一行）",
    /class="row-control"/.test(cardRow) &&
      /\.row-wide \.row-control\s*\{[\s\S]{0,120}flex\s*:\s*0 0 100%/.test(cardCss),
    ruleBody(cardCss, ".row-wide .row-control") || "");
  check("小字按钮用 n-button text size=tiny，不是手画胶囊",
    /<NButton\b[\s\S]{0,160}\btext\b/.test(cardRow) &&
      /<NButton\b[\s\S]{0,160}size="tiny"/.test(cardRow));
  check("小字按钮的两态文案来自 card-view（本会话 / 跟随全局）",
    cardRow.includes("noteView(props.overridden)") &&
      cardRow.includes("{{ note.text }}"));
  check("已覆盖时小字用 primary 色（组件库上色，不写虚线边框）",
    /:type="overridden \? 'primary' : 'default'"/.test(cardRow));

  // ---- 「跟随全局」提交 null，不是 false ----
  const resetPatch = cardResetOverride({ autoRecall: false, readOnly: true }, "autoRecall");
  eq("交回全局提交 autoRecall:null", resetPatch.autoRecall, null);
  eq("同时保留其它覆盖值", resetPatch.readOnly, true);
  check("交回全局不写 false", resetPatch.autoRecall !== false, JSON.stringify(resetPatch));
  const withPatch = cardWithOverride({ autoRecall: true }, "autoCapture", false);
  eq("改一项只合并这一项", withPatch, { autoRecall: true, autoCapture: false });
  eq("null 不算覆盖", hasCardOverride({ autoRecall: null }, "autoRecall"), false);
  eq("false 算覆盖", hasCardOverride({ autoRecall: false }, "autoRecall"), true);
  check("组件走 resetOverride 生成清覆盖补丁", cardApp.includes("resetOverride("), cardApp.slice(0, 200));
  check("组件里没有把清覆盖写成 false", /\[key\]\s*:\s*false/.test(cardApp) === false);

  // ---- 文案 / 统计规则与旧卡逐字一致 ----
  eq("跟随中（未覆盖）的小字", cardNoteView(false), { text: "跟随全局", title: "当前跟随全局" });
  eq("已覆盖的小字", cardNoteView(true), { text: "本会话", title: "点击交回全局" });
  eq("统计行：召回 / 写回 / 钩子",
    cardStatsText({
      state: { recall: { turns: 2 }, capture: { turns: 1 } },
      probe: { events: { "provider/before-request": 2, "agent/before-start": 1 } },
    }),
    "召回 2 · 写回 1 · 钩子 3");
  eq("没有探针时间时不追加空段",
    cardStatsText({ state: { recall: { turns: 0 }, capture: { turns: 0 } }, probe: { events: {} } }),
    "召回 0 · 写回 0");
  eq("总闸关着时提示红色警告",
    cardHintView({ overrides: {}, enabled: false, status: { enabled: false, probe: true } }),
    { text: "全局总闸关着，这里的开关不会生效。", warn: true });
  eq("探针关着时的有覆盖提示",
    cardHintView({ overrides: { autoRecall: false }, enabled: true, status: { probe: false } }),
    { text: "有本会话设置；点小字交回全局。", warn: false });
  eq("探针开着时的有覆盖提示",
    cardHintView({ overrides: { autoRecall: false }, enabled: true, status: { probe: true } }),
    { text: "实心小字是本会话设置，点它交回全局。", warn: false });
  eq("没有覆盖时不给空话",
    cardHintView({ overrides: {}, enabled: true, status: { probe: true } }).text,
    "");
  eq("peer 优先显示宿主断言的会话归属",
    cardPeerView({ peer: "ov-mbp", peerSource: "session" }, "hermes").text,
    "hermes");
  check("拿不到身份时不编门牌", cardPeerView({ peer: null, peerSource: "unbound" }, "").text === "未绑定助手");
  eq("没有活动会话时的标题",
    cardSessionView(null),
    { sessionKey: null, sessionOwner: "", title: "无活动会话", titleTitle: "" });
  const active = cardSessionView({
    sessionPath: "/tmp/sessions/2026-10-20T08-09-15-730Z_01a1585b-1f3e-4b2b-9d9a-5c5d5e5f5a5b.jsonl",
    title: "",
    agentId: "hermes",
  });
  eq("活动会话取的是路径里的 uuid", active.sessionKey, "01a1585b-1f3e-4b2b-9d9a-5c5d5e5f5a5b");
  eq("没有标题时显示 key 末八位", active.title, "5e5f5a5b");
  eq("会话归属来自 agentId", active.sessionOwner, "hermes");

  // ---- 无活动会话：四个键的控件与「跟随全局」全部禁用 ----
  check("禁用判据同时看会话 key 与已读到的模型",
    /controlsDisabled\s*=\s*computed\([\s\S]{0,160}!state\.sessionKey[\s\S]{0,80}!state\.hasModel/.test(cardApp),
    cardApp.slice(0, 600));
  // 四个 CardRow 各接一次，四个真控件（3 开关 + 1 radio-group）再各接一次。
  eq("三开关 + 召回范围都接 controlsDisabled",
    (cardApp.match(/:disabled="controlsDisabled"/g) || []).length,
    8);
  check("小字按钮也接同一个禁用态",
    /:disabled="disabled"/.test(cardRow) &&
      (cardApp.match(/:disabled="controlsDisabled"/g) || []).length === 8);
  check("无活动会话时标题写「无活动会话」", cardApp.includes('title: "无活动会话"'));
  check("无活动会话时提示先打开一个对话", cardApp.includes("先打开一个对话"));

  // ---- 样式：组件接管外观，只留卡片容器 / 行布局 / 状态点 ----
  const cardCssLines = cardCss.replace(/\n$/, "").split("\n").length;
  check("card.css 比旧版短（旧 212 行，组件接管后 < 180 行）",
    cardCssLines < 180, `${cardCssLines} 行`);
  const deadCardSelectors = ["\n.switch {", "\n.seg {", ".seg button", ".knob", ".row-note.over", "\n.sub {"];
  check("自绘开关 / 分段 / 胶囊小字的选择器都不在了",
    deadCardSelectors.every((needle) => cardCss.includes(needle) === false),
    deadCardSelectors.filter((needle) => cardCss.includes(needle)).join(", "));
  check("卡片不画自己的底色（容器背景留透明）",
    /background/.test(ruleBody(cardCss, ".ov") || "") === false &&
      /background/.test(ruleBody(cardCss, ".card") || "") === false,
    `${ruleBody(cardCss, ".ov")} | ${ruleBody(cardCss, ".card")}`);
  check("状态点用宿主 accent #537d96（warm-paper 亮色）",
    /\.dot\.ok\s*\{[\s\S]{0,120}#537d96/.test(cardCss));
  check("行布局仍在 `.row` 上，小字靠 margin-left:auto 推到行尾",
    /\.row\s*\{[\s\S]{0,160}display\s*:\s*flex/.test(cardCss) &&
      /\.row-note\s*\{[\s\S]{0,80}margin-left\s*:\s*auto/.test(cardCss));
  check("挂载层不撑破侧边栏",
    /#card-app,[\s\S]{0,80}\.card\s*\{[\s\S]{0,80}min-width\s*:\s*0/.test(cardCss),
    ruleBody(cardCss, "#card-app,\n.card") || "");
  check("卡片主题是亮色，不引 darkTheme", cardApp.includes("darkTheme") === false);
  check("卡片局部用宿主 accent #537D96，不写在共享 theme.js 里",
    cardApp.includes("#537D96") && uiCode("theme.js").includes("#537D96") === false);
  check("交回全局的乐观回退用全局状态值",
    cardOptimisticReset({ autoRecall: false }, "autoRecall", { autoRecall: true }).autoRecall === true &&
      cardOptimisticReset({ recallPeerScope: "all" }, "recallPeerScope", { recallScope: "self" }).recallPeerScope === "self");
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

// ================= 界面文案：locale 与 placeholder =================
{
  // 这一组盯的是一类很隐蔽的回退：naive-ui 的默认 locale 是 enUS，某个输入框
  // 没写 placeholder 时不会“空着”，而是显示 "Please Input"、下拉显示
  // "Please Select"。中文界面里出现英文，冒烟以前一条都拦不住。
  // 两层防护都要：locale 兜底（组件级默认文案是中文），以及每个输入框自己
  // 写一句中文 placeholder（不把责任全推给 locale）。
  const entryFiles = ["App.vue", "SettingsApp.vue", "CardApp.vue"];
  for (const name of entryFiles) {
    const src = uiCode(name);
    check(`${name} 从 naive-ui 引 zhCN`,
      /import\s*\{[^}]*\bzhCN\b[^}]*\}\s*from\s*["']naive-ui["']/.test(src), src.slice(0, 120));
    check(`${name} 的 NConfigProvider 传了 :locale="zhCN"`,
      /<NConfigProvider[\s\S]{0,300}?locale="zhCN"/.test(src));
  }

  // 递归扫一遍组件源码：所有 NInput / NInputNumber 都必须自带 placeholder。
  const walkVue = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkVue(full);
      return entry.name.endsWith(".vue") || entry.name.endsWith(".js") ? [full] : [];
    });
  const stripComments = (text) =>
    text.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
  const inputsWithoutPlaceholder = [];
  const literalPlaceholders = new Map();
  for (const file of walkVue(UI_SRC_DIR)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const tag of ["NInput", "NInputNumber"]) {
      const re = new RegExp(`<${tag}\\b[\\s\\S]*?(?:/>|>[\\s\\S]*?</${tag}>)`, "g");
      for (const match of src.matchAll(re)) {
        const rel = path.relative(UI_SRC_DIR, file);
        const line = src.slice(0, match.index).split("\n").length;
        if (!/\bplaceholder\b/.test(match[0])) {
          inputsWithoutPlaceholder.push(`${rel}:${line} <${tag}>`);
          continue;
        }
        const idMatch = match[0].match(/id:\s*["']([\w-]+)["']/);
        const literal = match[0].match(/\splaceholder="([^"]*)"/);
        if (idMatch && literal) literalPlaceholders.set(idMatch[1], literal[1]);
      }
    }
  }
  check("所有 NInput / NInputNumber 都自带 placeholder（不靠组件默认文案）",
    inputsWithoutPlaceholder.length === 0, inputsWithoutPlaceholder.join(" / "));

  // placeholder 不能是空串：空串等于又退回默认文案。
  const emptyPlaceholders = [...literalPlaceholders].filter(([, text]) => text.trim() === "");
  check("字面 placeholder 都不是空串", emptyPlaceholders.length === 0,
    emptyPlaceholders.map(([id]) => id).join(" / "));

  // 三个原本靠默认文案的框：placeholder 要与后端默认值同一个数，
  // 免得将来改了默认值、界面还在默念旧数字。
  const manifestDefaults = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "../manifest.json"), "utf8"),
  ).contributes.settings.schema.properties;
  check("超时框的 placeholder 写的是后端默认超时",
    literalPlaceholders.get("timeoutMs") === `默认 ${manifestDefaults.requestTimeoutMs.default}`,
    `${literalPlaceholders.get("timeoutMs")} vs ${manifestDefaults.requestTimeoutMs.default}`);
  check("注入预算框的 placeholder 写的是后端默认预算",
    literalPlaceholders.get("budgetTokens") === `默认 ${manifestDefaults.injectBudgetTokens.default}`,
    `${literalPlaceholders.get("budgetTokens")} vs ${manifestDefaults.injectBudgetTokens.default}`);
  check("通道权重框的 placeholder 是 1（与 recall.js 的等价默认一致）",
    /placeholder="默认 1"/.test(uiCode("components/ChannelList.vue")));

  // 日期控件一个都没有：所以不需要 dateZhCN，写清楚比默默不写强。
  const datePickers = walkVue(UI_SRC_DIR)
    .map((file) => stripComments(fs.readFileSync(file, "utf8")))
    .filter((src) => /<N(Date|Time)Picker\b/.test(src));
  check("没有日期 / 时间选择器（因此不需要 dateZhCN）", datePickers.length === 0,
    `${datePickers.length} 个文件用了日期控件`);
}

// ================= 结果 =================
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);

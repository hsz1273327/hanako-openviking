// 离线冒烟：不联网、不装 App，只验纯逻辑。
// 跑法：node dev/smoke.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "../src/ov/client.js";
import { resolvePeer, agentDirFromSessionPath } from "../src/ov/identity.js";
import { readConnection, readSwitches, DEFAULTS } from "../src/ov/settings.js";
import { createProbe } from "../src/probe.js";
import {
  stripInjected,
  lastUserText,
  injectMemory,
  estimateTokens,
  trimToBudget,
} from "../src/inject/plan.js";
import { skillFindTool, skillLoadTool } from "../src/skills/tools.js";
import {
  createDeduper,
  createRecallHandler,
  extractRecallText,
  fingerprint,
  memoryBlock,
  resetShapeWarning,
  DEDUP_LIMIT,
  MEMORY_MAX_TOKENS,
} from "../src/memory/recall.js";
import {
  readSession,
  patchSession,
  effective,
  listSessions,
  touchSession,
  markClosed,
  OVERRIDE_KEYS,
} from "../src/state/session.js";

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
  const { calls, fetchImpl } = mockFetch({ body: { status: "ok", result: { healthy: true } } });
  const client = createClient({
    serverUrl: "http://192.168.50.142:8000/",
    apiKey: "k-123",
    peer: "mbp-hanako",
    fetchImpl,
  });

  const result = await client.health();
  eq("health 返回 result", result, { healthy: true });
  eq("base 去掉尾部斜杠", client.baseUrl, "http://192.168.50.142:8000");
  eq("health 走 GET", calls[0].init.method, "GET");
  eq("health URL", calls[0].url, "http://192.168.50.142:8000/health");
  eq("带上 X-API-Key", calls[0].init.headers["X-API-Key"], "k-123");
  eq("带上 actor peer", calls[0].init.headers["X-OpenViking-Actor-Peer"], "mbp-hanako");
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

// ================= identity =================
{
  const p = "/Users/u/.hanako/agents/agent-muewpt9i/sessions/2026-10-19T02-41.jsonl";
  eq("从会话路径取 agentDir", agentDirFromSessionPath(p), "agent-muewpt9i");
  eq("无前缀", resolvePeer({ peerPrefix: "" }, p), "agent-muewpt9i");
  eq("有前缀", resolvePeer({ peerPrefix: "mbp" }, p), "mbp-agent-muewpt9i");
  eq("合并记忆", resolvePeer({ peerPrefix: "mbp", mergeMemory: true }, p), "mbp-openhanako");
  eq("路径不明时退回合并名", resolvePeer({}, null), "openhanako");
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

  const lines = fs
    .readFileSync(path.join(dir, "probe.log"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  eq("三行记录", lines.length, 3);
  eq("第一个事件名", lines[0].event, "agent/before-start");
  eq("before-start 记了 prompt 长度", lines[0].shape.promptChars, 8);
  eq("同一会话第二次计数为 2", lines[2].count, 2);
  eq("payload 里数出 messages", lines[1].shape.messageCount, 2);
  eq("payload 顶层键", lines[1].shape.payloadKeys, ["system", "messages"]);

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
  eq("召回请求带 actor peer", calls[0].init.headers["X-OpenViking-Actor-Peer"], "agent-x");

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

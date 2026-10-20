// 离线冒烟：不联网、不装 App，只验纯逻辑。
// 跑法：node dev/smoke.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "../src/ov/client.js";
import { resolvePeer, agentDirFromSessionPath } from "../src/ov/identity.js";
import { readConnection, readSwitches, DEFAULTS } from "../src/ov/settings.js";
import { createProbe } from "../src/probe.js";

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
  eq("recall peer_scope", body.peer_scope, "self");
  eq("recall max_tokens", body.max_tokens, 800);
  eq("recall 路径", calls[0].url, "http://h:1/api/v1/search/search");
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

// ================= 结果 =================
if (failures.length) {
  console.error(`\n${failures.length} failed, ${passed} passed\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);

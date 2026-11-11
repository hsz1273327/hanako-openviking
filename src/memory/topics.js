// 写回话题表：跨会话共享的一张 json 表，用来把每次提交归到同一个话题上。
//
// 为什么是单文件：话题要跨会话比较，按会话分文件就没法在 global 作用域下取候选。
// 文件坏了只影响归类（退化成「每次都是新话题」），不能把整轮写回打回去。
//
// 写入串行化在进程内做（withTopics）：两个会话同时 settled 时，各自读一份再写，
// 后写的那份会把先写的 segments 覆盖掉。按 dataDir 分键排队，同一个文件只有一条链。

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TOPIC_ID_RE =
  /^t_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 读写与调用方共用的空表；每次返回新对象，避免调用方改到模块级那份。 */
export function emptyTopics() {
  return { version: 1, topics: [] };
}

function fileOf(dataDir) {
  return path.join(dataDir || ".", "topics.json");
}

function stringOf(value) {
  return typeof value === "string" ? value : "";
}

function positiveInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.floor(value);
    return n > 0 ? n : 0;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) {
      const rounded = Math.floor(n);
      return rounded > 0 ? rounded : 0;
    }
  }
  return 0;
}

function sanitizeTopic(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = stringOf(raw.id).trim();
  if (!TOPIC_ID_RE.test(id)) return null;
  const segments = positiveInt(raw.segments);
  // 没有段数的话题没有可用于归类的历史，留着只会让候选池里多一条空记录。
  if (!segments) return null;
  const sessionIds = Array.isArray(raw.sessionIds)
    ? [...new Set(raw.sessionIds.filter((value) => typeof value === "string" && value))]
    : [];
  return {
    id,
    label: stringOf(raw.label),
    summary: stringOf(raw.summary),
    sessionIds,
    firstSeenAt: stringOf(raw.firstSeenAt),
    lastSeenAt: stringOf(raw.lastSeenAt),
    segments,
    status: raw.status === "dormant" ? "dormant" : "active",
  };
}

/**
 * 读话题表。文件不存在、坏 JSON、顶层不是对象、topics 不是数组、单项字段不对，
 * 一律收敛：坏项丢掉，整张读不出来就给空表。绝不抛。
 */
export function readTopics(dataDir) {
  let text;
  try {
    text = fs.readFileSync(fileOf(dataDir), "utf8");
  } catch {
    return emptyTopics();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyTopics();
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.topics)) {
    return emptyTopics();
  }
  const topics = [];
  const seen = new Set();
  for (const item of parsed.topics) {
    const topic = sanitizeTopic(item);
    if (!topic || seen.has(topic.id)) continue;
    seen.add(topic.id);
    topics.push(topic);
  }
  return { version: 1, topics };
}

/** 写话题表：tmp + rename；失败返回 false，让调用方记一条 warn，不把写回打回去。 */
export function writeTopics(dataDir, table) {
  try {
    const dir = dataDir || ".";
    fs.mkdirSync(dir, { recursive: true });
    const file = fileOf(dir);
    const tmp = `${file}.${process.pid}.tmp`;
    const payload =
      table && typeof table === "object" && Array.isArray(table.topics)
        ? { version: 1, topics: table.topics }
        : emptyTopics();
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

// 每个 dataDir 一条 promise 链。前一条失败也要继续跑后一条，所以链头先 catch 掉。
const chains = new Map();

/**
 * 串行化的读-改-写。fn(table) 的返回值原样透出，返回后写盘；fn 抛错则不写。
 *
 * 第三参数是可选的写盘失败回调：writeTopics 按约定不抛，只能把失败交回调用方，
 * 由它用 sdk.logger 记一条 warn。
 */
export function withTopics(dataDir, fn, { onWriteError } = {}) {
  const key = String(dataDir || ".");
  const start = (chains.get(key) || Promise.resolve()).catch(() => {});
  const next = start.then(async () => {
    const table = readTopics(dataDir);
    const result = await fn(table);
    if (!writeTopics(dataDir, table)) {
      try {
        onWriteError?.("topics.json 写入失败，本轮话题表未落盘");
      } catch {
        /* 日志不能反过来打断写回 */
      }
    }
    return result;
  });
  chains.set(key, next);
  const cleanup = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

export function newTopicId() {
  return `t_${randomUUID()}`;
}

function timeOf(value) {
  const ms = Date.parse(stringOf(value));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * 候选池：只收 active；session 作用域再按 sessionIds 过滤。
 * 排序按 lastSeenAt 倒序，时间相同按表内顺序（旧在前），不靠 sort 的实现细节。
 */
export function candidatePool(table, { sessionId, scope, limit } = {}) {
  const topics = Array.isArray(table?.topics) ? table.topics : [];
  const wantSession = scope === "session";
  const out = [];
  for (let index = 0; index < topics.length; index += 1) {
    const topic = topics[index];
    if (!topic || topic.status !== "active") continue;
    if (wantSession && !topic.sessionIds.includes(sessionId)) continue;
    out.push({ topic, index, time: timeOf(topic.lastSeenAt) });
  }
  out.sort((a, b) => (b.time - a.time) || (a.index - b.index));
  const max = Number(limit);
  const sliced = Number.isFinite(max) && max >= 0 ? out.slice(0, Math.floor(max)) : out;
  return sliced.map((entry) => entry.topic);
}

/**
 * 记一段提交。认到已有话题就续写；其它情况（new / verdict 为空 / id 找不到）新建。
 *
 * dormant 的话题被认到时只更新计数与时间，状态保持原样：没有「自动唤醒」策略，
 * 不要在这里发明一个。
 */
export function recordSegment(table, { verdict, sessionId, at, label, summary } = {}) {
  if (!table || typeof table !== "object") return null;
  if (!Array.isArray(table.topics)) table.topics = [];
  table.version = 1;

  const when = typeof at === "string" ? at : "";
  const session = typeof sessionId === "string" ? sessionId : "";
  const existingId = verdict?.kind === "existing" ? verdict.id : "";
  const existing =
    existingId && table.topics.find((topic) => topic && topic.id === existingId);

  if (existing) {
    existing.segments = positiveInt(existing.segments) + 1;
    if (when) existing.lastSeenAt = when;
    if (session && !existing.sessionIds.includes(session)) {
      existing.sessionIds.push(session);
    }
    return { topic: existing, seq: existing.segments, isNew: false };
  }

  const topic = {
    id: newTopicId(),
    label: stringOf(label) || "新话题",
    summary: stringOf(summary),
    sessionIds: session ? [session] : [],
    firstSeenAt: when,
    lastSeenAt: when,
    segments: 1,
    status: "active",
  };
  table.topics.push(topic);
  return { topic, seq: 1, isNew: true };
}

/** 本会话涉及的话题（含 dormant），给会话卡数数用；不改表。 */
export function topicsForSession(table, sessionId) {
  const session = typeof sessionId === "string" ? sessionId : "";
  if (!session) return [];
  const topics = Array.isArray(table?.topics) ? table.topics : [];
  return topics.filter(
    (topic) =>
      topic &&
      Array.isArray(topic.sessionIds) &&
      topic.sessionIds.includes(session),
  );
}

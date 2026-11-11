// 存量补交：把历史会话里还没写进 OpenViking 的部分补上。
//
// 与实时写回同构：每段都走 capture.js 的 commitSegment（归类 → 落话题表 → 带三件套
// 标签 commit → 推进游标），补出来的数据与实时链路长在同一张话题表上，不是每段新开
// 一个话题。
//
// 两条纪律：
//   - 会话文件只流式读，不整份读进内存（78MB / 一万多条也不怕）。
//   - 幂等靠对账：同一段重跑，messages/batch 不发第二次，commit 也不发第二次。
//
// 所有网络都走 client.js / transportFor，不裸 fetch。

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "../ov/client.js";
import { resolvePeer } from "../ov/identity.js";
import { readConnection, readSwitches } from "../ov/settings.js";
import { transportFor } from "../ov/transport.js";
import { patchSession, readSession, sessionKeyOf } from "../state/session.js";
import { commitSegment } from "./capture.js";
import {
  countTurns,
  isCaptureMessage,
  messageTextOf,
  normalizeCursor,
} from "./cursor.js";

/** 一次补交最多跑多少段。计划阶段累计，到上限就停，剩下的下次再来。 */
export const BACKFILL_MAX_SEGMENTS = 200;

/** 段与段之间至少隔多久。给服务端留一口气，也让取消能在段边界收住。 */
export const BACKFILL_GAP_MS = 200;

/** 扫描结果缓存：同一个文件 30 秒内不重复扫。 */
const SCAN_TTL_MS = 30_000;
const SCAN_CACHE_MAX = 256;
const scanCache = new Map();

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

function loggerOf(ctx, deps) {
  return deps?.logger || ctx?.logger || ctx?.sdk?.logger || {};
}

function warnLine(logger, message) {
  try {
    logger?.warn?.(`openviking backfill: ${message}`);
  } catch {
    /* 日志不能反过来打断补交 */
  }
}

function errorText(error) {
  return String(error?.message || error || "unknown");
}

function nonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

/** 服务端字段可能是数字串或缺失：非有限数字一律当「不知道」。 */
function numberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function perSegmentOf(switches) {
  const value = Number(switches?.captureCommitTurns);
  return Number.isInteger(value) && value > 0 ? value : 12;
}

// ---- 流式读 ----
//
// 默认实现只有 createReadStream + readline：一行一行喂给回调，回调返回 false 就提前停。
// deps.openLines(file, onLine) 是测试接缝：假实现也只该逐行回调，不能先整份读进来。

async function forEachLine(file, onLine, deps = {}) {
  if (typeof deps.openLines === "function") {
    return deps.openLines(file, onLine);
  }
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if ((await onLine(line)) === false) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return undefined;
}

function parseRecord(line) {
  if (typeof line !== "string" || !line.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

/** 一条记录 → captureMessages() 的单条形状；不是可写消息就返回 null。 */
function captureMessageOf(record) {
  if (!isCaptureMessage(record)) return null;
  return {
    id: typeof record.id === "string" ? record.id : "",
    role: record.message.role,
    content: messageTextOf(record.message.content),
    timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
  };
}

async function statOf(file) {
  try {
    const stat = await fs.promises.stat(file);
    return { size: stat.size, mtimeMs: stat.mtimeMs, mtime: stat.mtime };
  } catch {
    return null;
  }
}

/**
 * 第一趟：只数数，不保留正文。
 *
 * messages 的口径与 cursor.js 的 isCaptureMessage 完全一致；turnsAt 是每个完整轮
 * 结束处的消息下标（end-exclusive），升序。末尾悬空的 user 不计轮、也不进 turnsAt。
 */
export async function scanSessionFile(file, deps = {}) {
  let messages = 0;
  let turns = 0;
  let openUser = false;
  let lastTimestamp = "";
  const turnsAt = [];

  await forEachLine(
    file,
    (line) => {
      const record = parseRecord(line);
      if (!record || !isCaptureMessage(record)) return;
      messages += 1;
      lastTimestamp = typeof record.timestamp === "string" ? record.timestamp : "";
      const role = record.message.role;
      if (role === "user") {
        openUser = true;
      } else if (role === "assistant" && openUser) {
        turns += 1;
        turnsAt.push(messages);
        openUser = false;
      }
    },
    deps,
  );

  const stat = await statOf(file);
  const lastActivityAt = lastTimestamp || (stat ? stat.mtime.toISOString() : "");
  return { messages, turns, turnsAt, lastActivityAt, size: stat?.size ?? 0 };
}

/**
 * 把 turnsAt 切成段：每段最多 perSegment 轮，只在完整轮边界切，最后不足也算一段。
 *
 * from 是「已经提交到的消息下标」，只取 end > from 的轮；第一段的 start = from。
 * 返回的 start / end 都是消息下标（end-exclusive），段与段首尾相接、不重不漏。
 */
export function planSegments(turnsAt, { from = 0, perSegment = 12 } = {}) {
  const limit = Number.isInteger(Number(perSegment)) && Number(perSegment) > 0
    ? Math.floor(Number(perSegment))
    : 12;
  const startFrom = nonNegativeInt(from);
  const ends = (Array.isArray(turnsAt) ? turnsAt : [])
    .filter((end) => Number.isInteger(end) && end > startFrom)
    .sort((a, b) => a - b);

  const plan = [];
  let start = startFrom;
  for (let index = 0; index < ends.length; index += limit) {
    const chunk = ends.slice(index, index + limit);
    const end = chunk[chunk.length - 1];
    plan.push({ start, end, turns: chunk.length });
    start = end;
  }
  return plan;
}

/**
 * 第二趟：按消息顺序取正文。onMessage({ index, message }) 返回 false 即提前停。
 * index 是「可写消息」的序号（0 起），与 captureMessages() 数组下标一致。
 */
export async function readSessionMessages(file, onMessage, deps = {}) {
  let index = 0;
  await forEachLine(
    file,
    (line) => {
      const record = parseRecord(line);
      if (!record) return;
      const message = captureMessageOf(record);
      if (!message) return;
      const keep = onMessage({ index, message });
      index += 1;
      if (keep === false) return false;
    },
    deps,
  );
  return index;
}

/** 取 [start, end) 这一段的正文；只保留这一段，段与段之间释放。 */
async function readMessageRange(file, start, end, deps = {}) {
  const out = [];
  if (end <= start) return out;
  await readSessionMessages(
    file,
    ({ index, message }) => {
      if (index >= end) return false;
      if (index >= start) out.push(message);
    },
    deps,
  );
  return out;
}

/** 对账基线：服务端是事实，但本地记过的东西不轻易推翻。 */
export function planBaseline({ cursor, server, totalMessages } = {}) {
  const local = normalizeCursor(cursor);
  if (!server || typeof server !== "object" || Array.isArray(server)) return local;

  const commitCount = numberOrNull(server.commit_count);
  const messageCount = numberOrNull(server.message_count);
  // 字段缺失：服务端没给出可用的坐标，本地游标原样用。
  if (commitCount === null || messageCount === null) return local;

  if (local.lastMessageCount > 0) {
    // 本地有游标：以本地为准，只认服务端已经交过更多这件事。
    return normalizeCursor({
      ...local,
      lastCommitCount: Math.max(local.lastCommitCount, nonNegativeInt(commitCount)),
    });
  }

  // 本地空、服务端有：用服务端的条数补齐，并把 commit 过的部分当成已提交，
  // 避免把整段历史再交一遍。
  const total = nonNegativeInt(totalMessages);
  const count = Math.min(nonNegativeInt(messageCount), total);
  const commits = nonNegativeInt(commitCount);
  return normalizeCursor({
    ...local,
    lastMessageCount: count,
    lastCommitCount: commits,
    lastCommitMessageCount: commits > 0 ? count : 0,
  });
}

// ---- 会话清单 ----

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** agents 根的形状：自己存在，且至少有一个 <agent>/sessions 子目录。 */
function usableAgentsRoot(root) {
  const dir = String(root ?? "").trim();
  if (!dir || !isDirectory(dir)) return "";
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (isDirectory(path.join(dir, entry.name, "sessions"))) return dir;
    }
  } catch {
    return "";
  }
  return "";
}

/** 状态文件里记过的 agentDir（最近的在前）；只用来找 agents 根。 */
function recordedAgentDirs(dataDir) {
  const dir = path.join(dataDir || ".", "sessions");
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const stat = fs.statSync(file);
      const state = readSession(dataDir, name.replace(/\.json$/i, ""));
      if (typeof state.agentDir === "string" && state.agentDir.trim()) {
        rows.push({ agentDir: state.agentDir.trim(), mtimeMs: stat.mtimeMs });
      }
    } catch {
      /* 坏文件跳过 */
    }
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return rows.map((row) => row.agentDir);
}

/**
 * 找 ~/.hanako/agents。顺序：deps.agentsRoot → 状态文件里 agentDir 的父目录 →
 * <dataDir>/../../agents。第一个「存在且含 agent/sessions 子目录」的胜出；都没有返回空串，不抛。
 */
export function agentsRootOf(dataDir, deps = {}) {
  const candidates = [];
  if (typeof deps.agentsRoot === "string" && deps.agentsRoot.trim()) {
    candidates.push(deps.agentsRoot.trim());
  }
  for (const agentDir of recordedAgentDirs(dataDir)) {
    candidates.push(path.dirname(agentDir));
  }
  candidates.push(path.resolve(dataDir || ".", "../..", "agents"));

  for (const candidate of candidates) {
    const usable = usableAgentsRoot(candidate);
    if (usable) return usable;
  }
  return "";
}

/** <agentsRoot>/<agent>/sessions/*.jsonl；只认 .jsonl 结尾，认不出 sessionId 的跳过。 */
function sessionFilesOf(root) {
  const out = [];
  if (!root) return out;
  let agents = [];
  try {
    agents = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const agent of agents) {
    if (!agent.isDirectory()) continue;
    const sessionsDir = path.join(root, agent.name, "sessions");
    let names = [];
    try {
      names = fs.readdirSync(sessionsDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.jsonl$/i.test(name)) continue;
      const sessionId = sessionKeyOf(name);
      if (!sessionId) continue;
      out.push({ file: path.join(sessionsDir, name), sessionId });
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return out;
}

function nowMsOf(deps = {}) {
  try {
    const value =
      typeof deps.nowMs === "function"
        ? deps.nowMs()
        : typeof deps.now === "function"
          ? deps.now()
          : Date.now();
    const ms = Number(value);
    return Number.isFinite(ms) ? ms : Date.now();
  } catch {
    return Date.now();
  }
}

/** 带 30 秒缓存的扫描：文件大小 / mtime 变了才重扫。 */
async function scanCached(file, deps = {}) {
  const stat = await statOf(file);
  if (!stat) return null;
  const at = nowMsOf(deps);
  const cached = scanCache.get(file);
  if (
    cached &&
    cached.size === stat.size &&
    cached.mtimeMs === stat.mtimeMs &&
    at - cached.at < SCAN_TTL_MS
  ) {
    return cached.value;
  }
  const scan = typeof deps.scanSessionFile === "function" ? deps.scanSessionFile : scanSessionFile;
  const value = await scan(file, deps);
  if (scanCache.size >= SCAN_CACHE_MAX) {
    const oldest = scanCache.keys().next().value;
    if (oldest !== undefined) scanCache.delete(oldest);
  }
  scanCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, at, value });
  return value;
}

/** 清空扫描缓存（测试用；正常路径不需要）。 */
export function resetBackfillScanCache() {
  scanCache.clear();
}

/**
 * 列出「还欠着记忆」的会话。
 *
 * written 来自状态文件里的 capture.cursor.lastMessageCount；pendingTurns 是从它之后
 * 的完整轮数；pendingSegments 按 captureCommitTurns 折算。只列 messages > 0 的会话。
 */
export async function listBackfillSessions(ctx, deps = {}) {
  const dataDir = dataDirOf(ctx);
  const switches = await readSwitches(ctx);
  const perSegment = perSegmentOf(switches);
  const root = agentsRootOf(dataDir, deps);
  if (!root) return [];

  const rows = [];
  for (const { file, sessionId } of sessionFilesOf(root)) {
    const scan = await scanCached(file, deps);
    if (!scan || !(scan.messages > 0)) continue;
    const written = normalizeCursor(readSession(dataDir, sessionId).capture?.cursor).lastMessageCount;
    const pendingTurns = (Array.isArray(scan.turnsAt) ? scan.turnsAt : []).filter(
      (end) => end > written,
    ).length;
    rows.push({
      sessionId,
      messages: scan.messages,
      written,
      pendingTurns,
      pendingSegments: Math.ceil(pendingTurns / perSegment),
      lastActivityAt: scan.lastActivityAt,
    });
  }

  rows.sort((a, b) => {
    const left = Date.parse(a.lastActivityAt) || 0;
    const right = Date.parse(b.lastActivityAt) || 0;
    if (left !== right) return right - left;
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  });
  return rows;
}

// ---- 补交状态机 ----

function clockOf(deps = {}) {
  return typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString();
}

function sleepOf(deps = {}) {
  return typeof deps.sleep === "function"
    ? deps.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

/** turnsAt 里 end <= at 的个数（turnsAt 升序）。 */
function turnsBefore(turnsAt, at) {
  const list = Array.isArray(turnsAt) ? turnsAt : [];
  let count = 0;
  for (const end of list) {
    if (end <= at) count += 1;
    else break;
  }
  return count;
}

/** 「之前」的起点：seg.start 之前最近 contextTurns 个完整轮的起点。 */
function contextStartFor(turnsAt, start, contextTurns) {
  const list = (Array.isArray(turnsAt) ? turnsAt : []).filter((end) => end <= start);
  const want = Number.isInteger(Number(contextTurns)) && Number(contextTurns) > 0
    ? Math.floor(Number(contextTurns))
    : 3;
  return list.length > want ? list[list.length - 1 - want] : 0;
}

/**
 * 补交控制器：一个 App 一个，所有请求共用（单任务）。
 *
 * start 立刻返回，实际跑法在后台；进度只有六个字段，一个不多。
 */
export function createBackfillController(ctx, deps = {}) {
  const dataDir = dataDirOf(ctx);
  const logger = loggerOf(ctx, deps);
  const sleep = sleepOf(deps);
  const clock = () => clockOf(deps);

  const status = {
    running: false,
    sessionId: null,
    done: 0,
    total: 0,
    currentLabel: "",
    error: null,
  };
  let cancelled = false;
  let runPromise = null;

  /**
   * 计划阶段用的会话清单：扫元数据，并（能连上时）读一次服务端坐标。
   *
   * 读服务端是为了让 start 的 total 与真正要跑的段数一致：本地状态空、服务端已有
   * message_count / commit_count 时，基线会把起点推到服务端已有消息之后，
   * 只看本地游标会多算段。GET 失败就退回本地口径，实际跑的时候再按段对账。
   */
  async function plannedEntries({ scope, sessionId, client }) {
    const root = agentsRootOf(dataDir, deps);
    if (!root) return { entries: [], missingSession: false };
    const files = sessionFilesOf(root);
    let chosen = files;
    if (scope === "session") {
      const key = sessionKeyOf(String(sessionId ?? ""));
      const target = key ? files.find((entry) => entry.sessionId === key) : null;
      if (!target) return { entries: [], missingSession: true };
      chosen = [target];
    }

    const switches = await readSwitches(ctx);
    const perSegment = perSegmentOf(switches);
    const entries = [];
    for (const entry of chosen) {
      const scan = await scanCached(entry.file, deps);
      if (!scan || !(scan.messages > 0)) continue;
      const cursor = normalizeCursor(
        readSession(dataDir, entry.sessionId).capture?.cursor,
      );
      const localPending = (Array.isArray(scan.turnsAt) ? scan.turnsAt : []).filter(
        (end) => end > cursor.lastMessageCount,
      ).length;
      if (!localPending) continue;

      // 只有本地游标为空时基线才会改排段起点；本地已有游标时基线只抬
      // commit_count，不改变 lastCommitMessageCount，不必为算 total 去联网。
      let server = null;
      if (client && cursor.lastMessageCount === 0) {
        try {
          server = await client.getSession(entry.sessionId);
        } catch {
          // 404 / 读不到都按「服务端没有可用坐标」处理，不挡 start。
          server = null;
        }
      }
      const baseline = planBaseline({
        cursor,
        server,
        totalMessages: scan.messages,
      });
      const pendingSegments = planSegments(scan.turnsAt, {
        from: baseline.lastCommitMessageCount,
        perSegment,
      }).length;
      if (pendingSegments > 0) entries.push({ ...entry, pendingSegments });
    }
    return { entries, missingSession: false };
  }

  async function runSegment({ entry, segment, scan, switches, conn, client, judge }) {
    let cursor = normalizeCursor(readSession(dataDir, entry.sessionId).capture?.cursor);

    // 每段开始再对一次账（顺序不能换）。
    let live = null;
    try {
      live = await client.getSession(entry.sessionId);
    } catch (error) {
      if (error?.status !== 404) throw error;
      live = null;
    }
    const commitCount = numberOrNull(live?.commit_count);
    const messageCount = numberOrNull(live?.message_count);

    // 1. 上一段的提交其实成功了，只是本地没落：只补游标，不重复提交。
    if (live && commitCount !== null && commitCount > cursor.lastCommitCount) {
      const next = normalizeCursor({
        ...cursor,
        lastCommitCount: commitCount,
        lastCommitMessageCount: segment.start,
      });
      patchSession(dataDir, entry.sessionId, {
        capture: { cursor: next, lastAt: clock() },
      });
      return;
    }

    // 2 / 3. 服务端少了消息就地起写；否则只写它还缺的那一段。
    const writeFrom = messageCount !== null ? Math.max(0, Math.floor(messageCount)) : segment.start;
    const contextStart = contextStartFor(
      scan.turnsAt,
      segment.start,
      switches.captureContextTurns,
    );
    const windowStart = Math.max(
      0,
      Math.min(contextStart, cursor.lastCommitMessageCount, writeFrom, segment.start),
    );
    const window = await readMessageRange(entry.file, windowStart, segment.end, deps);
    const effectiveEnd = windowStart + window.length;
    if (effectiveEnd < segment.end) {
      throw new Error("会话文件比计划时短了，这一段先不提交");
    }
    const lastId = window.length ? window[window.length - 1].id : cursor.lastEntryId;

    // 只发服务端还缺的那些；已经写过的消息不再写。
    const peer = resolvePeer(conn, entry.file);
    const batch = [];
    for (let index = writeFrom; index < effectiveEnd; index += 1) {
      const message = window[index - windowStart];
      if (!message) continue;
      batch.push({
        role: message.role,
        content: message.content,
        created_at: message.timestamp,
        ...(peer ? { peer_id: peer } : {}),
      });
    }
    if (batch.length) {
      try {
        await client.addMessages(entry.sessionId, batch);
      } catch (error) {
        // 写入失败：游标一步都不动，下次重试这一段。
        warnLine(logger, `write messages failed: ${errorText(error)}`);
        status.error = errorText(error);
        return;
      }
    }

    // commitSegment 用「相对于本次窗口」的游标：messages 数组只装这一段 + 上下文。
    const relativeCursor = normalizeCursor({
      ...cursor,
      lastEntryId: lastId,
      lastMessageCount: effectiveEnd - windowStart,
      lastCommitMessageCount: Math.max(0, cursor.lastCommitMessageCount - windowStart),
    });

    try {
      const out = await commitSegment({
        sdk: ctx?.sdk ?? ctx,
        client,
        dataDir,
        sessionId: entry.sessionId,
        messages: window,
        cursor: relativeCursor,
        switches,
        judge,
        nowIso: clock(),
        onWarn: (message) => warnLine(logger, message),
      });
      const committed = normalizeCursor({
        ...out.cursor,
        lastMessageCount: out.cursor.lastMessageCount + windowStart,
        lastCommitMessageCount: out.cursor.lastCommitMessageCount + windowStart,
      });
      patchSession(dataDir, entry.sessionId, {
        capture: {
          cursor: committed,
          turns: turnsBefore(scan.turnsAt, effectiveEnd),
          lastAt: clock(),
          topicId: out.topic.id,
        },
      });
    } catch (error) {
      warnLine(logger, `commit failed: ${errorText(error)}`);
      status.error = errorText(error);
      // 提交失败：消息已经在服务端，只把 lastMessageCount 推到段尾；
      // lastCommitMessageCount 不动，下一段成功提交时会把这段一起带上。
      const next = normalizeCursor({
        ...cursor,
        lastEntryId: lastId,
        lastMessageCount: effectiveEnd,
        pendingTurns: countTurns(
          window.slice(Math.max(0, cursor.lastCommitMessageCount - windowStart)),
        ),
      });
      patchSession(dataDir, entry.sessionId, {
        capture: {
          cursor: next,
          turns: turnsBefore(scan.turnsAt, effectiveEnd),
          lastAt: clock(),
        },
      });
    }
  }

  async function runSession({ entry, switches, conn, client, judge }) {
    status.sessionId = entry.sessionId;
    const scan = await scanCached(entry.file, deps);
    if (!scan || scan.messages === 0) return;

    // GET 会话：404 就建。服务端没有就是全新会话，基线按本地游标。
    let server = null;
    try {
      server = await client.getSession(entry.sessionId);
    } catch (error) {
      if (error?.status !== 404) throw error;
      server = null;
    }
    if (server === null) {
      await client.createSession({ sessionId: entry.sessionId });
    }

    const storedCursor = normalizeCursor(
      readSession(dataDir, entry.sessionId).capture?.cursor,
    );
    const baseline = planBaseline({
      cursor: storedCursor,
      server,
      totalMessages: scan.messages,
    });
    // 本地状态空、服务端已有坐标时，基线必须先落盘：否则第一段进 runSegment
    // 会命中段内对账第 1 条，把「服务端已经交过」误当成上一段，整段被跳过。
    // 本地已有游标时不在这里落盘：那条基线只抬 commit_count，要让段内对账看见
    // 旧值才能认出「回执丢了」，提前落盘反而会变成重复提交。
    if (
      storedCursor.lastMessageCount === 0 &&
      JSON.stringify(baseline) !== JSON.stringify(storedCursor)
    ) {
      patchSession(dataDir, entry.sessionId, { capture: { cursor: baseline } });
    }
    let plan = planSegments(scan.turnsAt, {
      from: baseline.lastCommitMessageCount,
      perSegment: perSegmentOf(switches),
    });
    // 本轮的名额（全量时可能被 200 段上限截断过）。
    if (entry.planCount && plan.length > entry.planCount) plan = plan.slice(0, entry.planCount);

    for (let index = 0; index < plan.length; index += 1) {
      if (cancelled) return;
      const segment = plan[index];
      status.currentLabel = `${entry.sessionId.slice(0, 8)} · 第 ${index + 1}/${plan.length} 段`;
      try {
        await runSegment({ entry, segment, scan, switches, conn, client, judge });
      } catch (error) {
        // 段与段之间互不拖累：这一段落了，下一段接着来。
        warnLine(logger, `session ${entry.sessionId.slice(0, 8)} failed: ${errorText(error)}`);
        status.error = errorText(error);
      }
      status.done += 1;
      if (cancelled) return;
      await sleep(BACKFILL_GAP_MS);
    }
  }

  async function run(entries) {
    try {
      const switches = await readSwitches(ctx);
      const conn = await readConnection(ctx);
      const transport = transportFor(ctx);
      if (transport.mode === "down") throw new Error("出站通道不可用");
      const client = createClient({ ...conn, ...transport });
      // 与实时链路同一口径：判断器恒取 captureEarlyJudge，不因为提前提交关着就退化成
      // "fixed"（那会让 buildClassifier 恒回 null，补出来的每段都新开一个话题）。
      const judge = switches.captureEarlyJudge;

      for (const entry of entries) {
        if (cancelled) break;
        try {
          await runSession({ entry, switches, conn, client, judge });
        } catch (error) {
          // 一个会话整段失败不挡后面的会话；错误只记最后一条。
          warnLine(logger, `session ${entry.sessionId.slice(0, 8)} failed: ${errorText(error)}`);
          status.error = errorText(error);
        }
      }
    } catch (error) {
      if (!cancelled) {
        status.error = errorText(error);
        warnLine(logger, errorText(error));
      }
    } finally {
      status.running = false;
      runPromise = null;
    }
  }

  async function start({ scope = "all", sessionId = "" } = {}) {
    // 同步标记挡住并发：这一行之前没有任何 await，两个请求不会同时见到 running=false。
    if (status.running) return { ok: false, error: "已有补交在进行" };
    status.running = true;
    status.done = 0;
    status.total = 0;
    status.currentLabel = "";
    status.error = null;
    status.sessionId = null;
    cancelled = false;

    try {
      const switches = await readSwitches(ctx);
      if (switches.enabled !== true) throw new Error("总开关关着");

      const conn = await readConnection(ctx);
      if (!conn.serverUrl || !conn.apiKey) throw new Error("没有连接");

      const transport = transportFor(ctx);
      if (transport.mode === "down") throw new Error("出站通道不可用");

      if (scope !== "all" && scope !== "session") throw new Error("scope 只能是 session / all");

      // total 要按服务端已有坐标投影；这里只读，不建会话、不写消息。
      const planningClient = createClient({ ...conn, ...transport });
      const { entries, missingSession } = await plannedEntries({
        scope,
        sessionId,
        client: planningClient,
      });
      if (missingSession) throw new Error("找不到这个会话");

      // 200 段上限：计划阶段累计，到上限就停；被截断时记一条 warn。
      let remaining = BACKFILL_MAX_SEGMENTS;
      let allSegments = 0;
      const planned = [];
      for (const entry of entries) {
        allSegments += entry.pendingSegments;
        if (remaining <= 0) continue;
        const take = Math.min(remaining, entry.pendingSegments);
        if (take <= 0) continue;
        planned.push({ ...entry, planCount: take });
        remaining -= take;
      }
      const total = planned.reduce((sum, entry) => sum + entry.planCount, 0);
      if (allSegments > BACKFILL_MAX_SEGMENTS) {
        warnLine(logger, `还有 ${allSegments - BACKFILL_MAX_SEGMENTS} 段没补，下次再来`);
      }
      if (total === 0) throw new Error("没有要补的段");

      status.total = total;
      runPromise = run(planned);
      return { ok: true, total, sessions: planned.length };
    } catch (error) {
      status.running = false;
      status.error = errorText(error);
      return { ok: false, error: errorText(error) };
    }
  }

  return {
    start,
    cancel() {
      cancelled = true;
      return { ok: true };
    },
    status() {
      return {
        running: status.running,
        sessionId: status.sessionId,
        done: status.done,
        total: status.total,
        currentLabel: status.currentLabel,
        error: status.error,
      };
    },
    /** 测试接缝：等后台这一轮落定。生产路径不调用。 */
    whenIdle() {
      return runPromise || Promise.resolve();
    },
  };
}

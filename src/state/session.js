// 会话级状态：每个会话一份，存它自己的覆盖值与进度。
//
// 为什么必须按会话存：记忆讲的是"这段对话里发生了什么"。开关、召回次数、写回游标
// 都属于这一段的上下文。把会话级的开关写进全局配置，等于在一个房间关灯、整栋楼都黑。
//
// 存储形态：<dataDir>/sessions/<safeId>.json，一会话一文件。
// 单文件 Map 省事，但并发写会把别人的记录冲掉；一文件一写入，坏也坏一个。

import fs from "node:fs";
import path from "node:path";

const MAX_AGE_DAYS = 30;

/** 允许被会话覆盖的键。总闸不在里面——关整台机器是全局决定，不该由某段对话代劳。 */
export const OVERRIDE_KEYS = Object.freeze([
  "autoRecall",
  "autoCapture",
  "readOnly",
  "skillRouting",
  "probe",
  "recallPeerScope",
]);

const BOOLEAN_KEYS = new Set(["autoRecall", "autoCapture", "readOnly", "skillRouting", "probe"]);

function dirOf(dataDir) {
  return path.join(dataDir || ".", "sessions");
}

function safeName(sessionId) {
  return String(sessionId || "unknown").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
}

function fileOf(dataDir, sessionId) {
  return path.join(dirOf(dataDir), `${safeName(sessionId)}.json`);
}

function emptyState(sessionId) {
  return {
    sessionId: String(sessionId || ""),
    createdAt: null,
    updatedAt: null,
    closedAt: null,
    closeReason: null,
    overrides: {},
    recall: { turns: 0, injectedTokens: 0, lastAt: null },
    capture: { turns: 0, cursor: null, lastAt: null },
  };
}

export function readSession(dataDir, sessionId) {
  if (!sessionId) return emptyState(sessionId);
  try {
    const raw = fs.readFileSync(fileOf(dataDir, sessionId), "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...emptyState(sessionId),
      ...parsed,
      overrides: { ...(parsed.overrides || {}) },
      recall: { ...emptyState().recall, ...(parsed.recall || {}) },
      capture: { ...emptyState().capture, ...(parsed.capture || {}) },
    };
  } catch {
    return emptyState(sessionId);
  }
}

function writeSession(dataDir, sessionId, state) {
  const dir = dirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = fileOf(dataDir, sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return state;
}

function sanitizeOverride(key, value) {
  if (!OVERRIDE_KEYS.includes(key)) return undefined;
  if (BOOLEAN_KEYS.has(key)) return typeof value === "boolean" ? value : undefined;
  if (key === "recallPeerScope") {
    return value === "all" || value === "self" ? value : undefined;
  }
  return undefined;
}

/**
 * 改一个会话的状态。patch.overrides 里值为 null 表示"撤销覆盖，回到全局"。
 * 其余字段（recall/capture）是累加与游标，由链路自己写。
 */
export function patchSession(dataDir, sessionId, patch = {}) {
  const state = readSession(dataDir, sessionId);

  if (patch.overrides && typeof patch.overrides === "object") {
    for (const [key, value] of Object.entries(patch.overrides)) {
      if (value === null) {
        delete state.overrides[key];
        continue;
      }
      const sanitized = sanitizeOverride(key, value);
      if (sanitized !== undefined) state.overrides[key] = sanitized;
    }
  }

  if (patch.recall && typeof patch.recall === "object") {
    state.recall = { ...state.recall, ...patch.recall };
  }
  if (patch.capture && typeof patch.capture === "object") {
    state.capture = { ...state.capture, ...patch.capture };
  }

  state.updatedAt = new Date().toISOString();
  return writeSession(dataDir, sessionId, state);
}

/** 会话开始：确保有一份状态文件。重开同一个会话时清掉关闭标记。 */
export function touchSession(dataDir, sessionId) {
  if (!sessionId) return null;
  const state = readSession(dataDir, sessionId);
  const now = new Date().toISOString();
  state.createdAt = state.createdAt || now;
  state.updatedAt = now;
  state.closedAt = null;
  state.closeReason = null;
  return writeSession(dataDir, sessionId, state);
}

/** 会话关闭：只打标记，不删文件。会话可能被重开，删了会把覆盖值一起弄丢。 */
export function markClosed(dataDir, sessionId, reason) {
  if (!sessionId) return null;
  const state = readSession(dataDir, sessionId);
  const now = new Date().toISOString();
  state.closedAt = now;
  state.closeReason = reason || null;
  state.updatedAt = now;
  return writeSession(dataDir, sessionId, state);
}

/** 全局值 + 会话覆盖 = 这一轮真正生效的值。 */
export function effective(base, session) {
  const overrides = session?.overrides || {};
  const result = { ...base };
  for (const key of OVERRIDE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) result[key] = overrides[key];
  }
  return result;
}

/** 列出所有会话状态文件的摘要，给整页用。顺带清掉过期的。 */
export function listSessions(dataDir, { maxAgeDays = MAX_AGE_DAYS } = {}) {
  const dir = dirOf(dataDir);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const cutoff = Date.now() - maxAgeDays * 86400000;
  const rows = [];

  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const stat = fs.statSync(file);
      const state = JSON.parse(fs.readFileSync(file, "utf8"));

      // 过期锚点：关过的看关闭时间，没关过的看最后写入。
      // 一个会话如果开了一整个月没关，mtime 一直新，它就不会被误删。
      const closed = state.closedAt ? Date.parse(state.closedAt) : NaN;
      const anchor = Number.isFinite(closed) ? closed : stat.mtimeMs;
      if (anchor < cutoff) {
        fs.rmSync(file, { force: true });
        continue;
      }

      rows.push({
        sessionId: state.sessionId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        closedAt: state.closedAt,
        overrides: state.overrides || {},
        recall: state.recall || {},
        capture: state.capture || {},
        mtime: stat.mtimeMs,
      });
    } catch {
      /* 坏文件跳过，不影响列表 */
    }
  }

  return rows.sort((a, b) => b.mtime - a.mtime);
}

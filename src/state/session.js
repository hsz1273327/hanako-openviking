// 会话级状态：每个会话一份，存它自己的覆盖值与进度。
//
// 为什么必须按会话存：记忆讲的是"这段对话里发生了什么"。开关、召回次数、写回游标
// 都属于这一段的上下文。把会话级的开关写进全局配置，等于在一个房间关灯、整栋楼都黑。
//
// 存储形态：<dataDir>/sessions/<sessionKey>.json，一会话一文件。
// 单文件 Map 省事，但并发写会把别人的记录冲掉；一文件一写入，坏也坏一个。
//
// sessionKey 的规则见下方的 sessionKeyOf：路由必须先过它，认不出来的 key 不落盘。

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

// key 的形状：宿主会话文件里的 uuid 是小写，所以正则不带 i 标志。
// 形状不对的一律当“认不出来”：readSession 会给任何字符串回一份空状态，而写路径
// 会直接建文件——不挡住 ../etc/passwd、foo 这类输入，sessions 目录就成了垃圾桶。
const KEY_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}/;

/** 文件名里最后一个 `_` 之后的段落；没有 `_` 时就是整个名字。 */
function stripStamp(name) {
  return name.slice(name.lastIndexOf("_") + 1);
}

/**
 * 会话 key：把"宿主给的会话定位器"收敛成"状态文件的文件名"。
 *
 * 三种输入：
 *   <会话路径>.jsonl  取 basename、去扩展名、去创建时间前缀 → 01a1585b-86d2-...
 *   已经是一个 key    原样返回（仍要过 uuid 形状检查）
 *   sess_… 稳定 id    映射不到任何文件 → ""
 *   其它字符串        形状不对 → ""，不造文件
 *
 * 为什么要有这道门：宿主的会话文件名是 <时间戳>_<uuid>.jsonl，hook 里的
 * session.sessionId 就是那个 uuid，状态文件也按 uuid 命名；而前端
 * hana.sessions.getActive().sessionId 给的是 sess_… 这种稳定 id。两者不是一回事。
 * 不在这里收口，sess_… 会被当成新会话名，为每段对话造出一份永远不会被读到的状态文件。
 */
export function sessionKeyOf(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // 两个方向的分隔符都认（宿主的会话路径在 Windows 上是反斜杠）。
  // 已经是一个 key 时，这一行只是把它原样带回来。
  const base = trimmed.split(/[/\\]/).filter(Boolean).pop() || "";
  const name = base.replace(/\.jsonl$/i, "").replace(/\.json$/i, "");
  if (!name || name === "." || name === "..") return "";
  if (name.startsWith("sess_")) return "";
  // 文件名前缀是会话创建时间（2026-10-20T08-09-15-730Z_，也可能带 +08-00 之类
  // 的时区形态）；key 不带它，hook 的 sessionId 也不带。按“最后一个 _ 之后”剥，
  // 不去猜时间戳长什么样：宿主换一种写法，这里也不会静默分叉。
  const key = stripStamp(name);
  if (!key || key.startsWith("sess_")) return "";
  if (!KEY_SHAPE.test(key)) return "";
  return key;
}

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
 *
 * agentDir 只补不改新：用于给早于本功能建立的会话回填身份，
 * 刻意不碰 closedAt / closeReason——补一条旧数据不该把已关闭的会话重新打开。
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

  // 只认非空字符串：空 agentDir 等于"没解析出来"，不该覆盖掉已有的身份。
  if (typeof patch.agentDir === "string") {
    const dir = patch.agentDir.trim();
    if (dir) state.agentDir = dir;
  }

  state.updatedAt = new Date().toISOString();
  return writeSession(dataDir, sessionId, state);
}

/** 会话开始：确保有一份状态文件。重开同一个会话时清掉关闭标记。 */
export function touchSession(dataDir, sessionId, agentDir) {
  if (!sessionId) return null;
  const state = readSession(dataDir, sessionId);
  const now = new Date().toISOString();
  state.createdAt = state.createdAt || now;
  state.updatedAt = now;
  state.closedAt = null;
  state.closeReason = null;
  // 会话归哪个助手管，记在状态里：面板和小卡拿不到会话对象，
  // 但必须能说出“这一段属于哪个 peer”。
  const dir = String(agentDir || "").trim();
  if (dir) state.agentDir = dir;
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

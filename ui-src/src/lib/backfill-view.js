// 存量补交的视图投影：会话表、进度行、确认文案全部是纯计算。
//
// 不 import vue，也不碰网络：组件只排版，定时器与请求留给 composables/useBackfill.js。
// 200 这个上限与后端 src/memory/backfill.js 的 BACKFILL_MAX_SEGMENTS 同值，
// 面板加载不了 Node 模块，只能各存一份，冒烟会断言两边相等。

import { relativeTime } from "./relative-time.js";

/** 与后端 src/memory/backfill.js 的 BACKFILL_MAX_SEGMENTS 同值。 */
export const BACKFILL_MAX_SEGMENTS = 200;

/** 每段按多久估：只用于确认框里那句「约 N 分钟」，不参与任何调度。 */
const SECONDS_PER_SEGMENT = 1.5;

const SESSION_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}/i;

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

/** 会话 key 的前 8 位；形状不对给空串。 */
export function sessionShortId(sessionId) {
  const text = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!SESSION_KEY_RE.test(text)) return "";
  return text.slice(0, 8);
}

/** 侧边栏那一行：还欠几段。null / undefined → "—"，0 → "已补完"。 */
export function pendingBackfillText(n) {
  if (n === null || n === undefined) return "—";
  const value = nonNegativeInt(n);
  return value > 0 ? `欠 ${value} 段` : "已补完";
}

/**
 * 会话表的一行。
 *
 * opts.running 是整台机器只有一个补交任务；busy 表示正在跑的就是这一行。
 * cancelDisabled 只看有没有任务在跑，不看是哪一行。
 */
export function backfillRowView(row, nowMs, opts = {}) {
  const source = row && typeof row === "object" ? row : {};
  const sessionId = typeof source.sessionId === "string" ? source.sessionId : "";
  const running = opts.running === true;
  const title = typeof source.title === "string" ? source.title.trim() : "";
  return {
    sessionId,
    shortId: sessionShortId(sessionId),
    // 悬停短码：完整 UUID 一行、完整文件路径一行，方便直接搜日志。
    idTitle: [sessionId, typeof source.file === "string" ? source.file : ""]
      .filter(Boolean)
      .join("\n"),
    titleText: title || "（无标题会话）",
    titleFull: title,
    agentText: typeof source.agent === "string" ? source.agent : "",
    messagesText: String(nonNegativeInt(source.messages)),
    writtenText: String(nonNegativeInt(source.written)),
    pendingText: `${nonNegativeInt(source.pendingSegments)} 段`,
    seenText: relativeTime(source.lastActivityAt, nowMs),
    busy: running && sessionId !== "" && opts.currentSessionId === sessionId,
    cancelDisabled: !running,
  };
}

/** 表尾的合计："3 个会话、共 128 段"。 */
export function backfillTotalsText(totals) {
  const source = totals && typeof totals === "object" ? totals : {};
  return `${nonNegativeInt(source.sessions)} 个会话、共 ${nonNegativeInt(source.segments)} 段`;
}

/** 每段 1.5 秒估时；不足 1 分钟就说「不到 1 分钟」。 */
export function backfillEtaText(segments) {
  const seconds = nonNegativeInt(segments) * SECONDS_PER_SEGMENT;
  if (seconds < 60) return "不到 1 分钟";
  return `约 ${Math.round(seconds / 60)} 分钟`;
}

/**
 * 「补交全部」的二次确认文案（逐字，冒烟整段比对）。
 *
 * max 默认 200；sessions / segments 取整。两句话之间用 \n，不用破折号堆叠。
 */
export function backfillAllConfirm({ sessions, segments, max } = {}) {
  const sessionCount = nonNegativeInt(sessions);
  const segmentCount = nonNegativeInt(segments);
  const limit = max === undefined || max === null ? BACKFILL_MAX_SEGMENTS : nonNegativeInt(max);
  const eta = backfillEtaText(segmentCount);
  return [
    `补交全部：共 ${sessionCount} 个会话、${segmentCount} 段，${eta}。`,
    "补交会把这些历史对话写进 OpenViking 并抽取记忆，写出去的记忆不会自动撤销；",
    `单次最多 ${limit} 段，超出部分要再点一次。`,
  ].join("\n");
}

/**
 * 表头上方那行进度。
 *
 * 四个分支：正在跑 → 当前段；没跑但上次出错 → 错误；没跑但跑过 → 完成数；其余空串。
 * 空串时组件不渲染这一行（不占位）。
 */
export function backfillProgressText(status) {
  const source = status && typeof status === "object" ? status : {};
  const done = nonNegativeInt(source.done);
  const total = nonNegativeInt(source.total);
  if (source.running === true) {
    const label = typeof source.currentLabel === "string" ? source.currentLabel : "";
    return `补交中 · ${label}（${done}/${total} 段）`;
  }
  const error = typeof source.error === "string" ? source.error.trim() : "";
  if (error) return `上次补交出错：${error}`;
  if (done > 0) return `上次补交完成 ${done}/${total} 段`;
  return "";
}

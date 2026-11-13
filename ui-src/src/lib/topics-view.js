// 话题列表的视图投影：一张本地表 + 一个搜索框，全部是纯计算。
//
// 不 import vue，也不碰网络：组件只排版，删 / 改走的网络留给 composable。
// label 的字符口径与后端 routes/topics.js 的 TOPIC_LABEL_MAX 同值（60），
// 面板加载不了 Node 模块，只能各存一份，冒烟会断言两边相等。

import { relativeTime } from "./relative-time.js";

/** 与后端 routes/topics.js 的 TOPIC_LABEL_MAX 同值（按码点算）。 */
export const TOPIC_LABEL_MAX = 60;

/** 简述最多显示多少个字；超过就截断并加 …。 */
export const TOPIC_SUMMARY_MAX = 80;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOPIC_ID_RE = /^t_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** 压成一行：换行 / 连续空白都收成一个空格，去掉首尾。 */
function oneLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max) {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return `${chars.slice(0, max).join("")}…`;
}

/** t_<uuid> 或裸 uuid → uuid 前 8 位；形状不对给空串。 */
export function shortTopicId(id) {
  const text = typeof id === "string" ? id.trim() : "";
  if (!text) return "";
  const uuid = TOPIC_ID_RE.test(text) ? text.slice(2) : text;
  if (!UUID_RE.test(uuid)) return "";
  return uuid.slice(0, 8);
}

/**
 * 一行的显示值。字段名固定（冒烟按它断言），组件不再自己拼字符串。
 *
 * segments 非数字 / 负数按 0；sessionIds 不是数组也按 0 个会话。
 * 状态只认 dormant，其余一律活跃。
 */
export function topicRowView(topic, nowMs) {
  const row = topic && typeof topic === "object" ? topic : {};
  const id = typeof row.id === "string" ? row.id : "";
  const label = oneLine(row.label);
  const dormant = row.status === "dormant";
  const sessions = Array.isArray(row.sessionIds) ? row.sessionIds.length : 0;
  const anchors = (Array.isArray(row.anchors) ? row.anchors : [])
    .filter((item) => typeof item === "string" && item)
    .slice(0, 8);
  return {
    id,
    shortId: shortTopicId(id),
    label: label || "未命名",
    summary: truncate(oneLine(row.summary), TOPIC_SUMMARY_MAX),
    segmentsText: `${nonNegativeInt(row.segments)} 段`,
    seenText: relativeTime(row.lastSeenAt, nowMs),
    sessionsText: `${sessions} 个会话`,
    anchors,
    anchorsText: anchors.slice(0, 3).join("、"),
    anchorsTitle: anchors.join("、"),
    statusText: dormant ? "沉睡" : "活跃",
    dormant,
    labelEditable: true,
  };
}

/** 按 label 与 summary 做不区分大小写的子串过滤；query 空 → 原样返回。 */
export function filterTopics(topics, query) {
  const list = Array.isArray(topics) ? topics : [];
  const needle = oneLine(query).toLowerCase();
  if (!needle) return list;
  return list.filter((topic) => {
    const label = oneLine(topic?.label).toLowerCase();
    const summary = oneLine(topic?.summary).toLowerCase();
    return label.includes(needle) || summary.includes(needle);
  });
}

/** trim；空 / 超长 → ""（非法）；合法返回 trim 后的串。 */
export function normalizeTopicLabel(text) {
  if (typeof text !== "string") return "";
  const value = text.trim();
  const length = Array.from(value).length;
  if (length < 1 || length > TOPIC_LABEL_MAX) return "";
  return value;
}

/** 头部右侧的计数："共 N 个"。 */
export function topicsCountText(n) {
  return `共 ${nonNegativeInt(n)} 个`;
}

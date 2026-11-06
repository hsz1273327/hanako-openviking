// 召回分层：按记忆类型加权、只让过程记录随时间衰减。
//
// 为什么分两层（类型 + 时间），而不是只留一道分数门槛：
// 共享库里数量最多的是过程记录（memories/events、memories/trajectories，每轮对话都可能产一条），
// 真正有用的长期事实（memories/entities：机器型号、NAS 地址、内存、上面存了什么数据）反而少。
// 只用相似度挑，过程记录会凭数量把事实挤出去；一刀切排除过程记录，又会把埋在里面的线索一起扔掉。
// 所以先按类型分权重（事实 > 偏好 > 案例 > 过程），再只对过程类按时间衰减：
// 三年前的 NAS 型号不会变，三天前的一次排查过程会过时。
//
// 为什么权重乘在**精排合并后的分数**上，而不是服务端原始相似度：
// 服务端的相似度只回答「这段话跟问题像不像」，精排合并出来的分才是这一轮真正用来排序的那个数。
// 乘在原始分上，会被后续的 min-max 标准化按批重新拉伸，权重等于白乘；乘在合并分上，
// 排序、探针里的分数表、条数上限看到的是同一个数，账才对得上。
//
// 为什么只有过程类衰减，而且半衰期是 90 天：
// 事实类（entities / preferences / cases）的价值与时间无关，给它们衰减等于按「新旧」而不是
// 「对不对」筛记忆；过程类的价值是会过期的，但也不能衰减太快——半衰期取 90 天，
// 一年前的记录还有约 6% 的分，仍能进候选，只是排在新鲜记录后面。
//
// 这一层只做过滤与加权，不排序：排序交给精排那一段（rankRerankIndexes），
// 这里保持输入顺序，调用方才能把「被谁丢的」与「排第几」分开记账。
//
// 纯函数，不 import 任何 node 内置模块；只借 assemble.js 的 scoreOf 统一「没有分数」的口径。
// 这一层没有开关：它是判断，不是偏好。

import { scoreOf } from "./assemble.js";

/** 记忆库 uri 里认得的类型段。顺序也是 byType 的键序（unknown 排在最后）。 */
export const MEMORY_TYPES = Object.freeze([
  "entities",
  "preferences",
  "cases",
  "events",
  "trajectories",
]);

/** uri 解不出类型、条目自己也没带 type 时的类别。 */
export const MEMORY_TYPE_UNKNOWN = "unknown";

/**
 * 类型权重。unknown 取 events 的 0.75：认不出的东西既不能当事实重赏，
 * 也不该被当成垃圾直接扔掉，按「可能是过程记录」对待是更保守的那一侧。
 */
export const MEMORY_TYPE_WEIGHTS = Object.freeze({
  entities: 1,
  preferences: 0.95,
  cases: 0.9,
  events: 0.75,
  trajectories: 0.7,
  unknown: 0.75,
});

/**
 * 会随时间衰减的类型。unknown 也在里面：uri 与 type 都解不出来时，
 * 唯一能用的信号就是「它有多新」，按过程记录处理比按事实处理更安全。
 */
export const LAYER_DECAY_TYPES = Object.freeze(["events", "trajectories", "unknown"]);

/** 半衰期：90 天前的一条记录，衰减因子是 0.5。 */
export const LAYER_HALF_LIFE_DAYS = 90;

/** 分层后的分数低于这个值就整条丢掉。0.02 约等于「半衰期过了 5 轮半」，再留着只占名额。 */
export const LAYER_STALE_FLOOR = 0.02;

/**
 * 正文门槛：去掉 <memory> 标记与全部空白后不足 40 字，按空壳丢掉。
 *
 * rendered 拆出来的条目 text 是带标记的整块，一个只有 uri 的占位条光属性就有七八十字；
 * 不剥标记的话，这道门槛等于不存在。40 字是「一句能自洽的话」的下限，
 * 比它短的多半是标题、占位符或截断的尾巴。
 */
export const LAYER_MIN_BODY_CHARS = 40;

/** 一天有多少毫秒。单独导出来，冒烟要用它算「90 天前」。 */
export const LAYER_DAY_MS = 86400000;

/** 从 uri 里取第一段 uri 的类型段。 */
function typeSegmentOf(uri) {
  if (typeof uri !== "string") return "";
  const value = uri.trim();
  if (!value) return "";
  // 查询串与片段不是路径的一部分：`?v=2` 里出现 memories 不该改变类型。
  const pathOnly = value.split(/[?#]/)[0];
  const segments = pathOnly.split("/");
  const at = segments.indexOf("memories");
  if (at < 0 || at + 1 >= segments.length) return "";
  return segments[at + 1].trim();
}

/**
 * uri -> 类型。认不出（空串 / 非字符串 / 没有 memories 段 / 段名不在表里）一律 unknown，
 * 永不返回空串：调用方拿它去查权重，空串会静默变成 undefined。
 */
export function memoryTypeOfUri(uri) {
  const segment = typeSegmentOf(uri);
  return MEMORY_TYPES.includes(segment) ? segment : MEMORY_TYPE_UNKNOWN;
}

/**
 * 条目 -> 类型：先看 uri，uri 解不出时再看条目自带的 type 字段。
 *
 * rendered 的 `<memory type="events">` 已经把 type 收进 item.type（见 recallMetaOf），
 * 但 entries 形态的条目往往只有 uri。两处都认不出才 unknown。
 */
export function memoryTypeOfItem(item) {
  const byUri = memoryTypeOfUri(item?.uri);
  if (byUri !== MEMORY_TYPE_UNKNOWN) return byUri;
  const own = typeof item?.type === "string" ? item.type.trim() : "";
  return MEMORY_TYPES.includes(own) ? own : MEMORY_TYPE_UNKNOWN;
}

/** 类型 -> 权重。认不出的一律 0.75（与 unknown 同档）。 */
export function typeWeightOf(type) {
  const weight = MEMORY_TYPE_WEIGHTS[type];
  return Number.isFinite(weight) ? weight : MEMORY_TYPE_WEIGHTS[MEMORY_TYPE_UNKNOWN];
}

/** 这一类型要不要按时间衰减。认不出的类型按 unknown 处理。 */
export function decaysWithTime(type) {
  const name = MEMORY_TYPES.includes(type) || type === MEMORY_TYPE_UNKNOWN
    ? type
    : MEMORY_TYPE_UNKNOWN;
  return LAYER_DECAY_TYPES.includes(name);
}

/**
 * 校验年月日并返回 { year, month, day }，非法给 null。
 *
 * 不直接 new Date(y, m - 1, d) 之后回读：2 月 30 日会被静默滚到 3 月 2 日，
 * 结果不是「这段 uri 没有日期」，而是「它有一条别的日期」。先按日历算当月天数再比。
 */
function validDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1 || m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { year: y, month: m, day: d };
}

/**
 * uri 里的日期段：`memories/events/2026/10/27/...` 与 `memories/events/2026-10-27/...`
 * 两种写法都认。从 memories 段之后开始扫，命中第一个合法日期就返回，解不出给 null。
 *
 * uri 日期优先于条目 time 字段：前者是这份记忆在库里的归属位置（归档时就定死了），
 * 后者可能被重建、复制、迁移改过，甚至只是最后一次被读到的时刻。
 */
export function uriDateOf(uri) {
  if (typeof uri !== "string") return null;
  const value = uri.trim();
  if (!value) return null;
  const segments = value.split(/[?#]/)[0].split("/");
  const at = segments.indexOf("memories");
  if (at < 0) return null;
  for (let index = at + 1; index < segments.length; index += 1) {
    const single = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(segments[index]);
    if (single) return validDateParts(single[1], single[2], single[3]);
    if (
      /^\d{4}$/.test(segments[index]) &&
      index + 2 < segments.length &&
      /^\d{1,2}$/.test(segments[index + 1]) &&
      /^\d{1,2}$/.test(segments[index + 2])
    ) {
      const parts = validDateParts(segments[index], segments[index + 1], segments[index + 2]);
      if (parts) return parts;
    }
  }
  return null;
}

/**
 * 纯数字时间戳按量级判单位：绝对值小于 1e11 当秒，否则当毫秒。
 *
 * 服务端的 modTime / timestamp 两种写法都见过（recall.js 那边把数字也留成串）。
 * 一律按毫秒读，秒级时间戳会落到 1970 年，ageDays 变成两万天、衰减因子约等于 0，
 * 整类 events 会被静默当成过时丢掉。1e11 毫秒约合 1973 年，而秒级要到公元 5138 年
 * 才会越界，两边都不可能在真实记忆里撞上。
 */
const EPOCH_SECONDS_LIMIT = 1e11;

function epochMsOf(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) < EPOCH_SECONDS_LIMIT ? number * 1000 : number;
}

/**
 * 条目的 time 字段 -> Date。字符串认 ISO / `2026-10-27` / 纯数字时间戳。
 * 纯数字（数字本体或纯数字字符串）按量级判秒 / 毫秒，规则见上面的 epochMsOf。
 *
 * 日期部分先过 validDateParts：`2026-02-30` 这类非法日期给 null，不让运行时替我们滚月。
 * 取不到或形状不像时间一律 null——「没有时间」与「时间是 1970」必须分得开。
 */
export function timeDateOf(time) {
  if (typeof time === "number") {
    const ms = epochMsOf(time);
    if (ms === null) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof time !== "string") return null;
  const text = time.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const ms = epochMsOf(text);
    if (ms === null) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const head = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(text);
  if (head) {
    const parts = validDateParts(head[1], head[2], head[3]);
    if (!parts) return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nowMsOf(now) {
  if (now instanceof Date) {
    const value = now.getTime();
    return Number.isFinite(value) ? value : Date.now();
  }
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}

/**
 * 条目有多旧（天）。取时间的优先级：uri 里的日期段 > 条目的 time 字段。
 * 两者都没有给 null（不是 0）：「不知道多旧」不能被当成「刚刚」。
 * 未来的时间按 0 天算，不产生大于 1 的衰减因子。
 */
export function ageDaysOf(item, now) {
  const parts = uriDateOf(item?.uri);
  const date = parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : timeDateOf(item?.time);
  if (!date) return null;
  const days = (nowMsOf(now) - date.getTime()) / LAYER_DAY_MS;
  return days > 0 ? days : 0;
}

/**
 * 衰减因子：0.5 ** (ageDays / 90)。不衰减的类型恒为 1。
 *
 * ageDays 不是有限数字（null / NaN）时也给 1：取不到时间就是「不知道它旧不旧」，
 * 这时按「不额外惩罚」处理，交给类型权重与分数去决定。负年龄按 0 天算（factor=1）。
 */
export function decayFactorOf(type, ageDays) {
  if (!decaysWithTime(type)) return 1;
  if (!Number.isFinite(ageDays)) return 1;
  const days = ageDays > 0 ? ageDays : 0;
  return 0.5 ** (days / LAYER_HALF_LIFE_DAYS);
}

/** 去掉开头那个 `<memory ...>` 开标签与结尾的 `</memory>`。 */
function stripMemoryTags(text) {
  let body = text;
  const open = /^\s*<memory(?=[\s/>])[^>]*>/i.exec(body);
  if (open) body = body.slice(open[0].length);
  body = body.replace(/<\/memory\s*>\s*$/i, "");
  return body;
}

/**
 * 正文字数：剥掉 <memory> 标记、去掉全部空白后按码点算。
 *
 * 按码点而不是 UTF-16 长度：一个汉字 / emoji 在 length 里可能算两个，
 * 门槛要的是「读起来有多长」，不是「占几个字节」。
 */
export function bodyLengthOf(item) {
  const text = typeof item?.text === "string" ? item.text : "";
  if (!text) return 0;
  return Array.from(stripMemoryTags(text).replace(/\s+/g, "")).length;
}

/**
 * 一条候选分层后的分数：`scoreOf(item) × 类型权重 × 时间衰减因子`。
 *
 * 没有分数（scoreOf 给 null）就返回 null，不参与过时判定、也不丢：
 * 与 assemble.js 里「没有分数不能当成零分」同一口径——零分是「明确不要」，
 * 没有分数是「这一轮没人给它打分」，两件事不能混。
 */
export function layerScoreOf(item, options = {}) {
  const raw = scoreOf(item);
  if (raw === null) return null;
  const type = memoryTypeOfItem(item);
  return raw * typeWeightOf(type) * decayFactorOf(type, ageDaysOf(item, options?.now));
}

/**
 * 把分层权重乘到给定的分数表上（精排合并后的那一份），返回同长度的新表。
 *
 * 与 layerScoreOf 的区别：这里的分数来自精排合并，不读条目的 score 字段；
 * 条目只提供「是什么类型、有多旧」。合并分不是有限数字的位置给 null。
 */
export function applyLayerWeights(scores, items, options = {}) {
  const list = Array.isArray(scores) ? scores : [];
  const entries = Array.isArray(items) ? items : [];
  const now = nowMsOf(options?.now);
  return list.map((score, index) => {
    const value = Number(score);
    if (!Number.isFinite(value)) return null;
    const item = entries[index];
    const type = memoryTypeOfItem(item);
    return value * typeWeightOf(type) * decayFactorOf(type, ageDaysOf(item, now));
  });
}

/**
 * 候选分层：空壳先丢，再过时门槛，剩下的原样按输入顺序返回。
 *
 * 两步的先后有意义：空壳没有正文，给它算「过时」没有意义，先按正文丢掉。
 * byType 记的是**进入这一层的原始批次**（含随后被丢掉的）：
 * 这一层到底看到了什么、丢在哪一步，要能分开看。
 * 键序按 MEMORY_TYPES 排、unknown 最后，且不带 0 值的键——日志里一长串 :0 只会淹掉有用的项。
 * 空批次也给 {}（不是 null）：这一层跑过就一定有一份账。
 */
export function layerCandidates(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const now = nowMsOf(options?.now);
  const counts = new Map();
  const kept = [];
  let droppedEmpty = 0;
  let droppedStale = 0;

  for (const item of list) {
    const type = memoryTypeOfItem(item);
    counts.set(type, (counts.get(type) || 0) + 1);
    if (bodyLengthOf(item) < LAYER_MIN_BODY_CHARS) {
      droppedEmpty += 1;
      continue;
    }
    const layered = layerScoreOf(item, { now });
    if (layered !== null && layered < LAYER_STALE_FLOOR) {
      droppedStale += 1;
      continue;
    }
    kept.push(item);
  }

  const byType = {};
  for (const type of MEMORY_TYPES) {
    const count = counts.get(type);
    if (count) byType[type] = count;
  }
  const unknown = counts.get(MEMORY_TYPE_UNKNOWN);
  if (unknown) byType[MEMORY_TYPE_UNKNOWN] = unknown;

  return { items: kept, droppedEmpty, droppedStale, byType };
}

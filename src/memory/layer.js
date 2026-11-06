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
// 为什么除了类型还要看正文：类型来自 uri 里的段名，而段名是写记忆的人打的标签，不规范是常态。
// 一条「代理迁到某个内网地址:端口」被写成 events 很常见，但那个地址今天还在用，
// 按 90 天半衰期算三个月前只剩三四成，排序就被推到后面——这不是时间让它过时，是标签让它过时。
// 所以正文里能认出的硬事实（地址、绝对路径、版本号、型号、端口、容量规格）盖过类型：
// 这类条目不做时间衰减、权重按事实那一档给。它只管衰减，不改类型归类（byType 仍按 uri 记）。
// 代价是误伤要压到底：纯日期、分数、数量词都不算事实，判据宁可窄，因为放宽一次就是
// 一整类过程记录永远不衰减，那比错判一条更贵。
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
 *
 * 第三个参数是正文兜底的结果（见 factualOf）：命中就恒 1，与类型无关。
 * 默认 false 是为了让两参调用保持原样——「没有正文判据」与「判过、没命中」在这里同一处理，
 * 因为这一层从不猜，没拿到判据就不额外惩罚。
 */
export function decayFactorOf(type, ageDays, factual = false) {
  if (factual) return 1;
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

// ---- 内容兜底：正文里有没有硬事实 ----
//
// 每条判据都写成「只看形状」的正则 / 小函数，不做语义理解。窄一点是有意的：
// 这些判据一旦放宽，一整类过程记录就永远不衰减，代价远大于漏判一条。

/**
 * 版本号判据前面要先挖掉日期形状：`2026.10.04` 是日期，不是三段版本号。
 * `2026-10-04` 本来就不匹配版本号，一并挖掉只是省得后面各条判据再去躲它。
 */
const FACTUAL_DATE_SHAPE = /\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g;

/** IPv4：四段数字且每段都 ≤ 255（`999.1.1.1` 不是地址，是串数字）。 */
function looksIpv4(text) {
  const matches = text.match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/g);
  if (!matches) return false;
  return matches.some((candidate) =>
    candidate.split(".").every((octet) => Number(octet) <= 255),
  );
}

/** host:port：`nas.local:8080`。主机名要带点，裸 `键:值` 不算。 */
const FACTUAL_HOST_PORT =
  /(?<![\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}:\d{2,5}(?!\d)/i;

/**
 * 绝对路径：`/mnt/nas-quant/archive`、`~/.hermes/config/pi-router.json`。
 *
 * 根斜杠前面只认行首 / 空白 / 标点，且第一段至少两个字：`17/282`、`3/4` 这种数字夹斜杠
 * 是分数不是路径。`://` 里的斜杠前面是冒号也会被前一段条件放到上一轮匹配里，
 * 但第二段要求非 `/`，所以 uri 的 `//` 不会命中。
 */
const FACTUAL_ABS_PATH =
  /(?:^|[\s,;:：，；、。!?！？()（）\[\]【】「」'"“”=])(?:~\/|\/)[A-Za-z0-9_.-]{2,}(?:\/[\w.@+-]+)*/;

/**
 * 版本号：`v0.4.16` / `0.4.16` / `20.04`。
 *
 * 两段的点号串要求第一段至少两位数字（或带 v 前缀），否则 `0.35`、`0.9` 这种分数 /
 * 相似度会被当成版本号；三段及以上不限，`0.4.16` 才认得出。日期形状先挖掉。
 */
function looksVersion(text) {
  const body = text.replace(FACTUAL_DATE_SHAPE, " ");
  return (
    /(?<![\w.])v\d+(?:\.\d+)+(?![\d.])/i.test(body) ||
    /(?<![\d.])\d+(?:\.\d+){2,}(?![\d.])/.test(body) ||
    /(?<![\d.])\d{2,}\.\d+(?![\d.])/.test(body)
  );
}

/**
 * 型号串：`X600` / `RTX 4090` / `i7-12700`。
 *
 * 三段：两位以上大写字母带两位以上数字（可夹一个空格）、单字母＋短数字＋减号＋长数字、
 * 单字母＋两位以上数字。单字母＋一位数字（填充语里那个 `v7`）不算——它更像章节号。
 */
const FACTUAL_MODEL =
  /(?<![\w-])(?:[A-Z]{2,}[ -]?\d{2,6}|[A-Za-z]\d{1,3}-\d{2,6}|[A-Za-z]\d{2,6})(?![\d])/;

/**
 * 端口：`port=47821` 与裸冒号写法 `:8080`。
 *
 * 裸冒号左边不能是数字或字母，否则 `14:30` 这种时刻会被当成端口；`主机:端口` 写法里
 * 左边是数字的（IPv4 带端口）归 IPv4 那条判据管，不靠这一条。
 */
const FACTUAL_PORT = /(?<![\d\w]):\d{2,5}(?!\d)|(?<!\w)port\s*=\s*\d{1,5}(?!\d)/i;

/**
 * 容量 / 规格：`32GB` / `8TB` / `DDR5`。
 *
 * 单位必须是真正的容量或频率单位，`14 篇文献` 不算；`DDR` 这一族单独认，
 * 因为它的数字只是一位。
 */
const FACTUAL_SPEC =
  /(?<![\w.])\d+(?:\.\d+)?\s?(?:GB|TB|MB|KB|PB|GHz|MHz)(?!\w)|(?<!\w)(?:DDR|LPDDR|GDDR)\d+(?!\w)/;

/**
 * 正文里有没有硬事实：IPv4 / host:port、绝对路径、版本号、型号串、显式端口、容量规格，
 * 命中任一类给 true。
 *
 * 先剥掉 `<memory ...>` 标记再判断：uri 与 score 都在属性里，把属性算进正文等于
 * 「每条渲染出来的记忆都带路径」，判据就永远命中，等于没有判据。
 * 非字符串、空串、剥完只剩空白的占位条一律 false。
 */
export function looksFactual(text) {
  if (typeof text !== "string") return false;
  const body = stripMemoryTags(text).trim();
  if (!body) return false;
  return (
    looksIpv4(body) ||
    FACTUAL_HOST_PORT.test(body) ||
    FACTUAL_ABS_PATH.test(body) ||
    looksVersion(body) ||
    FACTUAL_MODEL.test(body) ||
    FACTUAL_PORT.test(body) ||
    FACTUAL_SPEC.test(body)
  );
}

/**
 * 命中内容兜底时用的权重：就是 entities 那一档，指过去而不是另写一个 1。
 * 另写一个数，哪天 entities 的权重动了，这条兜底会静默地不再等价于「按事实对待」。
 */
export const FACTUAL_WEIGHT = MEMORY_TYPE_WEIGHTS.entities;

/** 条目正文是否命中兜底。没正文的条目一律 false。 */
export function factualOf(item) {
  return looksFactual(item?.text);
}

/**
 * 条目该拿的权重：命中兜底按事实档，否则按类型档。
 * 与 decayFactorOf 的第三个参数是一对：权重抬到事实档、衰减同时取消。
 */
export function layerWeightOf(item) {
  return factualOf(item) ? FACTUAL_WEIGHT : typeWeightOf(memoryTypeOfItem(item));
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
 * 一条候选分层后的分数：`scoreOf(item) × 权重 × 时间衰减因子`。
 *
 * 权重与衰减都看正文有没有命中兜底：命中就给事实档权重、不衰减；否则按类型给。
 * 顺序是这个函数要保证的东西：解析 type → 判正文 → 命中就绕开衰减，因为标签不可信时，
 * 唯一能拿准的就是正文里那条硬事实。
 *
 * 没有分数（scoreOf 给 null）就返回 null，不参与过时判定、也不丢：
 * 与 assemble.js 里「没有分数不能当成零分」同一口径——零分是「明确不要」，
 * 没有分数是「这一轮没人给它打分」，两件事不能混。
 */
export function layerScoreOf(item, options = {}) {
  const raw = scoreOf(item);
  if (raw === null) return null;
  const type = memoryTypeOfItem(item);
  return (
    raw *
    layerWeightOf(item) *
    decayFactorOf(type, ageDaysOf(item, options?.now), factualOf(item))
  );
}

/**
 * 把分层权重乘到给定的分数表上（精排合并后的那一份），返回同长度的新表。
 *
 * 与 layerScoreOf 的区别：这里的分数来自精排合并，不读条目的 score 字段；
 * 条目只提供「是什么类型、有多旧、正文里有没有事实」。合并分不是有限数字的位置给 null。
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
    return (
      value *
      layerWeightOf(item) *
      decayFactorOf(type, ageDaysOf(item, now), factualOf(item))
    );
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
 *
 * factual 记的是**命中内容兜底、且类型本来会衰减**的条数，也就是「被这条兜底救回来的」条数。
 * 已经落在 entities / preferences / cases 下的条目不计——它们本来就不衰减，计进去这个数
 * 就永远降不到 0，而它存在的意义正是「等它降到 0 就说明标签理干净了」。
 * 统计范围与 byType 同一批（进入这一层的候选，含随后被空壳 / 过时门槛丢掉的）。
 */
export function layerCandidates(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const now = nowMsOf(options?.now);
  const counts = new Map();
  const kept = [];
  let droppedEmpty = 0;
  let droppedStale = 0;
  let factual = 0;

  for (const item of list) {
    const type = memoryTypeOfItem(item);
    counts.set(type, (counts.get(type) || 0) + 1);
    if (factualOf(item) && decaysWithTime(type)) factual += 1;
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

  return { items: kept, droppedEmpty, droppedStale, byType, factual };
}

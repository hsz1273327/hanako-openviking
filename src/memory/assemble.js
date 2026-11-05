// 组装：精排之后、把候选拼成一段上下文之前的那一步。
//
// 为什么单独一层：拼成字符串之后，「这条是谁、几分、跟谁重复」就全没了。
// recall.js 里精排产出的那一小段还是分得开的候选，是链路上最后一个能看见每条身份的位置。
//
// 两档：
//   off   原样拼。除了下面那条与开关无关的凭据过滤，与加这一层之前的 recall.js
//         逐字一致：顺序不变，条数不变。
//   rules 按来源去重、按分数精排，再把结果拼成一段。
//
// 两档之上还有一条与开关无关的底线：带凭据的候选整条丢掉（见 hasCredential）。
// 安全过滤不随功能开关走——off 档的语义是「原样拼，但先滤一遍凭据」。
//
// 预算裁剪不在这里：截断点一直是 recall.js 的 memoryBlock(text, budget)，
// 它按拼好之后的文本算 token，也是这条链路上唯一会砍字的地方。
// 组装只决定「拼哪几条、什么顺序」，不决定「留多少」。
//
// 回指表 refs 与文本同源：第 N 段的 index 就是 N。它进探针和日志，不进注入文本。
//
// 这个文件不 import 任何东西：纯函数，冒烟与面板文案都能直接测。

/**
 * 一条候选的身份键。
 *
 * 有 uri 就只认 uri：同一个 uri 是同一份记忆，不管它被服务端回来几次。
 * 没有 uri 的退到文本指纹（去首尾空白、连续空白压成一个）：没有来源可认，只能认字面。
 *
 * 跨两类不合并：一条有 uri、一条没有时，即使字面一样也各留一条。理由是没有 uri 的
 * 那条根本不知道是哪儿来的，把有来源的那条当成它的副本，等于替服务端猜来源。
 */
export function candidateKey(item) {
  const uri = typeof item?.uri === "string" ? item.uri.trim() : "";
  if (uri) return `uri\u0000${uri}`;
  return `text\u0000${textKey(item?.text)}`;
}

/** 文本指纹：首尾空白去掉，连续空白压成一个。只用于判「是不是同一段话」。 */
export function textKey(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ");
}

/**
 * 候选的分数：数字就是数字，其余（null / 缺项 / 空串 / 非数字）一律 null。
 *
 * 不能用 Number() 一把梭：Number(null) 是 0，会让「没有分数」静默变成「零分」，
 * 排序时被当成最不相关的一条排到最后，而不是「没有分数」那一档。
 */
export function scoreOf(item) {
  const raw = item?.score;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** uri 里的 `/peers/<name>/` 那一段。解不出（没有 uri、不在 peers 下）给空串。 */
export function peerOfUri(uri) {
  const value = typeof uri === "string" ? uri.trim() : "";
  if (!value) return "";
  const hit = /\/peers\/([^/]+)\//.exec(value);
  return hit ? hit[1] : "";
}

/**
 * 去重：同一身份只留一条。
 *
 * 留分数最高的那条；分数相同（含两条都没有分数）留靠前的。留下来的位置也是
 * 第一次出现的位置：这里的顺序只在「同分」时才影响后面那步排序，先来的先走。
 */
export function dedupeCandidates(items) {
  const list = Array.isArray(items) ? items : [];
  const kept = [];
  const seen = new Map();
  for (const item of list) {
    const key = candidateKey(item);
    if (!seen.has(key)) {
      seen.set(key, kept.length);
      kept.push(item);
      continue;
    }
    const at = seen.get(key);
    const current = scoreOf(kept[at]);
    const next = scoreOf(item);
    if (next !== null && (current === null || next > current)) kept[at] = item;
  }
  return kept;
}

/**
 * 按分数降序精排，没有分数的排在有分数的后面。
 *
 * 稳定：同分之间、以及「都没分数」之间，保持原有相对顺序（带上原下标比较，
 * 不依赖 Array.prototype.sort 的实现细节）。没有分数的那一档不参与比较，
 * 它们之间谁先谁后只由原顺序决定。
 */
export function sortByScore(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = scoreOf(a.item);
      const right = scoreOf(b.item);
      if (left === null && right === null) return a.index - b.index;
      if (left === null) return 1;
      if (right === null) return -1;
      if (right !== left) return right - left;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** 回指表的一行：序号从 1 开始，只有定位信息，没有正文。 */
export function refOf(item, index) {
  const uri = typeof item?.uri === "string" ? item.uri.trim() : "";
  return {
    index,
    uri,
    peer: typeof item?.peer === "string" && item.peer ? item.peer : peerOfUri(uri),
    score: scoreOf(item),
  };
}

/**
 * 凭据判据：这一段文本里有没有不该进上下文的东西。
 *
 * 为什么在组装这一层做：这是链路上最后一个还看得见「每条候选各自是什么」的位置，
 * 拼成字符串之后就只能整段丢或者整段留。
 *
 * 几条模式对应实测里真的漏进来的东西：模型厂商的 key（sk-）、Authorization 头里
 * 抄下来的 Bearer、私钥块、网关会话头（x-opencode-session）、以及 `api_key = "..."`
 * 这种键值对写法。最后一条是兜底：任何 32 字符以上、大写小写数字齐全、且中间没有
 * 空格的连写片段，都按随机串处理（token / session id / 签名多半长这样）。
 * 纯小写长单词、纯数字、正常中文都不会命中——它们凑不齐「大小写加数字」三样。
 *
 * sk- 前面那个 \b 是有意的：`risk-management-and-planning` 里的 `sk-` 后面恰好是
 * 一长串字母与连字符，没有这个词边界就会被当成 key 整条丢掉。
 */
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /x-opencode-session/i,
  /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{16,}/i,
];

/** 32 字符以上的连写片段，大写、小写、数字三样齐全才算随机串。 */
const RANDOM_RUN = /[A-Za-z0-9._~+/=-]{32,}/g;

export function hasCredential(text) {
  if (typeof text !== "string" || !text) return false;
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  // 带 g 的那条只用 match：match 会把 lastIndex 归零，而 test() 不会。
  // 所以 CREDENTIAL_PATTERNS 里一条 g 都没有——有的话，同一张候选第二轮就会从上次
  // 停下的位置开始扫，判据随机漏。
  const runs = text.match(RANDOM_RUN) || [];
  return runs.some(
    (run) => /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run),
  );
}

/** 段与段之间的默认拼法：空行。 */
const SEGMENT_SEPARATOR = "\n\n";

/** ordered 是否保住了 clean 的相对顺序（按对象身份看，去重后的子序列也算保住）。 */
function keepsOrder(clean, ordered) {
  const at = new Map(clean.map((item, index) => [item, index]));
  let last = -1;
  for (const item of ordered) {
    const index = at.get(item);
    if (index === undefined || index <= last) return false;
    last = index;
  }
  return true;
}

/**
 * 拼正文。
 *
 * 条目自带 sep（rendered 按块拆出来的那些）且顺序没被打乱时，照抄原始分隔，
 * 拼回去与拆分前逐字一致——拆条不该改变注入文本。
 * 顺序被精排改过、或者本来就没有 sep（entries 那几种形态），就没有「原来隔着什么」可言，
 * 回到空行。
 */
function joinSegments(list, keepSeps) {
  let text = "";
  list.forEach((item, index) => {
    const body = typeof item?.text === "string" ? item.text : "";
    if (index > 0) {
      text += keepSeps && typeof item?.sep === "string" ? item.sep : SEGMENT_SEPARATOR;
    }
    text += body;
  });
  return text;
}

/**
 * 组装：候选列表 -> { text, refs, dropped }。
 *
 * mode 只认字面 "off"（原样拼），其余一律按规则档走。这与配置归一化同一个取舍：
 * 认不出的值回 rules，因为去重与精排不花时间，漏掉的代价只是白留一条。
 *
 * text 是这一段的正文（未包标记、未按预算截断）；recall.js 接着交给 memoryBlock。
 * 一条候选占一段。段与段之间默认空一行；候选自带 sep 且顺序未变时（rendered 拆条，
 * 服务端本来用单换行分隔）用原始分隔，拼回去与拆分前逐字一致。
 *
 * refs 与段落一一对应：一条文本为空的候选也占一行，宁可多一行空记录，
 * 也不让序号与段落错位（真实链路上 extractRecallItems 已经滤掉了空文本）。
 *
 * dropped 记这一轮滤掉了多少条（目前只有 credential 一种），只记条数不记内容：
 * 命中原文写进日志，等于把凭据从记忆搬到了另一处，两处都要清。
 *
 * 过滤排在去重之前：同一份记忆的两条副本里只有一条带凭据时，先把脏的那条拿走，
 * 干净的那条才能被留下；反过来先去重，脏的那条可能因为分数高而把干净的挤掉。
 */
export function assembleCandidates(items, mode = "rules") {
  const list = Array.isArray(items) ? items : [];
  let droppedCredential = 0;
  const clean = [];
  for (const item of list) {
    if (hasCredential(item?.text)) {
      droppedCredential += 1;
      continue;
    }
    clean.push(item);
  }
  const ordered = mode === "off" ? clean.slice() : sortByScore(dedupeCandidates(clean));
  const text = joinSegments(ordered, keepsOrder(clean, ordered)).trim();
  const refs = ordered.map((item, index) => refOf(item, index + 1));
  return { text, refs, dropped: { credential: droppedCredential } };
}

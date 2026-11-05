// 组装：精排之后、把候选拼成一段上下文之前的那一步。
//
// 为什么单独一层：拼成字符串之后，「这条是谁、几分、跟谁重复」就全没了。
// recall.js 里精排产出的那一小段还是分得开的候选，是链路上最后一个能看见每条身份的位置。
//
// 两档：
//   off   原样拼。与加这一层之前的 recall.js 逐字一致：顺序不变，条数不变。
//   rules 按来源去重、按分数精排，再把结果拼成一段。
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
 * 组装：候选列表 -> { text, refs }。
 *
 * mode 只认字面 "off"（原样拼），其余一律按规则档走。这与配置归一化同一个取舍：
 * 认不出的值回 rules，因为去重与精排不花时间，漏掉的代价只是白留一条。
 *
 * text 是这一段的正文（未包标记、未按预算截断）；recall.js 接着交给 memoryBlock。
 * 一条候选占一段，段与段之间空一行，与加这一层之前的拼法一致。
 *
 * refs 与段落一一对应：一条文本为空的候选也占一行，宁可多一行空记录，
 * 也不让序号与段落错位（真实链路上 extractRecallItems 已经滤掉了空文本）。
 */
export function assembleCandidates(items, mode = "rules") {
  const list = Array.isArray(items) ? items : [];
  const ordered = mode === "off" ? list.slice() : sortByScore(dedupeCandidates(list));
  const text = ordered
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("\n\n")
    .trim();
  const refs = ordered.map((item, index) => refOf(item, index + 1));
  return { text, refs };
}

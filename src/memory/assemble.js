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
// 候选级的判据都收在这里：精确去重（身份）、凭据判据、近重复（比对基准上字符 3-gram 的 Jaccard）。
// 三者在链路上挨着跑（召回之后、精排之前），放在一起才不会出现两份口径。
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

/* ---------------- 近重复：比对基准上字符 3-gram 的 Jaccard ----------------
 *
 * 精确去重只认「身份相同」或「字面一字不差」。同一段内容被提取两遍、加了个抬头、
 * 标点 / 换行 / 大小写不同、或者截取长度不同，精确去重一条都抓不住，两条都留下，
 * 白占精排的保留名额。这一层补的就是这些。
 *
 * 算法（不调任何模型、零依赖）：
 *   1. 从每条候选里取出比对基准（dedupeBasisOf：优先 # Summary 段，见下面那段）
 *   2. 归一化：全角转半角、英文转小写、去掉所有空白与标点
 *   3. 按字符切 3-gram 得到集合（中文按字，英文按字符）
 *   4. 两两比较：|A ∩ B| / |A ∪ B|
 *   5. 相似度 ≥ 阈值即视为同一件事
 *
 * 抓得住：同一段内容重复提取、加了抬头 / 前缀、标点与空白不同、大小写与全半角不同、
 * 截取长度不同（3-gram 的交集仍然很大）。
 * 抓不住：换一种说法的同义改写。那需要 embedding，不在这一层的能力范围里——
 * 别把这里当语义去重。
 *
 * 候选最多十几条，两两比较完全不是负担，所以不建索引也不做剪枝。
 */

/* ---------------- 比对基准：优先 # Summary 段 ----------------
 *
 * 为什么不能拿全文比：真实记忆条目是 800–1500 字（# Summary + # ChatLog）。
 * 3-gram 的 Jaccard 在这种长度上要八成以上的三字组合重合才算近重复，
 * 那基本只在逐字复制时发生——实测 50 条、1225 对，相似度 ≥ 0.5 的一对都没有。
 * 阈值调到多低都救不回来，因为问题是「量错了东西」，不是「门槛太高」。
 *
 * 但条目的结构给了一个天然的比对基准：# Summary 只有一两百字，概括的就是这件事本身。
 * 同一件事被提取两遍，两段概括往往高度重合；不同的事哪怕都跟这次提问相关，
 * 概括也差得很远。换成短的比，分辨率就回来了。
 *
 * 取法（按顺序落）：
 *   1. 有 `# Summary` 段 → 取那一段（到下一个 `# ` 标题之前）
 *   2. 没有 Summary、但有别的 `# ` 段 → 取第一段
 *   3. 一个 `# ` 标题都没有 → 取前 300 字
 *   4. 取出来的内容去空白后短于 20 字 → 退回整篇正文
 *      （太短的概括没有分辨率，用它比反而更容易误合并）
 *
 * 比对只用基准，合并仍然作用于整条候选：这里只决定「像不像」，不决定「丢什么」。
 */

/** 行首的段标题：一个井号 + 空白。`## ` 之类不算，子标题归在它所在的那一段里。 */
const SECTION_HEADING_RE = /^#[ \t]+(.+?)\s*$/u;

/** Summary 段的标题（`# Summary` / `# summary`）。 */
const SUMMARY_TITLE_RE = /^summary\b/iu;

/** 没有段标题时取多长的开头当基准。 */
export const DEDUPE_BASIS_HEAD_CHARS = 300;

/** 基准短于这个长度（去空白后按码点算）就没有分辨率，退回整篇正文。 */
export const DEDUPE_BASIS_MIN_CHARS = 20;

/** 按行切出 `# ` 开头的段；第一个标题之前的内容不属于任何段。 */
function sectionsOf(text) {
  const sections = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = SECTION_HEADING_RE.exec(line);
    if (heading) {
      current = { title: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}

/** 去空白后的码点数：只用来判「这段概括够不够长」，不参与相似度计算。 */
function bareLength(text) {
  return Array.from(text.replace(/\s+/g, "")).length;
}

/**
 * 一条候选的比对基准。规则见上面那段注释。
 *
 * 不是字符串（null / undefined）时给空串：没有正文就没有可比的东西，与 charGrams 对空文本的口径一致。
 */
export function dedupeBasisOf(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) return "";
  const sections = sectionsOf(raw);
  let basis = "";
  if (sections.length) {
    const summary = sections.find((section) => SUMMARY_TITLE_RE.test(section.title));
    basis = (summary || sections[0]).lines.join("\n").trim();
  }
  if (!basis) basis = Array.from(raw).slice(0, DEDUPE_BASIS_HEAD_CHARS).join("").trim();
  // 太短的概括认不出「同一件事」：两条不同的短摘要之间、以及短摘要与它自己的正文之间，
  // 3-gram 的重合都可能很高，用它比只会多合并。退回全文是更保守的那一侧。
  if (bareLength(basis) < DEDUPE_BASIS_MIN_CHARS) return raw.trim();
  return basis;
}

/** 单个 gram 的长度。3 是中文与英文都能吃到的那个折中：再短就误杀，再长就不认改写。 */
export const NEAR_DUPE_GRAM_SIZE = 3;

/**
 * 近重复的默认阈值。与 src/ov/settings.js 的 DEDUPE_THRESHOLD_DEFAULT 同值
 * （那一份是配置的默认值，这一份只给不传参的调用方兜底；冒烟里断言两者相等）。
 */
export const NEAR_DUPE_THRESHOLD = 0.6;

/** 归一化后还留得下的字符：任何文字的字母与数字（标点、符号、空白全丢）。 */
const KEEP_CHAR_RE = /[\p{L}\p{N}]/u;

/** 全角 ASCII 段（！到 ～）与半角之间的码点差，以及那个全角空格。 */
const FULLWIDTH_FIRST = 0xff01;
const FULLWIDTH_LAST = 0xff5e;
const FULLWIDTH_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;

/**
 * 归一化：全角转半角、英文转小写、去掉所有空白与标点。
 *
 * 为什么按码点走而不是一串 replace：全角转半角用一个码点偏移就够，
 * 正则里塞一堆区间既难读也容易漏掉某个区段；「留不留这个字符」交给一条
 * Unicode 属性类判断，中文 / 英文 / 数字都照收，标点与符号一律不留。
 */
export function normalizeForGram(text) {
  const raw = String(text ?? "");
  if (!raw) return "";
  let folded = "";
  for (const char of raw) {
    const code = char.codePointAt(0);
    if (code === IDEOGRAPHIC_SPACE) continue;
    if (code >= FULLWIDTH_FIRST && code <= FULLWIDTH_LAST) {
      folded += String.fromCodePoint(code - FULLWIDTH_OFFSET);
      continue;
    }
    folded += char;
  }
  let kept = "";
  for (const char of folded.toLowerCase()) {
    if (KEEP_CHAR_RE.test(char)) kept += char;
  }
  return kept;
}

/**
 * 归一化后按字符切 gram，得到去重后的集合。
 *
 * 归一化后什么都不剩（空文本、只剩标点）时给空集合：没有可比的字面证据，
 * 就谁也不像谁（见 jaccardOf 对空集的处理）。
 * 短于一个 gram 的文本（比如单个汉字）整个当一条 gram，否则它跟任何东西的
 * 相似度都是 0，两条一模一样的两字短句也就永远合并不了。
 */
export function charGrams(text, size = NEAR_DUPE_GRAM_SIZE) {
  const chars = Array.from(normalizeForGram(text));
  const grams = new Set();
  if (!chars.length) return grams;
  const width = Number.isInteger(size) && size > 0 ? size : NEAR_DUPE_GRAM_SIZE;
  if (chars.length <= width) {
    grams.add(chars.join(""));
    return grams;
  }
  for (let i = 0; i + width <= chars.length; i += 1) {
    grams.add(chars.slice(i, i + width).join(""));
  }
  return grams;
}

/**
 * 两个 gram 集合的 Jaccard 相似度：交集大小 / 并集大小。
 *
 * 任一边为空集时给 0：分母是 0，而且「没有字面证据」不该被当成「一样」。
 * 两集合相同时给 1（含两边都只有一个 gram、且那一个 gram 相同的情况）。
 */
export function jaccardOf(left, right) {
  if (!(left instanceof Set) || !(right instanceof Set)) return 0;
  if (!left.size || !right.size) return 0;
  const [small, big] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const gram of small) {
    if (big.has(gram)) shared += 1;
  }
  return shared / (left.size + right.size - shared);
}

/**
 * 两段文本的相似度（各切一次 gram 再算 Jaccard）。冒烟与文档都直接用它。
 *
 * 注意口径：这里比的是传进来的那两段字面本身，不走 dedupeBasisOf。
 * 近重复判重用的是「基准 vs 基准」（见 nearDedupeCandidates）。
 */
export function textSimilarity(left, right) {
  return jaccardOf(charGrams(left), charGrams(right));
}

/**
 * 近重复去重：相似度 ≥ 阈值的那些只留一条。
 *
 * 留分数最高的那条；分数相同（含两条都没有分数）留先出现的——与 dedupeCandidates
 * 同一套取舍，两条去重不会因为谁先谁后给出不同的结果。
 *
 * 怎么做到的：按「分数降序、同分靠前」逐个当代表，凡是与已收下的某个代表相似度 ≥ 阈值
 * 就丢掉。以代表为准而不是两两连锁：A 像 B、B 像 C 但 A 不像 C 时，只留代表那一条，
 * 不把三句话连成一坨（连锁合并会一路吃掉整批候选，那正是「阈值调到 0.5 就乱合」的来源）。
 *
 * 输出保持输入顺序（按留下来的那条原本的位置），后面的排序仍然由 sortByScore 决定。
 * threshold 不合法（非数字）时用 NEAR_DUPE_THRESHOLD。
 *
 * 比的是 dedupeBasisOf 取出的基准（有 # Summary 就只用那段），不是整篇正文：
 * 800–1500 字的全文之间 3-gram 几乎不重合，那样比跟精确去重没区别。
 * 合并仍然整条合并，基准只用来判「像不像」。
 *
 * 返回 { items, dropped }：与 dropCredentialCandidates 同形，调用方只加一笔账。
 */
export function nearDedupeCandidates(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const raw = options?.threshold;
  const threshold = Number.isFinite(raw) ? raw : NEAR_DUPE_THRESHOLD;
  if (list.length < 2) return { items: list.slice(), dropped: 0 };

  const grams = list.map((item) => charGrams(dedupeBasisOf(item?.text)));
  const order = list
    .map((_, index) => index)
    .sort((a, b) => {
      const left = scoreOf(list[a]);
      const right = scoreOf(list[b]);
      if (left === null && right === null) return a - b;
      if (left === null) return 1;
      if (right === null) return -1;
      if (right !== left) return right - left;
      return a - b;
    });

  const kept = [];
  for (const index of order) {
    const twin = kept.some((at) => jaccardOf(grams[at], grams[index]) >= threshold);
    if (!twin) kept.push(index);
  }
  kept.sort((a, b) => a - b);
  return { items: kept.map((index) => list[index]), dropped: list.length - kept.length };
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

/**
 * 凭据过滤：命中 hasCredential 的整条丢，返回 { items, dropped }。
 *
 * 放在这里是因为它有两条调用路径：recall.js 在精排之前先滤一遍（不让带凭据的候选
 * 占掉 rerankKeep 的名额），组装时再滤一遍（幂等的第二道网，挡的是精排之后才出现的
 * 东西，比如兜底返回的结果）。两处必须同一个判据，否则第二道网会漏掉第一道认得出的。
 */
export function dropCredentialCandidates(items) {
  const list = Array.isArray(items) ? items : [];
  const kept = [];
  let dropped = 0;
  for (const item of list) {
    if (hasCredential(item?.text)) {
      dropped += 1;
      continue;
    }
    kept.push(item);
  }
  return { items: kept, dropped };
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
 * 这一层的去重与凭据过滤现在是**第二道网**：recall.js 在精排之前已经做过一遍，
 * 所以正常情况下这里一条都丢不掉（dropped.credential 应为 0）。留着是因为精排之后
 * 还可能冒出新东西（兜底返回的候选），而这时再往下一步就只剩一个字符串了。
 * 换句话说：off 档「原样拼」指的是这一层不再加工，不是「上游没做过去重」。
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
  const screened = dropCredentialCandidates(items);
  const droppedCredential = screened.dropped;
  const clean = screened.items;
  const ordered = mode === "off" ? clean.slice() : sortByScore(dedupeCandidates(clean));
  const text = joinSegments(ordered, keepsOrder(clean, ordered)).trim();
  const refs = ordered.map((item, index) => refOf(item, index + 1));
  return { text, refs, dropped: { credential: droppedCredential } };
}

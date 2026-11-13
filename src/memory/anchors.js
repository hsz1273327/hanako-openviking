// 话题锚点：从一段对话里抽可检索的关键证据，跟简述一起存。
//
// 纯规则、不调模型：下一轮判断时，候选池里「标签 —— 简述」后面挂一行关键词，
// 模型看到 `captureCommitTurns`、`manifest.json` 这类具体名字，比只读一句概括更容易归对。
// 这里不 import 任何东西，capture.js 与 topics.js 都可以用它。

export const ANCHOR_MAX = 8;
export const ANCHOR_MAX_CHARS = 40;

// 单个词没有信息量；大小写不敏感地丢掉。
const NOISE = new Set(["true", "false", "null", "undefined"]);

// 结尾标点不算锚点的一部分；保留括号内的形态（`foo()` 这类反引号内容不在这里处理）。
const TRAILING_PUNCT = /[\s，。；、！？：,.;:!?…—–~·"'“”‘’]+$/u;

/** 单个锚点归一：压空白、去尾标点、长度 / 噪声过滤，最后截到 40 字。 */
export function normalizeAnchor(text) {
  const value = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCT, "")
    .trim();
  if (!value) return "";
  if (Array.from(value).length < 2) return "";
  if (/^[\p{P}\p{S}\s]+$/u.test(value)) return "";
  if (NOISE.has(value.toLowerCase())) return "";
  return Array.from(value).slice(0, ANCHOR_MAX_CHARS).join("");
}

const FILE_RE =
  /(?:\/[\w.@+-]+)+\.[A-Za-z0-9]{1,8}\b|\b[\w@-]+(?:\/[\w@-]+)+\.[A-Za-z0-9]{1,8}\b|\b[\w@-]+(?:\.[\w@-]+)*\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|css|scss|html|yml|yaml|toml|py|sh|txt|log|vue|svelte)\b/g;
const BACKTICK_RE = /`([^`\n]{1,80})`/g;
const COMMAND_RE =
  /(?:^|\n)[ \t]*(?:[>$#][ \t]*)?((?:npm|npx|pnpm|yarn|git|node|python3?|pip3?|cargo|go|make|docker|kubectl|curl|wget|rsync|ssh|cd|ls|cat|grep|find|chmod|systemctl|journalctl)\b[^\n]*)/g;
const URL_RE = /https?:\/\/[^\s`"'<>]+/g;
const CODE_RE =
  /\b(?:ERR[A-Z0-9_]*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|v\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/g;

/**
 * 从消息里抽锚点。
 *
 * 输入可以是消息数组（取 content）或纯字符串数组；按「出现次数降序、次数相同按首次
 * 出现顺序」排，忽略大小写去重，最多 8 个、每个 40 字。简述空不空与这里无关。
 */
export function extractAnchors(messages) {
  const texts = (Array.isArray(messages) ? messages : [])
    .map((message) =>
      typeof message === "string" ? message : typeof message?.content === "string" ? message.content : "",
    )
    .filter(Boolean);
  const source = texts.join("\n");
  if (!source) return [];

  const counts = new Map();
  const firstAt = new Map();
  const labels = new Map();
  const record = (raw, position) => {
    const value = normalizeAnchor(raw);
    if (!value) return;
    const key = value.toLowerCase();
    if (!labels.has(key)) labels.set(key, value);
    counts.set(key, (counts.get(key) || 0) + 1);
    const at = Number.isFinite(position) ? position : source.length;
    if (!firstAt.has(key) || at < firstAt.get(key)) firstAt.set(key, at);
  };

  // URL 里的 /example.com 不是文件路径：先摘掉 URL 再抽路径，避免假阳性。
  const withoutUrls = source.replace(URL_RE, " ");
  for (const match of withoutUrls.matchAll(FILE_RE)) record(match[0], match.index);
  for (const match of source.matchAll(BACKTICK_RE)) record(match[1], match.index);
  for (const match of source.matchAll(COMMAND_RE)) record(match[1], match.index);
  for (const match of source.matchAll(URL_RE)) record(match[0], match.index);
  for (const match of source.matchAll(CODE_RE)) record(match[0], match.index);

  return [...counts.keys()]
    .map((key) => ({ key, count: counts.get(key), first: firstAt.get(key) }))
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, ANCHOR_MAX)
    .map((entry) => labels.get(entry.key));
}

/**
 * 合并旧锚点与新锚点：各按出现一次计，去重后重算频次（旧的若也在新一段出现，
 * 次数会叠上去），再取前 8。旧表里没有 anchors 字段时按空数组处理。
 */
export function mergeAnchors(existing, incoming) {
  const counts = new Map();
  const labels = new Map();
  const firstAt = new Map();
  const add = (raw) => {
    const value = normalizeAnchor(raw);
    if (!value) return;
    const key = value.toLowerCase();
    if (!labels.has(key)) labels.set(key, value);
    if (!firstAt.has(key)) firstAt.set(key, firstAt.size);
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  for (const item of Array.isArray(existing) ? existing : []) add(item);
  for (const item of Array.isArray(incoming) ? incoming : []) add(item);
  return [...counts.keys()]
    .map((key) => ({ key, count: counts.get(key), first: firstAt.get(key) }))
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, ANCHOR_MAX)
    .map((entry) => labels.get(entry.key));
}

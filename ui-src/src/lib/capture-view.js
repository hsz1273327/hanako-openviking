// 写回界面共用的纯函数：记忆共享页（机器级设置）与侧边栏会话卡（本会话四行）。
//
// 不 import vue，也不碰网络：冒烟可以直接跑，组件只负责排版与绑定。
// 两个页面的边界不能混：
//   - 设置页只放机器级配置，不出现「本会话 / 上次提交 / 待提交」；
//   - 会话卡只放当前对话的状态，不出现策略 / 模型 / 服务地址。

export const CAPTURE_EMPTY = "暂无";

/**
 * 判断题面的字符上限：与后端 src/ov/settings.js 的 CAPTURE_PROMPT_MAX
 * （= GATE_PROMPT_MAX，2000）同值。面板加载不了 Node 模块，只能在这里存一份，
 * 冒烟会断言两边相等。
 */
export const CAPTURE_PROMPT_MAX = 2000;

/** 题面骨架模板的字符上限：与后端 src/ov/settings.js 的 CAPTURE_TEMPLATE_MAX 同值。 */
export const CAPTURE_TEMPLATE_MAX = 4000;

/**
 * 内置默认题面。与 src/memory/capture.js 的 CAPTURE_TOPIC_QUESTION 逐字一致
 * （冒烟比对两边）。配置 capturePrompt 为空时就是它。
 */
export const DEFAULT_CAPTURE_PROMPT = [
  "下面有几个已知话题，和一段新的对话。",
  "",
  "先判断这段对话在讲什么，给它起个名字，再决定它属于哪个话题。",
  "",
  "名字要像标题，30 个字以内，不要路径、命令、代码或 markdown 符号。",
  "简述按要素写，讲清楚就行，不要为了写长而铺陈。500 个字是上限，不是要求。",
].join("\n");

/** 与后端 normalizeCapturePrompt 同一口径：非字符串 / 空 → 空串，否则按字符截断。 */
export function normalizeCapturePrompt(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, CAPTURE_PROMPT_MAX).join("");
}

/**
 * textarea 里该显示什么。
 *
 * 配置为空时把默认题面整段填进去当草稿：placeholder 一敲键盘就消失，
 * 而人很可能就是拿默认这份当底稿直接改。
 * touched 为真（用户动过或已经提交过空值）就不再拿默认去盖他。
 */
export function capturePromptDraft(configValue, touched = false) {
  const value = normalizeCapturePrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_CAPTURE_PROMPT;
}

/** 题面旁边那行小字：默认 / 已修改 / 空（回内置默认）。 */
export function capturePromptStatus(text) {
  const value = normalizeCapturePrompt(text);
  if (value === DEFAULT_CAPTURE_PROMPT) return "当前为默认题面";
  if (!value.trim()) return "已修改 · 题面为空时使用内置默认";
  return "已修改";
}

/**
 * 内置默认骨架。与 src/ov/prompt-defaults.js 的 DEFAULT_CAPTURE_TEMPLATE 逐字一致
 * （冒烟比对两边）。配置 captureTemplate 为空时就是它。
 */
export const DEFAULT_CAPTURE_TEMPLATE = [
  "{{question}}",
  "",
  "已有话题：",
  "{{candidates}}",
  "",
  "之前（供参考）：",
  "{{previous}}",
  "",
  "对话：",
  "{{current}}",
  "",
  "{{format}}",
].join("\n");

/** 与后端 normalizeCaptureTemplate 同一口径：非字符串 / 空 → 空串，否则按字符截断。 */
export function normalizeCaptureTemplate(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, CAPTURE_TEMPLATE_MAX).join("");
}

/** textarea 里该显示什么：空配置坐默认模板当草稿，touched 之后不再盖。 */
export function captureTemplateDraft(configValue, touched = false) {
  const value = normalizeCaptureTemplate(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_CAPTURE_TEMPLATE;
}

/** 模板旁边那行小字：默认 / 已修改 / 空（回内置默认）。 */
export function captureTemplateStatus(text) {
  const value = normalizeCaptureTemplate(text);
  if (value === DEFAULT_CAPTURE_TEMPLATE) return "当前为默认模板";
  if (!value.trim()) return "已修改 · 模板为空时使用内置默认";
  return "已修改";
}

/** 强制轮数 / 上下文轮数 / 最少轮数 / 候选池 / 空闲秒数的范围：与后端路由 / manifest 同一组边界。 */
export const CAPTURE_TURNS_RANGE = Object.freeze([1, 100]);
export const CAPTURE_CONTEXT_RANGE = Object.freeze([1, 20]);
export const CAPTURE_MIN_RANGE = Object.freeze([1, 50]);
export const CAPTURE_TOPIC_CANDIDATES_RANGE = Object.freeze([1, 20]);
export const CAPTURE_IDLE_RANGE = Object.freeze([60, 86400]);

/** 回落原因里的配置键 → 人话。 */
export const CAPTURE_MISSING_LABELS = Object.freeze({
  captureServiceUrl: "判别服务地址",
  systemoneServiceModel: "决策服务模型",
});

function formatTimestamp(value) {
  if (value == null) return "";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString("zh-CN");
  } catch {
    return "";
  }
}

function formatCount(value) {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.floor(n));
}

/**
 * 会话卡四行的文字。
 *
 * opts.active === false（没有活动会话）、opts.autoCapture === false（写回关着）
 * 或整份数据缺项时，四行一律占位并置灰。单条字段缺失只让那一行占位，
 * 不把整块拖成不可用。
 */
export function captureStatusView(data, opts = {}) {
  const hasData = Boolean(data) && typeof data === "object";
  const off = opts.active === false || opts.autoCapture === false || !hasData;
  if (off) {
    return {
      written: CAPTURE_EMPTY,
      lastCommit: CAPTURE_EMPTY,
      pending: CAPTURE_EMPTY,
      topics: CAPTURE_EMPTY,
      disabled: true,
    };
  }

  const writtenCount = formatCount(data.written);
  const lastCommit = formatTimestamp(data.lastCommitAt);
  const pendingCount = formatCount(data.pendingTurns);
  const topicCount = formatCount(data.topics);
  return {
    written: writtenCount !== "" ? `${writtenCount} 条` : CAPTURE_EMPTY,
    lastCommit: lastCommit || CAPTURE_EMPTY,
    pending: pendingCount !== "" ? `${pendingCount} 轮` : CAPTURE_EMPTY,
    topics: topicCount !== "" ? `${topicCount} 个` : CAPTURE_EMPTY,
    disabled: false,
  };
}

/** 给 CardApp 直接 v-for 的四行；label 是固定的四件套。 */
export function captureStatusRows(data, opts = {}) {
  const view = captureStatusView(data, opts);
  return [
    { key: "written", label: "本会话已写", value: view.written },
    { key: "lastCommit", label: "上次提交", value: view.lastCommit },
    { key: "pending", label: "待提交", value: view.pending },
    { key: "topics", label: "本会话话题数", value: view.topics },
  ];
}

/**
 * 设置页的提示：提前提交存着开着，但判断方式缺配置，所以这一轮没生效。
 * 开关本身关着（或已经生效）时不提示。
 */
export function captureFallbackNote(config) {
  if (!config || typeof config !== "object") return "";
  if (config.early === true || config.earlyStored !== true) return "";
  const missing = (Array.isArray(config.missing) ? config.missing : [])
    .map((key) => CAPTURE_MISSING_LABELS[key] || String(key || ""))
    .filter(Boolean);
  return missing.length
    ? `当前不提前提交：还缺 ${missing.join("、")}`
    : "当前不提前提交";
}

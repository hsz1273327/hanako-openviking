// 写回界面共用的纯函数：记忆共享页（机器级设置）与侧边栏会话卡（本会话三行）。
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

/**
 * 内置默认题面。与 src/memory/capture.js 的 CAPTURE_TOPIC_QUESTION 逐字一致
 * （冒烟比对两边）。配置 capturePrompt 为空时就是它。
 */
export const DEFAULT_CAPTURE_PROMPT = "只看下面这两段，它们是不是在讲同一件事？只回 yes 或 no。";

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

/** 固定轮次 / 判据上下文 / 最少触发轮数与空闲秒数的范围：与后端路由 / manifest 同一组边界。 */
export const CAPTURE_TURNS_RANGE = Object.freeze([1, 100]);
export const CAPTURE_CONTEXT_RANGE = Object.freeze([1, 20]);
export const CAPTURE_MIN_RANGE = Object.freeze([1, 50]);
export const CAPTURE_IDLE_RANGE = Object.freeze([60, 86400]);

/** 三档标签与 manifest 的 ui.enumLabels 逐字一致。 */
export const captureModeLabels = Object.freeze({
  fixed: "固定轮次",
  llm: "语言模型判断",
  discriminator: "判别模型判断",
});

export function captureModeOptions() {
  return ["fixed", "llm", "discriminator"].map((value) => ({
    value,
    label: captureModeLabels[value],
  }));
}

/** 回落原因里的配置键 → 人话。 */
export const CAPTURE_MISSING_LABELS = Object.freeze({
  captureModel: "判断模型",
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
 * 会话卡三行的文字。
 *
 * opts.active === false（没有活动会话）、opts.autoCapture === false（写回关着）
 * 或整份数据缺项时，三行一律占位并置灰。单条字段缺失只让那一行占位，
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
      disabled: true,
    };
  }

  const writtenCount = formatCount(data.written);
  const lastCommit = formatTimestamp(data.lastCommitAt);
  const pendingCount = formatCount(data.pendingTurns);
  return {
    written: writtenCount !== "" ? `${writtenCount} 条` : CAPTURE_EMPTY,
    lastCommit: lastCommit || CAPTURE_EMPTY,
    pending: pendingCount !== "" ? `${pendingCount} 轮` : CAPTURE_EMPTY,
    disabled: false,
  };
}

/** 给 CardApp 直接 v-for 的三行；label 是固定的三件套。 */
export function captureStatusRows(data, opts = {}) {
  const view = captureStatusView(data, opts);
  return [
    { key: "written", label: "本会话已写", value: view.written },
    { key: "lastCommit", label: "上次提交", value: view.lastCommit },
    { key: "pending", label: "待提交", value: view.pending },
  ];
}

/**
 * 设置页的回落提示：存的档位与真正生效的档不一致时，说清缺什么。
 * 两档一致（或还没读到服务端投影）时返回空串。
 */
export function captureFallbackNote(config) {
  if (!config || typeof config !== "object") return "";
  if (!config.mode || !config.effectiveMode || config.effectiveMode === config.mode) return "";
  const missing = (Array.isArray(config.missing) ? config.missing : [])
    .map((key) => CAPTURE_MISSING_LABELS[key] || String(key || ""))
    .filter(Boolean);
  return missing.length
    ? `当前回落到固定轮次：还缺 ${missing.join("、")}`
    : "当前回落到固定轮次";
}

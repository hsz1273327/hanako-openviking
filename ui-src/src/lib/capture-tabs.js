// 记忆共享页的三个子页签：写回 / 存量会话 / 话题。
// 纯逻辑、无依赖：组件里由 CapturePanel 用，node 里冒烟直接 import。
//
// 子页签只是本页的视图状态，不进 store、不落 storage：切页签不触发任何
// 读 / 写 / 重算（BackfillBlock 与 TopicBlock 的数据都在各自挂载时拉一次，
// 三块始终挂载，切页签只切 hidden）。
// 与 lib/tabs.js 分开是因为两者语义不同：主页面签要记忆（localStorage），
// 子页签每次都从默认页开始——与记忆页的 lib/memory-tabs.js 同一套规矩。
//
// 顺序照读页面的人往下走的顺序：先看开关怎么配（写回）→ 再把历史补上去（存量会话）
// → 最后看这些段被归成了哪些事（话题）。

export const CAPTURE_TABS = Object.freeze(["writeback", "backfill", "topics"]);
export const CAPTURE_TAB_LABELS = Object.freeze({
  writeback: "写回",
  backfill: "存量会话",
  topics: "话题",
});
export const DEFAULT_CAPTURE_TAB = "writeback";

/** 只认三个已知子页名，其余（空、旧值、大小写变体）一律回写回。 */
export function normalizeCaptureTab(value) {
  return CAPTURE_TABS.includes(value) ? value : DEFAULT_CAPTURE_TAB;
}

/** 当前子页是否可见：同一时刻只有一个是 true。 */
export function capturePaneVisible(active, name) {
  return normalizeCaptureTab(active) === name;
}

/** 子页签的键盘换页：左右循环，Home / End 到首尾，别的键返回 null。 */
export function nextCaptureTab(tab, key) {
  const index = CAPTURE_TABS.indexOf(normalizeCaptureTab(tab));
  if (key === "ArrowRight") return CAPTURE_TABS[(index + 1) % CAPTURE_TABS.length];
  if (key === "ArrowLeft") return CAPTURE_TABS[(index - 1 + CAPTURE_TABS.length) % CAPTURE_TABS.length];
  if (key === "Home") return CAPTURE_TABS[0];
  if (key === "End") return CAPTURE_TABS[CAPTURE_TABS.length - 1];
  return null;
}

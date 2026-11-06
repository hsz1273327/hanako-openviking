// 记忆页的五个子页签：召回 / 去重 / 精排 / 组装 / 候选池。
// 纯逻辑、无依赖：组件里由 MemoryPanel 用，node 里冒烟直接 import。
//
// 子页签只是本页的视图状态，不进 store、不落 storage：切页签不触发任何
// 读 / 写 / 重算，草稿与提示位由五个子组件共享的那一份 store 保管。
// 与 lib/tabs.js 分开是因为两者语义不同：主页面签要记忆（localStorage），
// 子页签每次都从默认页开始。
//
// 顺序就是链路的顺序：查不查（召回）→ 拿回来的怎么筛（去重）→ 怎么排（精排）
// → 怎么拼（组装）→ 谁能进来（候选池）。

export const MEMORY_TABS = Object.freeze(["recall", "dedupe", "rerank", "assemble", "peers"]);
export const MEMORY_TAB_LABELS = Object.freeze({
  recall: "召回",
  dedupe: "去重",
  rerank: "精排",
  assemble: "组装",
  peers: "候选池",
});
export const DEFAULT_MEMORY_TAB = "recall";

/** 只认五个已知子页名，其余（空、旧值、大小写变体）一律回召回。 */
export function normalizeMemoryTab(value) {
  return MEMORY_TABS.includes(value) ? value : DEFAULT_MEMORY_TAB;
}

/** 当前子页是否可见：同一时刻只有一个是 true。 */
export function memoryPaneVisible(active, name) {
  return normalizeMemoryTab(active) === name;
}

/** 子页签的键盘换页：左右循环，Home / End 到首尾，别的键返回 null。 */
export function nextMemoryTab(tab, key) {
  const index = MEMORY_TABS.indexOf(normalizeMemoryTab(tab));
  if (key === "ArrowRight") return MEMORY_TABS[(index + 1) % MEMORY_TABS.length];
  if (key === "ArrowLeft") return MEMORY_TABS[(index - 1 + MEMORY_TABS.length) % MEMORY_TABS.length];
  if (key === "Home") return MEMORY_TABS[0];
  if (key === "End") return MEMORY_TABS[MEMORY_TABS.length - 1];
  return null;
}

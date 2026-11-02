// 面板标签页的名字与「上次停在哪一页」的记忆。
// 纯逻辑、无依赖：浏览器里由 panel.js 用，node 里冒烟直接 import。

export const TAB_KEY = "hanako-openviking:tab";
export const TABS = ["global", "memory", "skill"];
export const DEFAULT_TAB = "global";

/** 只认三个已知页名，其余（空、旧值、大小写变体）一律回默认页。 */
export function normalizeTab(value) {
  return TABS.includes(value) ? value : DEFAULT_TAB;
}

/** 读上次停的页。没有 storage、读不到、读本身抛错，都回默认页。 */
export function readTab(storage) {
  try {
    return normalizeTab(storage?.getItem?.(TAB_KEY));
  } catch {
    return DEFAULT_TAB;
  }
}

/** 记住当前页。写不进去（隐私模式 / 配额满）不该影响切页本身。 */
export function writeTab(storage, value) {
  try {
    storage?.setItem?.(TAB_KEY, normalizeTab(value));
  } catch {
    // 记忆只是锦上添花，吞掉即可。
  }
}

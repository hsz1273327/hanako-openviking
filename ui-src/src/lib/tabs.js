// 面板标签页的名字与「上次停在哪一页」的记忆。
// 纯逻辑、无依赖：浏览器里由 panel.js 用，node 里冒烟直接 import。

export const TAB_KEY = "hanako-openviking:tab";
export const TABS = ["global", "memory", "capture", "skill", "logs"];
export const DEFAULT_TAB = "global";

/** 只认五个已知页名，其余（空、旧值、大小写变体）一律回默认页。 */
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

/**
 * 键盘换页：左右在一圈里循环，Home 回第一页，End 去最后一页。
 * 别的键返回 null（调用方据此不 preventDefault）。
 */
export function nextTab(tab, key) {
  const index = TABS.indexOf(tab);
  if (key === "ArrowRight") return TABS[(index + 1) % TABS.length];
  if (key === "ArrowLeft") return TABS[(index - 1 + TABS.length) % TABS.length];
  if (key === "Home") return TABS[0];
  if (key === "End") return TABS[TABS.length - 1];
  return null;
}

/** 记住当前页。写不进去（隐私模式 / 配额满）不该影响切页本身。 */
export function writeTab(storage, value) {
  try {
    storage?.setItem?.(TAB_KEY, normalizeTab(value));
  } catch {
    // 记忆只是锦上添花，吞掉即可。
  }
}

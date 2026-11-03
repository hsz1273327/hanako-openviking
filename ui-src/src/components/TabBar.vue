<script setup>
// 三页标签：点一下切页并记住；左右方向键 / Home / End 也能换，焦点跟着走。
//
// 纯逻辑（键名、默认页、非法值回退、读写 storage 的容错）在 lib/tabs.js，
// 这里只管按键与 aria。切页不触发任何读 / 写 / 重算（见行为清单第 10 条）。
import { nextTick, ref } from "vue";
import { TABS } from "../lib/tabs.js";

const LABELS = Object.freeze({
  global: "全局配置",
  memory: "记忆配置",
  skill: "共享技能",
});

const props = defineProps({
  active: { type: String, default: "global" },
});
const emit = defineEmits(["select"]);

// 键盘切换之后要把焦点挪到新标签上，否则方向键按到第二次就丢了。
// 用容器 + id 查节点，比给每个按钮挂函数 ref 稳：按钮本身会随选中态重渲染。
const listEl = ref(null);

function select(name) {
  emit("select", name);
}

function nextTabOf(tab, key) {
  const index = TABS.indexOf(tab);
  if (key === "ArrowRight") return TABS[(index + 1) % TABS.length];
  if (key === "ArrowLeft") return TABS[(index - 1 + TABS.length) % TABS.length];
  if (key === "Home") return TABS[0];
  if (key === "End") return TABS[TABS.length - 1];
  return null;
}

function onKeydown(event, tab) {
  const next = nextTabOf(tab, event.key);
  if (!next) return;
  event.preventDefault();
  select(next);
  // 等 Vue 把选中态（tabindex）刷到新标签上再聚焦。
  nextTick(() => listEl.value?.querySelector(`#tab-${next}`)?.focus?.());
}
</script>

<template>
  <!-- 三个中文标签窄屏也放得下一行：等分宽度、绝不换行（.tabs / .tab）。 -->
  <div ref="listEl" class="tabs" role="tablist" aria-label="配置分类">
    <button
      v-for="tab in TABS"
      :id="`tab-${tab}`"
      :key="tab"
      class="tab"
      type="button"
      role="tab"
      :data-tab="tab"
      :aria-selected="props.active === tab ? 'true' : 'false'"
      :tabindex="props.active === tab ? 0 : -1"
      :aria-controls="`panel-${tab}`"
      @click="select(tab)"
      @keydown="onKeydown($event, tab)"
    >
      {{ LABELS[tab] }}
    </button>
  </div>
</template>

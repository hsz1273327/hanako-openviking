<script setup>
// 四页标签：点一下切页并记住；左右方向键 / Home / End 也能换，焦点跟着走。
//
// 纯逻辑（键名、默认页、非法值回退、键盘换页、读写 storage 的容错）在 lib/tabs.js，
// 这里只管绑定按键与 aria。切页不触发任何读 / 写 / 重算（见行为清单第 10 条）。
//
// 为什么不用 n-tabs：n-tabs 的标签是它自己生成的节点，无法同时保留
//   id="tab-<name>" / aria-controls / aria-labelledby / data-tab 与 roving tabindex
// 这套现有契约 —— 换过去只会让 App.vue 里四个 role="tabpanel" 的标注脱钩。
// 所以标签栏继续手写 <button role="tab">，样式只留等分 / nowrap / 选中态 / focus 环
// （不画渐变，也不模拟卡片边框：那是 n-card 的活）。
import { nextTick, ref } from "vue";
import { TABS, nextTab } from "../lib/tabs.js";

const LABELS = Object.freeze({
  global: "全局配置",
  memory: "记忆配置",
  skill: "共享技能",
  logs: "日志",
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

function onKeydown(event, tab) {
  const next = nextTab(tab, event.key);
  if (!next) return;
  event.preventDefault();
  select(next);
  // 等 Vue 把选中态（tabindex）刷到新标签上再聚焦。
  nextTick(() => listEl.value?.querySelector(`#tab-${next}`)?.focus?.());
}
</script>

<template>
  <!-- 四个中文标签窄屏也放得下一行：等分宽度（flex: 1 1 0）、绝不换行（.tabs / .tab）。
       宽度账：.page 左右各 16px、标签栏三处 4px 间隙，所以每格 = (宽 − 44) / 4；
       560px 时约 129px、760px 时约 179px，减去 20px 内边距还剩 109 / 159px，
       而最长标签「全局配置」四个 12px 汉字约 48px。够用。
       极限在 ~316px 视口（4 × 48 + 4 × 20 + 12 + 32），更窄时 nowrap 会溢出：
       那时仍不改字号、不换行（等分 + nowrap 是有意的取舍）。 -->
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

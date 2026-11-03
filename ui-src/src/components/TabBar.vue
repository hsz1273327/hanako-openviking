<script setup>
// 四页标签：点一下切页并记住；左右方向键 / Home / End 也能换，焦点跟着走。
//
// 纯逻辑（键名、默认页、非法值回退、键盘换页、读写 storage 的容错）在 lib/tabs.js，
// 这里只管绑定按键与 aria。切页不触发任何读 / 写 / 重算（见行为清单第 10 条）。
//
// 为什么是 n-tabs 并且还要自己挂 aria：
//   naive-ui 2.45 的 tabs 只画一个 div（data-name），不输出 role / aria，也没有
//   keydown 处理（node_modules/naive-ui/es/tabs/src/Tabs.mjs 与 Tab.mjs 全文没有
//   ArrowLeft / ArrowRight / Home / End）。所以 role、id、aria-controls、
//   aria-selected、data-tab、roving tabindex 与键盘映射全部由这里补上。
//   Tab.mjs 的渲染是 mergeProps({ class, onClick, style }, this.$attrs)，
//   自己写 <NTab> 子节点时走 $attrs 那一支，且我们传的属性排在后面（优先），
//   所以这些属性会落到真正带 data-name 的 tab div 上。
//
// 形态用 type="line" 而不是 segment：标签栏在页头，下面已经是浅底 + 无边框卡片；
// segment 会再叠一层灰胶囊容器，等于第三层容器。line 只有文字 + 品牌色下划线。
// justifyContent 用 space-evenly：四个标签按内容宽度散开，不强行等分。
import { nextTick } from "vue";
import { NTab, NTabs } from "naive-ui";
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

function select(name) {
  emit("select", name);
}

function onKeydown(event, tab) {
  const next = nextTab(tab, event.key);
  if (!next) return;
  event.preventDefault();
  select(next);
  // 等 Vue 把选中态（tabindex）刷到新标签上再聚焦。标签根节点是内层 div，
  // 从当前事件节点往上找 .n-tabs，比给每个 NTab 挂函数 ref 更稳。
  const root = event.currentTarget?.closest?.(".n-tabs");
  nextTick(() => root?.querySelector(`#tab-${next}`)?.focus?.());
}
</script>

<template>
  <!-- 一个 tablist 里四个 role=tab。n-tabs 不生成这些语义，所以挂在这里。 -->
  <NTabs
    class="tabs"
    type="line"
    size="small"
    role="tablist"
    aria-label="配置分类"
    :value="props.active"
    justify-content="space-evenly"
    @update:value="select"
  >
    <NTab
      v-for="tab in TABS"
      :key="tab"
      :name="tab"
      :id="`tab-${tab}`"
      role="tab"
      :aria-controls="`panel-${tab}`"
      :aria-selected="props.active === tab ? 'true' : 'false'"
      :tabindex="props.active === tab ? 0 : -1"
      :data-tab="tab"
      @keydown="onKeydown($event, tab)"
    >
      {{ LABELS[tab] }}
    </NTab>
  </NTabs>
</template>

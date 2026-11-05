<script setup>
// 记忆配置页：按会话说明 → [召回 / 精排 / 候选池] 三个子页签 → 页面级提示位。
//
// 这一页没有按会话的开关：召回判断 / 查询 / 精排跟上面两个开关一样按整台机器算，
// 改了即时生效；按会话的那几项（召回范围等）在对话右侧的 OpenViking 卡片里。
//
// 拆卡是有意的：召回管「查不查、拿什么查」，精排管「查回来之后怎么排序」，
// 候选池管「谁能进来」——三件事三张卡，但竖排一屏放不下，所以改成同页三个子页签。
// 整单提交靠 lib/panel-store.js 的 readLayers()（每个组件都只调 store 的
// setForm / setPrompt，各卡各发各的那是错）。
//
// 三块**始终挂载**，只用 hidden 切显隐（与 App.vue 的四个主页面签同一做法）：
// 切走再切回来，输入中的草稿、已填未提交的值、提示位都还在。
// 子页签本身只是本页视图状态（lib/memory-tabs.js），不进 store、不落 storage。
//
// 高度：子页容器吃满剩余高度。召回 / 精排的内容比一屏高时由子页自己滚，
// 候选池卡的滚动交给卡内的 PeerList（见 panel.css 的 .memory-pane 那组规则）。
import { nextTick, ref } from "vue";
import { NCard, NTab, NTabs } from "naive-ui";
import { usePeers } from "../composables/usePeers.js";
import { useConfig } from "../composables/useConfig.js";
import {
  DEFAULT_MEMORY_TAB,
  MEMORY_TAB_LABELS,
  MEMORY_TABS,
  memoryPaneVisible,
  nextMemoryTab,
  normalizeMemoryTab,
} from "../lib/memory-tabs.js";
import RecallCard from "./RecallCard.vue";
import RerankCard from "./RerankCard.vue";
import PeerList from "./PeerList.vue";

const { state } = useConfig();
const { count: peerCountText } = usePeers();

// 子页签只是本页视图状态，不进 store、不触发任何读 / 写 / 重算。
const activeTab = ref(DEFAULT_MEMORY_TAB);

function selectTab(name) {
  activeTab.value = normalizeMemoryTab(name);
}

function onTabKeydown(event, name) {
  const next = nextMemoryTab(name, event.key);
  if (!next) return;
  event.preventDefault();
  selectTab(next);
  // 等 Vue 把选中态（tabindex）刷到新标签上再聚焦。标签根节点是内层 div，
  // 从当前事件节点往上找 .n-tabs，比给每个 NTab 挂函数 ref 更稳。
  const root = event.currentTarget?.closest?.(".n-tabs");
  nextTick(() => root?.querySelector(`#memory-tab-${next}`)?.focus?.());
}
</script>

<template>
  <p class="scoped-note">
    记忆召回、写回、只读、召回范围是<b>按会话</b>算的，在这段对话右侧的 OpenViking 卡片里改。
  </p>

  <!-- 三个子页签：line + small，不叠第三层容器；aria 由这里补（n-tabs 不输出语义）。 -->
  <NTabs
    class="memory-tabs"
    type="line"
    size="small"
    role="tablist"
    aria-label="记忆配置分区"
    :value="activeTab"
    justify-content="space-evenly"
    @update:value="selectTab"
  >
    <NTab
      v-for="name in MEMORY_TABS"
      :key="name"
      :name="name"
      :id="`memory-tab-${name}`"
      role="tab"
      :aria-controls="`memory-panel-${name}`"
      :aria-selected="activeTab === name ? 'true' : 'false'"
      :tabindex="activeTab === name ? 0 : -1"
      :data-memory-tab="name"
      @keydown="onTabKeydown($event, name)"
    >
      {{ MEMORY_TAB_LABELS[name] }}
    </NTab>
  </NTabs>

  <!-- 三块始终挂载：切页签只切 hidden，草稿与提示位不会因为重建而丢。 -->
  <div class="memory-tabs-body">
    <div
      id="memory-panel-recall"
      class="memory-pane"
      role="tabpanel"
      aria-labelledby="memory-tab-recall"
      :hidden="!memoryPaneVisible(activeTab, 'recall')"
    >
      <RecallCard />
    </div>
    <div
      id="memory-panel-rerank"
      class="memory-pane"
      role="tabpanel"
      aria-labelledby="memory-tab-rerank"
      :hidden="!memoryPaneVisible(activeTab, 'rerank')"
    >
      <RerankCard />
    </div>
    <div
      id="memory-panel-peers"
      class="memory-pane"
      role="tabpanel"
      aria-labelledby="memory-tab-peers"
      :hidden="!memoryPaneVisible(activeTab, 'peers')"
    >
      <!-- 候选池：谁能进召回范围。卡片吃满子页高度，名单在卡内自己滚。 -->
      <NCard
        class="peers-card"
        size="small"
        title="候选池"
        :bordered="false"
        header-style="padding: 4px 16px"
        content-style="padding: 16px"
      >
        <template #header-extra>
          <span id="peerCount" class="peer-count">{{ peerCountText }}</span>
        </template>

        <PeerList />
      </NCard>
    </div>
  </div>

  <!-- 提示位在一页的底部：这一页上的写入（peer 排除 / 召回策略）如果只在
       全局页报错，用户在这一页根本看不见。文案与全局页同源（store.note）。 -->
  <p class="save-hint" :class="{ ok: !state.note.bad, bad: state.note.bad }">{{ state.note.text }}</p>
</template>

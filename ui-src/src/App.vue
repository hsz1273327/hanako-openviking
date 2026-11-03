<script setup>
// 面板根组件：主题 + 顶部身份条 + 标签栏 + 四页 + 页脚。
//
// 结构对应手写的 ui/panel.html，一屏布局的契约没变：
//   .page（定高、不自滚）→ .top / .tabs / .tab-panel / .foot
// 四页**始终挂载**，只用 hidden 切显隐：切页不重算、不重读、不丢输入中的内容。
// 这也意味着隐藏页里的节点照旧存在（peer 名单 / 通道行都在内存里）。
//
// 主题：宿主是亮色，用 theme.js 的 lightThemeOverrides，不引 darkTheme（见该文件注释）。
// 断点：n-grid 的 responsive="screen" 按断点表取名，表在 lib/grid-breakpoints.js
// （键就是像素阈值 0 / 520 / 700），所以组件里能直接写 cols="1 700:2"。
// 布局 / 配色一律留在 ui/assets/panel.css，SFC 里不写 <style>。
import { computed, onMounted, ref } from "vue";
import { NButton, NConfigProvider, NTag, zhCN } from "naive-ui";
import GlobalPanel from "./components/GlobalPanel.vue";
import LogsPanel from "./components/LogsPanel.vue";
import MemoryPanel from "./components/MemoryPanel.vue";
import SkillPanel from "./components/SkillPanel.vue";
import TabBar from "./components/TabBar.vue";
import { lightThemeOverrides } from "./theme.js";
import { BREAKPOINTS } from "./lib/grid-breakpoints.js";
import { DEFAULT_TAB, normalizeTab, readTab, writeTab } from "./lib/tabs.js";
import { appReady } from "./api.js";
import { useConfig } from "./composables/useConfig.js";
import { useStatus } from "./composables/useStatus.js";

const { refresh } = useConfig();
const { view, foot } = useStatus();

// localStorage 只在浏览器里有；取不到（隐私模式 / 被禁）就当没有记忆。
function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// 上次停在哪一页：非法值 / 读不到一律回默认页（lib/tabs.js）。
const tab = ref(readTab(safeLocalStorage()));

function selectTab(name) {
  const active = normalizeTab(name ?? DEFAULT_TAB);
  tab.value = active;
  // 切页只决定哪一块可见，不触发任何读 / 写 / 重算。
  writeTab(safeLocalStorage(), active);
}

const refreshing = ref(false);
const testing = ref(false);

async function onRefresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await refresh();
  } finally {
    refreshing.value = false;
  }
}

async function onTest() {
  if (testing.value) return;
  testing.value = true;
  try {
    await refresh({ note: "已重新探测" });
  } finally {
    testing.value = false;
  }
}

const dotClass = computed(() => view.value.dotClass);

// 状态药丸的档位（ok / down / ""）→ NTag 的 type。三档一张表，不在模板里写 ? :。
const PILL_TYPE = Object.freeze({ ok: "success", down: "error" });
const pillType = computed(() => PILL_TYPE[view.value.pillTone]);

onMounted(() => {
  appReady();
  // 先摆好上次停的页（上面已经读好了），再开始读数据：
  // 默认页是 global，读不到也一样。
  refresh();
});
</script>

<template>
  <!-- abstract：不额外包一层 div，挂载点里直接就是 .page。 -->
  <!-- zhCN：不传 locale 时 naive-ui 用默认的 enUS，空着的输入框会显示
       "Please Input"、下拉显示 "Please Select"。中文占位文案是组件的底线，
       不是某一页的装饰，所以每一条文案都自己写（见各组件），locale 只是兜底。 -->
  <NConfigProvider
    abstract
    :locale="zhCN"
    :theme-overrides="lightThemeOverrides"
    :breakpoints="BREAKPOINTS"
  >
    <main class="page" data-hana-app-ui>
      <header class="top">
        <div class="ident">
          <span id="dot" :class="dotClass" aria-hidden="true"></span>
          <div class="ident-text">
            <div class="ident-line">
              <h1 class="title">OpenViking</h1>
              <NTag id="statePill" size="small" round :type="pillType">{{ view.pillText }}</NTag>
            </div>
            <p id="subLine" class="sub">{{ view.subLine }}</p>
          </div>
        </div>
        <div class="top-actions">
          <NButton id="testBtn" size="small" type="primary" :disabled="testing" @click="onTest">
            {{ testing ? "测试中…" : "测试连接" }}
          </NButton>
          <NButton
            id="refreshBtn"
            size="small"
            quaternary
            :disabled="refreshing"
            @click="onRefresh"
          >
            刷新
          </NButton>
        </div>
      </header>

      <TabBar :active="tab" @select="selectTab" />

      <!-- 四页共用顶部身份条与页脚；标签只决定中间哪一块可见，不引入路由。 -->
      <div
        id="panel-global"
        class="tab-panel"
        role="tabpanel"
        aria-labelledby="tab-global"
        :hidden="tab !== 'global'"
      >
        <GlobalPanel />
      </div>
      <div
        id="panel-memory"
        class="tab-panel"
        role="tabpanel"
        aria-labelledby="tab-memory"
        :hidden="tab !== 'memory'"
      >
        <MemoryPanel />
      </div>
      <div
        id="panel-skill"
        class="tab-panel"
        role="tabpanel"
        aria-labelledby="tab-skill"
        :hidden="tab !== 'skill'"
      >
        <SkillPanel />
      </div>
      <div
        id="panel-logs"
        class="tab-panel"
        role="tabpanel"
        aria-labelledby="tab-logs"
        :hidden="tab !== 'logs'"
      >
        <LogsPanel />
      </div>

      <footer id="foot" class="foot">{{ foot }}</footer>
    </main>
  </NConfigProvider>
</template>

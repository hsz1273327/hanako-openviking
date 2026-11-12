<script setup>
// 记忆共享页：三个子页签 [写回 / 存量会话 / 话题]。
//
// 一页三块竖排太长了（写回设置一屏、存量会话一张长表、话题一张表），所以照
// MemoryPanel 那套拆成同页三个子页签：栏是 NTabs line + small，三块**始终挂载**
// 只用 hidden 切显隐——补交进度、话题的编辑态、提示位切走再切回来都还在。
// 子页签本身只是本页视图状态（lib/capture-tabs.js），不进 store、不落 storage。
//
// 会话级进度在侧边栏会话卡里，不在这一页出现：换一个窗口看一眼
// 就不该串到别人头上。
//
// 所有控件都真的绑到 state.form 并走 store 的提交口：
//   setCaptureForm  —— 下拉 / 开关 / 地址（立即整单提交）
//   setCaptureNumber —— 数字格（收敛到范围后提交；清空不提交）
// 失败由 store 回滚到上一次服务端确认的值，并在页面提示位报错。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { computed, nextTick, ref, watch } from "vue";
import {
  NButton,
  NCard,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NTab,
  NTabPane,
  NTabs,
  NText,
} from "naive-ui";
import {
  CAPTURE_TAB_LABELS,
  CAPTURE_TABS,
  DEFAULT_CAPTURE_TAB,
  capturePaneVisible,
  nextCaptureTab,
  normalizeCaptureTab,
} from "../lib/capture-tabs.js";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import {
  CAPTURE_CONTEXT_RANGE,
  CAPTURE_IDLE_RANGE,
  CAPTURE_MIN_RANGE,
  CAPTURE_TURNS_RANGE,
  captureFallbackNote,
} from "../lib/capture-view.js";
import BackfillBlock from "./BackfillBlock.vue";
import TopicBlock from "./TopicBlock.vue";

const {
  state,
  flip,
  setCaptureForm,
  setCaptureNumber,
  setFocus,
} = useConfig();
const { options } = useModels();

// 子页签只是本页视图状态，不进 store、不触发任何读 / 写 / 重算。
const activeTab = ref(DEFAULT_CAPTURE_TAB);

function selectTab(name) {
  activeTab.value = normalizeCaptureTab(name);
}

function onTabKeydown(event, name) {
  const next = nextCaptureTab(name, event.key);
  if (!next) return;
  event.preventDefault();
  selectTab(next);
  // 等 Vue 把选中态（tabindex）刷到新标签上再聚焦，与记忆页同一做法。
  const root = event.currentTarget?.closest?.(".n-tabs");
  nextTick(() => root?.querySelector(`#capture-tab-${next}`)?.focus?.());
}

// 判断方式是「关闭 / 大语言模型 / 判别模型」三态，直接落在既有的两个键上：
// 关闭 = captureEarlyCommit false（运行时的 fixed，只按强制轮数交），
// 另两档 = captureEarlyCommit true + captureEarlyJudge。没有新造开关。
const modeOptions = Object.freeze([
  { value: "off", label: "关闭" },
  { value: "llm", label: "大语言模型" },
  { value: "discriminator", label: "判别模型" },
]);
const judgeMode = computed(() => {
  if (state.form.captureEarlyCommit !== true) return "off";
  return state.form.captureEarlyJudge === "discriminator" ? "discriminator" : "llm";
});
// 卡片内的配置页签；切模式时只在当前页签已经不存在时回「基础配置」。
const settingsTab = ref("base");
const modeTabs = computed(() =>
  judgeMode.value === "off" ? ["base"] : ["base", judgeMode.value],
);
watch(judgeMode, () => {
  if (!modeTabs.value.includes(settingsTab.value)) settingsTab.value = "base";
});

async function chooseJudgeMode(value) {
  if (value === "off") {
    if (state.form.captureEarlyCommit) await setCaptureForm("captureEarlyCommit", false);
    return;
  }
  if (state.form.captureEarlyJudge !== value) {
    await setCaptureForm("captureEarlyJudge", value);
  }
  if (!state.form.captureEarlyCommit) await setCaptureForm("captureEarlyCommit", true);
}
const scopeOptions = Object.freeze([
  { value: "session", label: "会话内" },
  { value: "global", label: "全局" },
]);
const modelOptions = computed(() => options(state.form.captureModel));
const fallbackNote = computed(() => captureFallbackNote(state.captureConfig));

function onServiceUrlInput(value) {
  state.form.captureServiceUrl = value ?? "";
}

function onServiceUrlChange(value) {
  setCaptureForm("captureServiceUrl", value ?? "");
}

function onEnter(event) {
  event.preventDefault();
  event.target.blur();
}
</script>

<template>
  <!-- 三个子页签：line + small，与记忆搜索页同一套 .sub-tabs 样式；
       aria 由这里补（n-tabs 不输出语义）。 -->
  <NTabs
    class="sub-tabs capture-tabs"
    type="line"
    size="small"
    role="tablist"
    aria-label="记忆共享分区"
    :value="activeTab"
    justify-content="space-evenly"
    @update:value="selectTab"
  >
    <NTab
      v-for="name in CAPTURE_TABS"
      :key="name"
      :name="name"
      :id="`capture-tab-${name}`"
      role="tab"
      :aria-controls="`capture-panel-${name}`"
      :aria-selected="activeTab === name ? 'true' : 'false'"
      :tabindex="activeTab === name ? 0 : -1"
      :data-capture-tab="name"
      @keydown="onTabKeydown($event, name)"
    >
      {{ CAPTURE_TAB_LABELS[name] }}
    </NTab>
  </NTabs>

  <!-- 三块始终挂载：切页签只切 hidden，补交进度与话题的编辑态不会因为重建而丢。 -->
  <div class="capture-tabs-body">
    <div
      id="capture-panel-writeback"
      class="capture-pane"
      role="tabpanel"
      aria-labelledby="capture-tab-writeback"
      :hidden="!capturePaneVisible(activeTab, 'writeback')"
    >
      <NCard
        class="capture-card"
        size="small"
        title="写回"
        :bordered="false"
        header-style="padding: 4px 16px"
        content-style="padding: 16px"
      >
        <template #header-extra>
          <NSwitch
            aria-label="写回"
            :value="state.controls.autoCapture"
            @update:value="(next) => flip('autoCapture', next)"
          />
        </template>

        <!-- 判断方式是这一页的总闸：关闭时只剩基础配置，两个判断模型各带一套设置。 -->
        <div class="field capture-mode">
          <label for="captureJudgeMode">判断方式</label>
          <NSelect
            size="small"
            aria-label="判断方式"
            :options="modeOptions"
            :input-props="{ id: 'captureJudgeMode' }"
            :value="judgeMode"
            @update:value="chooseJudgeMode"
          />
          <span class="field-hint">关闭 = 不做话题判断，只按强制轮数提交；大语言模型读题面回答编号；判别模型走 /v1/systemone 做多选判断。</span>
        </div>

        <NTabs
          class="capture-settings-tabs"
          type="line"
          size="small"
          :value="settingsTab"
          @update:value="(value) => (settingsTab = value)"
        >
          <NTabPane name="base" tab="基础配置">
            <div class="topic-pane" :key="'capture-base'">
              <div class="field">
                <label for="captureCommitTurns">强制提交轮数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_TURNS_RANGE[0]"
                  :max="CAPTURE_TURNS_RANGE[1]"
                  :step="1"
                  placeholder="默认 12"
                  aria-label="强制提交轮数"
                  :input-props="{ id: 'captureCommitTurns' }"
                  :value="typeof state.form.captureCommitTurns === 'number' ? state.form.captureCommitTurns : null"
                  @focus="setFocus('captureCommitTurns')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureCommitTurns', value)"
                />
                <span class="field-hint">所有情况共用：攒够这么多轮就提交。一轮 = 一条用户消息加至少一条助手消息。范围 1–100。</span>
              </div>

              <div class="field">
                <span class="field-label">兜底提交</span>
                <NSwitch
                  aria-label="服务端兜底"
                  :value="state.form.captureServerFallback"
                  @update:value="(next) => setCaptureForm('captureServerFallback', next)"
                />
                <span class="field-hint">打开后空闲足够久时由服务端自己提交；关着时全程由本地判断。</span>
              </div>

              <div class="field" :class="{ dim: !state.form.captureServerFallback }">
                <label for="captureServerIdleSeconds">空闲秒数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_IDLE_RANGE[0]"
                  :max="CAPTURE_IDLE_RANGE[1]"
                  :step="60"
                  placeholder="默认 600"
                  aria-label="空闲秒数"
                  :disabled="!state.form.captureServerFallback"
                  :input-props="{ id: 'captureServerIdleSeconds' }"
                  :value="typeof state.form.captureServerIdleSeconds === 'number' ? state.form.captureServerIdleSeconds : null"
                  @focus="setFocus('captureServerIdleSeconds')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureServerIdleSeconds', value)"
                />
                <span class="field-hint">服务端多久没有新消息就自己提交。范围 60–86400 秒。</span>
              </div>
            </div>
          </NTabPane>

          <NTabPane v-if="judgeMode === 'llm'" name="llm" tab="语言模型设置">
            <div class="topic-pane" :key="'capture-llm'">
              <div class="field">
                <span class="field-label">提前提交</span>
                <NSwitch
                  aria-label="提前提交"
                  :value="state.form.captureEarlyCommit"
                  @update:value="(next) => setCaptureForm('captureEarlyCommit', next)"
                />
                <span class="field-hint">打开后每次提交前先归类：换话题就提前交，不必等到强制轮数。</span>
              </div>

              <div class="field">
                <span class="field-label">话题作用域</span>
                <NSelect
                  size="small"
                  aria-label="话题作用域"
                  :options="scopeOptions"
                  :input-props="{ id: 'captureTopicScope' }"
                  :value="state.form.captureTopicScope"
                  @focus="setFocus('captureTopicScope')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureForm('captureTopicScope', value)"
                />
                <span class="field-hint">会话内：候选少、判断准，但跨会话的同一件事连不起来。全局：能跨会话连起来，但候选多，容易并错。</span>
              </div>

              <div class="field">
                <label for="captureContextTurns">上下文轮数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_CONTEXT_RANGE[0]"
                  :max="CAPTURE_CONTEXT_RANGE[1]"
                  :step="1"
                  placeholder="默认 3"
                  aria-label="上下文轮数"
                  :input-props="{ id: 'captureContextTurns' }"
                  :value="typeof state.form.captureContextTurns === 'number' ? state.form.captureContextTurns : null"
                  @focus="setFocus('captureContextTurns')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureContextTurns', value)"
                />
                <span class="field-hint">归类时回看几轮之前的对话，默认 3。范围 1–20。</span>
              </div>

              <div class="field">
                <label for="captureMinTurns">最少触发轮数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_MIN_RANGE[0]"
                  :max="CAPTURE_MIN_RANGE[1]"
                  :step="1"
                  placeholder="默认 2"
                  aria-label="最少触发轮数"
                  :input-props="{ id: 'captureMinTurns' }"
                  :value="typeof state.form.captureMinTurns === 'number' ? state.form.captureMinTurns : null"
                  @focus="setFocus('captureMinTurns')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureMinTurns', value)"
                />
                <span class="field-hint">攒够这么多轮之前不归类、不提前提交，默认 2。范围 1–50。</span>
              </div>

              <div class="field">
                <span class="field-label">判断模型</span>
                <NSelect
                  size="small"
                  aria-label="判断模型"
                  :options="modelOptions"
                  :input-props="{ id: 'captureModel' }"
                  :value="state.form.captureModel"
                  @focus="setFocus('captureModel')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureForm('captureModel', value)"
                />
                <span class="field-hint">留空 = 用宿主的辅助模型（utility）；非空形如 provider/model。</span>
              </div>
            </div>
          </NTabPane>

          <NTabPane v-if="judgeMode === 'discriminator'" name="discriminator" tab="判别模型设置">
            <div class="topic-pane" :key="'capture-discriminator'">
              <div class="field">
                <span class="field-label">提前提交</span>
                <NSwitch
                  aria-label="提前提交"
                  :value="state.form.captureEarlyCommit"
                  @update:value="(next) => setCaptureForm('captureEarlyCommit', next)"
                />
                <span class="field-hint">打开后每次提交前先归类：换话题就提前交，不必等到强制轮数。</span>
              </div>

              <div class="field">
                <span class="field-label">话题作用域</span>
                <NSelect
                  size="small"
                  aria-label="话题作用域"
                  :options="scopeOptions"
                  :input-props="{ id: 'captureTopicScope' }"
                  :value="state.form.captureTopicScope"
                  @focus="setFocus('captureTopicScope')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureForm('captureTopicScope', value)"
                />
                <span class="field-hint">会话内：候选少、判断准，但跨会话的同一件事连不起来。全局：能跨会话连起来，但候选多，容易并错。</span>
              </div>

              <div class="field">
                <label for="captureContextTurns">上下文轮数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_CONTEXT_RANGE[0]"
                  :max="CAPTURE_CONTEXT_RANGE[1]"
                  :step="1"
                  placeholder="默认 3"
                  aria-label="上下文轮数"
                  :input-props="{ id: 'captureContextTurns' }"
                  :value="typeof state.form.captureContextTurns === 'number' ? state.form.captureContextTurns : null"
                  @focus="setFocus('captureContextTurns')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureContextTurns', value)"
                />
                <span class="field-hint">归类时回看几轮之前的对话，默认 3。范围 1–20。</span>
              </div>

              <div class="field">
                <label for="captureMinTurns">最少触发轮数</label>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="CAPTURE_MIN_RANGE[0]"
                  :max="CAPTURE_MIN_RANGE[1]"
                  :step="1"
                  placeholder="默认 2"
                  aria-label="最少触发轮数"
                  :input-props="{ id: 'captureMinTurns' }"
                  :value="typeof state.form.captureMinTurns === 'number' ? state.form.captureMinTurns : null"
                  @focus="setFocus('captureMinTurns')"
                  @blur="setFocus('')"
                  @update:value="(value) => setCaptureNumber('captureMinTurns', value)"
                />
                <span class="field-hint">攒够这么多轮之前不归类、不提前提交，默认 2。范围 1–50。</span>
              </div>

              <div class="field">
                <label for="captureServiceUrl">判别服务地址</label>
                <NInput
                  size="small"
                  type="text"
                  aria-label="判别服务地址"
                  placeholder="http://127.0.0.1:8000"
                  :input-props="{ id: 'captureServiceUrl', spellcheck: 'false' }"
                  :value="state.form.captureServiceUrl"
                  @focus="setFocus('captureServiceUrl')"
                  @blur="setFocus('')"
                  @update:value="onServiceUrlInput"
                  @change="onServiceUrlChange"
                  @keydown.enter="onEnter"
                />
                <span class="field-hint">需兼容 /v1/systemone。模型与密钥沿用「决策服务」那组配置（在「记忆搜索 → 精排」页里填）。</span>
              </div>
            </div>
          </NTabPane>
        </NTabs>

        <p v-if="fallbackNote" class="capture-fallback bad">{{ fallbackNote }}</p>

        <!-- 文案整段写在一行里：模板里的换行会被压成一个空格，中文句子中间会多出空档。 -->
        <NText class="hint-line" depth="3">打开后每轮增量提交到 OpenViking，由服务端抽成可检索的长期记忆；写在本机门牌（peer）下，不覆盖其它机器的记忆；记忆搜索与写回互不影响。</NText>
      </NCard>
    </div>

    <div
      id="capture-panel-backfill"
      class="capture-pane"
      role="tabpanel"
      aria-labelledby="capture-tab-backfill"
      :hidden="!capturePaneVisible(activeTab, 'backfill')"
    >
      <BackfillBlock />
    </div>

    <div
      id="capture-panel-topics"
      class="capture-pane"
      role="tabpanel"
      aria-labelledby="capture-tab-topics"
      :hidden="!capturePaneVisible(activeTab, 'topics')"
    >
      <!-- 话题表默认收起，展开只切显隐。 -->
      <TopicBlock />
    </div>
  </div>
</template>

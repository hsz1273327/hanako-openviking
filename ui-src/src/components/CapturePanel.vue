<script setup>
// 记忆共享页：只放写回的机器级设置。
//
// 会话级进度在侧边栏会话卡里，不在这一页出现：换一个窗口看一眼
// 就不该串到别人头上。
//
// 所有控件都真的绑到 state.form 并走 store 的提交口：
//   setCaptureForm  —— 下拉 / 开关 / 地址（立即整单提交）
//   setCaptureNumber —— 数字格（收敛到范围后提交；清空不提交）
// 失败由 store 回滚到上一次服务端确认的值，并在页面提示位报错。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { computed } from "vue";
import {
  NButton,
  NCard,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NText,
} from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import {
  CAPTURE_CONTEXT_RANGE,
  CAPTURE_IDLE_RANGE,
  CAPTURE_MIN_RANGE,
  CAPTURE_PROMPT_MAX,
  CAPTURE_TURNS_RANGE,
  captureFallbackNote,
} from "../lib/capture-view.js";

const {
  state,
  flip,
  setCaptureForm,
  setCaptureNumber,
  setFocus,
  touchCapturePrompt,
  setCapturePrompt,
  resetCapturePrompt,
  capturePromptStatusOf,
} = useConfig();
const { options } = useModels();

const judgeOptions = Object.freeze([
  { value: "llm", label: "语言模型" },
  { value: "discriminator", label: "判别模型" },
]);
const scopeOptions = Object.freeze([
  { value: "session", label: "会话内" },
  { value: "global", label: "全局" },
]);
const modelOptions = computed(() => options(state.form.captureModel));
const fallbackNote = computed(() => captureFallbackNote(state.captureConfig));

// 提前提交打开后，判断方式与它的上下文才有意义。
const earlyOpen = computed(() => state.form.captureEarlyCommit === true);
const promptStatusText = computed(() => capturePromptStatusOf());

function onPromptInput(value) {
  touchCapturePrompt(value ?? "");
}

function onPromptChange(value) {
  setCapturePrompt(value ?? "");
}

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

    <div class="capture-fields">
      <div class="capture-group">
        <div class="capture-group-title">提交策略</div>

        <!-- 强制线所有情况共用：攒够就交，不看提前提交开关。 -->
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
          <span class="field-label">提前提交</span>
          <NSwitch
            aria-label="提前提交"
            :value="state.form.captureEarlyCommit"
            @update:value="(next) => setCaptureForm('captureEarlyCommit', next)"
          />
          <span class="field-hint">打开后每次提交前先归类：换话题就提前交，不必等到强制轮数。</span>
        </div>

        <div v-if="earlyOpen" class="field">
          <span class="field-label">判断方式</span>
          <NSelect
            size="small"
            aria-label="判断方式"
            :options="judgeOptions"
            :input-props="{ id: 'captureEarlyJudge' }"
            :value="state.form.captureEarlyJudge"
            @focus="setFocus('captureEarlyJudge')"
            @blur="setFocus('')"
            @update:value="(value) => setCaptureForm('captureEarlyJudge', value)"
          />
          <span class="field-hint">语言模型读题面回答编号；判别模型走 /v1/systemone 做多选判断。</span>
        </div>

        <div v-if="earlyOpen" class="field">
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

        <div v-if="earlyOpen" class="field">
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

        <div v-if="earlyOpen" class="field">
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

        <!-- 判断题面：语言模型与判别模型共用这一句。留空 = 内置那句默认问法。 -->
        <div v-if="earlyOpen" class="field">
          <div class="prompt-head">
            <label for="capturePrompt">判断题面</label>
            <span id="capturePromptStatus" class="prompt-status">{{ promptStatusText }}</span>
            <NButton id="captureResetPrompt" size="small" quaternary @click="resetCapturePrompt()">恢复默认</NButton>
          </div>
          <NInput
            type="textarea"
            size="small"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="CAPTURE_PROMPT_MAX"
            :input-props="{ id: 'capturePrompt', spellcheck: 'false' }"
            :value="state.form.capturePrompt"
            @focus="setFocus('capturePrompt')"
            @blur="setFocus('')"
            @update:value="onPromptInput"
            @change="onPromptChange"
          />
          <span class="field-hint">提前提交时共用这一句，留空 = 内置那句默认问法。判别模型的选项由话题表自动生成，这一格只决定怎么问。</span>
        </div>

        <div v-if="earlyOpen && state.form.captureEarlyJudge === 'llm'" class="field">
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

        <div v-if="earlyOpen && state.form.captureEarlyJudge === 'discriminator'" class="field">
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

      <div class="capture-group">
        <div class="capture-group-title">服务端兜底</div>

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
    </div>

    <p v-if="fallbackNote" class="capture-fallback bad">{{ fallbackNote }}</p>

    <!-- 文案整段写在一行里：模板里的换行会被压成一个空格，中文句子中间会多出空档。 -->
    <NText class="hint-line" depth="3">打开后每轮增量提交到 OpenViking，由服务端抽成可检索的长期记忆；写在本机门牌（peer）下，不覆盖其它机器的记忆；记忆搜索与写回互不影响。</NText>
  </NCard>
</template>

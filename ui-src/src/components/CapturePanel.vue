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
  CAPTURE_IDLE_RANGE,
  CAPTURE_PROMPT_MAX,
  CAPTURE_TURNS_RANGE,
  captureFallbackNote,
  captureModeOptions,
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

const modeOptions = Object.freeze(captureModeOptions());
const modelOptions = computed(() => options(state.form.captureModel));
const fallbackNote = computed(() => captureFallbackNote(state.captureConfig));

// 判断题面只在两档判断里出现：固定轮次那一档不看题面。
const promptOpen = computed(() => ["llm", "discriminator"].includes(state.form.captureCommitMode));
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

        <div class="field">
          <span class="field-label">策略</span>
          <NSelect
            size="small"
            aria-label="提交策略"
            :options="modeOptions"
            :input-props="{ id: 'captureCommitMode' }"
            :value="state.form.captureCommitMode"
            @focus="setFocus('captureCommitMode')"
            @blur="setFocus('')"
            @update:value="(value) => setCaptureForm('captureCommitMode', value)"
          />
          <span class="field-hint">固定轮次攒够就交；语言模型 / 判别模型只在换话题时交。</span>
        </div>

        <!-- 判断题面：语言模型与判别模型两档共用这一句。留空 = 内置那句默认问法；
             判别模型的 yes/no 两条判定描述是内置的，这一格只改怎么问。 -->
        <div v-if="promptOpen" class="field">
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
          <span class="field-hint">语言模型判断与判别模型判断共用这一句；留空 = 内置那句默认问法；判别模型的 yes/no 两条判定描述是内置的，这一格只决定怎么问。</span>
        </div>

        <div v-if="state.form.captureCommitMode === 'fixed'" class="field">
          <label for="captureCommitTurns">固定轮次</label>
          <NInputNumber
            size="small"
            style="width: 100%"
            :show-button="false"
            :update-value-on-input="false"
            :min="CAPTURE_TURNS_RANGE[0]"
            :max="CAPTURE_TURNS_RANGE[1]"
            :step="1"
            placeholder="默认 12"
            aria-label="固定轮次"
            :input-props="{ id: 'captureCommitTurns' }"
            :value="typeof state.form.captureCommitTurns === 'number' ? state.form.captureCommitTurns : null"
            @focus="setFocus('captureCommitTurns')"
            @blur="setFocus('')"
            @update:value="(value) => setCaptureNumber('captureCommitTurns', value)"
          />
          <span class="field-hint">一轮 = 一条用户消息加至少一条助手消息。范围 1–100。</span>
        </div>

        <div v-if="state.form.captureCommitMode === 'llm'" class="field">
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
          <span class="field-hint">留空 = 用宿主的辅助模型；非空形如 provider/model。</span>
        </div>

        <div v-if="state.form.captureCommitMode === 'discriminator'" class="field">
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

<script setup>
// 精排卡：「查回来之后怎么排序」——开关，加三条并列的路。
//
// 三条路是平的，谁也不是谁的备胎：
//   语言模型    宿主提供，恒启用（至少保留一路），吃 rerankPrompt 那份清单模板；
//   判别模型    配了决策服务才出现，吃 rerankSystemonePrompt 那份逐条题面；
//   rerank 模型 配了精排服务才出现，交叉编码器成对打分，没有提示词可配。
//
// 一条路只有一行头（类型 + 启用开关 + 权重 + 「配置」），点开才显示规则区：
// 提示词 / 题面是大块文本，权重与超时是数字，收起时不该占着一屏。
// 启用中的那条边框走绿（颜色取主题里的 success 色，不写死色值），停用的保持默认灰边。
//
// 提交仍然是**整单**：本卡只调 store 的动作（setForm / setPrompt / setLane*），
// 请求体由 lib/panel-store.js 的 readLayers() 整份拼。组件里不出现任何 post / fetch。
import { computed, ref } from "vue";
import { NButton, NCard, NGrid, NGridItem, NInput, NInputNumber, NSwitch } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { RERANK_LANE_NO_PROMPT_NOTE } from "../lib/recall-layers.js";
import { lightThemeOverrides } from "../theme.js";

const {
  state,
  enabled,
  setForm,
  setPrompt,
  touchPrompt,
  resetPrompt,
  rerankPromptStatus,
  systemonePromptStatus,
  laneRows,
  laneCountText,
  laneNote,
  setLaneEnabled,
  setLaneWeight,
  setLaneTimeout,
  testChannels,
  setFocus,
} = useConfig();

// 展开的是哪一条（只展开一条：三条全开时提示词框会把整页顶长）。
const openLane = ref("");

const rerankOpen = computed(() => state.form.rerank === "llm");
const lanes = computed(() => laneRows());
const countText = computed(() => laneCountText());

// 启用中的那条用主题里的 success 色画边框。取的是主题对象，不是写死的色值：
// 换主题时这里跟着变（theme.js 是两页共用的那一份）。
const ACTIVE_BORDER = lightThemeOverrides?.common?.successColor || "";

// 开关改了就整单提交（setForm → saveLayers）。
function onSwitch(value) {
  setForm("rerank", value ? "llm" : "off");
}

function toggleOpen(type) {
  openLane.value = openLane.value === type ? "" : type;
}

// 提示词是 value：每敲一个字先写进草稿（标记 touched），失焦 / 回车才提交。
function onPromptInput(which, value) {
  touchPrompt(which, value);
}

function onPromptChange(which, value) {
  setPrompt(which, value);
}

function promptStatusOf(type) {
  return type === "systemone" ? systemonePromptStatus() : rerankPromptStatus();
}

// n-input-number 清空给 null：权重不提交（不让它变成 0 再被夹），超时则收成空串 = 回默认。
function onWeight(type, value) {
  if (value === null || value === undefined) return;
  setLaneWeight(type, value);
}

function onTimeout(type, value) {
  setLaneTimeout(type, value === null || value === undefined ? "" : value);
}

function borderStyle(lane) {
  return lane.enabled && ACTIVE_BORDER ? { borderColor: ACTIVE_BORDER } : undefined;
}
</script>

<template>
  <NCard
    class="rerank-card"
    size="small"
    title="精排"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <!-- 总开关：两档（关 / 开）用 NSwitch，不用下拉。 -->
    <div class="field" :class="{ dim: !enabled }">
      <span class="field-label">结果精排</span>
      <NSwitch
        size="small"
        aria-label="结果精排"
        :input-props="{ id: 'rerank' }"
        :value="rerankOpen"
        @update:value="onSwitch"
      />
      <span class="field-hint">
        开启后按下面启用的路精排；一个启用通道都没有时直接跳过，候选原样保留。任一路失败只弃权，全部弃权也原样保留。
      </span>
    </div>

    <div id="rerankAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!rerankOpen">
      <div id="rerankLanes" class="lane-stack">
        <div
          v-for="lane in lanes"
          :key="lane.type"
          class="rerank-lane"
          :class="{ active: lane.enabled, warn: lane.unavailable }"
          :style="borderStyle(lane)"
          :data-type="lane.type"
        >
          <div class="lane-head">
            <span class="lane-name">{{ lane.label }}</span>

            <!-- 语言模型那一条恒启用：开关是禁用态，旁边写明为什么。 -->
            <NSwitch
              size="small"
              :aria-label="`${lane.label}启用`"
              :value="lane.enabled"
              :disabled="lane.locked"
              @update:value="(value) => setLaneEnabled(lane.type, value)"
            />
            <span v-if="lane.locked" class="lane-lock">恒启用 · 至少保留一路</span>
            <span v-else-if="lane.unavailable" class="lane-warn">服务未配置，不会生效</span>

            <span class="lane-weight">权重 {{ lane.weight }}</span>
            <NButton
              class="lane-config"
              size="small"
              quaternary
              :aria-expanded="openLane === lane.type ? 'true' : 'false'"
              @click="toggleOpen(lane.type)"
            >
              {{ openLane === lane.type ? "收起" : "配置" }}
            </NButton>
          </div>

          <div class="lane-body" :hidden="openLane !== lane.type">
            <!-- 语言模型：提示词（编号清单模板） -->
            <div v-if="lane.type === 'model'" class="field">
              <div class="prompt-head">
                <label for="rerankPrompt">提示词</label>
                <span id="rerankPromptStatus" class="prompt-status">{{ promptStatusOf("model") }}</span>
                <NButton id="rerankResetPrompt" size="small" quaternary @click="resetPrompt('rerank')">
                  恢复默认
                </NButton>
              </div>
              <NInput
                type="textarea"
                size="small"
                :autosize="{ minRows: 4, maxRows: 8 }"
                :maxlength="2000"
                placeholder="留空则用内置默认模板"
                :input-props="{ id: 'rerankPrompt', spellcheck: 'false' }"
                :value="state.prompts.rerank"
                @focus="setFocus('rerankPrompt')"
                @blur="setFocus('')"
                @update:value="onPromptInput('rerank', $event)"
                @change="onPromptChange('rerank', $event)"
              />
              <span class="field-hint" v-pre>用 {{message}} 表示当前这条用户消息，用 {{candidates}} 表示候选清单；没写 {{candidates}} 的话，清单会自动接在末尾。</span>
            </div>

            <!-- 判别模型：题面（逐条问，{{n}} 是候选序号） -->
            <div v-else-if="lane.type === 'systemone'" class="field">
              <div class="prompt-head">
                <label for="rerankSystemonePrompt">题面</label>
                <span id="rerankSystemonePromptStatus" class="prompt-status">{{ promptStatusOf("systemone") }}</span>
                <NButton
                  id="rerankSystemoneResetPrompt"
                  size="small"
                  quaternary
                  @click="resetPrompt('systemone')"
                >
                  恢复默认
                </NButton>
              </div>
              <NInput
                type="textarea"
                size="small"
                :autosize="{ minRows: 4, maxRows: 8 }"
                :maxlength="2000"
                placeholder="留空则用内置默认题面"
                :input-props="{ id: 'rerankSystemonePrompt', spellcheck: 'false' }"
                :value="state.prompts.systemone"
                @focus="setFocus('rerankSystemonePrompt')"
                @blur="setFocus('')"
                @update:value="onPromptInput('systemone', $event)"
                @change="onPromptChange('systemone', $event)"
              />
              <span class="field-hint" v-pre>每条候选问一次，用 {{n}} 表示它是本批里的第几条（从 1 开始）；没写 {{n}} 的话，序号会自动补在题面最前面。</span>
            </div>

            <!-- rerank 模型：没有提示词，只有一句说明 -->
            <p v-else class="field-hint lane-note">{{ RERANK_LANE_NO_PROMPT_NOTE }}</p>

            <NGrid cols="1 520:2" responsive="screen" :x-gap="8" :y-gap="6">
              <NGridItem>
                <label class="lane-cell">
                  <span>权重</span>
                  <NInputNumber
                    size="small"
                    :show-button="false"
                    :update-value-on-input="false"
                    :min="0.1"
                    :max="10"
                    :step="0.1"
                    placeholder="默认 1"
                    :value="lane.weight"
                    @update:value="(value) => onWeight(lane.type, value)"
                  />
                </label>
              </NGridItem>
              <NGridItem>
                <label class="lane-cell">
                  <span>超时（ms）</span>
                  <NInputNumber
                    size="small"
                    :show-button="false"
                    :update-value-on-input="false"
                    :min="200"
                    :max="lane.timeoutCeiling"
                    :step="100"
                    :placeholder="lane.timeoutPlaceholder"
                    :value="lane.timeoutMs ?? null"
                    @update:value="(value) => onTimeout(lane.type, value)"
                  />
                </label>
              </NGridItem>
            </NGrid>

            <!-- 存量通道自带的地址与模型只填了一半：运行时那一对会整个改用服务配置。 -->
            <p v-if="laneNote(lane)" class="lane-pair-note">{{ laneNote(lane) }}</p>
          </div>
        </div>
      </div>

      <div class="lane-actions">
        <span id="rerankLanesCount" class="prompt-status">{{ countText }}</span>
        <NButton
          id="rerankTestBtn"
          size="small"
          quaternary
          :disabled="state.channelTest.pending"
          @click="testChannels()"
        >
          {{ state.channelTest.pending ? "测试中…" : "测试" }}
        </NButton>
      </div>

      <pre id="rerankTestResult" class="rerank-test-result" :hidden="state.channelTest.hidden">{{ state.channelTest.text }}</pre>

      <span class="field-hint">三条路各配各的：语言模型吃提示词，判别模型吃题面，rerank 模型只打分不吃提示词。多路按权重加权合并，单路失败只弃权不归零。超时留空 = 用该路的默认值（判别模型按候选数自适应）；语言模型那一路停不了，至少保留一路。</span>
    </div>
  </NCard>
</template>

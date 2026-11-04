<script setup>
// 召回卡：判断「查不查」（召回判断）与「拿什么查」（召回查询），
// 加上两份判据提示词与判断模型。重排在 RerankCard.vue —— 那是「查回来之后
// 怎么排序」，另一件事，不混在这张卡里。
//
// 召回判断四档（关闭 / 规则判断 / 语言模型判断 / 决策模型判断），展开区间不一样：
//   off / rules —— 什么都不展开；
//   llm         —— 展开提示词（gatePrompt）与判断模型（宿主生成式模型）；
//   decision    —— 展开提示词（gateDecisionPrompt）与一行决策服务状态，
//                  判断模型下拉隐藏（模型由服务配置决定）。
// 两份提示词是同一位置、同一套三态与「恢复默认」，但绑的键不同：分开存、分开提交，
// 改一份不动另一份，切档也不丢内容。
//
// 第四档只在决策服务（地址 + 模型）配好时才出现在下拉里：没见过这一项的人不会选到
// 一个永远不生效的档位。选项由 lib/recall-layers.js 的纯函数生成，组件只渲染。
//
// 行为第 1~4 条仍然成立，只是搬家：
//   - 下拉改了就提交，没有保存按钮；
//   - 失败回滚由 store.saveLayers → commitLayers 负责，控件值跟着退回；
//   - 召回判断与召回查询**永远整单提交**：本卡只调 setForm，请求体由
//     lib/panel-store.js 的 readLayers() 整份拼（recallGate 与 queryMode
//     永远同一单，还带着重排卡那几个键）。组件里不出现任何 post / fetch。
//   - 提示词框里放的是 value（配置为空时坐默认全文），不是 placeholder；
//     「恢复默认」只填框、走正常提交；旁边小字三态：默认 / 已修改 / 空。
//
// 形态交给 naive-ui：一张 n-card（title="召回"），内容按内容定高（不吃余量，
// 余量归候选池卡）。两个下拉并排为 NGrid :cols="2"（700px 以下收成一列）。
//
// 标签分两种写法，按控件内部有没有真 <input> 决定：
//   - NInput / NInputNumber 里有真 <input>，<label for=id> + :input-props 的 id 是有效关联；
//   - NSelect（naive-ui 2.45）非 filterable 时不渲染内部 <input>，也没有 role/aria，
//     <label for> 只能指到外层 div 上，等于指空。下拉一律用纯文本标签
//     （span.field-label）+ 控件自带 aria-label，文字逐字一致。
// NSelect 的 id 仍走 :input-props：裸 id 会落到外层 <div class="n-select">，别让 id 与标签错位。
import { computed } from "vue";
import { NButton, NCard, NGrid, NGridItem, NInput, NSelect } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import {
  decisionServiceConfigured,
  decisionServiceView,
  recallGateOptions,
} from "../lib/recall-layers.js";

const {
  state,
  enabled,
  setForm,
  setPrompt,
  touchPrompt,
  resetPrompt,
  gatePromptStatus,
  decisionPromptStatus,
  setFocus,
} = useConfig();
const { options, hint: modelsHint } = useModels();

// 决策服务配好了吗：这是「第四档出不出现」与「存量 decision 还算不算数」的同一判据，
// 判据落在 layers（服务端确认过的投影）上，不是在草稿里——填了一半的服务不该提前解锁。
const decisionConfigured = computed(() => decisionServiceConfigured(state.layers));
const gateOptions = computed(() => recallGateOptions(decisionConfigured.value));

const gateOpen = computed(() => state.form.recallGate === "llm");
const decisionOpen = computed(() => state.form.recallGate === "decision");
// 两份判据共用一块展开区：同一个位置、同一套三态，只是绑的键不同。
const promptOpen = computed(() => gateOpen.value || decisionOpen.value);
const promptWhich = computed(() => (decisionOpen.value ? "decision" : "gate"));
const promptField = computed(() => (decisionOpen.value ? "gateDecisionPrompt" : "gatePrompt"));
const promptValue = computed(() =>
  decisionOpen.value ? state.prompts.decision : state.prompts.gate,
);
const promptStatusText = computed(() =>
  decisionOpen.value ? decisionPromptStatus() : gatePromptStatus(),
);
const promptPlaceholder = computed(() =>
  decisionOpen.value ? "留空则不拦截任何召回" : "留空则用内置默认模板",
);
// 决策服务状态行：纯函数给文案，组件只排版（与其它卡片同一习惯）。
const decisionService = computed(() => decisionServiceView(state.layers));

// 判断模型下拉的选项：默认（宿主辅助模型）+ 目录；目录读不到也保留默认项。
const gateModelOptions = computed(() => options(state.form.gateModel));

const QUERY_MODE_OPTIONS = Object.freeze([
  { label: "最后一句", value: "last" },
  { label: "带上文（最近三条）", value: "context" },
]);

// 下拉改了就整单提交（setForm → saveLayers）。
function onSelect(key, value) {
  setForm(key, value);
}

// 提示词是 value：每敲一个字先写进草稿（标记 touched），失焦 / 回车才提交。
function onPromptInput(value) {
  touchPrompt(promptWhich.value, value);
}

function onPromptChange(value) {
  setPrompt(promptWhich.value, value);
}
</script>

<template>
  <NCard
    class="recall-card"
    size="small"
    title="召回"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <NGrid class="recall-grid" cols="1 700:2" responsive="screen" :x-gap="10" :class="{ dim: !enabled }">
      <NGridItem>
        <div class="field">
          <span class="field-label">召回判断</span>
          <NSelect
            size="small"
            aria-label="召回判断"
            :options="gateOptions"
            :input-props="{ id: 'recallGate' }"
            :value="state.form.recallGate"
            @update:value="(value) => onSelect('recallGate', value)"
          />
          <span class="field-hint">规则判断只认 ≤8 字、无问号、无疑问词、无指代词的指令；语言模型判断或决策模型判断失败、超时会照常召回。</span>
        </div>
      </NGridItem>
      <NGridItem>
        <div class="field">
          <span class="field-label">召回查询</span>
          <NSelect
            size="small"
            aria-label="召回查询"
            :options="QUERY_MODE_OPTIONS"
            :input-props="{ id: 'queryMode' }"
            :value="state.form.queryMode"
            @update:value="(value) => onSelect('queryMode', value)"
          />
          <span class="field-hint">带上文会拼最近三条用户文本，总长最多 300 字符，最新一句保持完整。</span>
        </div>
      </NGridItem>
    </NGrid>

    <!-- 只有 recallGate=llm / decision 时才展开。提示词框里放的就是当前生效的那一份：
         llm 坐 gatePrompt，decision 坐 gateDecisionPrompt —— 同一个位置，两份值互不影响。 -->
    <div id="gateAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!promptOpen">
      <NGrid cols="1 700:2" responsive="screen" :x-gap="10" :y-gap="8">
        <NGridItem>
          <div class="field">
            <div class="prompt-head">
              <label :for="promptField">判断提示词</label>
              <span id="gatePromptStatus" class="prompt-status">{{ promptStatusText }}</span>
              <NButton id="gateResetPrompt" size="small" quaternary @click="resetPrompt(promptWhich)">
                恢复默认
              </NButton>
            </div>
            <NInput
              type="textarea"
              size="small"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :maxlength="2000"
              :placeholder="promptPlaceholder"
              :input-props="{ id: promptField, spellcheck: 'false' }"
              :value="promptValue"
              @focus="setFocus(promptField)"
              @blur="setFocus('')"
              @update:value="onPromptInput"
              @change="onPromptChange"
            />
            <!-- 两份用法不一样：语言模型是「生成一句话再解析」，决策模型是「在两条内置描述之间选一个」。
                 占位符写法在模板里要 v-pre，否则会被当成插值。 -->
            <span v-if="!decisionOpen" class="field-hint" v-pre>用 {{message}} 表示当前这条用户消息；没写它的话，消息会自动接在末尾。</span>
            <span v-else id="decisionPromptHint" class="field-hint" v-pre>这一格是题面，不是让模型生成文本：判定标准由内置的两条描述决定（有指代或省略 / 自己把话说完整），模型只在两者之间选一个并给出置信度。选「有指代或省略」且置信度 ≥ 0.45 时照常召回，选「自己把话说完整」时跳过召回。
              用 {{message}} 表示当前这条用户消息；没写它时这句就是纯题面（消息本身在 state 里，不会重复发）。</span>
          </div>
        </NGridItem>

        <!-- 判断模型只属于 language 档：决策模型的模型标识在「打分服务」那组配置里。 -->
        <NGridItem v-if="gateOpen">
          <div class="field">
            <span class="field-label">判断模型</span>
            <!-- 一个下拉选到底：首项是默认（走宿主辅助模型），其余就是目录里的每个模型。 -->
            <NSelect
              size="small"
              aria-label="判断模型"
              :options="gateModelOptions"
              :input-props="{ id: 'gateModel' }"
              :value="state.form.gateModel"
              @update:value="(value) => onSelect('gateModel', value)"
            />
            <span id="gateModelsHint" class="field-hint" :hidden="!modelsHint">{{ modelsHint }}</span>
          </div>
        </NGridItem>
      </NGrid>
    </div>

    <!-- 只有 recallGate=decision 时才展开：模型由服务配置决定，所以这里没有输入框，
         只有一行状态（服务没配时这一档根本选不到，存量会归一化成 off）。 -->
    <div id="decisionService" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!decisionOpen">
      <div class="field">
        <span class="field-hint">{{ decisionService.text }}</span>
      </div>
    </div>
  </NCard>
</template>

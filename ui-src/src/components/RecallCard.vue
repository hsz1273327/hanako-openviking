<script setup>
// 召回卡：判断「查不查」（召回判断）与「拿什么查」（召回查询），
// 加上两份判据提示词与判断模型。精排在 RerankCard.vue —— 那是「查回来之后
// 怎么排序」，另一件事，不混在这张卡里。
//
// 召回判断四档（关闭 / 规则判断 / 语言模型判断 / 决策模型判断），展开区间不一样：
//   off / rules —— 什么都不展开；
//   llm         —— 展开提示词（gatePrompt）与判断模型（宿主生成式模型）；
//   decision    —— 展开判断前文（gateContext / gateContextTurns）、提示词、召回门槛
//                  （gateDecisionThreshold）与一行决策服务状态，判断模型下拉隐藏。
//
// 这张卡还有两个数值格：查询长度上限（queryChars）与召回超时（recallTimeoutMs）。
// 它们属于宿主控制台那组数值调参（与注入预算同一个提交口 /controls → patchControls，
// 走 store.setControlsNumber），不是召回策略那一单（setForm → saveLayers）：
// 一个是“拼多长”，一个是“等多久”，改了立即生效，不需要整单回滚。
//
// 提示词是同一位置、同一套三态与「恢复默认」，但绑的键不同：llm 一份，decision 再按
// gateContext 分「不看前文 / 带前文」两份。分开存、分开提交，改一份不动另一份，
// 切档或切 gateContext 都不丢内容。
//
// 第四档只在决策服务（地址 + 模型）配好时才出现在下拉里：没见过这一项的人不会选到
// 一个永远不生效的档位。选项由 lib/recall-layers.js 的纯函数生成，组件只渲染。
//
// 行为第 1~4 条仍然成立，只是搬家：
//   - 下拉改了就提交，没有保存按钮；
//   - 失败回滚由 store.saveLayers → commitLayers 负责，控件值跟着退回；
//   - 召回判断与召回查询**永远整单提交**：本卡只调 setForm，请求体由
//     lib/panel-store.js 的 readLayers() 整份拼（recallGate 与 queryMode
//     永远同一单，还带着精排卡那几个键）。组件里不出现任何 post / fetch。
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
import { NButton, NCard, NGrid, NGridItem, NInput, NInputNumber, NSelect } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import {
  GATE_CONTEXT_TURNS_DEFAULT,
  GATE_CONTEXT_TURNS_MAX,
  GATE_CONTEXT_TURNS_MIN,
  GATE_CONTEXT_TURNS_STEP,
  GATE_DECISION_THRESHOLD_DEFAULT,
  GATE_DECISION_THRESHOLD_HINT,
  GATE_DECISION_THRESHOLD_MAX,
  GATE_DECISION_THRESHOLD_MIN,
  GATE_DECISION_THRESHOLD_STEP,
  decisionServiceConfigured,
  decisionServiceView,
  gateContextOptions,
  gateFallbackOptions,
  gateHasFailurePath,
  recallGateOptions,
  recallPromptField,
  recallPromptKey,
} from "../lib/recall-layers.js";

const {
  state,
  enabled,
  setForm,
  setControlsNumber,
  setDecisionThreshold,
  setGateContextTurns,
  setPrompt,
  touchPrompt,
  resetPrompt,
  gatePromptStatus,
  decisionPromptStatus,
  contextPromptStatus,
  setFocus,
} = useConfig();
const { options, hint: modelsHint } = useModels();

// 决策服务配好了吗：这是「第四档出不出现」与「存量 decision 还算不算数」的同一判据，
// 判据落在 layers（服务端确认过的投影）上，不是在草稿里——填了一半的服务不该提前解锁。
const decisionConfigured = computed(() => decisionServiceConfigured(state.layers));
const gateOptions = computed(() => recallGateOptions(decisionConfigured.value));

const gateOpen = computed(() => state.form.recallGate === "llm");
const decisionOpen = computed(() => state.form.recallGate === "decision");
// 「带最近几轮」只在 decision 档 + gateContext=turns 时出现。
const gateContextTurnsOpen = computed(
  () => decisionOpen.value && state.form.gateContext === "turns",
);
// 判据共用一块展开区：同一个位置、同一套三态，只是绑的键不同。
// decision 档里再按 gateContext 分两份题面：none 坐 gateDecisionPrompt，
// turns 坐 gateContextPrompt。切回来时各自草稿都还在。
const promptOpen = computed(() => gateOpen.value || decisionOpen.value);
const promptWhich = computed(() =>
  recallPromptKey(state.form.recallGate, state.form.gateContext),
);
const promptField = computed(() =>
  recallPromptField(state.form.recallGate, state.form.gateContext),
);
const promptValue = computed(() => state.prompts[promptWhich.value]);
const promptStatusText = computed(() => {
  if (promptWhich.value === "gate") return gatePromptStatus();
  if (promptWhich.value === "context") return contextPromptStatus();
  return decisionPromptStatus();
});
const promptPlaceholder = computed(() =>
  promptWhich.value === "gate" ? "留空则用内置默认模板" : "留空则不拦截任何召回",
);
const contextOptions = Object.freeze(gateContextOptions());
// 决策服务状态行：纯函数给文案，组件只排版（与其它卡片同一习惯）。
const decisionService = computed(() => decisionServiceView(state.layers));

// 判断模型下拉的选项：默认（宿主辅助模型）+ 目录；目录读不到也保留默认项。
const gateModelOptions = computed(() => options(state.form.gateModel));

// 「判断失败时」只在会去问外部服务的两档出现：off / rules 自己就是判据，没有失败路径。
const fallbackOptions = Object.freeze(gateFallbackOptions());
const fallbackOpen = computed(() => gateHasFailurePath(state.form.recallGate));

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

/** 数字格：n-input-number 清空给 null，收成空串走 store 的「不提交」分支。 */
function onNumberChange(key, value) {
  setControlsNumber(key, value === null || value === undefined ? "" : value);
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
          <span class="field-hint">规则判断只认 ≤8 字、无问号、无疑问词、无指代词的指令；语言模型与决策模型这两档判断失败、超时按下面的「判断失败时」处理。</span>
        </div>
      </NGridItem>
      <!-- 判断失败时怎么兜底：只对 llm / decision 两档显示（另两档不依赖外部服务）。
           跟其它下拉一样改了就整单提交，失败由 store 回滚。 -->
      <NGridItem v-if="fallbackOpen">
        <div class="field">
          <span class="field-label">判断失败时</span>
          <NSelect
            size="small"
            aria-label="判断失败时"
            :options="fallbackOptions"
            :input-props="{ id: 'gateFallback' }"
            :value="state.form.gateFallback"
            @update:value="(value) => onSelect('gateFallback', value)"
          />
          <span class="field-hint">网络错、超时、返回结构不认识、提示词为空都算失败：照常召回不过滤，或退到规则判断（≤8 字且无问号、无疑问词、无指代词才跳过）。</span>
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
          <span class="field-hint">带上文会从最近一轮往回拼用户文本，累计到查询长度上限就停，停在完整的一轮边界上、不切半句。</span>
        </div>
      </NGridItem>
      <!-- 两个数字格：拼多长 / 等多久。提交口是 /controls（与注入预算同一条），
           不是召回策略那一单：这两个数改了立即生效，没有整单校验要一起过。 -->
      <NGridItem>
        <div class="field">
          <label for="queryChars">查询长度上限</label>
          <NInputNumber
            size="small"
            style="width: 100%"
            :show-button="false"
            :update-value-on-input="false"
            :min="100"
            :max="8000"
            :step="50"
            placeholder="默认 600"
            :input-props="{ id: 'queryChars' }"
            :value="state.controls.queryChars ?? null"
            @update:value="onNumberChange('queryChars', $event)"
          />
          <span class="field-hint">按字数算。只影响「带上文」：从最近一轮往回整条累加，装不下就少拼一轮，不会把句子切成半句。服务端耗时约随查询长度线性上升，这个数越高、召回超时就要跟着放宽。</span>
        </div>
      </NGridItem>
      <NGridItem>
        <div class="field">
          <label for="recallTimeoutMs">召回超时（ms）</label>
          <NInputNumber
            size="small"
            style="width: 100%"
            :show-button="false"
            :update-value-on-input="false"
            :min="500"
            :max="30000"
            :step="500"
            placeholder="默认 5000"
            :input-props="{ id: 'recallTimeoutMs' }"
            :value="state.controls.recallTimeoutMs ?? null"
            @update:value="onNumberChange('recallTimeoutMs', $event)"
          />
          <span class="field-hint">召回请求自己那一档，与全局页的「请求超时」分开；精排三个通道的超时也不受它影响。当年沿用 1500 的后果是长查询被提前掐断，整轮 recalled:0。</span>
        </div>
      </NGridItem>
    </NGrid>

    <!-- 只有 recallGate=llm / decision 时才展开。提示词框里放的就是当前生效的那一份：
         llm 坐 gatePrompt，decision 坐 gateDecisionPrompt —— 同一个位置，两份值互不影响。 -->
    <div id="gateAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!promptOpen">
      <NGrid cols="1 700:2" responsive="screen" :x-gap="10" :y-gap="8">
        <!-- 判断前文只属于 decision 档：none 只看最后一句，turns 带最近几轮问答。 -->
        <NGridItem v-if="decisionOpen">
          <div class="field">
            <span class="field-label">判断前文</span>
            <NSelect
              size="small"
              aria-label="判断前文"
              :options="contextOptions"
              :input-props="{ id: 'gateContext' }"
              :value="state.form.gateContext"
              @update:value="(value) => onSelect('gateContext', value)"
            />
            <span class="field-hint">不看前文只判断最后一条用户消息；带最近几轮会把最近几轮问答一起给模型，问的是「上面有没有」。</span>
          </div>
        </NGridItem>
        <!-- 只有选「带最近几轮」才出现。失焦 / 回车才提交，清空不提交、回填已确认值。 -->
        <NGridItem v-if="gateContextTurnsOpen">
          <div class="field">
            <label for="gateContextTurns">带最近几轮</label>
            <NInputNumber
              size="small"
              style="width: 100%"
              :show-button="false"
              :update-value-on-input="false"
              :min="GATE_CONTEXT_TURNS_MIN"
              :max="GATE_CONTEXT_TURNS_MAX"
              :step="GATE_CONTEXT_TURNS_STEP"
              :placeholder="String(GATE_CONTEXT_TURNS_DEFAULT)"
              :input-props="{ id: 'gateContextTurns' }"
              :value="state.form.gateContextTurns"
              @update:value="(value) => setGateContextTurns(value)"
            />
            <span class="field-hint">1–12 的整数，默认 {{ GATE_CONTEXT_TURNS_DEFAULT }} 轮；一问一答算一轮。</span>
          </div>
        </NGridItem>
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
                 占位符不能靠 v-pre 躲：v-pre 会连 v-if 一起跳过，两个 span 会同时渲染。
                 用 HTML 实体写双花括号，编译期不当插值，渲染出来仍是 {{message}}。 -->
            <span v-if="!decisionOpen" class="field-hint">用 &#123;&#123;message&#125;&#125; 表示当前这条用户消息；没写它的话，消息会自动接在末尾。</span>
            <span v-else-if="gateContextTurnsOpen" id="gateContextPromptHint" class="field-hint">这一格是「带前文模式」的题面：模型能看到上面几轮对话，判定标准换成「上面有没有 / 要不要翻更早的记录」那一套。前文取不到时（比如会话第一句）自动退回不带前文的题面，不会因此失败。
              用 &#123;&#123;message&#125;&#125; 表示当前这条用户消息；没写它时这句就是纯题面（前文与消息本身都在 state 里，不会重复发）。</span>
            <span v-else id="decisionPromptHint" class="field-hint">这一格是题面，不是让模型生成文本：判定标准由内置的两条描述决定（有指代或省略 / 自己把话说完整），模型只在两者之间选一个并给出置信度。选「有指代或省略」且置信度不低于下面的召回门槛（默认 0.45）时照常召回，选「自己把话说完整」时跳过召回。
              为什么这么问：直接问「要不要查记忆」，模型看一句孤立的话会倾向答「不用查」，实测十条该召回的全漏；改问「不看之前的对话够不够回答」，它才会去找这句话缺了什么。两个问法测的是同一件事，后者才问得动。
              用 &#123;&#123;message&#125;&#125; 表示当前这条用户消息；没写它时这句就是纯题面（消息本身在 state 里，不会重复发）。</span>
          </div>
        </NGridItem>

        <!-- 召回门槛只属于 decision 档：need 且置信度够得着才召回。
             与提示词同一个展开区，位置在题面之后、模型下拉之前；
             失焦 / 回车才提交，清空不提交、回填已确认值（store.setDecisionThreshold）。 -->
        <NGridItem v-if="decisionOpen">
          <div class="field">
            <label for="gateDecisionThreshold">召回门槛</label>
            <NInputNumber
              size="small"
              style="width: 100%"
              :show-button="false"
              :update-value-on-input="false"
              :min="GATE_DECISION_THRESHOLD_MIN"
              :max="GATE_DECISION_THRESHOLD_MAX"
              :step="GATE_DECISION_THRESHOLD_STEP"
              :placeholder="String(GATE_DECISION_THRESHOLD_DEFAULT)"
              :input-props="{ id: 'gateDecisionThreshold' }"
              :value="state.form.gateDecisionThreshold"
              @update:value="(value) => setDecisionThreshold(value)"
            />
            <span id="gateDecisionThresholdHint" class="field-hint">{{ GATE_DECISION_THRESHOLD_HINT }}</span>
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

    <!-- 只有 recallGate=decision 时才展开：模型由服务配置决定，所以这里没有模型输入框。
         这里只剩决策服务状态行（服务没配时这一档根本选不到，存量会归一化成 off）。 -->
    <div id="decisionService" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!decisionOpen">
      <div class="field">
        <span class="field-hint">{{ decisionService.text }}</span>
      </div>
    </div>
  </NCard>
</template>

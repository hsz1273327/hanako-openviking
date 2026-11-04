<script setup>
// 召回卡：判断「查不查」（召回判断）与「拿什么查」（召回查询），
// 加上 llm 判断用的提示词与模型。重排在 RerankCard.vue —— 那是「查回来之后
// 怎么排序」，另一件事，不混在这张卡里。
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

const { state, enabled, setForm, setPrompt, touchPrompt, resetPrompt, gatePromptStatus, setFocus } =
  useConfig();
const { options, hint: modelsHint } = useModels();

const gateOpen = computed(() => state.form.recallGate === "llm");
const gateStatus = computed(() => gatePromptStatus());

// 判断模型下拉的选项：默认（宿主辅助模型）+ 目录；目录读不到也保留默认项。
const gateModelOptions = computed(() => options(state.form.gateModel));

// 两个固定下拉的选项表：n-select 只认 { label, value }，文案与手写版逐字一致。
const GATE_OPTIONS = Object.freeze([
  { label: "不判断（每轮都召回）", value: "off" },
  { label: "规则跳过（极短的纯操作指令）", value: "rules" },
  { label: "模型判断（用宿主模型）", value: "llm" },
]);
const QUERY_MODE_OPTIONS = Object.freeze([
  { label: "最后一句", value: "last" },
  { label: "带上文（最近三条）", value: "context" },
]);

// 下拉改了就整单提交（setForm → saveLayers）。
function onSelect(key, value) {
  setForm(key, value);
}

// 提示词是 value：每敲一个字先写进草稿（标记 touched），失焦 / 回车才提交。
function onPromptInput(which, value) {
  touchPrompt(which, value);
}

function onPromptChange(which, value) {
  setPrompt(which, value);
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
            :options="GATE_OPTIONS"
            :input-props="{ id: 'recallGate' }"
            :value="state.form.recallGate"
            @update:value="(value) => onSelect('recallGate', value)"
          />
          <span class="field-hint">规则跳过只认 ≤8 字、无问号、无疑问词、无指代词的指令；模型判断失败或超时会照常召回。</span>
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

    <!-- 只有 recallGate=llm 时才展开。提示词框里放的就是当前生效的提示词。
         提示词与模型两格用 NGrid :cols="2"（700px 以下收成一列）。 -->
    <div id="gateAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!gateOpen">
      <NGrid cols="1 700:2" responsive="screen" :x-gap="10" :y-gap="8">
        <NGridItem>
          <div class="field">
            <div class="prompt-head">
              <label for="gatePrompt">判断提示词</label>
              <span id="gatePromptStatus" class="prompt-status">{{ gateStatus }}</span>
              <NButton id="gateResetPrompt" size="small" quaternary @click="resetPrompt('gate')">
                恢复默认
              </NButton>
            </div>
            <NInput
              type="textarea"
              size="small"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :maxlength="2000"
              placeholder="留空则用内置默认模板"
              :input-props="{ id: 'gatePrompt', spellcheck: 'false' }"
              :value="state.prompts.gate"
              @focus="setFocus('gatePrompt')"
              @blur="setFocus('')"
              @update:value="onPromptInput('gate', $event)"
              @change="onPromptChange('gate', $event)"
            />
            <!-- 提示词是模板：占位符处填当前这条用户消息，渲染后整段作为单条用户消息发给模型。 -->
            <span class="field-hint" v-pre>用 {{message}} 表示当前这条用户消息；没写它的话，消息会自动接在末尾。</span>
          </div>
        </NGridItem>

        <NGridItem>
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
  </NCard>
</template>

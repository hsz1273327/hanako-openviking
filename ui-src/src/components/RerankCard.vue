<script setup>
// 重排卡：「查回来之后怎么排序」——重排开关、重排提示词、兜底模型、精排通道。
// 召回（查不查 / 拿什么查）在 RecallCard.vue，两件事不混在一张卡里。
//
// 行为第 1~2、4、6 条仍然成立，只是搬家：
//   - 「结果重排」是这张卡的第一项，改了就提交，没有保存按钮；
//   - 失败回滚由 store.saveLayers → commitLayers 负责，控件值跟着退回；
//   - 提交仍然是**整单**：本卡只调 setForm / setPrompt，请求体由
//     lib/panel-store.js 的 readLayers() 整份拼（这一卡改一个键，请求里
//     仍然带着 recallGate 与 queryMode）。组件里不出现任何 post / fetch。
//   - 提示词框里放的是 value，三态小字：默认 / 已修改 / 空；恢复默认只填框、走正常提交。
//
// 形态交给 naive-ui：一张 n-card（title="重排"），按内容定高（不吃余量，
// 余量归候选池卡）。展开区里提示词与模型两格 NGrid :cols="2"（700px 以下一列），
// 通道列表在 ChannelList.vue。
import { computed } from "vue";
import { NButton, NCard, NGrid, NGridItem, NInput, NSelect } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import ChannelList from "./ChannelList.vue";

const { state, enabled, setForm, setPrompt, touchPrompt, resetPrompt, rerankPromptStatus, setFocus } =
  useConfig();
const { options, hint: modelsHint } = useModels();

const rerankOpen = computed(() => state.form.rerank === "llm");
const rerankStatus = computed(() => rerankPromptStatus());

// 兜底模型下拉的选项：默认（宿主辅助模型）+ 目录；目录读不到也保留默认项。
const rerankModelOptions = computed(() => options(state.form.rerankModel));

// 固定下拉的选项表：n-select 只认 { label, value }，文案与手写版逐字一致。
const RERANK_OPTIONS = Object.freeze([
  { label: "关", value: "off" },
  { label: "开启", value: "llm" },
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
    class="rerank-card"
    size="small"
    title="重排"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <!-- 第一项就是「结果重排」：它是这张卡的总开关，展开区跟着它走。
         和召回卡一样走两列栅格：下拉占半行、说明在它下面，
         不把一个只有「关 / 开启」两个值的下拉拉成一整行宽。 -->
    <NGrid class="rerank-grid" cols="1 700:2" responsive="screen" :x-gap="10" :class="{ dim: !enabled }">
      <NGridItem>
        <div class="field">
          <span class="field-label">结果重排</span>
          <NSelect
            size="small"
            aria-label="结果重排"
            :options="RERANK_OPTIONS"
            :input-props="{ id: 'rerank' }"
            :value="state.form.rerank"
            @update:value="(value) => onSelect('rerank', value)"
          />
          <span class="field-hint">开启后按下面的通道精排；没有启用通道时用兜底模型。任一路失败只弃权，全部弃权时原样保留。</span>
        </div>
      </NGridItem>
    </NGrid>

    <!-- 只有 rerank=llm 时才展开。 -->
    <div id="rerankAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!rerankOpen">
      <NGrid cols="1 700:2" responsive="screen" :x-gap="10" :y-gap="8">
        <NGridItem>
          <div class="field">
            <div class="prompt-head">
              <label for="rerankPrompt">重排提示词</label>
              <span id="rerankPromptStatus" class="prompt-status">{{ rerankStatus }}</span>
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
        </NGridItem>

        <NGridItem>
          <div class="field">
            <span class="field-label">兜底模型（无启用通道时）</span>
            <NSelect
              size="small"
              aria-label="兜底模型（无启用通道时）"
              :options="rerankModelOptions"
              :input-props="{ id: 'rerankModel' }"
              :value="state.form.rerankModel"
              @update:value="(value) => onSelect('rerankModel', value)"
            />
            <span id="rerankModelsHint" class="field-hint" :hidden="!modelsHint">{{ modelsHint }}</span>
          </div>
        </NGridItem>
      </NGrid>

      <ChannelList />
    </div>
  </NCard>
</template>

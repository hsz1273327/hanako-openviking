<script setup>
// 召回管理：三个主下拉 + 两个展开区（llm 判断 / 结果重排）+ 通道 + peer 名单。
//
// 行为第 1~4 条都在这里看得见：
//   - 三个下拉改了就提交，没有保存按钮；
//   - 失败回滚由 store.saveLayers → commitLayers 负责，控件值跟着退回；
//   - /recall-mode 是整单校验：召回判断与召回查询永远一起 POST（其实整份配置一起发），
//     不会出现「一半生效」的显示；
//   - 提示词框里放的是 value（配置为空时坐默认全文），不是 placeholder；
//     「恢复默认」只填框、走正常提交；旁边小字三态：默认 / 已修改 / 空。
import { computed } from "vue";
import { useConfig } from "../composables/useConfig.js";
import { useModels } from "../composables/useModels.js";
import { usePeers } from "../composables/usePeers.js";
import ChannelList from "./ChannelList.vue";
import PeerList from "./PeerList.vue";

const {
  state,
  enabled,
  setForm,
  setPrompt,
  touchPrompt,
  resetPrompt,
  gatePromptStatus,
  rerankPromptStatus,
  setFocus,
} = useConfig();
const { options, hint: modelsHint } = useModels();
const { count: peerCountText } = usePeers();

const gateOpen = computed(() => state.form.recallGate === "llm");
const rerankOpen = computed(() => state.form.rerank === "llm");

const gateStatus = computed(() => gatePromptStatus());
const rerankStatus = computed(() => rerankPromptStatus());

// 两个模型下拉的选项：默认（宿主辅助模型）+ 目录；目录读不到也保留默认项。
const gateModelOptions = computed(() => options(state.form.gateModel));
const rerankModelOptions = computed(() => options(state.form.rerankModel));

function onSelect(key, event) {
  setForm(key, event.target.value);
}

function onPromptInput(which, event) {
  touchPrompt(which, event.target.value);
}

function onPromptChange(which, event) {
  setPrompt(which, event.target.value);
}
</script>

<template>
  <section class="card recall" aria-label="召回管理">
    <header class="recall-head">
      <h2 class="card-title">召回管理</h2>
      <span id="peerCount" class="peer-count">{{ peerCountText }}</span>
    </header>

    <div class="recall-grid" :class="{ dim: !enabled }">
      <div class="field">
        <label for="recallGate">召回判断</label>
        <select id="recallGate" :value="state.form.recallGate" @change="onSelect('recallGate', $event)">
          <option value="off">不判断（每轮都召回）</option>
          <option value="rules">规则跳过（极短的纯操作指令）</option>
          <option value="llm">模型判断（用宿主模型）</option>
        </select>
        <span class="field-hint">规则跳过只认 ≤8 字、无问号、无疑问词、无指代词的指令；模型判断失败或超时会照常召回。</span>
      </div>
      <div class="field">
        <label for="queryMode">召回查询</label>
        <select id="queryMode" :value="state.form.queryMode" @change="onSelect('queryMode', $event)">
          <option value="last">最后一句</option>
          <option value="context">带上文（最近三条）</option>
        </select>
        <span class="field-hint">带上文会拼最近三条用户文本，总长最多 300 字符，最新一句保持完整。</span>
      </div>
      <div class="field">
        <label for="rerank">结果重排</label>
        <select id="rerank" :value="state.form.rerank" @change="onSelect('rerank', $event)">
          <option value="off">关</option>
          <option value="llm">开启</option>
        </select>
        <span class="field-hint">开启后按下面的通道精排；没有启用通道时用兜底模型。任一路失败只弃权，全部弃权时原样保留。</span>
      </div>
    </div>

    <!-- 只有 recallGate=llm 时才展开。提示词框里放的就是当前生效的提示词。 -->
    <div id="gateAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!gateOpen">
      <div class="field">
        <div class="prompt-head">
          <label for="gatePrompt">判断提示词</label>
          <span id="gatePromptStatus" class="prompt-status">{{ gateStatus }}</span>
          <button id="gateResetPrompt" class="btn ghost sm" type="button" @click="resetPrompt('gate')">
            恢复默认
          </button>
        </div>
        <textarea
          id="gatePrompt"
          rows="4"
          maxlength="2000"
          spellcheck="false"
          :value="state.prompts.gate"
          @focus="setFocus('gatePrompt')"
          @blur="setFocus('')"
          @input="onPromptInput('gate', $event)"
          @change="onPromptChange('gate', $event)"
        ></textarea>
        <!-- 提示词是模板：占位符处填当前这条用户消息，渲染后整段作为单条用户消息发给模型。 -->
        <span class="field-hint" v-pre>用 {{message}} 表示当前这条用户消息；没写它的话，消息会自动接在末尾。</span>
      </div>

      <div class="field">
        <label for="gateModel">判断模型</label>
        <!-- 一个下拉选到底：首项是默认（走宿主辅助模型），其余就是目录里的每个模型。 -->
        <select id="gateModel" :value="state.form.gateModel" @change="onSelect('gateModel', $event)">
          <option v-for="option in gateModelOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <span id="gateModelsHint" class="field-hint" :hidden="!modelsHint">{{ modelsHint }}</span>
      </div>
    </div>

    <!-- 只有 rerank=llm 时才展开。 -->
    <div id="rerankAdvanced" class="gate-advanced" :class="{ dim: !enabled }" :hidden="!rerankOpen">
      <div class="field">
        <div class="prompt-head">
          <label for="rerankPrompt">重排提示词</label>
          <span id="rerankPromptStatus" class="prompt-status">{{ rerankStatus }}</span>
          <button id="rerankResetPrompt" class="btn ghost sm" type="button" @click="resetPrompt('rerank')">
            恢复默认
          </button>
        </div>
        <textarea
          id="rerankPrompt"
          rows="4"
          maxlength="2000"
          spellcheck="false"
          :value="state.prompts.rerank"
          @focus="setFocus('rerankPrompt')"
          @blur="setFocus('')"
          @input="onPromptInput('rerank', $event)"
          @change="onPromptChange('rerank', $event)"
        ></textarea>
        <span class="field-hint" v-pre>用 {{message}} 表示当前这条用户消息，用 {{candidates}} 表示候选清单；没写 {{candidates}} 的话，清单会自动接在末尾。</span>
      </div>

      <div class="field">
        <label for="rerankModel">兜底模型（无启用通道时）</label>
        <select id="rerankModel" :value="state.form.rerankModel" @change="onSelect('rerankModel', $event)">
          <option v-for="option in rerankModelOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <span id="rerankModelsHint" class="field-hint" :hidden="!modelsHint">{{ modelsHint }}</span>
      </div>

      <ChannelList />
    </div>

    <div class="recall-sep" aria-hidden="true"></div>

    <PeerList />

    <!-- 提示位在记忆页也有一份：这一页上的写入（peer 排除 / 召回策略）如果只
         在全局页报错，用户在这一页根本看不见。文案与全局页同源（store.note）。 -->
    <p class="save-hint" :class="{ ok: !state.note.bad, bad: state.note.bad }">{{ state.note.text }}</p>
  </section>
</template>

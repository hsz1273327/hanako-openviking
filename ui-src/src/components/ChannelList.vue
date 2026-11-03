<script setup>
// 精排通道列表（在重排展开区里）。
//
// 行为第 6 条：
//   - 类型下拉只列「已配的打分服务 + 宿主模型」（channelTypeOptions）；
//   - 服务被清空后，存量通道保留在列表里，但标红 + 写「服务未配置，不会生效」，
//     不自动删数据；
//   - 权重 0.1 ~ 10，超时留空 = 该类型默认值（placeholder 就是那个数）；
//   - 通道行只剩类型 / 名称 / 权重 / 超时 / 启用 / 删除：地址与模型来自打分服务，
//     存量自带的那一对只在「只填一半」时给一句说明（channelPairNote）。
//
// 可提交性（isCompleteRerankChannel）与上限（RERANK_CHANNELS_MAX）都在
// lib/recall-layers.js；排序 / 增删 / 回滚在 store。
import { computed } from "vue";
import {
  RERANK_CHANNELS_MAX,
  SYSTEMONE_MAX_CANDIDATES,
  SYSTEMONE_TIMEOUT_BASE,
  SYSTEMONE_TIMEOUT_MAX,
  SYSTEMONE_TIMEOUT_STEP,
  rerankChannelsCountText,
} from "../lib/recall-layers.js";
import { useConfig } from "../composables/useConfig.js";

const {
  state,
  addChannel,
  updateChannel,
  removeChannel,
  setChannelWeight,
  setChannelTimeout,
  channelView,
  channelTypeChoices,
  testChannels,
} = useConfig();

const rows = computed(() => state.channels.map((channel, index) => channelView(channel, index)));
const countText = computed(() => rerankChannelsCountText(state.channels));
// 两个服务都没配时只剩「宿主模型」：此时没有可加的类型，按钮禁用并说明原因。
// 判据必须看「已配服务」（channelTypeOptions），不看行里补过存量值的选项。
const typeOptions = computed(() => channelTypeChoices());
const noService = computed(() => typeOptions.value.every((option) => option.value === "model"));
const addDisabled = computed(
  () => state.channels.length >= RERANK_CHANNELS_MAX || noService.value,
);

function onType(index, value) {
  // 换类型时通道自带的地址 / 模型作废：它们属于旧类型。
  updateChannel(index, { type: value, url: "", model: "" });
}

function onWeight(index, event) {
  const row = rows.value[index];
  const parsed = Number(event.target.value);
  if (!row || !Number.isFinite(parsed)) {
    event.target.value = row ? String(row.channel.weight) : "";
    return;
  }
  const clamped = Math.min(10, Math.max(0.1, parsed));
  event.target.value = String(clamped);
  setChannelWeight(index, clamped);
}

function onTimeout(index, event) {
  const row = rows.value[index];
  if (!row) return;
  const text = String(event.target.value ?? "").trim();
  if (!text) {
    setChannelTimeout(index, "");
    return;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    event.target.value = row.channel.timeoutMs ? String(row.channel.timeoutMs) : "";
    return;
  }
  const clamped = Math.min(row.timeoutCeiling, Math.max(200, Math.floor(parsed)));
  event.target.value = String(clamped);
  setChannelTimeout(index, clamped);
}

function timeoutTitle(row) {
  return row.channel.type === "systemone"
    ? `留空 = 自适应：${SYSTEMONE_TIMEOUT_BASE}ms 起，每多一条候选再给 ${SYSTEMONE_TIMEOUT_STEP}ms，上限 ${SYSTEMONE_TIMEOUT_MAX}ms；一次只问前 ${SYSTEMONE_MAX_CANDIDATES} 条`
    : "留空 = 用该类型的默认值";
}
</script>

<template>
  <div class="field channel-field">
    <div class="prompt-head">
      <label>精排通道</label>
      <span id="rerankChannelsCount" class="prompt-status">{{ countText }}</span>
      <button
        id="rerankTestBtn"
        class="btn ghost sm"
        type="button"
        :disabled="state.channelTest.pending"
        @click="testChannels()"
      >
        {{ state.channelTest.pending ? "测试中…" : "测试" }}
      </button>
    </div>

    <p id="rerankChannelsEmpty" class="field-hint" :hidden="state.channels.length > 0">
      还没有通道，精排不会生效
    </p>

    <div id="rerankChannelList" class="channel-list">
      <div
        v-for="row in rows"
        :key="row.index"
        class="channel-row"
        :class="{ warn: row.unavailable }"
        :data-index="row.index"
      >
        <div class="channel-row-head">
          <b>{{ row.title }}</b>
          <label class="channel-enabled">
            <input
              type="checkbox"
              :checked="row.channel.enabled"
              @change="updateChannel(row.index, { enabled: $event.target.checked })"
            />
            启用
          </label>
          <span v-if="row.unavailable" class="channel-unavailable">服务未配置，不会生效</span>
          <button
            class="btn ghost sm"
            type="button"
            @click="removeChannel(row.index)"
          >删除</button>
        </div>

        <div class="channel-cells">
          <label class="channel-cell">
            <span>类型</span>
            <select :value="row.channel.type" @change="onType(row.index, $event.target.value)">
              <option
                v-for="option in row.options"
                :key="option.value"
                :value="option.value"
              >{{ option.label }}</option>
            </select>
          </label>
          <label class="channel-cell">
            <span>名称</span>
            <input
              type="text"
              spellcheck="false"
              placeholder="显示名，可空"
              :value="row.channel.name"
              @change="updateChannel(row.index, { name: $event.target.value })"
            />
          </label>
          <label class="channel-cell">
            <span>权重</span>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              :value="row.channel.weight"
              @change="onWeight(row.index, $event)"
            />
          </label>
          <!-- 超时那一格：留空 = 用该类型的默认值（placeholder 就显示这个数）。 -->
          <label class="channel-cell">
            <span>超时（ms）</span>
            <input
              type="number"
              min="200"
              :max="row.timeoutCeiling"
              step="100"
              :placeholder="row.timeoutPlaceholder"
              :title="timeoutTitle(row)"
              :value="row.channel.timeoutMs ?? ''"
              @change="onTimeout(row.index, $event)"
            />
          </label>
        </div>

        <!-- 自己的地址与模型只填了一半：运行时那一对会整个改用服务配置，得说出来。 -->
        <p v-if="row.pairNote" class="channel-pair-note">{{ row.pairNote }}</p>
      </div>
    </div>

    <div class="channel-actions">
      <span id="rerankChannelHint" class="field-hint" :hidden="!noService">
        先在上面配好打分服务
      </span>
      <button
        id="rerankAddChannel"
        class="btn ghost sm"
        type="button"
        :disabled="addDisabled"
        @click="addChannel()"
      >添加通道</button>
    </div>

    <pre id="rerankTestResult" class="channel-result" :hidden="state.channelTest.hidden">{{ state.channelTest.text }}</pre>

    <span class="field-hint" v-pre>精排 / 决策两类走上面「打分服务」配的地址；宿主模型走宿主模型，模型留空表示辅助模型。多路按权重加权合并，单路失败只弃权不归零。通道自带的地址与模型成对生效，只填一半就整对改用服务配置。超时优先级：通道自带 &gt; 服务配置 &gt; 类型默认值；systemone 没配超时时按候选数自适应（3500ms 起，候选越多越慢，默认 5 条，一次问完全部候选，超过 5 条的按未打分处理）。</span>
  </div>
</template>

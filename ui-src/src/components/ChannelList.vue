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
//
// 形态：一个通道一张 n-card（size="small"，title 是通道名）；
// 卡头右侧是「启用 / 服务未配置 / 删除」，正文是 NGrid 四格（类型 / 名称 / 权重 / 超时，
// 520px 两列、700px 四列）。列表外面套 NScrollbar，条目多时区内滚，不顶高整列。
import { computed } from "vue";
import { NButton, NCard, NCheckbox, NGrid, NGridItem, NInput, NInputNumber, NScrollbar, NSelect } from "naive-ui";
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

// 通道不再手填名字：每类服务只能配一个模型，地址和模型都在「打分服务」里，
// 再手填一遍只是抄一遍的事，还容易和服务实际用的对不上。卡头改成自动显示
// 这一路实际打到哪个模型（channelView 的 title 里拼）。

function onWeight(index, value) {
  // n-input-number 清空给 null：不提交，也不让它变成 0 再被夹到 0.1。
  if (value === null || value === undefined) return;
  setChannelWeight(index, value);
}

function onTimeout(index, value) {
  // 清空仍是「用该类型默认值」：null 收成空串交给 store 删掉这一格。
  setChannelTimeout(index, value === null || value === undefined ? "" : value);
}

function timeoutTitle(row) {
  return row.channel.type === "systemone"
    ? `留空 = 自适应：${SYSTEMONE_TIMEOUT_BASE}ms 起，每多一条候选再给 ${SYSTEMONE_TIMEOUT_STEP}ms，上限 ${SYSTEMONE_TIMEOUT_MAX}ms；一次只问前 ${SYSTEMONE_MAX_CANDIDATES} 条`
    : "留空 = 用该类型的默认值";
}
</script>

<template>
  <div class="channel-field">
    <div class="prompt-head">
      <span class="field-label">精排通道</span>
      <span id="rerankChannelsCount" class="prompt-status">{{ countText }}</span>
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

    <p id="rerankChannelsEmpty" class="field-hint" :hidden="state.channels.length > 0">
      还没有通道，精排不会生效
    </p>

    <div id="rerankChannelList" class="channel-list">
      <NScrollbar class="channel-scroll">
        <div class="channel-stack">
          <NCard
            v-for="row in rows"
            :key="row.index"
            class="channel-card"
            :class="{ warn: row.unavailable }"
            size="small"
            :bordered="false"
            :title="row.title"
            :data-index="row.index"
            header-style="padding: 4px 16px"
            content-style="padding: 16px"
          >
            <template #header-extra>
              <div class="channel-head-extra">
                <NCheckbox
                  class="channel-enabled"
                  size="small"
                  :checked="row.channel.enabled"
                  @update:checked="(next) => updateChannel(row.index, { enabled: next })"
                >
                  启用
                </NCheckbox>
                <span v-if="row.unavailable" class="channel-unavailable">服务未配置，不会生效</span>
                <NButton
                  size="small"
                  quaternary
                  @click="removeChannel(row.index)"
                >删除</NButton>
              </div>
            </template>

            <NGrid cols="1 520:2 700:3" responsive="screen" :x-gap="8" :y-gap="6">
              <NGridItem>
                <!-- 类型那格包的是 NSelect：非 filterable 时内部没有 <input>，
                     包在 <label> 里也关联不上，所以用 div + 控件自己的 aria-label。 -->
                <div class="channel-cell">
                  <span>类型</span>
                  <NSelect
                    size="small"
                    aria-label="类型"
                    :options="row.options"
                    :value="row.channel.type"
                    @update:value="(value) => onType(row.index, value)"
                  />
                </div>
              </NGridItem>
              <NGridItem>
                <label class="channel-cell">
                  <span>权重</span>
                  <NInputNumber
                    size="small"
                    :show-button="false"
                    :update-value-on-input="false"
                    :min="0.1"
                    :max="10"
                    :step="0.1"
                    placeholder="默认 1"
                    :value="row.channel.weight"
                    @update:value="(value) => onWeight(row.index, value)"
                  />
                </label>
              </NGridItem>
              <!-- 超时那一格：留空 = 用该类型的默认值（placeholder 就显示这个数）。 -->
              <NGridItem>
                <label class="channel-cell">
                  <span>超时（ms）</span>
                  <NInputNumber
                    size="small"
                    :show-button="false"
                    :update-value-on-input="false"
                    :min="200"
                    :max="row.timeoutCeiling"
                    :step="100"
                    :placeholder="row.timeoutPlaceholder"
                    :title="timeoutTitle(row)"
                    :value="row.channel.timeoutMs ?? null"
                    @update:value="(value) => onTimeout(row.index, value)"
                  />
                </label>
              </NGridItem>
            </NGrid>

            <!-- 自己的地址与模型只填了一半：运行时那一对会整个改用服务配置，得说出来。 -->
            <p v-if="row.pairNote" class="channel-pair-note">{{ row.pairNote }}</p>
          </NCard>
        </div>
      </NScrollbar>
    </div>

    <div class="channel-actions">
      <span id="rerankChannelHint" class="field-hint" :hidden="!noService">
        先在上面配好打分服务
      </span>
      <NButton
        id="rerankAddChannel"
        size="small"
        quaternary
        :disabled="addDisabled"
        @click="addChannel()"
      >添加通道</NButton>
    </div>

    <pre id="rerankTestResult" class="channel-result" :hidden="state.channelTest.hidden">{{ state.channelTest.text }}</pre>

    <span class="field-hint" v-pre>精排 / 决策两类走上面「打分服务」配的地址；宿主模型走宿主模型，模型留空表示辅助模型。多路按权重加权合并，单路失败只弃权不归零。通道自带的地址与模型成对生效，只填一半就整对改用服务配置。超时优先级：通道自带 &gt; 服务配置 &gt; 类型默认值；systemone 没配超时时按候选数自适应（3500ms 起，候选越多越慢，默认 5 条，一次问完全部候选，超过 5 条的按未打分处理）。</span>
  </div>
</template>

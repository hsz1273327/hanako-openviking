<script setup>
// 去重卡：召回之后、精排之前那一步里的两小步。
//
//   精确去重  恒开，不可关（uri 相同 / 去掉空白后字面相同）——这一页只作说明；
//   近重复    可开关 + 一个阈值（字符 3-gram 的 Jaccard，纯算法、不调模型）。
//
// 为什么精确去重不给开关：它没有取舍。同一条记忆的两份副本，留两份只是白占
// 精排的保留名额，关掉它得不到任何好处。可调的是近重复那一档：阈值调低合并更多，
// 调高更保守，所以这里只给它开关与数字格。
//
// 两档都在召回之后、凭据过滤之后、精排之前跑，顺序见 src/memory/recall.js；
// 两笔账分开记（droppedNear / droppedExact），探针里对得上。
//
// 提交仍然走召回策略那一单（setForm / setDedupeThreshold，与 RerankCard 同一套
// 失败回滚），组件里不出现任何 post / fetch。
import { computed } from "vue";
import { NCard, NInputNumber, NSwitch } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import {
  DEDUPE_EXACT_NOTE,
  DEDUPE_NEAR_LIMIT_NOTE,
  DEDUPE_NEAR_NOTE,
  DEDUPE_THRESHOLD_HINT,
  DEDUPE_THRESHOLD_MAX,
  DEDUPE_THRESHOLD_MIN,
  DEDUPE_THRESHOLD_STEP,
} from "../lib/recall-layers.js";

const { state, enabled, setForm, setDedupeThreshold } = useConfig();

// 开关就是 state.form.dedupeNear 本身：没有第二档，缺项 / 脏值由投影收敛成「开」。
const nearOn = computed(() => state.form.dedupeNear !== false);

/** 开关改了就整单提交（setForm → saveLayers）。 */
function onSwitch(value) {
  return setForm("dedupeNear", Boolean(value));
}

/**
 * 阈值数字格：n-input-number 清空给 null。
 * 清空 = 回默认 0.8 并真的提交（「留空用默认」是这一格自己的语义，不是「还没填完」）。
 */
function onThreshold(value) {
  return setDedupeThreshold(value === null || value === undefined ? "" : value);
}
</script>

<template>
  <NCard
    class="dedupe-card"
    size="small"
    title="去重"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <div class="field" :class="{ dim: !enabled }">
      <span class="field-label">近重复检测</span>
      <NSwitch
        size="small"
        aria-label="近重复检测"
        :input-props="{ id: 'dedupeNear' }"
        :value="nearOn"
        @update:value="onSwitch"
      />
      <span class="field-hint">
        关掉就只剩精确去重：同一段内容被提取两遍、加了个抬头、标点 / 换行 / 大小写不同、
        或者截取长度不同的那几条会各留一份，白占精排的保留名额。
      </span>
    </div>

    <div class="field" :class="{ dim: !enabled }" :hidden="!nearOn">
      <label for="dedupeThreshold">近重复阈值</label>
      <NInputNumber
        size="small"
        :show-button="false"
        :update-value-on-input="false"
        :min="DEDUPE_THRESHOLD_MIN"
        :max="DEDUPE_THRESHOLD_MAX"
        :step="DEDUPE_THRESHOLD_STEP"
        placeholder="默认 0.8"
        :input-props="{ id: 'dedupeThreshold' }"
        :value="state.form.dedupeThreshold ?? null"
        @update:value="onThreshold"
      />
      <span class="field-hint">{{ DEDUPE_THRESHOLD_HINT }}。留空用默认 0.8；0.5–1.0 之外的值与非数字同样回 0.8。</span>
    </div>

    <div class="field" :class="{ dim: !enabled }">
      <span class="field-label">算法</span>
      <span class="field-hint">{{ DEDUPE_NEAR_NOTE }}</span>
      <span class="field-hint">{{ DEDUPE_NEAR_LIMIT_NOTE }}</span>
      <span class="field-hint">{{ DEDUPE_EXACT_NOTE }}</span>
    </div>
  </NCard>
</template>

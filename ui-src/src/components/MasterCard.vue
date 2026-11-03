<script setup>
// 总闸：整页唯一的是非题，关着的时候下面的能力块一起变淡（行为第 8 条）。
//
// 乐观更新与失败回滚在 store 里（flip），这里只把状态摆出来：
//   - aria / 视觉跟随服务端确认过的 controls.enabled；
//   - 说明那句话由 lib/panel-view.js 的 statusView 给（开 / 关两种文案）；
//   - 关着时 .master[data-off="true"] 换成灰底（CSS 手写，不在这里写样式）。
//
// 形态全部交给 naive-ui：卡片壳是 n-card（title="总闸" 是卡头），
// 开关行是 NSpace + NText + NSwitch（一句说明在左、开关在右），
// 说明文字是 n-text（warn 档走 type="error"）。
// 不再手写 .toggle / .toggle-copy / .master-hint 那一套。
import { computed } from "vue";
import { NCard, NSpace, NSwitch, NText } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useStatus } from "../composables/useStatus.js";

const { state, flip } = useConfig();
const { view } = useStatus();

// 说明文字的档位：正常半透（depth=3），不推荐的关闸状态直接标红。
const hintDepth = computed(() => (view.value.masterHintWarn ? undefined : 3));
const hintType = computed(() => (view.value.masterHintWarn ? "error" : undefined));
</script>

<template>
  <NCard
    id="masterCard"
    class="master"
    size="small"
    title="总闸"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
    :data-off="state.controls.enabled ? 'false' : 'true'"
  >
    <!-- 开关不可被会话覆盖，所以它不随任何页面状态禁用，只随写入结果回滚。
         用 NThing 会多出一个空的 header 区（没给 title 也不省），白占 29px，
         而这一行本来就是「一句说明 + 右边一个开关」，NSpace + NText 就够。 -->
    <NSpace align="center" justify="space-between" :size="8" :wrap="false">
      <NText id="masterHint" class="hint-body" :depth="hintDepth" :type="hintType">
        {{ view.masterHint }}
      </NText>
      <NSwitch
        aria-label="总闸"
        :value="state.controls.enabled"
        @update:value="(next) => flip('enabled', next)"
      />
    </NSpace>
  </NCard>
</template>

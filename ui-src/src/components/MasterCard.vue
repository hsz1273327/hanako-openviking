<script setup>
// 总闸：整页唯一的是非题，关着的时候下面的能力块一起变淡（行为第 8 条）。
//
// 乐观更新与失败回滚在 store 里（flip），这里只把状态摆出来：
//   - aria / 视觉跟随服务端确认过的 controls.enabled；
//   - 说明文字由 lib/panel-view.js 的 statusView 给（开 / 关两种文案）；
//   - 关着时 .master[data-off="true"] 换成灰底（CSS 手写，不在这里写样式）。
//
// 卡片形态交给 n-card：title="总闸" 是卡头，开关放 #header-extra（右对齐），
// 说明那句话是正文。不再手写 .card / .card-title 那一套。
import { NCard, NSwitch } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { useStatus } from "../composables/useStatus.js";

const { state, flip } = useConfig();
const { view } = useStatus();
</script>

<template>
  <NCard
    id="masterCard"
    class="master"
    size="small"
    title="总闸"
    header-style="padding: 6px 12px"
    content-style="padding: 4px 12px 8px"
    :data-off="state.controls.enabled ? 'false' : 'true'"
  >
    <template #header-extra>
      <!-- 总闸不可被会话覆盖，所以它不随任何页面状态禁用，只随写入结果回滚。 -->
      <NSwitch
        aria-label="总闸"
        :value="state.controls.enabled"
        @update:value="(next) => flip('enabled', next)"
      />
    </template>
    <p id="masterHint" class="master-hint" :class="{ warn: view.masterHintWarn }">
      {{ view.masterHint }}
    </p>
  </NCard>
</template>

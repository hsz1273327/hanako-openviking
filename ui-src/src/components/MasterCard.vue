<script setup>
// 总闸：整页唯一的是非题，关着的时候下面的能力块一起变淡（行为第 8 条）。
//
// 乐观更新与失败回滚在 store 里（flip），这里只把状态摆出来：
//   - aria / 视觉跟随服务端确认过的 controls.enabled；
//   - 说明那句话由 lib/panel-view.js 的 statusView 给（开 / 关两种文案）；
//   - 关着时 .master[data-off="true"] 换成灰底（CSS 手写，不在这里写样式）。
//
// 形态全部交给 naive-ui：卡片壳是 n-card，标题与说明同处卡头（#header），
// 开关在 #header-extra，说明文字是 n-text（warn 档走 type="error"）。
// 不再手写 .toggle / .toggle-copy / .master-hint 那一套。
//
// 整张卡**只有卡头没有正文**：「总闸 + 一句说明 + 一个开关」本来就是一行的事。
// 改前标题独占一行、正文再吃 16px 上下内边距，整卡 90px 里 56px 是纯留白。
// 不给默认 slot，n-card 就不渲染 .n-card-content（见 naive 的 Card.mjs）。
// 也刻意不传 title="总闸"：naive 里 title 属性优先级高于 #header 槽，
// 两个都写会把 #header 整个盖掉（标题又回到一行）。
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
    :bordered="false"
    header-style="padding: 4px 16px"
    :data-off="state.controls.enabled ? 'false' : 'true'"
  >
    <!-- 卡头左侧：标题 + 一句说明（baseline 对齐，字号同一档）。
         开关不可被会话覆盖，所以它不随任何页面状态禁用，只随写入结果回滚。 -->
    <template #header>
      <NSpace align="baseline" :size="8" :wrap="false">
        <NText strong class="hint-body master-title">总闸</NText>
        <NText id="masterHint" class="hint-body" :depth="hintDepth" :type="hintType">
          {{ view.masterHint }}
        </NText>
      </NSpace>
    </template>
    <template #header-extra>
      <NSwitch
        aria-label="总闸"
        :value="state.controls.enabled"
        @update:value="(next) => flip('enabled', next)"
      />
    </template>
  </NCard>
</template>

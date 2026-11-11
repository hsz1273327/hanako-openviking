<script setup>
// 记忆共享页：只管写回这一半。
//
// 这一版只放「现在就能生效」的东西：写回开关 + 状态行空态 + 一段说明。
// commit 策略 / 服务端兜底 / 手动补录 都还没做，所以一张卡、一行状态、一句说明就够用。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { NCard, NSwitch, NText } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";
import { captureStatusView } from "../lib/capture-view.js";

const { state, flip } = useConfig();
const status = captureStatusView(null);
</script>

<template>
  <NCard
    class="capture-card"
    size="small"
    title="写回"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <template #header-extra>
      <NSwitch
        aria-label="写回"
        :value="state.controls.autoCapture"
        @update:value="(next) => flip('autoCapture', next)"
      />
    </template>

    <!-- 文案整段写在一行里：模板里的换行会被压成一个空格，中文句子中间会多出空档。 -->
    <NText class="hint-line" depth="3">打开后，每轮对话的增量会提交到 OpenViking，由服务端抽成可检索的长期记忆。这段记忆写在自己这台机器的门牌（peer）下，不会覆盖其它机器的记忆。</NText>
    <NText class="hint-line" depth="3">记忆搜索与写回互不影响：关掉记忆搜索只停读、写回照旧；关掉写回只停写、搜索照旧。</NText>
  </NCard>

  <div class="facts-row">
    <span class="fact">
      <span class="fact-label">本会话已写</span>
      <b>{{ status.written }}</b>
    </span>
    <span class="fact">
      <span class="fact-label">上次提交</span>
      <b>{{ status.lastCommit }}</b>
    </span>
    <span class="fact">
      <span class="fact-label">待提交</span>
      <b>{{ status.pending }}</b>
    </span>
  </div>

  <NText class="hint-line" depth="3">这一页暂时只有写回开关。状态行要等后端写回链路做完之后才会有数。</NText>
</template>

<script setup>
// 日志页：计数条 + 正文（区内滚动，整页不自滚）。
//
// 几点别改坏（行为第 9 条）：
//   1. 正文倒序（最新在上），一行一条 JSON，滚动在正文自己身上；
//   2. 行数上限由服务端定（/probe 只回最后 60 条），面板不再二次截断；
//   3. 后端只有 GET /probe，没有清空 / 刷新接口——不加点了没反应的按钮。
//
// 形态交给 naive-ui：一张 n-card（title="日志"）吃满本页，计数条 #logChips
// 放卡的 #header-extra（标题在左、计数在右），正文是 NScrollbar > pre。
// 高度全部由 panel.css 的 #panel-logs / .logs / .log 三条规则接起来。
import { NCard, NScrollbar } from "naive-ui";
import { useLogs } from "../composables/useLogs.js";

const { chips, body } = useLogs();
</script>

<template>
  <NCard
    class="logs"
    size="small"
    title="日志"
    content-style="padding: 4px 12px 8px"
  >
    <template #header-extra>
      <div id="logChips" class="chips">
        <span
          v-for="(chip, index) in chips"
          :key="index"
          :style="chip.muted ? { opacity: 0.45 } : undefined"
        >{{ chip.text }}</span>
      </div>
    </template>

    <NScrollbar class="log">
      <pre id="logBody" class="log-body">{{ body }}</pre>
    </NScrollbar>
  </NCard>
</template>

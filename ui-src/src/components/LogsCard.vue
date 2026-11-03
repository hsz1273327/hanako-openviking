<script setup>
// 日志卡：事件计数 + 折叠 / 展开 + 区内滚动。
//
// 三点别改坏（行为第 9 条）：
//   1. 默认折叠，按钮只切「隐藏」与文案（展开 / 收起）；
//   2. 正文倒序（最新在上），一行一条 JSON，内部滚动（.log 的 height + overflow）；
//   3. 行数上限由服务端定（/probe 只回最后 60 条），面板不再二次截断。
import { useLogs } from "../composables/useLogs.js";

const { chips, open, body, toggle } = useLogs();
</script>

<template>
  <section class="card logs">
    <header class="logs-head">
      <h2 class="card-title">日志</h2>
      <div id="logChips" class="chips">
        <span
          v-for="(chip, index) in chips"
          :key="index"
          :style="chip.muted ? { opacity: 0.45 } : undefined"
        >{{ chip.text }}</span>
      </div>
      <button id="logToggle" class="btn ghost sm" type="button" @click="toggle()">
        {{ open ? "收起" : "展开" }}
      </button>
    </header>
    <pre id="logBody" class="log" :hidden="!open">{{ body }}</pre>
  </section>
</template>

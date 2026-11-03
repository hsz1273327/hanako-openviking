<script setup>
// 日志卡：事件计数 + 折叠 / 展开 + 区内滚动。
//
// 几点别改坏（行为第 9 条）：
//   1. 默认折叠，按钮只切「隐藏」与文案（展开 / 收起）；
//   2. 正文倒序（最新在上），一行一条 JSON，内部滚动（n-scrollbar + .log 的 120px）；
//   3. 行数上限由服务端定（/probe 只回最后 60 条），面板不再二次截断。
//
// 形态交给 naive-ui：一张 n-card（title="日志"），计数条 #logChips 放卡的
// #header-extra（折叠与否都看得见）；正文是 NCollapse > NCollapseItem，
// 折叠头「日志正文」，展开按钮 #logToggle 挂在折叠头的 #header-extra。
//
// 折叠是**受控**的：:expanded-names="open ? ['logs'] : []"，回写只走 store 的
// toggle()。这样单击折叠头与点按钮汇到同一个状态，不存在两级状态。
import { NButton, NCard, NCollapse, NCollapseItem, NScrollbar } from "naive-ui";
import { useLogs } from "../composables/useLogs.js";

const { chips, open, body, toggle } = useLogs();

/** 折叠头的显隐回写：只在状态真的变了时才落 store（避免回写把两次点击吃成一次）。 */
function onExpanded(names) {
  const next = Array.isArray(names) ? names.includes("logs") : names === "logs";
  if (next !== open.value) toggle();
}
</script>

<template>
  <NCard
    id="logsCard"
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

    <NCollapse
      :expanded-names="open ? ['logs'] : []"
      :trigger-areas="['main', 'arrow']"
      @update:expanded-names="onExpanded"
    >
      <NCollapseItem name="logs" title="日志正文">
        <template #header-extra>
          <NButton id="logToggle" size="small" quaternary @click="toggle()">
            {{ open ? "收起" : "展开" }}
          </NButton>
        </template>
        <NScrollbar class="log">
          <pre id="logBody" class="log-body">{{ body }}</pre>
        </NScrollbar>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>

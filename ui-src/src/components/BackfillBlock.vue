<script setup>
// 存量会话：把历史会话里还没写出去的段补交上去。
//
// 逻辑全在 composables/useBackfill.js 与 lib/backfill-view.js：这里只排版。
// 进度轮询只在 running 时开（composable 里管表），running 落回 false 时会
// 重新拉一次清单，所以这里的数字是服务端算出来的真实值。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { computed, onMounted } from "vue";
import { NButton, NCard, NPopconfirm, NSpace } from "naive-ui";
import { BACKFILL_MAX_SEGMENTS, backfillAllConfirm } from "../lib/backfill-view.js";
import { useBackfill } from "../composables/useBackfill.js";

const { state, rows, progressText, totalsText, load, loadSessions, startSession, startAll, cancel } =
  useBackfill();

const confirmText = computed(() =>
  backfillAllConfirm({
    sessions: state.totals.sessions,
    segments: state.totals.segments,
    max: BACKFILL_MAX_SEGMENTS,
  }),
);

const allDisabled = () =>
  state.starting || state.status.running || state.totals.segments <= 0;

function rowStartDisabled(row) {
  return state.starting || state.status.running || row.pendingText === "0 段";
}

onMounted(load);
</script>

<template>
  <NCard
    class="backfill-card"
    size="small"
    title="存量会话"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <template #header-extra>
      <NSpace :size="8" :wrap="false">
        <NPopconfirm @positive-click="startAll">
          <template #trigger>
            <NButton id="backfillAllBtn" size="small" :disabled="allDisabled()">补交全部</NButton>
          </template>
          <span class="backfill-confirm">{{ confirmText }}</span>
        </NPopconfirm>
        <NButton
          id="backfillRefreshBtn"
          size="small"
          quaternary
          :disabled="state.loading"
          @click="loadSessions"
        >
          刷新
        </NButton>
      </NSpace>
    </template>

    <p v-if="progressText" class="backfill-progress">{{ progressText }}</p>

    <table class="backfill-table">
      <thead>
        <tr>
          <th class="backfill-col-session">会话</th>
          <th class="num backfill-col-num">消息数</th>
          <th class="num backfill-col-num">已写</th>
          <th class="num backfill-col-num">待补</th>
          <th class="backfill-col-seen">最近活动</th>
          <th class="backfill-col-ops">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.sessionId"
          class="backfill-row"
          :class="{ busy: row.busy }"
          :data-session-id="row.sessionId"
        >
          <td class="backfill-session">
            <div class="backfill-session-title" :title="row.titleFull">{{ row.titleText }}</div>
            <div class="backfill-session-sub">
              <code :title="row.idTitle">{{ row.shortId || row.sessionId }}</code><template v-if="row.agentText"> · {{ row.agentText }}</template>
            </div>
          </td>
          <td class="num">{{ row.messagesText }}</td>
          <td class="num">{{ row.writtenText }}</td>
          <td class="num">{{ row.pendingText }}</td>
          <td class="backfill-seen">{{ row.seenText }}</td>
          <td class="backfill-ops">
            <NButton size="tiny" :disabled="rowStartDisabled(row)" @click="startSession(row.sessionId)">
              {{ row.busy ? "补交中…" : "补交" }}
            </NButton>
            <NButton size="tiny" quaternary :disabled="row.cancelDisabled" @click="cancel">取消</NButton>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td class="backfill-empty" colspan="6">还没有可补交的会话</td>
        </tr>
      </tbody>
    </table>

    <p class="backfill-note">
      {{ totalsText }}；每次最多补交 {{ BACKFILL_MAX_SEGMENTS }} 段，段与段之间留 200ms；可以取消，下次从断点接着补。
    </p>
    <p v-if="state.note" class="backfill-note" :class="{ bad: state.noteBad }">{{ state.note }}</p>
  </NCard>
</template>

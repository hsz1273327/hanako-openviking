<script setup>
// peer 名单：整行可点（本机除外），绿框 = 参与召回，灰框 = 已排除。
//
// 行的文案与档位全部来自 lib/panel-view.js（peerMetaText / peerTitle /
// peerExcluded / peerTappable），组件只排版。点击的乐观更新与失败回滚在
// store.togglePeer 里，组件不碰状态（行为第 7 条）。
import { computed } from "vue";
import { useConfig } from "../composables/useConfig.js";
import { usePeers } from "../composables/usePeers.js";

const { state } = useConfig();
const { rows, emptyText, hintVisible, pending, toggle } = usePeers();

const listTitle = computed(() => state.peers.error || undefined);

function onRowKeydown(event, row) {
  if (!row.tappable) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (pending.value) return;
  toggle(row.name);
}

function onRowClick(row) {
  if (!row.tappable || pending.value) return;
  toggle(row.name);
}
</script>

<template>
  <div
    id="peerList"
    class="peer-list"
    :class="{ empty: rows.length === 0 }"
    :title="listTitle"
  >
    <div v-if="rows.length === 0">{{ emptyText }}</div>
    <div
      v-for="row in rows"
      :key="row.name"
      class="peer-row"
      :class="{ self: row.self, excluded: row.excluded, tappable: row.tappable }"
      :title="row.title"
      :role="row.tappable ? 'button' : undefined"
      :tabindex="row.tappable ? 0 : undefined"
      @click="onRowClick(row)"
      @keydown="onRowKeydown($event, row)"
    >
      <span class="peer-name">{{ row.name }}</span>
      <span class="peer-meta">{{ row.meta }}</span>
    </div>
  </div>
  <p id="peerHint" class="field-hint" :hidden="!hintVisible">
    点一下任意一行可以排除这个 peer：它的记忆不再参与上面的召回，再点恢复。
  </p>
</template>

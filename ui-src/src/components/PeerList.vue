<script setup>
// peer 名单：整行可点（本机除外），绿实心点 = 参与召回，灰空心点 = 已排除。
//
// 行的文案与档位全部来自 lib/panel-view.js（peerMetaText / peerTitle /
// peerExcluded / peerTappable），组件只排版。点击的乐观更新与失败回滚在
// store.togglePeer 里，组件不碰状态（行为第 7 条）。
//
// 形态交给 naive-ui：NScrollbar > NList(clickable) > NListItem。整行可点，
// 但本机**不挂** click / role / tabindex（rowAttrs 里直接不给），
// 免得键盘用户点进去得到一个什么都不会发生的按钮。
import { computed } from "vue";
import { NEmpty, NList, NListItem, NScrollbar, NTag, NText } from "naive-ui";
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

/**
 * 一行要挂的属性：可点才挂 click / role / tabindex。
 * 本机（与没名字的行）返回空对象 —— 一个属性都不落到 DOM 上。
 */
function rowAttrs(row) {
  if (!row.tappable) return {};
  return {
    role: "button",
    tabindex: 0,
    onClick: () => onRowClick(row),
    onKeydown: (event) => onRowKeydown(event, row),
  };
}

/** 行框：本机 / 外部、参与 / 排除，三种状态各一个类，颜色全在 panel.css 里。 */
function rowClass(row) {
  return {
    self: row.self,
    other: !row.self,
    excluded: row.excluded,
    tappable: row.tappable,
  };
}
</script>

<template>
  <div
    id="peerList"
    class="peer-list"
    :class="{ empty: rows.length === 0 }"
    :title="listTitle"
  >
    <div v-if="rows.length === 0" class="peer-empty">
      <NEmpty size="small" :description="emptyText" />
    </div>
    <NScrollbar v-else class="peer-scroll">
      <NList clickable :show-divider="false">
        <NListItem
          v-for="row in rows"
          :key="row.name"
          class="peer-item"
          :class="rowClass(row)"
          :title="row.title"
          v-bind="rowAttrs(row)"
        >
          <span class="peer-dot" :class="{ off: row.excluded }" aria-hidden="true"></span>
          <code class="peer-name">{{ row.name }}</code>
          <NTag v-if="row.self" size="small" :bordered="false" class="peer-self-tag">本机</NTag>
          <template #suffix>
            <NText depth="3" class="peer-meta">{{ row.meta }}</NText>
          </template>
        </NListItem>
      </NList>
    </NScrollbar>
  </div>
  <p id="peerHint" class="field-hint" :hidden="!hintVisible">
    点一下任意一行可以排除这个 peer：它的记忆不再参与上面的召回，再点恢复。
  </p>
</template>

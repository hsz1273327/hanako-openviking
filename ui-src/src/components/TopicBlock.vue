<script setup>
// 话题列表：一张本地归组表，可过滤、改标签、删一条。
//
// 逻辑全在 composables/useTopics.js 与 lib/topics-view.js：这里只排版。
// 默认收起，展开只切显隐；数据在挂载时拉一次（折叠状态不重复拉）。
// 改标签回车提交、Esc 取消、失焦不提交；失败把错误留在提示位并留在编辑态。
// 删除只动本地记录，确认后把那一行从列表里去掉，不整表重拉。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { computed, nextTick, onMounted, ref } from "vue";
import { NButton, NCard, NCollapse, NCollapseItem, NInput, NPopconfirm } from "naive-ui";
import {
  filterTopics,
  topicRowView,
  topicsCountText,
} from "../lib/topics-view.js";
import { useTopics } from "../composables/useTopics.js";

const { state, load, beginEdit, cancelEdit, setDraft, submitLabel, remove } = useTopics();

// 默认收起：没有展开项。展开状态只是本组件的视图状态，不进 store。
const expanded = ref([]);
const query = ref("");
const editInput = ref(null);

function onExpanded(names) {
  expanded.value = Array.isArray(names) ? names : [];
}

function setEditInput(el) {
  editInput.value = el;
}

const filtered = computed(() => filterTopics(state.topics, query.value));
const rows = computed(() => filtered.value.map((topic) => topicRowView(topic, Date.now())));

function topicById(id) {
  return state.topics.find((topic) => topic?.id === id) || null;
}

async function startEdit(id) {
  const topic = topicById(id);
  if (!topic) return;
  beginEdit(topic);
  await nextTick();
  editInput.value?.focus?.();
}

onMounted(load);
</script>

<template>
  <NCard
    class="topic-card"
    size="small"
    title="话题"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <template #header-extra>
      <span id="topicCount" class="topic-count">{{ topicsCountText(state.topics.length) }}</span>
    </template>

    <NCollapse :expanded-names="expanded" @update:expanded-names="onExpanded">
      <NCollapseItem title="话题列表" name="topics">
        <div class="topic-tools">
          <NInput
            id="topicSearch"
            size="small"
            clearable
            placeholder="按标签或摘要过滤"
            aria-label="按标签或摘要过滤"
            :input-props="{ spellcheck: 'false' }"
            :value="query"
            @update:value="(value) => (query = value ?? '')"
          />
        </div>

        <div v-if="rows.length" class="topic-list">
          <div
            v-for="row in rows"
            :key="row.id"
            class="topic-row"
            :class="{ dormant: row.dormant }"
            :data-topic-id="row.id"
          >
            <code class="topic-code">{{ row.shortId || row.id }}</code>

            <div class="topic-label-cell">
              <NInput
                v-if="state.editingId === row.id"
                :ref="setEditInput"
                size="tiny"
                aria-label="话题标签"
                :input-props="{ 'aria-label': '话题标签', spellcheck: 'false' }"
                :value="state.draft"
                @update:value="setDraft"
                @keydown.enter.prevent="submitLabel(row.id)"
                @keydown.esc.prevent="cancelEdit"
              />
              <span v-else class="topic-label" :title="row.label">{{ row.label }}</span>
            </div>

            <span class="topic-summary" :title="row.summary">{{ row.summary || "—" }}</span>
            <span class="topic-segments">{{ row.segmentsText }}</span>
            <span class="topic-seen">{{ row.seenText }}</span>
            <span class="topic-sessions">{{ row.sessionsText }}</span>
            <span class="topic-status" :class="{ dormant: row.dormant }">{{ row.statusText }}</span>

            <span class="topic-ops">
              <NButton
                size="tiny"
                :disabled="!row.labelEditable || state.editingId === row.id"
                @click="startEdit(row.id)"
              >
                改标签
              </NButton>
              <NPopconfirm @positive-click="remove(row.id)">
                <template #trigger>
                  <NButton size="tiny" quaternary>删除</NButton>
                </template>
                <span class="topic-confirm">删除后只移除本地归组记录，已经写出去的记忆不动。</span>
              </NPopconfirm>
            </span>
          </div>
        </div>

        <p v-else class="topic-empty">还没有话题</p>
      </NCollapseItem>
    </NCollapse>

    <p v-if="state.note" class="topic-note" :class="{ bad: state.noteBad }">{{ state.note }}</p>
  </NCard>
</template>

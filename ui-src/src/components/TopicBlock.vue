<script setup>
// 话题列表：一张本地归组表，可过滤、改标签、删一条。
//
// 逻辑全在 composables/useTopics.js 与 lib/topics-view.js：这里只排版。
// 默认收起，展开只切显隐；数据在挂载时拉一次（折叠状态不重复拉）。
// 改标签回车提交、Esc 取消、失焦不提交；失败把错误留在提示位并留在编辑态。
// 删除只动本地记录，确认后把那一行从列表里去掉，不整表重拉。
// 样式在 ui/assets/panel.css，组件不写 <style>。
import { computed, h, onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NInput,
  NPopconfirm,
} from "naive-ui";
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

function onExpanded(names) {
  expanded.value = Array.isArray(names) ? names : [];
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
}

function rowProps(row) {
  return {
    class: row?.dormant ? "topic-row-dormant" : "",
    "data-topic-id": row?.id || "",
  };
}

const columns = computed(() => [
  {
    title: "ID",
    key: "id",
    width: 82,
    render: (row) =>
      h("code", { class: "topic-code", title: row.id }, row.shortId || row.id),
  },
  {
    title: "标签",
    key: "label",
    width: 112,
    render: (row) =>
      state.editingId === row.id
        ? h(NInput, {
            size: "tiny",
            autofocus: true,
            value: state.draft,
            "aria-label": "话题标签",
            inputProps: {
              "aria-label": "话题标签",
              spellcheck: "false",
              onKeydown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitLabel(row.id);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              },
            },
            onUpdateValue: (value) => setDraft(value ?? ""),
          })
        : h("span", { class: "topic-label", title: row.label }, row.label),
  },
  {
    title: "摘要",
    key: "summary",
    render: (row) =>
      h("span", { class: "topic-summary", title: row.summary }, row.summary || "—"),
  },
  {
    title: "段数",
    key: "segments",
    width: 58,
    render: (row) => h("span", { class: "topic-segments" }, row.segmentsText),
  },
  {
    title: "最近",
    key: "seen",
    width: 72,
    render: (row) => h("span", { class: "topic-seen" }, row.seenText),
  },
  {
    title: "会话",
    key: "sessions",
    width: 72,
    render: (row) => h("span", { class: "topic-sessions" }, row.sessionsText),
  },
  {
    title: "状态",
    key: "status",
    width: 54,
    render: (row) =>
      h("span", { class: ["topic-status", { dormant: row.dormant }] }, row.statusText),
  },
  {
    title: "操作",
    key: "ops",
    width: 120,
    align: "right",
    render: (row) =>
      h("span", { class: "topic-ops" }, [
        h(
          NButton,
          {
            size: "tiny",
            disabled: !row.labelEditable || state.editingId === row.id,
            onClick: () => startEdit(row.id),
          },
          { default: () => "改标签" },
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => remove(row.id) },
          {
            trigger: () =>
              h(NButton, { size: "tiny", quaternary: true }, { default: () => "删除" }),
            default: () =>
              h(
                "span",
                { class: "topic-confirm" },
                "删除后只移除本地归组记录，已经写出去的记忆不动。",
              ),
          },
        ),
      ]),
  },
]);

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

        <div v-if="rows.length" class="topic-table">
          <NDataTable
            size="small"
            :columns="columns"
            :data="rows"
            :row-key="(row) => row.id"
            :pagination="false"
            :max-height="320"
            :row-props="rowProps"
            :bordered="false"
          />
        </div>

        <p v-else class="topic-empty">还没有话题</p>
      </NCollapseItem>
    </NCollapse>

    <p v-if="state.note" class="topic-note" :class="{ bad: state.noteBad }">{{ state.note }}</p>
  </NCard>
</template>

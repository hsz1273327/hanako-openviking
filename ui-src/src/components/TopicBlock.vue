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
  NDataTable,
  NDrawer,
  NDrawerContent,
  NInput,
  NPopconfirm,
  NTabPane,
  NTabs,
} from "naive-ui";
import {
  CAPTURE_FORMAT_MAX,
  CAPTURE_PROMPT_MAX,
  CAPTURE_TEMPLATE_MAX,
  DEFAULT_CAPTURE_TOPIC_TAB,
  normalizeCaptureTopicTab,
} from "../lib/capture-view.js";
import {
  filterTopics,
  topicRowView,
  topicsCountText,
} from "../lib/topics-view.js";
import { useTopics } from "../composables/useTopics.js";
import { useConfig } from "../composables/useConfig.js";

const { state, load, beginEdit, cancelEdit, setDraft, submitLabel, remove } = useTopics();
const {
  state: configState,
  setFocus,
  touchCapturePrompt,
  setCapturePrompt,
  resetCapturePrompt,
  capturePromptStatusOf,
  touchCaptureTemplate,
  setCaptureTemplate,
  resetCaptureTemplate,
  captureTemplateStatusOf,
  touchCaptureFormat,
  setCaptureFormat,
  resetCaptureFormat,
  captureFormatStatusOf,
} = useConfig();

// 子页签由父组件持有（写回页的「去编辑提示词」要能指到判断题面），
// 默认停在话题列表；切走再回来不重建、不丢草稿。
const props = defineProps({
  tab: { type: String, default: DEFAULT_CAPTURE_TOPIC_TAB },
});
const emit = defineEmits(["update:tab"]);
const activeTab = computed({
  get: () => normalizeCaptureTopicTab(props.tab),
  set: (value) => emit("update:tab", normalizeCaptureTopicTab(value)),
});
const query = ref("");
// 详情抽屉：只记 id，内容从同一份 topics 里取，删掉后自然消失。
const detailId = ref("");
const detailTopic = computed(() => topicById(detailId.value));
const detailRow = computed(() =>
  detailTopic.value ? topicRowView(detailTopic.value, Date.now()) : null,
);

function openDetail(id) {
  detailId.value = id;
}

function closeDetail() {
  detailId.value = "";
}

function editFromDetail(id) {
  closeDetail();
  startEdit(id);
}

async function removeFromDetail(id) {
  await remove(id);
  closeDetail();
}
const promptStatusText = computed(() => capturePromptStatusOf());
const templateStatusText = computed(() => captureTemplateStatusOf());
const formatStatusText = computed(() => captureFormatStatusOf());

function onPromptInput(value) {
  touchCapturePrompt(value ?? "");
}

function onPromptChange(value) {
  setCapturePrompt(value ?? "");
}

function onTemplateInput(value) {
  touchCaptureTemplate(value ?? "");
}

function onTemplateChange(value) {
  setCaptureTemplate(value ?? "");
}

function onFormatInput(value) {
  touchCaptureFormat(value ?? "");
}

function onFormatChange(value) {
  setCaptureFormat(value ?? "");
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
    title: "简述",
    key: "summary",
    render: (row) =>
      h("span", { class: "topic-summary", title: row.summary }, row.summary || "—"),
  },
  {
    title: "关键词",
    key: "anchors",
    width: 150,
    render: (row) =>
      h(
        "span",
        { class: "topic-anchors", title: row.anchorsTitle || "" },
        row.anchorsText || "—",
      ),
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
    width: 168,
    align: "right",
    render: (row) =>
      h("span", { class: "topic-ops" }, [
        h(
          NButton,
          { size: "tiny", quaternary: true, onClick: () => openDetail(row.id) },
          { default: () => "详情" },
        ),
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

    <NTabs
      class="topic-tabs"
      type="line"
      size="small"
      aria-label="话题分区"
      :value="activeTab"
      @update:value="(value) => (activeTab = value)"
    >
      <NTabPane name="topics" tab="话题列表">
        <!-- 页签内容包一层并给 key：NTabs 切换时若在上一个位置做原位 patch，
             表格里的搜索框会被复用成题面输入框（生产构建下 type 不重建）。 -->
        <div class="topic-pane" :key="'topics'">
          <div class="topic-tools">
            <NInput
              id="topicSearch"
              size="small"
              clearable
              placeholder="按标签或简述过滤"
              aria-label="按标签或简述过滤"
              :input-props="{ spellcheck: 'false' }"
              :value="query"
              @update:value="(value) => (query = value ?? '')"
            />
          </div>

          <!-- 表格直接铺开，没有折叠壳；行数超过 8 行才启用表体内部滚动。 -->
          <div v-if="rows.length" class="topic-table">
            <NDataTable
              size="small"
              :columns="columns"
              :data="rows"
              :row-key="(row) => row.id"
              :pagination="false"
              :max-height="rows.length > 8 ? 320 : undefined"
              :row-props="rowProps"
              :bordered="false"
            />
          </div>

          <p v-else class="topic-empty">还没有话题</p>
          </div>
      </NTabPane>

      <NTabPane name="prompt" tab="判断题面">
        <div class="topic-pane" :key="'prompt'">
          <div class="field">
            <div class="prompt-head">
              <label for="capturePrompt">判断题面</label>
              <span id="capturePromptStatus" class="prompt-status">{{ promptStatusText }}</span>
              <NButton id="captureResetPrompt" size="small" quaternary @click="resetCapturePrompt()">恢复默认</NButton>
            </div>
            <NInput
              type="textarea"
              size="small"
              :autosize="{ minRows: 8, maxRows: 24 }"
              :maxlength="CAPTURE_PROMPT_MAX"
              :input-props="{ id: 'capturePrompt', spellcheck: 'false' }"
              :value="configState.form.capturePrompt"
              @focus="setFocus('capturePrompt')"
              @blur="setFocus('')"
              @update:value="onPromptInput"
              @change="onPromptChange"
            />
            <span class="field-hint">提前提交时共用这一句，留空 = 内置那句默认问法。判别模型的选项由话题表自动生成，这一格只决定怎么问。</span>
          </div>
        </div>
      </NTabPane>

      <NTabPane name="template" tab="题面骨架">
        <div class="topic-pane" :key="'template'">
          <div class="field">
            <div class="prompt-head">
              <label for="captureTemplate">题面骨架</label>
              <span id="captureTemplateStatus" class="prompt-status">{{ templateStatusText }}</span>
              <NButton id="captureResetTemplate" size="small" quaternary @click="resetCaptureTemplate()">恢复默认</NButton>
            </div>
            <NInput
              type="textarea"
              size="small"
              :autosize="{ minRows: 16, maxRows: 30 }"
              :maxlength="CAPTURE_TEMPLATE_MAX"
              :input-props="{ id: 'captureTemplate', spellcheck: 'false' }"
              :value="configState.form.captureTemplate"
              @focus="setFocus('captureTemplate')"
              @blur="setFocus('')"
              @update:value="onTemplateInput"
              @change="onTemplateChange"
            />
            <span class="field-hint" v-pre>占位符：{{question}} 题面、{{candidates}} 已有话题、{{previous}} 之前对话、{{current}} 当前对话、{{format}} 答案格式。必须包含 {{current}}，否则回退内置模板并记一条警告。</span>
          </div>
        </div>
      </NTabPane>

      <NTabPane name="format" tab="答案格式">
        <div class="topic-pane" :key="'format'">
          <div class="field">
            <div class="prompt-head">
              <label for="captureFormat">答案格式</label>
              <span id="captureFormatStatus" class="prompt-status">{{ formatStatusText }}</span>
              <NButton id="captureResetFormat" size="small" quaternary @click="resetCaptureFormat()">恢复默认</NButton>
            </div>
            <NInput
              type="textarea"
              size="small"
              :autosize="{ minRows: 12, maxRows: 24 }"
              :maxlength="CAPTURE_FORMAT_MAX"
              :input-props="{ id: 'captureFormat', spellcheck: 'false' }"
              :value="configState.form.captureFormat"
              @focus="setFocus('captureFormat')"
              @blur="setFocus('')"
              @update:value="onFormatInput"
              @change="onFormatChange"
            />
            <span class="field-hint" v-pre>这一段会替换题面骨架里的 {{format}} 占位符；留空 = 内置的三行格式（主题 / 简述 / 归属）。模型答歪时先改这里：行数、字段名、要素顺序都由它决定。</span>
          </div>
        </div>
      </NTabPane>
    </NTabs>

    <p v-if="state.note" class="topic-note" :class="{ bad: state.noteBad }">{{ state.note }}</p>

    <NDrawer
      :show="Boolean(detailId)"
      :width="420"
      placement="right"
      @update:show="(value) => { if (!value) closeDetail(); }"
    >
      <NDrawerContent v-if="detailRow" :title="detailRow.label" closable>
        <p class="topic-detail-meta">
          {{ detailRow.segmentsText }} · 最近 {{ detailRow.seenText }} · {{ detailRow.sessionsText }}
        </p>
        <p class="topic-detail-summary">{{ detailTopic.summary || "暂无简述" }}</p>
        <p v-if="detailRow.anchors.length" class="topic-detail-anchors">
          关键词：{{ detailRow.anchors.join("、") }}
        </p>
        <template #footer>
          <div class="topic-detail-ops">
            <NButton size="small" @click="editFromDetail(detailRow.id)">改标签</NButton>
            <NPopconfirm @positive-click="removeFromDetail(detailRow.id)">
              <template #trigger>
                <NButton size="small" quaternary>删除</NButton>
              </template>
              <span class="topic-confirm">删除后只移除本地归组记录，已经写出去的记忆不动。</span>
            </NPopconfirm>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </NCard>
</template>

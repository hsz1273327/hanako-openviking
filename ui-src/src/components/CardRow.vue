<script setup>
// 会话卡的一行：标签 + 两态小字 + 右侧控件。
//
// 四行共用这一个壳，开关和召回范围从默认插槽进来。
// 「跟随全局」的点击只发给父组件；要不要提交、提交什么（null）由 CardApp 决定。
// 小字按钮用 n-button text size="tiny"：外观交给组件库，已覆盖时用 primary 色区分，
// 不再手画虚线边框 / 实心胶囊。
import { computed } from "vue";
import { NButton } from "naive-ui";
import { noteView } from "../lib/card-view.js";

const props = defineProps({
  rowKey: { type: String, required: true },
  label: { type: String, required: true },
  overridden: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // 召回范围的两枚按钮在侧边栏里换行到第二行，见 card.css 的 .row-wide。
  wide: { type: Boolean, default: false },
});

defineEmits(["reset"]);

const note = computed(() => noteView(props.overridden));
</script>

<template>
  <div class="row" :class="{ 'row-wide': wide }" :data-key="rowKey">
    <span class="row-label">{{ label }}</span>
    <NButton
      class="row-note"
      text
      size="tiny"
      :type="overridden ? 'primary' : 'default'"
      :disabled="disabled"
      :title="note.title"
      :aria-pressed="overridden ? 'true' : 'false'"
      @click="$emit('reset')"
    >
      {{ note.text }}
    </NButton>
    <div class="row-control">
      <slot />
    </div>
  </div>
</template>

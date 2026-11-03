<script setup>
// 「共享技能」页：整页只有一个开关（把共享技能交给助手按需调用）。
//
// 这一块上一轮就迁到 Vue 了；本轮整页只剩一个应用，所以它改成读**同一份**
// 面板状态（composables/useConfig）：
//
//   - 开关值的读写仍走 GET/POST /controls 的 skillRouting（不新增后端接口），
//     乐观更新与失败回滚统一用 store 的 flip，不再自己抄一套；
//   - 置灰（总闸关着时半透）不再由手写面板的 paintDim 从外部切类，
//     而是跟着 store.controls.enabled 走 —— 总闸一关，三页的能力块同时变淡；
//   - 提示位仍是这一块自己的小字（面板别处的提示在各自页面里）。
//
// 形态交给 naive-ui：一张 n-card（title="技能路由"），开关在 #header-extra。
// 样式只留 .skill-route-hint 那几行（ui/assets/panel.css），SFC 里不写 <style>。
import { computed, ref } from "vue";
import { NCard, NSwitch } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";

const HINT = "把共享技能交给助手按需调用";

const { state, enabled, flip } = useConfig();

const routing = computed(() => state.controls.skillRouting);
const pending = ref(false);
const hint = ref(HINT);
const hintBad = ref(false);
let hintTimer = 0;

function note(text, bad = false) {
  hint.value = text || HINT;
  hintBad.value = Boolean(text) && Boolean(bad);
  clearTimeout(hintTimer);
  if (!text) return;
  hintTimer = setTimeout(() => {
    hint.value = HINT;
    hintBad.value = false;
  }, 2600);
}

async function onToggle(next) {
  if (pending.value) return;
  pending.value = true;
  try {
    await flip("skillRouting", next);
    // 写入成功时服务端确认值与目标值一致；不一致说明失败已回滚。
    if (state.controls.skillRouting === next) note("已保存");
    else note(state.note.text || "写入失败", true);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <!-- 单根节点，class 只写静态值 + 一个 dim：总闸关着时整块半透。 -->
  <NCard
    id="skillRoute"
    class="skill-route"
    size="small"
    title="技能路由"
    :bordered="false"
    header-style="padding: 4px 16px"
    aria-label="技能路由"
    content-style="padding: 16px"
    :class="{ dim: !enabled }"
  >
    <template #header-extra>
      <NSwitch
        size="small"
        :value="routing"
        :loading="pending"
        aria-label="技能路由"
        @update:value="onToggle"
      />
    </template>
    <p class="skill-route-hint" :class="{ bad: hintBad }">{{ hint }}</p>
  </NCard>
</template>

<script setup>
// 「共享技能」页：整页只有一个开关，用来验证 Vue + naive-ui 这条链能在宿主里跑通。
//
// 和手写面板的关系：
// - 数据面复用同一组端点（GET /controls 读，POST /controls 写），不新增后端接口。
// - 置灰（总闸关着时整块半透）仍由 ui/assets/panel.js 的 paintDim 负责：
//   它在 .skill-route 上切 dim 类。这里只在首次挂载时补一次，避免启动瞬间漏掉。
//   所以根节点保留 class="skill-route" 且不绑定动态 class——静态 class 不变，
//   Vue 重渲染时不会把外部加的 dim 抹掉。
// - 样式全部留在 ui/assets/panel.css（.skill-route / .skill-route-head /
//   .skill-route-hint），SFC 里不写 <style>，否则构建会覆盖整份手写样式。
import { onMounted, ref } from "vue";
import { NSwitch } from "naive-ui";
import { hana } from "./sdk.js";

const HINT = "把共享技能交给助手按需调用";

const rootEl = ref(null);
const routing = ref(false);
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

async function jsonGet(path) {
  const res = await hana.api.fetch(path);
  return res.json();
}

async function jsonPost(path, body) {
  const res = await hana.api.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 总闸关着时整块置灰。和手写面板同一套语义：只改外观，不禁用开关。
function applyEnabled(enabled) {
  if (typeof enabled !== "boolean") return;
  rootEl.value?.classList.toggle("dim", !enabled);
}

// 读回当前值：写操作是整组控制的一部分，读不到就不猜，维持「关」。
onMounted(async () => {
  try {
    const out = await jsonGet("/controls");
    if (typeof out?.skillRouting === "boolean") routing.value = out.skillRouting;
    applyEnabled(out?.enabled);
  } catch {
    // 读不到只影响这一块：顶部状态条已经把失败说清楚了，这里不重复喊。
  }
});

async function onToggle(next) {
  if (pending.value) return;
  const before = routing.value;
  routing.value = next; // 乐观
  pending.value = true;
  try {
    const out = await jsonPost("/controls", { skillRouting: next });
    if (out?.ok === false) throw new Error(out.error || "写入失败");
    if (typeof out?.skillRouting === "boolean") routing.value = out.skillRouting;
    applyEnabled(out?.enabled);
    note("已保存");
  } catch (error) {
    routing.value = before;
    note(String(error?.message || error), true);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <!-- 单根节点，且 class 只写静态值：paintDim 会在这上面切 dim。 -->
  <section id="skillRoute" ref="rootEl" class="card skill-route" aria-label="技能路由">
    <header class="skill-route-head">
      <h2 class="card-title">技能路由</h2>
      <NSwitch
        size="small"
        :value="routing"
        :loading="pending"
        aria-label="技能路由"
        @update:value="onToggle"
      />
    </header>
    <p class="skill-route-hint" :class="{ bad: hintBad }">{{ hint }}</p>
  </section>
</template>

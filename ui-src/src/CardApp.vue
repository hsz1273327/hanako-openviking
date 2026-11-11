<script setup>
// 边栏会话卡：这段对话里的记忆行为，全部按会话算。
//
// 行为与已删除的手写会话卡（历史实现）逐条对齐：
//   - 记忆召回与只读两个开关、加上召回范围，改的是本会话覆盖值，选了立刻 POST；
//   - 小字「本会话 / 跟随全局」：已覆盖时点它交回全局，提交的是 { [key]: null }，
//     不是 false（后端 patchSession 里只有 null 才 delete）；
//   - 提交先乐观改，失败退回点之前的值，并把错误写进 hint；
//   - 没有活动会话时标题写「无活动会话」，三个键的控件与「跟随全局」全部 disabled；
//   - 状态点 / 药丸 / stats / hint 的文案规则来自 lib/card-view.js，与旧卡同一份。
//
// 形态：侧边栏是宿主 warm-paper 亮色（--sidebar-bg #F4F0EA），卡片不画自己的底色，
// 只保留透明容器 + 行布局；开关、按钮、分段全部用 naive-ui。
// 主色在本页局部换成宿主 accent #537D96，不动共享 theme.js（面板仍是品牌绿）。
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  NConfigProvider,
  NRadioButton,
  NRadioGroup,
  NSwitch,
  zhCN,
} from "naive-ui";
import { hana } from "./sdk.js";
import { appReady, currentSession, jsonGet, jsonPost, onActiveSessionChanged } from "./api.js";
import { lightThemeOverrides } from "./theme.js";
import {
  OVERRIDE_KEYS,
  SCOPE_KEY,
  SCOPE_VALUES,
  activeSessionView,
  dotTone,
  hasOverride,
  hintView,
  optimisticResetEffective,
  peerView,
  pillView,
  resetOverride,
  statsText,
  withOverride,
} from "./lib/card-view.js";
import CardRow from "./components/CardRow.vue";
import { captureStatusRows } from "./lib/capture-view.js";

const REFRESH_MS = 8000;

const cardThemeOverrides = {
  ...lightThemeOverrides,
  common: {
    ...lightThemeOverrides.common,
    primaryColor: "#537D96",
    primaryColorHover: "#6A8FA6",
    primaryColorPressed: "#476B82",
    primaryColorSuppl: "#537D96",
  },
};

const state = reactive({
  sessionKey: null,
  sessionOwner: "",
  title: "无活动会话",
  titleTitle: "",
  peerText: "—",
  peerTitle: "",
  pillText: "—",
  pillTone: "",
  dotTone: "idle",
  stats: "—",
  hintText: "",
  hintWarn: false,
  effective: {},
  overrides: {},
  enabled: true,
  globalStatus: null,
  hasModel: false,
  writing: false,
  capture: { active: false, autoCapture: false, data: null },
});

const controlsDisabled = computed(
  () => !state.sessionKey || !state.hasModel || state.writing,
);

// 四行状态：没有活动会话 / 写回关着 / 取数失败，都走同一条置灰路径。
const captureDisabled = computed(
  () => !state.capture.active || !state.capture.autoCapture,
);
const captureRows = computed(() =>
  captureStatusRows(state.capture.data, {
    active: state.capture.active,
    autoCapture: state.capture.autoCapture,
  }),
);

const overridden = computed(() => {
  const out = {};
  for (const key of OVERRIDE_KEYS) out[key] = hasOverride(state.overrides, key);
  return out;
});

const scopeValue = computed(() => state.effective[SCOPE_KEY] || "all");

function setHint(text, warn) {
  state.hintText = text || "";
  state.hintWarn = Boolean(warn);
}

function showNoSession() {
  state.hasModel = false;
  state.effective = {};
  state.overrides = {};
  state.peerText = "—";
  state.peerTitle = "";
  state.capture = { active: false, autoCapture: false, data: null };
  state.stats = "—";
  state.pillText = "—";
  state.pillTone = "";
  state.dotTone = "idle";
  setHint("先打开一个对话，这张卡才会跟会话绑定。", false);
}

function applySessionView(active) {
  const view = activeSessionView(active);
  state.sessionKey = view.sessionKey;
  state.sessionOwner = view.sessionOwner;
  state.title = view.title;
  state.titleTitle = view.titleTitle;
}

function applyData(data, status, captureOut) {
  // /status 失败时保留上一次的全局状态（与旧卡同一条规则）。
  if (status) state.globalStatus = status;
  // /capture-status 失败（null）时也保留上一次的值；成功则整块落值。
  if (captureOut && typeof captureOut === "object") {
    state.capture = {
      active: captureOut.active === true,
      autoCapture: captureOut.autoCapture === true,
      data: captureOut,
    };
  }
  state.hasModel = true;
  state.effective = { ...(data.effective || {}) };
  state.overrides = { ...(data.state?.overrides || {}) };

  const enabled = state.globalStatus ? Boolean(state.globalStatus.enabled) : true;
  state.enabled = enabled;

  const pill = pillView(state.globalStatus);
  state.pillText = pill.text;
  state.pillTone = pill.tone;
  state.dotTone = dotTone(data, enabled);
  state.stats = statsText(data);

  const peer = peerView(data, state.sessionOwner);
  state.peerText = peer.text;
  state.peerTitle = peer.title;

  const hint = hintView({
    overrides: state.overrides,
    enabled,
    status: state.globalStatus,
  });
  setHint(hint.text, hint.warn);
}

async function readStatus(key) {
  try {
    return await jsonGet(`/status?session=${encodeURIComponent(key)}`);
  } catch {
    return null;
  }
}

async function refresh() {
  if (!state.sessionKey) {
    applySessionView(await currentSession());
    if (!state.sessionKey) {
      showNoSession();
      return;
    }
  }

  const key = state.sessionKey;
  try {
    const [status, data, captureOut] = await Promise.all([
      readStatus(key),
      jsonGet(`/session/${encodeURIComponent(key)}`),
      jsonGet(`/capture-status?sessionId=${encodeURIComponent(key)}`).catch(() => null),
    ]);

    // 后端认不出这个 key 时回 ok:false：不画一份不存在的状态，说清为什么。
    if (data?.ok === false) {
      state.hasModel = false;
      state.stats = "—";
      state.capture = { active: false, autoCapture: false, data: null };
      setHint("这个会话对不上任何状态（unknown session key），先重新选一次会话。", true);
      return;
    }

    applyData(data || {}, status, captureOut);
  } catch (error) {
    setHint(String(error?.message || error), true);
  }
}

function snapshot() {
  return {
    effective: { ...state.effective },
    overrides: { ...state.overrides },
  };
}

async function write(overrides, before) {
  const key = state.sessionKey;
  if (!key) return;

  state.writing = true;
  try {
    const out = await jsonPost(`/session/${encodeURIComponent(key)}`, { overrides });
    if (out?.ok === false) throw new Error(out.error || "写入失败");
    // 回包只带会话字段，没有 peer / probe：重新读一遍再落控件值。
    await refresh();
  } catch (error) {
    // 失败退回点之前的值；服务端没接受，界面不能停在一个它不认识的状态上。
    state.effective = before.effective;
    state.overrides = before.overrides;
    setHint(String(error?.message || error), true);
  } finally {
    state.writing = false;
  }
}

async function toggle(key, next) {
  if (controlsDisabled.value) return;
  const before = snapshot();
  const target = typeof next === "boolean" ? next : !state.effective[key];
  if (target === Boolean(state.effective[key])) return;

  state.effective = { ...state.effective, [key]: target };
  state.overrides = withOverride(state.overrides, key, target);
  await write({ ...state.overrides }, before);
}

async function setScope(value) {
  if (controlsDisabled.value || !SCOPE_VALUES.includes(value)) return;
  if (value === scopeValue.value) return;

  const before = snapshot();
  state.effective = { ...state.effective, [SCOPE_KEY]: value };
  state.overrides = withOverride(state.overrides, SCOPE_KEY, value);
  await write({ ...state.overrides }, before);
}

async function reset(key) {
  if (controlsDisabled.value) return;
  if (!hasOverride(state.overrides, key)) return;

  const before = snapshot();
  state.overrides = resetOverride(state.overrides, key);
  state.effective = optimisticResetEffective(state.effective, key, state.globalStatus);
  await write({ ...state.overrides }, before);
}

let timer = null;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function start() {
  stop();
  refresh();
  timer = setInterval(refresh, REFRESH_MS);
}

function onVisibilityChange() {
  if (document.hidden) stop();
  else start();
}

let offActive = null;

// 宿主按 iframe 初始高度决定卡片占多高，Vue 是异步渲染的：数据回来之后卡片会长一截，
// 不主动报一次高度就会被裁掉下半部分（曾经只显示前两行）。
// 用 ResizeObserver 盯根节点，内容怎么变都跟得上；宿主端读的是 payload.height。
const rootEl = ref(null);
let resizeObserver = null;

function reportHeight() {
  const el = rootEl.value;
  if (!el) return;
  try {
    hana.ui.resize({ height: Math.ceil(el.getBoundingClientRect().height) });
  } catch {
    /* 宿主不支持这个能力时静默：卡片还能用，只是高度按初始值 */
  }
}

onMounted(() => {
  appReady();
  document.addEventListener("visibilitychange", onVisibilityChange);
  offActive = onActiveSessionChanged(() => {
    state.sessionKey = null;
    state.sessionOwner = "";
    state.hasModel = false;
    refresh();
  });
  start();

  if (typeof ResizeObserver === "function" && rootEl.value) {
    resizeObserver = new ResizeObserver(() => reportHeight());
    resizeObserver.observe(rootEl.value);
  }
  reportHeight();
});

onBeforeUnmount(() => {
  stop();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (offActive) offActive();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<template>
  <!-- zhCN 与面板页一致：不传就落回 enUS，空控件会显示英文默认文案。 -->
  <NConfigProvider abstract :locale="zhCN" :theme-overrides="cardThemeOverrides">
    <div ref="rootEl" class="card" :data-session="state.sessionKey ? 'on' : 'off'">
      <header class="head">
        <span class="dot" :class="state.dotTone" aria-hidden="true"></span>
        <span class="title" :title="state.titleTitle">{{ state.title }}</span>
        <span class="pill" :class="state.pillTone">{{ state.pillText }}</span>
      </header>

      <div class="ident">
        <span class="ident-label">peer</span>
        <span class="ident-value" :title="state.peerTitle">{{ state.peerText }}</span>
      </div>

      <div class="rows">
        <CardRow
          row-key="autoRecall"
          label="记忆召回"
          :overridden="overridden.autoRecall"
          :disabled="controlsDisabled"
          @reset="reset('autoRecall')"
        >
          <NSwitch
            size="small"
            aria-label="记忆召回"
            :value="Boolean(state.effective.autoRecall)"
            :disabled="controlsDisabled"
            @update:value="(next) => toggle('autoRecall', next)"
          />
        </CardRow>

        <CardRow
          row-key="readOnly"
          label="只读"
          :overridden="overridden.readOnly"
          :disabled="controlsDisabled"
          @reset="reset('readOnly')"
        >
          <NSwitch
            size="small"
            aria-label="只读"
            :value="Boolean(state.effective.readOnly)"
            :disabled="controlsDisabled"
            @update:value="(next) => toggle('readOnly', next)"
          />
        </CardRow>

        <CardRow
          row-key="recallPeerScope"
          label="召回范围"
          wide
          :overridden="overridden.recallPeerScope"
          :disabled="controlsDisabled"
          @reset="reset('recallPeerScope')"
        >
          <NRadioGroup
            size="small"
            aria-label="召回范围"
            :value="scopeValue"
            :disabled="controlsDisabled"
            @update:value="setScope"
          >
            <NRadioButton value="all">跨门牌</NRadioButton>
            <NRadioButton value="self">只看本机</NRadioButton>
          </NRadioGroup>
        </CardRow>
      </div>

      <div
        class="capture"
        :class="{ off: captureDisabled }"
        :aria-disabled="captureDisabled ? 'true' : 'false'"
      >
        <span
          v-for="row in captureRows"
          :key="row.key"
          class="capture-row"
          :data-row="row.key"
        >
          <span class="capture-label">{{ row.label }}</span>
          <span class="capture-value">{{ row.value }}</span>
        </span>
      </div>

      <p class="stats">{{ state.stats }}</p>
      <p v-if="state.hintText" class="hint" :class="{ warn: state.hintWarn }">
        {{ state.hintText }}
      </p>
    </div>
  </NConfigProvider>
</template>

// 存量补交的局部状态：会话清单 + 单任务进度。
//
// 为什么不进 panel-store.js：那个状态机是写回设置页的整单提交口，这一块只读清单、
// 只发两个动作，塞进去会把既有断言牵动一大片。
//
// 轮询只在 running 时开表（每 1000ms GET /backfill-status）；running 从 true 变
// false 时再拉一次 /backfill-sessions 把数字落回真实值，然后停表。
// document.hidden 时停表，回到前台且还在跑就继续。
// 定时器与监听都由这里自己清，组件只管在 onMounted 里调 load()。

import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { jsonGet, jsonPost } from "../api.js";
import {
  backfillProgressText,
  backfillRowView,
  backfillTotalsText,
} from "../lib/backfill-view.js";

const POLL_MS = 1000;

function nonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

function errorText(error) {
  return String(error?.message || error || "补交失败");
}

export function useBackfill() {
  const state = reactive({
    root: "",
    sessions: [],
    totals: { sessions: 0, segments: 0 },
    status: {
      running: false,
      sessionId: null,
      done: 0,
      total: 0,
      currentLabel: "",
      error: "",
    },
    loaded: false,
    loading: false,
    starting: false,
    note: "",
    noteBad: false,
  });
  const nowMs = ref(Date.now());

  let timer = null;
  let lastRunning = false;
  let disposed = false;

  function setNote(text, bad) {
    state.note = text || "";
    state.noteBad = Boolean(bad);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    if (timer || disposed) return;
    timer = setInterval(pollOnce, POLL_MS);
  }

  function applyStatus(out) {
    const running = out?.running === true;
    state.status = {
      running,
      sessionId: typeof out?.sessionId === "string" ? out.sessionId : null,
      done: nonNegativeInt(out?.done),
      total: nonNegativeInt(out?.total),
      currentLabel: typeof out?.currentLabel === "string" ? out.currentLabel : "",
      error: typeof out?.error === "string" ? out.error : "",
    };
    nowMs.value = Date.now();
    if (running) {
      startTimer();
    } else {
      stopTimer();
      // 从跑到停这一下：数字要落回真实值，否则表里还留着「欠 N 段」。
      if (lastRunning) loadSessions();
    }
    lastRunning = running;
  }

  async function readStatus() {
    try {
      applyStatus(await jsonGet("/backfill-status"));
    } catch {
      // 一次读不到不改状态：下一秒再试，不要把上一份进度洗掉。
    }
  }

  async function pollOnce() {
    if (disposed) return;
    await readStatus();
  }

  /** 拉会话清单：失败保留上一份，只在提示位说一句。 */
  async function loadSessions() {
    try {
      const out = await jsonGet("/backfill-sessions");
      if (!out || typeof out !== "object") throw new Error("会话清单格式不对");
      state.root = typeof out.root === "string" ? out.root : "";
      state.sessions = Array.isArray(out.sessions) ? out.sessions : [];
      state.totals = {
        sessions: nonNegativeInt(out.totals?.sessions),
        segments: nonNegativeInt(out.totals?.segments),
      };
      state.loaded = true;
      setNote("", false);
    } catch (error) {
      setNote(errorText(error), true);
    }
    nowMs.value = Date.now();
  }

  /** 组件挂载时调一次：先看清单，再看有没有已经在跑的任务。 */
  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      await Promise.all([loadSessions(), readStatus()]);
    } finally {
      state.loading = false;
    }
  }

  async function start(body) {
    if (state.starting) return false;
    state.starting = true;
    try {
      const out = await jsonPost("/backfill", body);
      if (out?.ok === false) {
        setNote(typeof out.error === "string" ? out.error : "补交没有开始", true);
        return false;
      }
      setNote("", false);
      await readStatus();
      if (!state.status.running) await loadSessions();
      return true;
    } catch (error) {
      setNote(errorText(error), true);
      return false;
    } finally {
      state.starting = false;
    }
  }

  function startSession(sessionId) {
    return start({ scope: "session", sessionId });
  }

  function startAll() {
    return start({ scope: "all" });
  }

  /** 取消：只在段边界生效，界面这边立刻停表要等 status 说 running=false。 */
  async function cancel() {
    try {
      const out = await jsonPost("/backfill/cancel", {});
      if (out?.ok === false) setNote("取消失败", true);
      await readStatus();
      if (!state.status.running) await loadSessions();
    } catch (error) {
      setNote(errorText(error), true);
    }
  }

  const rows = computed(() =>
    (Array.isArray(state.sessions) ? state.sessions : []).map((row) =>
      backfillRowView(row, nowMs.value, {
        running: state.status.running,
        currentSessionId: state.status.sessionId,
      }),
    ),
  );

  const progressText = computed(() => backfillProgressText(state.status));
  const totalsText = computed(() => backfillTotalsText(state.totals));

  function onVisibilityChange() {
    if (typeof document === "undefined") return;
    if (document.hidden) stopTimer();
    else if (state.status.running) {
      startTimer();
      pollOnce();
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  onBeforeUnmount(() => {
    disposed = true;
    stopTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  });

  return {
    state,
    rows,
    progressText,
    totalsText,
    load,
    loadSessions,
    startSession,
    startAll,
    cancel,
  };
}

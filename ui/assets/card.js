// 会话卡：跟着当前会话走，改的是会话覆盖值，不是全局配置。
//
// chip 两态：
//   跟随全局 → 虚线、低对比，点击后把这一项反过来并记成会话覆盖
//   会话覆盖 → 实线、高对比，再点一次撤销覆盖，回到跟随全局
import { hana } from "./sdk.js";

const REFRESH_MS = 8000;

const el = {
  dot: document.getElementById("dot"),
  title: document.getElementById("title"),
  peer: document.getElementById("peer"),
  counter: document.getElementById("counter"),
  lastAt: document.getElementById("lastAt"),
  hint: document.getElementById("hint"),
  chips: {
    autoRecall: document.getElementById("chipMemory"),
    autoCapture: document.getElementById("chipCapture"),
    readOnly: document.getElementById("chipReadOnly"),
  },
};

let sessionId = null;
let model = null;

function setHint(text, warn) {
  el.hint.textContent = text || "";
  el.hint.classList.toggle("warn", Boolean(warn));
}

function paintChip(node, key, info) {
  const overridden = Object.prototype.hasOwnProperty.call(info.overrides || {}, key);
  const on = Boolean(info.effective?.[key]);
  node.classList.toggle("on", on);
  node.classList.toggle("over", overridden);
  node.classList.toggle("follow", !overridden);
}

function paint(data) {
  model = data;
  const eff = data.effective || {};
  const overrides = data.state?.overrides || {};

  paintChip(el.chips.autoRecall, "autoRecall", { effective: eff, overrides });
  paintChip(el.chips.autoCapture, "autoCapture", { effective: eff, overrides });
  paintChip(el.chips.readOnly, "readOnly", { effective: eff, overrides });

  el.peer.textContent = data.peer ? `peer ${data.peer}` : "";

  const events = data.probe?.events || {};
  const turns = (events["provider/before-request"] || 0) + (events["agent/before-start"] || 0);
  const recall = data.state?.recall || {};
  const capture = data.state?.capture || {};

  el.counter.textContent = turns
    ? `钩子 ${turns} 次 · 召回 ${recall.turns || 0} · 写回 ${capture.turns || 0}`
    : `召回 ${recall.turns || 0} · 写回 ${capture.turns || 0}`;

  el.lastAt.textContent = data.probe?.lastAt
    ? new Date(data.probe.lastAt).toLocaleTimeString()
    : "";

  const active = Object.keys(overrides).length > 0;
  el.dot.className = `dot ${eff.autoRecall || eff.autoCapture ? "ok" : "idle"}`;

  if (!data.probe?.lines && !turns) {
    setHint(active ? "本会话有覆盖值；探针没开，看不到钩子计数。" : "探针没开，看不到钩子计数。", false);
  } else if (active) {
    setHint("实线项是本会话的覆盖，再点一次回到跟随全局。", false);
  } else {
    setHint("");
  }
}

function shortId(id) {
  return id ? String(id).slice(-8) : "";
}

async function resolveSession() {
  try {
    const active = await hana.sessions.getActive();
    sessionId = active?.sessionId || active?.id || active?.session?.sessionId || null;
    const title = active?.title || active?.session?.title || "";
    el.title.textContent = title || (sessionId ? shortId(sessionId) : "无活动会话");
  } catch {
    sessionId = null;
    el.title.textContent = "无活动会话";
  }
}

async function refresh() {
  if (!sessionId) {
    await resolveSession();
    if (!sessionId) {
      setHint("先打开一个对话，这张卡才会跟会话绑定。", false);
      return;
    }
  }
  try {
    const res = await hana.api.fetch(`/session/${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    paint(data);
  } catch (error) {
    setHint(String(error?.message || error), true);
  }
}

async function toggle(key) {
  if (!sessionId || !model) return;
  const overrides = { ...(model.state?.overrides || {}) };
  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    overrides[key] = null;
  } else {
    overrides[key] = !model.effective?.[key];
  }
  try {
    const res = await hana.api.fetch(`/session/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    const data = await res.json();
    if (data.ok === false) throw new Error(data.error || "写入失败");
    await refresh();
  } catch (error) {
    setHint(String(error?.message || error), true);
  }
}

for (const [key, node] of Object.entries(el.chips)) {
  node.addEventListener("click", () => toggle(key));
}

let timer = null;
function start() {
  stop();
  refresh();
  timer = setInterval(refresh, REFRESH_MS);
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else start();
});

// 切换会话时立刻重新绑定，不等下一次轮询。
try {
  hana.sessions.onActiveChanged(() => {
    sessionId = null;
    model = null;
    refresh();
  });
} catch {
  /* 老宿主没有这个订阅，靠轮询兜底 */
}

hana.ready();
start();

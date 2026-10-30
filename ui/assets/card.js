// 会话卡：这段对话里的记忆行为，全部按会话算。
//
// 每一种设置都有两段含义：
//   右侧控件  本会话这一项是什么值（点了就地覆盖）
//   中间小字  "跟随全局" / "本会话"，点它把这一项交回全局
// 这样"改一下"和"取消改动"是两件不同的事，不用靠连点猜。

import { hana } from "./sdk.js";

const REFRESH_MS = 8000;
const BOOL_KEYS = ["autoRecall", "autoCapture", "readOnly"];

const el = {
  dot: document.getElementById("dot"),
  title: document.getElementById("title"),
  pill: document.getElementById("pill"),
  peer: document.getElementById("peer"),
  stats: document.getElementById("stats"),
  hint: document.getElementById("hint"),
};

let sessionId = null;
let model = null;
let globalStatus = null;

function setSwitch(node, on) {
  if (!node) return;
  node.setAttribute("aria-checked", on ? "true" : "false");
}

function setHint(text, warn) {
  el.hint.textContent = text || "";
  el.hint.classList.toggle("warn", Boolean(warn));
}

function shortId(id) {
  return id ? String(id).slice(-8) : "";
}

function rowOf(key) {
  return document.querySelector(`.row[data-key="${key}"]`);
}

function paintNote(node, overridden) {
  if (!node) return;
  node.textContent = overridden ? "本会话" : "跟随全局";
  node.classList.toggle("over", overridden);
  node.classList.toggle("follow", !overridden);
  node.title = overridden ? "点击交回全局" : "当前跟随全局";
}

function paint(data, status) {
  model = data;
  if (status) globalStatus = status;

  const eff = data.effective || {};
  const overrides = data.state?.overrides || {};
  const has = (key) => Object.prototype.hasOwnProperty.call(overrides, key);

  for (const key of BOOL_KEYS) {
    const row = rowOf(key);
    if (!row) continue;
    setSwitch(row.querySelector(".switch"), Boolean(eff[key]));
    paintNote(row.querySelector(".row-note"), has(key));
  }

  const scopeRow = rowOf("recallPeerScope");
  if (scopeRow) {
    for (const btn of scopeRow.querySelectorAll(".seg button")) {
      const active = btn.dataset.value === (eff.recallPeerScope || "all");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    paintNote(scopeRow.querySelector(".row-note"), has("recallPeerScope"));
  }

  const enabled = globalStatus ? Boolean(globalStatus.enabled) : true;
  el.pill.textContent = enabled ? "全局开" : "全局关";
  el.pill.className = `pill ${enabled ? "on" : "off"}`;

  // 没有身份就不显示一个像样的名字：写清为什么没有，而不是拿别的会话顶上。
  if (!data.peer) {
    el.peer.textContent = "未绑定助手";
    el.peer.title =
      data.peerSource === "merged"
        ? "合并记忆已开启，但这一段没拿到会话身份。"
        : "拿不到会话路径，无法确定这一段属于哪个助手。";
  } else {
    el.peer.textContent = data.peer;
    el.peer.title =
      data.peerSource === "merged"
        ? data.peerAgentDir
          ? `${data.peer}（合并记忆已开启；本会话助手：${data.peerAgentDir}）`
          : `${data.peer}（合并记忆已开启，本机所有助手共用一个身份）`
        : data.peer;
  }

  const recall = data.state?.recall || {};
  const capture = data.state?.capture || {};
  const events = data.probe?.events || {};
  const hooks = (events["provider/before-request"] || 0) + (events["agent/before-start"] || 0);

  const bits = [`召回 ${recall.turns || 0}`, `写回 ${capture.turns || 0}`];
  if (hooks) bits.push(`钩子 ${hooks}`);
  if (data.probe?.lastAt) bits.push(new Date(data.probe.lastAt).toLocaleTimeString());
  el.stats.textContent = bits.join(" · ");

  const live = enabled && (eff.autoRecall || eff.autoCapture);
  el.dot.className = `dot ${live ? "ok" : "idle"}`;

  const overridden = Object.keys(overrides).some((key) => overrides[key] !== null);
  if (!enabled) {
    setHint("全局总闸关着，这里的开关不会生效。", true);
  } else if (globalStatus && !globalStatus.probe) {
    setHint(overridden ? "有本会话设置；点小字交回全局。" : "", false);
  } else {
    setHint(overridden ? "实心小字是本会话设置，点它交回全局。" : "", false);
  }
}

async function resolveSession() {
  try {
    const active = await hana.sessions.getActive();
    sessionId = active?.sessionId || active?.id || active?.session?.sessionId || null;
    const title = active?.title || active?.session?.title || "";
    el.title.textContent = title || (sessionId ? shortId(sessionId) : "无活动会话");
    el.title.title = title || sessionId || "";
  } catch {
    sessionId = null;
    el.title.textContent = "无活动会话";
  }
}

async function fetchStatus() {
  if (!sessionId) return null;
  try {
    const res = await hana.api.fetch(`/status?session=${encodeURIComponent(sessionId)}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function refresh() {
  if (!sessionId) {
    await resolveSession();
    if (!sessionId) {
      setHint("先打开一个对话，这张卡才会跟会话绑定。", false);
      el.stats.textContent = "—";
      el.pill.textContent = "—";
      el.pill.className = "pill";
      return;
    }
  }

  try {
    const [status, res] = await Promise.all([
      fetchStatus(),
      hana.api.fetch(`/session/${encodeURIComponent(sessionId)}`),
    ]);
    const data = await res.json();
    paint(data, status);
  } catch (error) {
    setHint(String(error?.message || error), true);
  }
}

async function write(overrides) {
  if (!sessionId) return;
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

// 点开关：这一项就地变成本会话的值（取反当前生效值）。
async function toggle(key) {
  if (!model) return;
  const overrides = { ...(model.state?.overrides || {}) };
  overrides[key] = !model.effective?.[key];
  await write(overrides);
}

// 点分段：把召回范围定在本会话。
async function setScope(value) {
  if (!model) return;
  const overrides = { ...(model.state?.overrides || {}) };
  overrides.recallPeerScope = value;
  await write(overrides);
}

// 点小字：撤销这一项的会话覆盖，交回全局。
async function reset(key) {
  if (!model) return;
  const overrides = { ...(model.state?.overrides || {}) };
  if (!Object.prototype.hasOwnProperty.call(overrides, key)) return;
  overrides[key] = null;
  await write(overrides);
}

for (const key of BOOL_KEYS) {
  const row = rowOf(key);
  if (!row) continue;
  row.querySelector(".switch").addEventListener("click", () => toggle(key));
  row.querySelector(".row-note").addEventListener("click", () => reset(key));
}

const scopeRow = rowOf("recallPeerScope");
if (scopeRow) {
  scopeRow.querySelector(".row-note").addEventListener("click", () => reset("recallPeerScope"));
  scopeRow.querySelector(".seg").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-value]");
    if (!btn) return;
    setScope(btn.dataset.value);
  });
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

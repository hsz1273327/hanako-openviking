// 会话卡：这段对话里的记忆行为，全部按会话算。
//
// 每一种设置都有两段含义：
//   右侧控件  本会话这一项是什么值（点了就地覆盖）
//   中间小字  "跟随全局" / "本会话"，点它把这一项交回全局
// 这样"改一下"和"取消改动"是两件不同的事，不用靠连点猜。

import { hana } from "./sdk.js";
import { sessionKeyOf } from "./session-key.js";

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

let sessionKey = null;
// 会话归属（宿主断言的 agentId）。拿不到时为空串，显示时回退到后端解析出的 peer。
let sessionOwner = "";
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

  // 会话归属优先用 getActive() 给的 agentId——那是宿主断言的身份，不用解析路径猜。
  // 拿不到（老宿主、没授权）才回退到后端按状态文件解析出的 peer。
  const owner = sessionOwner || data.peer || "";
  if (!owner) {
    el.peer.textContent = "未绑定助手";
    el.peer.title =
      data.peerSource === "merged"
        ? "合并记忆已开启，但这一段没拿到会话身份。"
        : "拿不到会话路径，无法确定这一段属于哪个助手。";
  } else if (sessionOwner) {
    el.peer.textContent = sessionOwner;
    el.peer.title = data.peer
      ? `会话归属 ${sessionOwner}；对外门牌 ${data.peer}`
      : `会话归属 ${sessionOwner}`;
  } else {
    el.peer.textContent = owner;
    el.peer.title =
      data.peerSource === "merged"
        ? data.peerAgentDir
          ? `${owner}（合并记忆已开启；本会话助手：${data.peerAgentDir}）`
          : `${owner}（合并记忆已开启，本机所有助手共用一个身份）`
        : owner;
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
    // 会话 key 用 sessionPath 的 basename（去扩展名、去时间戳），与后端、与 hook 的
    // sessionId、与 <dataDir>/sessions/<key>.json 是同一个值。
    // getActive().sessionId 是 sess_… 形式的稳定 id，映射不到任何状态文件。
    // 拿不到 sessionPath 就是“没有活动会话”：不给 sessionId 留后门，那条老路
    // 正是“编一个查不到也写不进的 key”的源头。
    sessionKey = sessionKeyOf(active) || null;
    sessionOwner = typeof active?.agentId === "string" ? active.agentId.trim() : "";
    const title = active?.title || "";
    el.title.textContent = title || (sessionKey ? shortId(sessionKey) : "无活动会话");
    el.title.title = title || sessionKey || "";
  } catch {
    // 未授权、或不在主聊天窗口：没有可指向的会话。这里不再拿 sessionId 去查——
    // 那个 id 指不到状态文件，查出来是空记录，开关写进去也不会生效。
    sessionKey = null;
    sessionOwner = "";
    el.title.textContent = "无活动会话";
    el.title.title = "";
  }
}

async function fetchStatus() {
  if (!sessionKey) return null;
  try {
    const res = await hana.api.fetch(`/status?session=${encodeURIComponent(sessionKey)}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function refresh() {
  if (!sessionKey) {
    await resolveSession();
    if (!sessionKey) {
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
      hana.api.fetch(`/session/${encodeURIComponent(sessionKey)}`),
    ]);
    const data = await res.json();
    // 后端认不出这个 key 时回 ok:false：不画一份不存在的状态，说清为什么。
    if (data.ok === false) {
      setHint("这个会话对不上任何状态（unknown session key），先重新选一次会话。", true);
      el.stats.textContent = "—";
      return;
    }
    paint(data, status);
  } catch (error) {
    setHint(String(error?.message || error), true);
  }
}

async function write(overrides) {
  if (!sessionKey) return;
  try {
    const res = await hana.api.fetch(`/session/${encodeURIComponent(sessionKey)}`, {
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
    sessionKey = null;
    sessionOwner = "";
    model = null;
    refresh();
  });
} catch {
  /* 老宿主没有这个订阅，靠轮询兜底 */
}

hana.ready();
start();

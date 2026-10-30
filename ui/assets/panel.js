// 整页控制台：状态投影 + 当场可改的开关。
//
// 数据面只有三个端点：
//   GET  /status    只读投影（也顺带做一次 health，往返时间就是它）
//   GET  /probe     日志尾部
//   GET  /controls  六个开关 + 召回范围 + 超时 + 预算
//   POST /controls  改上面这组
//   POST /conn      改连接三字段（地址 / key / 门牌前缀）
//
// 写操作一律乐观更新，失败回滚并提示。开关不是装饰。

import { hana } from "./sdk.js";

const $ = (id) => document.getElementById(id);

const SWITCH_KEYS = ["skillRouting", "probe"];

let controls = null;
let logOpen = false;

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

function setSwitch(node, on) {
  if (!node) return;
  node.setAttribute("aria-checked", on ? "true" : "false");
}

function isOn(node) {
  return node?.getAttribute("aria-checked") === "true";
}

function flash(text, bad) {
  const node = $("saveHint");
  node.textContent = text || "";
  node.classList.toggle("ok", !bad);
  node.classList.toggle("bad", Boolean(bad));
  if (text) {
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => {
      node.textContent = "";
      node.classList.remove("ok", "bad");
    }, 2600);
  }
}

/* ---------------- 渲染 ---------------- */

function applyControls(out) {
  if (!out) return;
  controls = { ...(controls || {}), ...out };
  setSwitch($("swEnabled"), out.enabled);
  for (const key of SWITCH_KEYS) {
    setSwitch(document.querySelector(`.switch[data-key="${key}"]`), out[key]);
  }
  if (out.requestTimeoutMs != null) $("timeoutMs").value = out.requestTimeoutMs;
  if (out.injectBudgetTokens != null) $("budgetTokens").value = out.injectBudgetTokens;
  paintDim(out.enabled);
}

function paintDim(enabled) {
  for (const node of document.querySelectorAll(".toggle")) {
    node.classList.toggle("dim", !enabled);
  }
  $("masterCard").setAttribute("data-off", enabled ? "false" : "true");
}

function renderStatus(data, latencyMs) {
  const reach = data.reach || "idle";
  $("dot").className = `dot ${reach === "ok" ? "ok" : reach === "down" ? "down" : "idle"}`;

  const pill = $("statePill");
  pill.className = "pill";
  if (!data.enabled) pill.textContent = "未启用";
  else if (!data.apiKeySet) pill.textContent = "缺 API Key";
  else if (reach === "down") {
    pill.textContent = "连不上";
    pill.classList.add("down");
  } else if (reach === "ok") {
    pill.textContent = "已连接";
    pill.classList.add("ok");
  } else {
    pill.textContent = "待命";
  }

  const transportText =
    data.transport === "runtime" ? "受管代理" : data.transport === "direct" ? "直连（仅白名单）" : "不可用";
  // /health 回的版本本身就带 v，再拼一个就成 vv0.4.16。
  const rawVersion = String(data.health?.version || "").trim();
  const version = rawVersion ? (rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`) : "";
  const bits = [];
  bits.push(transportText);
  if (version) bits.push(version);
  if (reach === "ok" && latencyMs != null) bits.push(`${latencyMs} ms`);
  $("subLine").textContent = bits.join(" · ");

  $("masterHint").textContent = data.enabled
    ? "已开启。召回与写回按下面的开关执行。"
    : "关着等于没装。打开之后，下面这些开关才有意义。";
  $("masterHint").classList.toggle("warn", !data.enabled);

  $("latency").textContent = reach === "ok" && latencyMs != null ? `${latencyMs} ms` : "—";
  $("version").textContent = version || "—";
  $("transport").textContent = transportText;

  if (document.activeElement !== $("serverUrl")) $("serverUrl").value = data.serverUrl || "";
  if (document.activeElement !== $("apiKey")) {
    $("apiKey").value = "";
    $("apiKey").placeholder = data.apiKeySet ? "已填写（留空表示不改）" : "未填写";
  }

  const err = $("reachError");
  const message = data.error || data.readyError || "";
  err.hidden = !message;
  err.textContent = message;

  const checks = $("checks");
  checks.textContent = "";
  for (const [name, value] of Object.entries(data.ready?.checks || {})) {
    const li = document.createElement("li");
    li.textContent = name;
    li.title = value?.status || "";
    li.classList.add(value?.status === "ok" ? "ok" : "bad");
    checks.appendChild(li);
  }
}

function renderProbe(payload) {
  const lines = payload?.lines || [];
  const counts = {};
  for (const line of lines) {
    const name = line.event || line.kind || "unknown";
    counts[name] = (counts[name] || 0) + 1;
  }

  const box = $("logChips");
  box.textContent = "";
  for (const [name, count] of Object.entries(counts)) {
    const span = document.createElement("span");
    span.textContent = `${name} × ${count}`;
    box.appendChild(span);
  }
  if (!Object.keys(counts).length) {
    const span = document.createElement("span");
    span.textContent = "暂无事件";
    span.style.opacity = "0.45";
    box.appendChild(span);
  }

  const body = $("logBody");
  body.textContent = lines.length
    ? lines
        .slice()
        .reverse()
        .map((line) => JSON.stringify(line))
        .join("\n")
    : "（还没有记录）";
}

/* ---------------- 数据 ---------------- */

// 存量前缀是脏的（比如早先手填的「主力机」）：说清它不会生效，而不是默默留着。
// 只用现有的 flash / title，不动页面的结构和样式。
function warnDirtyPrefix(prefix, note = "") {
  const shown = String(prefix || "");
  flash(`门牌前缀「${shown}」不会生效，请改成字母、数字或连字符${note}`, true);
  $("peerPrefix").title = `「${shown}」不能用：门牌前缀只能用字母、数字和连字符`;
}

function applyConnection(conn) {
  if (!conn) return;
  if (document.activeElement !== $("peerPrefix")) {
    $("peerPrefix").value = conn.peerPrefix || "";
  }
  if (conn.peerPrefixValid === false) warnDirtyPrefix(conn.peerPrefix);
  else $("peerPrefix").title = "";
}

async function currentSessionId() {
  try {
    const active = await hana.sessions.getActive();
    return active?.sessionId || active?.id || active?.session?.sessionId || null;
  } catch {
    return null;
  }
}

async function refresh(opts = {}) {
  const started = performance.now();
  $("refreshBtn").disabled = true;
  try {
    const sid = await currentSessionId();
    const statusPath = sid ? `/status?session=${encodeURIComponent(sid)}` : "/status";
    const [status, probe, ctrl, conn] = await Promise.all([
      jsonGet(statusPath),
      jsonGet("/probe").catch(() => ({ lines: [] })),
      jsonGet("/controls").catch(() => null),
      jsonGet("/conn").catch(() => null),
    ]);
    renderStatus(status, Math.round(performance.now() - started));
    renderProbe(probe);
    if (ctrl) applyControls(ctrl);
    applyConnection(conn);
    if (opts.note) flash(opts.note, false);
    $("foot").textContent = `上次读取 ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    $("dot").className = "dot down";
    $("statePill").className = "pill down";
    $("statePill").textContent = "读取失败";
    $("foot").textContent = String(error?.message || error);
  } finally {
    $("refreshBtn").disabled = false;
  }
}

/* ---------------- 写入 ---------------- */

async function flip(key, node) {
  const before = isOn(node);
  setSwitch(node, !before); // 乐观
  paintDim(key === "enabled" ? !before : isOn($("swEnabled")));
  try {
    const out = await jsonPost("/controls", { [key]: !before });
    if (out.ok === false) throw new Error(out.error || "写入失败");
    applyControls(out);
    flash("已保存");
    if (key === "enabled") await refresh();
  } catch (error) {
    setSwitch(node, before);
    paintDim(isOn($("swEnabled")));
    flash(String(error?.message || error), true);
  }
}

async function patchControls(body) {
  try {
    const out = await jsonPost("/controls", body);
    if (out.ok === false) throw new Error(out.error || "写入失败");
    applyControls(out);
    flash("已保存");
  } catch (error) {
    flash(String(error?.message || error), true);
  }
}

async function saveConnection() {
  const body = {};
  const url = $("serverUrl").value.trim();
  if (url) body.serverUrl = url;
  const key = $("apiKey").value.trim();
  if (key) body.apiKey = key;
  body.peerPrefix = $("peerPrefix").value.trim();
  if (!Object.keys(body).length) return;

  try {
    const out = await jsonPost("/conn", body);
    if (out.ok === false) throw new Error(out.error || "保存失败");
    $("apiKey").value = "";
    $("apiKey").placeholder = out.apiKeySet ? "已填写（留空表示不改）" : "未填写";
    // 服务端回的是存后的真实状态：未变化且非法的存量值会被原样放行，这里得说出来。
    // 脏前缀被放行了，但别的事确实存下去了：一句话里两件都要说清。
    if (out.peerPrefixValid === false) warnDirtyPrefix(out.peerPrefix, "（其余设置已保存）");
    else flash("连接信息已保存");
    await refresh();
  } catch (error) {
    flash(String(error?.message || error), true);
  }
}

/* ---------------- 绑定 ---------------- */

$("swEnabled").addEventListener("click", () => flip("enabled", $("swEnabled")));

for (const node of document.querySelectorAll('.switch[data-key]')) {
  node.addEventListener("click", () => flip(node.dataset.key, node));
}

for (const id of ["serverUrl", "apiKey", "peerPrefix"]) {
  $(id).addEventListener("change", saveConnection);
  $(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveConnection();
    }
  });
}

for (const [id, key] of [
  ["timeoutMs", "requestTimeoutMs"],
  ["budgetTokens", "injectBudgetTokens"],
]) {
  $(id).addEventListener("change", () => {
    const value = Number($(id).value);
    if (Number.isFinite(value)) patchControls({ [key]: value });
  });
}

$("testBtn").addEventListener("click", async () => {
  $("testBtn").disabled = true;
  $("testBtn").textContent = "测试中…";
  await refresh({ note: "已重新探测" });
  $("testBtn").textContent = "测试连接";
  $("testBtn").disabled = false;
});

$("refreshBtn").addEventListener("click", () => refresh());

$("logToggle").addEventListener("click", () => {
  logOpen = !logOpen;
  $("logBody").hidden = !logOpen;
  $("logToggle").textContent = logOpen ? "收起" : "展开";
});

hana.ready();
refresh();

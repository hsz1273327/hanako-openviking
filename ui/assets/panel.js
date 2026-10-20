// 整页控制台。只读投影：不写配置、不触发召回。
// 真正的开关在宿主设置页——这一页只负责把"现在是什么状态"摊开。
import { hana } from "./sdk.js";

const $ = (id) => document.getElementById(id);

function chip(node, on) {
  node.classList.toggle("on", Boolean(on));
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`;
  } catch {
    return url || "—";
  }
}

function renderStatus(data, latencyMs) {
  const reach = data.reach || "idle";
  $("dot").className = `dot ${reach === "ok" ? "ok" : reach === "down" ? "down" : "idle"}`;

  const badge = $("badge");
  badge.className = "badge";
  if (!data.enabled) badge.textContent = "未启用";
  else if (!data.apiKeySet) badge.textContent = "缺 API Key";
  else if (reach === "down") {
    badge.textContent = "连不上";
    badge.classList.add("down");
  } else {
    badge.textContent = "已连接";
    badge.classList.add("ok");
  }

  $("peerLine").textContent = data.peer ? `peer ${data.peer}` : "";
  $("server").textContent = hostOf(data.serverUrl);
  $("keyState").textContent = data.apiKeySet ? "已填（不回显）" : "未填";
  $("version").textContent = data.health?.version ? `v${data.health.version}` : "—";
  $("latency").textContent = reach === "ok" && latencyMs != null ? `${latencyMs} ms` : "—";

  const err = $("reachError");
  if (data.error) {
    err.hidden = false;
    err.textContent = data.error;
  } else {
    err.hidden = true;
  }

  const checks = $("checks");
  checks.textContent = "";
  for (const [name, value] of Object.entries(data.ready?.checks || {})) {
    const li = document.createElement("li");
    li.textContent = name;
    if (value?.status === "ok") li.classList.add("ok");
    else if (value?.status === "not_configured") li.classList.add("bad");
    else li.classList.add("bad");
    li.title = value?.status || "";
    checks.appendChild(li);
  }

  $("peer").textContent = data.peer || "—";
  $("scope").textContent = data.recallScope === "self" ? "只看本机（self）" : "跨门牌（all）";
  $("timeout").textContent = `${data.timeoutMs} ms`;
  $("budget").textContent = `${data.budgetTokens} token`;

  chip($("swEnabled"), data.enabled);
  chip($("swReadOnly"), data.readOnly);
  chip($("swProbe"), data.probe);
  chip($("swMemory"), data.autoRecall);
  chip($("swCapture"), data.autoCapture);
  chip($("swSkill"), data.skillRouting);

  const note = $("swNote");
  if (!data.enabled) {
    note.textContent = "总闸关着：下面这些标记都不生效。";
    note.classList.add("warn");
  } else if (data.readOnly) {
    note.textContent = "只读模式：召回照常，写回被跳过。";
    note.classList.remove("warn");
  } else {
    note.textContent = "";
    note.classList.remove("warn");
  }
}

function renderProbe(payload) {
  const summary = $("logSummary");
  summary.textContent = "";
  const counts = {};
  for (const line of payload.lines || []) {
    const name = line.event || line.kind || "unknown";
    counts[name] = (counts[name] || 0) + 1;
  }
  const names = Object.keys(counts);
  if (!names.length) {
    summary.textContent = "";
  } else {
    for (const name of names) {
      const span = document.createElement("span");
      span.className = "chip on";
      span.textContent = `${name} × ${counts[name]}`;
      summary.appendChild(span);
    }
  }

  const body = $("logBody");
  if (!payload.lines?.length) {
    body.textContent = "（还没有记录）";
    return;
  }
  body.textContent = payload.lines
    .slice()
    .reverse()
    .map((line) => JSON.stringify(line))
    .join("\n");
}

async function refresh() {
  const started = performance.now();
  try {
    const [statusRes, probeRes] = await Promise.all([
      hana.api.fetch("/status"),
      hana.api.fetch("/probe"),
    ]);
    const status = await statusRes.json().catch(() => ({}));
    const probe = await probeRes.json().catch(() => ({ lines: [] }));
    renderStatus(status, Math.round(performance.now() - started));
    renderProbe(probe);
    $("foot").textContent = `上次刷新 ${new Date().toLocaleTimeString()} · 只读投影，改开关请去设置页`;
  } catch (error) {
    $("dot").className = "dot down";
    $("badge").textContent = "读取失败";
    $("badge").className = "badge down";
    $("foot").textContent = String(error?.message || error);
  }
}

$("refresh").addEventListener("click", refresh);
hana.ready();
refresh();

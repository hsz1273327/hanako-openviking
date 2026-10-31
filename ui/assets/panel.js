// 整页控制台：状态投影 + 当场可改的开关。
//
// 数据面只有这几个端点：
//   GET  /status    只读投影（也顺带做一次 health，往返时间就是它）
//   GET  /probe     日志尾部
//   GET  /controls  六个开关 + 召回范围 + 超时 + 预算
//   POST /controls  改上面这组
//   GET  /recall-mode  召回判断 / 召回查询
//   POST /recall-mode  改上面这两个（面板那一排下拉，整单提交）
//   POST /conn      改连接三字段（地址 / key / 门牌前缀）
//   GET  /peers     中枢里的 peer + 是否排除
//   POST /peers     改排除名单
//
// 写操作一律乐观更新，失败回滚并提示。开关不是装饰。
// 召回判断 / 召回查询两个下拉也在这页：改一下直接 POST，没有保存按钮。

import { hana } from "./sdk.js";
import { sessionKeyOf } from "./session-key.js";
// 状态档位（ok / muted / bad）单独一份：父项与 details 共用，测试也能直接验。
import { statusTone } from "./check-tone.js";
// 服务端检查项的摘要与状态词：纯函数，冒烟直接验。
import { summarizeChecks } from "./check-summary.js";
// 召回那排下拉的状态与提交：整单校验、失败回滚，纯逻辑单独一份，冒烟直接验。
import { commitLayers, paintLayers } from "./recall-layers.js";

const $ = (id) => document.getElementById(id);

const SWITCH_KEYS = ["skillRouting", "probe"];

// 中枢里 peer 多的时候列表内部滚动，不截断、不折叠成 +N。
// 一屏放得下 8 行（行高 + 间距），超出的部分靠 CSS 的 max-height 滚。

let controls = null;
let logOpen = false;
// 上一次确认过的召回策略（服务端回的或默认值）。提交失败时回滚到这份。
let layers = paintLayers(null);
let layersPending = false;
let layersDirty = false;
// 最近一次成功读到的 peer 列表。点击切换排除时先改这份，再按它提交整单。
let peerCache = [];
let peerWritePending = false;

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
  for (const node of document.querySelectorAll(".toggle, .recall-row")) {
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

  const checkList = Array.isArray(data.ready?.checks) ? data.ready.checks : [];
  renderChecks(checkList);
}

/**
 * 服务端检查项：一行摘要；有问题时下面直接平铺不对的那几项。
 *
 * 五个胶囊对用户基本无用，只在排查「连上了但召回是空的」时才有价值。
 * 全绿就是一句静态文字，没有箭头也不可点：展开只是把「就绪」重复五遍。
 * 正常的项永远不出现。颜色档位仍按 statusTone。agfs 的 details 只进 title。
 */
function renderChecks(list) {
  const block = $("checksBlock");
  const head = $("checksSummary");
  const box = $("checks");
  if (!block || !head || !box) return;

  const summary = summarizeChecks(list);
  box.textContent = "";

  // 没读到检查项（未启用 / 连不上 / ready 挂了）：整块不出现，别拿「未知」占地方。
  if (!summary.total) {
    block.hidden = true;
    head.textContent = "";
    box.hidden = true;
    return;
  }

  block.hidden = false;
  head.textContent = summary.text;
  head.classList.remove("ok", "muted", "bad");
  head.classList.add(summary.tone);

  // 只列问题项：全绿时列表是空的，连占位都不要。
  box.hidden = summary.problems.length === 0;

  for (const problem of summary.problems) {
    const li = document.createElement("li");
    li.classList.add(statusTone(problem.status));

    const name = document.createElement("span");
    name.className = "check-name";
    name.textContent = problem.name;
    const word = document.createElement("span");
    word.className = "check-status";
    word.textContent = problem.label;
    li.append(name, word);

    // agfs 这类父项带的子项：塞进 title，鼠标悬停才看，不撑开一行。
    const source = list.find(
      (check) => String(check?.name ?? "").trim() === problem.name,
    );
    const details = Array.isArray(source?.details) ? source.details : [];
    li.title = [problem.status, ...details.map((sub) => `${sub?.name || "?"}: ${sub?.status || "?"}`)]
      .filter(Boolean)
      .join(" · ");

    box.appendChild(li);
  }
}

function paintPeerRow(row, peer) {
  const excluded = Boolean(peer?.excluded) && !peer?.self;
  row.classList.toggle("self", Boolean(peer?.self));
  row.classList.toggle("excluded", excluded);
  if (peer?.self) {
    row.title = "本机，不参与排除";
  } else if (excluded) {
    row.title = "已排除，不参与召回，点击恢复";
  } else {
    row.title = "点击排除，之后召回不再包含它的记忆";
  }
}

function renderPeers(payload) {
  const box = $("peerList");
  const hint = $("peerHint");
  const count = $("peerCount");
  if (!box) return;
  box.textContent = "";
  box.title = "";
  box.classList.remove("empty");
  if (count) count.textContent = "";
  if (hint) hint.hidden = true;

  // null（请求本身失败）和 ok:false（服务端读不到）都是同一种结果。
  if (!payload || payload.ok === false) {
    peerCache = [];
    box.textContent = "读不到 peer 列表";
    box.title = String(payload?.error || "");
    box.classList.add("empty");
    return;
  }

  const peers = Array.isArray(payload.peers) ? payload.peers : [];
  peerCache = peers;
  if (count) count.textContent = `${peers.length} 个`;

  if (!peers.length) {
    box.textContent = "中枢里还没有别的 peer";
    box.classList.add("empty");
    return;
  }

  if (hint) hint.hidden = !peers.some((peer) => peer && !peer.self);

  for (const peer of peers) {
    const row = document.createElement("div");
    row.className = "peer-row";

    const name = document.createElement("span");
    name.className = "peer-name";
    name.textContent = peer?.name || "";
    row.appendChild(name);

    // 一行小字：归属 · 记忆条数 · 是否参与召回。
    // count 为 null 表示这一条没读到，显示「—」而不是骗人的 0；
    // countCapped 表示数到了树节点上限，加个 + 说明真实可能更多。
    // 别改成固定的「500+」：500 是 fs/tree 的节点总数上限，目录与别的文件都占
    // 额度，md 条数一定小于 500，写死会造一个数不到的数字。
    const items = [peer?.self ? "本机" : "外部"];
    items.push(
      peer?.count == null
        ? "—"
        : peer.countCapped === true
          ? `${peer.count}+ 条`
          : `${peer.count} 条`,
    );
    items.push(peer?.excluded && !peer?.self ? "已排除" : "参与召回");
    const meta = document.createElement("span");
    meta.className = "peer-meta";
    meta.textContent = items.join(" · ");
    row.appendChild(meta);

    paintPeerRow(row, peer);

    // 本机的 peer 不能排除：整行不做成可点的。
    if (peer?.name && !peer?.self) {
      row.classList.add("tappable");
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      const toggle = () => togglePeerExclusion(peer.name);
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    }

    box.appendChild(row);
  }
}

async function togglePeerExclusion(name) {
  if (peerWritePending) return;
  const before = peerCache;
  const current = before.find((peer) => peer?.name === name);
  if (!current || current.self) return;

  const next = before.map((peer) =>
    peer?.name === name ? { ...peer, excluded: !peer.excluded } : peer,
  );

  peerWritePending = true;
  renderPeers({ ok: true, peers: next }); // 乐观：先让那一行变成目标状态
  try {
    const out = await jsonPost("/peers", {
      excluded: next.filter((peer) => peer?.excluded).map((peer) => peer.name),
    });
    if (!out || out.ok === false) throw new Error(out?.error || "写入失败");
    // 写路径不回读列表：按服务端实际存下的名单重算本地标记（大小写敏感），
    // 不重新渲染 peers 数组，下一次 refresh() 才去读 /peers。
    const saved = Array.isArray(out.excluded) ? out.excluded : [];
    peerCache = peerCache.map((peer) => ({
      ...peer,
      excluded: saved.includes(peer?.name),
    }));
    renderPeers({ ok: true, peers: peerCache });
    flash("排除名单已更新");
  } catch (error) {
    renderPeers({ ok: true, peers: before }); // 失败回滚到点击前
    flash(String(error?.message || error), true);
  } finally {
    peerWritePending = false;
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

async function currentSessionKey() {
  try {
    const active = await hana.sessions.getActive();
    // 与卡片同一套规则：/status 只认状态文件的 key，sess_… 形式的稳定 id 映射不到。
    // 只吃 sessionPath，不拿 sessionId 当保底——那个 id 指不到任何文件。
    return sessionKeyOf(active) || null;
  } catch {
    return null;
  }
}

async function refresh(opts = {}) {
  const started = performance.now();
  $("refreshBtn").disabled = true;
  try {
    const sid = await currentSessionKey();
    const statusPath = sid ? `/status?session=${encodeURIComponent(sid)}` : "/status";
    const [status, probe, ctrl, conn, peers, layerOut] = await Promise.all([
      jsonGet(statusPath),
      jsonGet("/probe").catch(() => ({ lines: [] })),
      jsonGet("/controls").catch(() => null),
      jsonGet("/conn").catch(() => null),
      // peer 列表是锦上添花：读不到也不能把整页状态拖下水。
      jsonGet("/peers").catch(() => null),
      jsonGet("/recall-mode").catch(() => null),
    ]);
    renderStatus(status, Math.round(performance.now() - started));
    renderPeers(peers);
    renderProbe(probe);
    if (ctrl) applyControls(ctrl);
    applyConnection(conn);
    // 读不到就留上一次的值，不把下拉刷成空。
    if (layerOut) applyLayers(paintLayers(layerOut));
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

/* ---------------- 召回策略 ---------------- */

// 两个下拉只回写、不重算：服务端存下什么就显示什么，脏值已在 paintLayers 收敛。
function applyLayers(next) {
  layers = next;
  $("recallGate").value = next.recallGate;
  $("queryMode").value = next.queryMode;
}

function readLayers() {
  return { recallGate: $("recallGate").value, queryMode: $("queryMode").value };
}

function sameLayers(a, b) {
  return a.recallGate === b.recallGate && a.queryMode === b.queryMode;
}

// 改一下立刻提交，跟上面两个开关一样没有保存按钮。
// 一次只发一单（/recall-mode 整单校验）：请求还在飞的时候又改了一格，
// 就记一笔、等上一单收笔后再发，不把这次改动丢掉。
async function saveLayers() {
  if (layersPending) {
    layersDirty = true;
    return;
  }
  layersPending = true;
  try {
    do {
      layersDirty = false;
      const next = readLayers();
      // 已经跟确认过的值一致：不用再发（失败回滚后就走到这里）。
      if (sameLayers(next, layers)) break;
      await commitLayers({
        before: layers,
        next,
        send: (body) => jsonPost("/recall-mode", body),
        apply: applyLayers,
        flash,
      });
    } while (layersDirty);
  } finally {
    layersPending = false;
    layersDirty = false;
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

for (const id of ["recallGate", "queryMode"]) {
  $(id).addEventListener("change", saveLayers);
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

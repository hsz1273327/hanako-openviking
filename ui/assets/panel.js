// 整页控制台：状态投影 + 当场可改的开关。
//
// 数据面只有这几个端点：
//   GET  /status    只读投影（也顺带做一次 health，往返时间就是它）
//   GET  /probe     日志尾部
//   GET  /controls  六个开关 + 召回范围 + 超时 + 预算
//   POST /controls  改上面这组
//   GET  /recall-mode  召回判断 / 召回查询 / llm 提示词与判断模型 / 精排通道
//   POST /recall-mode  改上面这组（面板「召回管理」栏，整单提交）
//   POST /recall-mode/test  用当前会话最近一轮候选复跑精排（不注入）
//   GET  /models       宿主公开模型目录（自选模型下拉的选项）
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
import {
  DEFAULT_GATE_PROMPT,
  DEFAULT_MODEL_OPTION,
  DEFAULT_RERANK_PROMPT,
  RERANK_CHANNEL_LABELS,
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_TIMEOUT_DEFAULTS,
  SYSTEMONE_MAX_CANDIDATES,
  SYSTEMONE_TIMEOUT_BASE,
  SYSTEMONE_TIMEOUT_MAX,
  SYSTEMONE_TIMEOUT_STEP,
  channelPairNote,
  commitLayers,
  emptyRerankChannel,
  channelServiceMissing,
  channelTypeOptions,
  isCompleteRerankChannel,
  modelOptions,
  normalizeGatePrompt,
  normalizeRerankChannels,
  normalizeRerankPrompt,
  normalizeServiceTimeout,
  paintRecallConfig,
  promptDraft,
  promptStatus,
  rerankChannelsCountText,
  rerankChannelsText,
  rerankPromptDraft,
  rerankPromptStatus,
  serviceTestBody,
  serviceTestReady,
  serviceTestView,
  serviceTimeoutInput,
} from "./recall-layers.js";

const $ = (id) => document.getElementById(id);

const SWITCH_KEYS = ["skillRouting", "probe"];

// 中枢里 peer 多的时候列表内部滚动，不截断、不折叠成 +N。
// 一屏放得下 8 行（行高 + 间距），超出的部分靠 CSS 的 max-height 滚。

let controls = null;
let logOpen = false;
// 上一次确认过的召回策略（服务端回的或默认值）。提交失败时回滚到这份。
let layers = paintRecallConfig(null);
let layersPending = false;
let layersDirty = false;
// 用户动过提示词之后，刷新不再拿默认文案去盖他（包括他故意清空的那次）。
let promptTouched = false;
let rerankPromptTouched = false;
// 通道行的编辑草稿。服务端确认后从这里重画；读 /recall-mode 也覆盖它。
let rerankChannelsDraft = [];
let rerankTestPending = false;
// 最近一次成功读到的 peer 列表。点击切换排除时先改这份，再按它提交整单。
let peerCache = [];
let peerWritePending = false;
// 宿主模型目录。它可能读不到；读不到只影响「自选模型」两个下拉，其它区块照常。
let modelCatalog = { loaded: false, ok: false, models: [], error: "" };
let modelsLoading = false;

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
  // 前置（探针 + 打分服务）和技能路由都是独立块，总闸关着时一起置灰。
  for (const node of document.querySelectorAll(
    ".toggle, .recall-grid, #scoringServices, .gate-advanced, .skill-route",
  )) {
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

/** 只有 llm 才展开提示词与判断模型。 */
function paintGatePanels() {
  const advanced = $("gateAdvanced");
  if (advanced) advanced.hidden = $("recallGate").value !== "llm";
}

/** 只有 rerank=llm 才展开重排提示词、兜底模型与精排通道。 */
function paintRerankPanels() {
  const advanced = $("rerankAdvanced");
  if (advanced) advanced.hidden = $("rerank").value !== "llm";
}

function updateChannel(index, patch) {
  const current = rerankChannelsDraft[index];
  if (!current) return;
  rerankChannelsDraft[index] = { ...current, ...patch };
}

function channelCell(labelText, control, wide = false) {
  const cell = document.createElement("label");
  cell.className = wide ? "channel-cell wide" : "channel-cell";
  const label = document.createElement("span");
  label.textContent = labelText;
  cell.append(label, control);
  return cell;
}

function textInput(value, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

/**
 * 通道列表：每行是类型 / 名称 / 权重 / 超时 / 启用 / 删除。
 * 类型选项按上面已配的打分服务动态生成：只配了精排就只有「精排服务」，
 * 两个都没配就只剩「宿主模型」，此时「添加通道」禁用。
 * 只在 change 时提交，不抢正在输入的光标。
 */
function renderRerankChannels(list) {
  const box = $("rerankChannelList");
  if (!box) return;
  rerankChannelsDraft = normalizeRerankChannels(list);
  box.textContent = "";

  const typeOptions = channelTypeOptions(layers);
  const noService = typeOptions.every((option) => option.value === "model");

  const empty = $("rerankChannelsEmpty");
  if (empty) empty.hidden = rerankChannelsDraft.length > 0;
  const count = $("rerankChannelsCount");
  if (count) count.textContent = rerankChannelsCountText(rerankChannelsDraft);
  const add = $("rerankAddChannel");
  if (add) add.disabled = rerankChannelsDraft.length >= RERANK_CHANNELS_MAX || noService;
  const addHint = $("rerankChannelHint");
  if (addHint) addHint.hidden = !noService;

  rerankChannelsDraft.forEach((channel, index) => {
    const row = document.createElement("div");
    row.className = "channel-row";
    row.dataset.index = String(index);

    // 服务被清空后，存量通道保留在列表里，但运行时不会生效：标红说清楚，不自动删。
    const unavailable = channelServiceMissing(channel, layers);
    row.classList.toggle("warn", unavailable);

    const head = document.createElement("div");
    head.className = "channel-row-head";
    const title = document.createElement("b");
    title.textContent = `通道 ${index + 1}`;

    const enabledLabel = document.createElement("label");
    enabledLabel.className = "channel-enabled";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = channel.enabled;
    enabled.addEventListener("change", () => {
      updateChannel(index, { enabled: enabled.checked });
      saveLayers();
    });
    enabledLabel.append(enabled, document.createTextNode(" 启用"));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn ghost sm";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      rerankChannelsDraft.splice(index, 1);
      renderRerankChannels(rerankChannelsDraft);
      saveLayers();
    });
    head.append(title, enabledLabel);
    if (unavailable) {
      const warning = document.createElement("span");
      warning.className = "channel-unavailable";
      warning.textContent = "服务未配置，不会生效";
      head.append(warning);
    }
    head.append(remove);

    const type = document.createElement("select");
    const options = [...typeOptions];
    // 存量通道的类型可能已不在可选范围内（服务被清空）：把当前值留住，别让下拉变空。
    if (!options.some((option) => option.value === channel.type)) {
      options.push({
        value: channel.type,
        label: `${RERANK_CHANNEL_LABELS[channel.type] || channel.type}（服务未配置）`,
      });
    }
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      type.appendChild(node);
    }
    type.value = channel.type;
    type.addEventListener("change", () => {
      // 那一格的默认超时跟类型走，placeholder 与上限一起换。
      timeout.placeholder = String(RERANK_CHANNEL_TIMEOUT_DEFAULTS[type.value] ?? 800);
      timeout.max = String(type.value === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000);
      updateChannel(index, { type: type.value, url: "", model: "" });
      saveLayers();
    });

    const name = textInput(channel.name, "显示名，可空");
    name.addEventListener("change", () => {
      updateChannel(index, { name: name.value });
      saveLayers();
    });

    const weight = document.createElement("input");
    weight.type = "number";
    weight.min = "0.1";
    weight.max = "10";
    weight.step = "0.1";
    weight.value = String(channel.weight);
    weight.addEventListener("change", () => {
      const parsed = Number(weight.value);
      if (!Number.isFinite(parsed)) {
        weight.value = String(channel.weight);
        return;
      }
      const clamped = Math.min(10, Math.max(0.1, parsed));
      weight.value = String(clamped);
      updateChannel(index, { weight: clamped });
      saveLayers();
    });

    // 超时那一格：留空 = 用该类型的默认值（placeholder 就显示这个数）。
    // systemone 一次问完全部候选，候选越多越慢，所以提示只挂在它下面。
    const timeout = document.createElement("input");
    timeout.type = "number";
    timeout.min = "200";
    timeout.max = String(
      channel.type === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000,
    );
    timeout.step = "100";
    timeout.placeholder = String(RERANK_CHANNEL_TIMEOUT_DEFAULTS[channel.type] ?? 800);
    timeout.title =
      channel.type === "systemone"
        ? `留空 = 自适应：${SYSTEMONE_TIMEOUT_BASE}ms 起，每多一条候选再给 ${SYSTEMONE_TIMEOUT_STEP}ms，上限 ${SYSTEMONE_TIMEOUT_MAX}ms；一次只问前 ${SYSTEMONE_MAX_CANDIDATES} 条`
        : "留空 = 用该类型的默认值";
    timeout.value = channel.timeoutMs ? String(channel.timeoutMs) : "";
    timeout.addEventListener("change", () => {
      const text = timeout.value.trim();
      if (!text) {
        const next = { ...rerankChannelsDraft[index] };
        delete next.timeoutMs;
        rerankChannelsDraft[index] = next;
        saveLayers();
        return;
      }
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        timeout.value = channel.timeoutMs ? String(channel.timeoutMs) : "";
        return;
      }
      const ceiling = channel.type === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000;
      const clamped = Math.min(ceiling, Math.max(200, Math.floor(parsed)));
      timeout.value = String(clamped);
      updateChannel(index, { timeoutMs: clamped });
      saveLayers();
    });

    const cells = document.createElement("div");
    cells.className = "channel-cells";
    cells.append(
      channelCell("类型", type),
      channelCell("名称", name),
      channelCell("权重", weight),
      channelCell("超时（ms）", timeout),
    );

    row.append(head, cells);
    // 自己的地址与模型只填了一半：运行时那一对会整个改用服务配置，得说出来。
    const pairNote = channelPairNote(channel, layers);
    if (pairNote) {
      const note = document.createElement("p");
      note.className = "channel-pair-note";
      note.textContent = pairNote;
      row.append(note);
    }
    box.appendChild(row);
  });
}

function formatChannelTest(out) {
  const lines = [];
  const channels = Array.isArray(out?.channels) ? out.channels : [];
  lines.push(
    `候选 ${out?.candidates ?? 0} 条 · ${channels.length} 路通道 · ${out?.elapsedMs ?? 0}ms`,
  );
  for (const channel of channels) {
    const label = RERANK_CHANNEL_LABELS[channel?.type] || channel?.type || "通道";
    const name = channel?.name ? `${label} ${channel.name}` : label;
    if (channel?.ok) {
      const raw = (Array.isArray(channel.scores) ? channel.scores : [])
        .map((score) => (score === null || score === undefined ? "—" : Number(score).toFixed(2)))
        .join(", ");
      const scaled = (Array.isArray(channel.normalized) ? channel.normalized : [])
        .map((score) => (score === null || score === undefined ? "—" : Number(score).toFixed(2)))
        .join(", ");
      const range = Array.isArray(channel.range)
        ? ` ${Number(channel.range[0]).toFixed(2)}~${Number(channel.range[1]).toFixed(2)}`
        : "";
      lines.push(`${name} · ok ${channel.elapsedMs}ms · 原始 [${raw}]${range}`);
      lines.push(`${name} · 标准化 [${scaled}] × 权重 ${Number(channel.weight ?? 1)}`);
    } else {
      lines.push(
        `${name} · ${channel?.abstained ? "弃权" : "失败"} ${channel?.elapsedMs ?? 0}ms · ${channel?.error || "失败"}`,
      );
    }
    // 整对回退的通道要说明为什么没用它自己的地址 / 模型名。
    if (channel?.pairNote) lines.push(`${name} · ${channel.pairNote}`);
  }
  if (out?.fallback) {
    lines.push("合并：全部通道弃权，原样保留全部候选");
  } else {
    lines.push(
      `合并：[${(Array.isArray(out?.merged) ? out.merged : [])
        .map((score) => Number(score).toFixed(2))
        .join(", ")}]`,
    );
    const kept = Array.isArray(out?.kept) ? out.kept.map((index) => `#${index + 1}`) : [];
    lines.push(`保留：${kept.join(", ") || "无"}`);
  }
  return lines.join("\n");
}

/* ---------------- 打分服务的连通性测试 ---------------- */

// 一组服务正在测；避免连点把一趟请求发成两趟。
const serviceTestPending = new Set();

/** 结果行统一的一次收笔：颜色只表达状态，文案已经在 serviceTestView 里拼好了。 */
function paintServiceResult(box, view) {
  if (!box) return;
  box.hidden = false;
  box.className = `service-result ${view.tone}`;
  box.textContent = view.text;
}

/** 改了地址 / 模型 / 超时，上一次的结果就不再可信，直接收掉。 */
function clearServiceResult(kind) {
  const box = $(`${kind}ServiceResult`);
  if (!box) return;
  box.hidden = true;
  box.className = "service-result";
  box.textContent = "";
}

/**
 * 拿输入框里此刻的值真打一发打分服务。
 *
 * 不发已保存的配置：填了还没保存的组合也要能先试。服务端只读这个请求体，
 * 不碰任何状态，所以点多少次都不会把配置写成半截。
 */
async function runServiceTest(kind) {
  const button = $(`${kind}ServiceTest`);
  const box = $(`${kind}ServiceResult`);
  if (!button || !box || serviceTestPending.has(kind)) return;

  const draft = {
    url: $(`${kind}ServiceUrl`).value,
    model: $(`${kind}ServiceModel`).value,
    timeoutMs: $(`${kind}ServiceTimeoutMs`).value,
  };
  const body = serviceTestBody(kind, draft);

  // 没填全就没有可测的东西：直接显示「先填地址和模型」，不发请求。
  // 填了但不合法（比如漏了 http://）仍然发：服务端会回一句具体的拒绝理由。
  if (!serviceTestReady(draft)) {
    paintServiceResult(box, serviceTestView(null));
    return;
  }

  serviceTestPending.add(kind);
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "测试中…";
  paintServiceResult(box, { tone: "muted", text: `正在请求 ${body.url}…` });
  try {
    const out = await jsonPost("/recall-mode/service-test", body);
    if (!out || typeof out !== "object") throw new Error("服务端没有返回结果");
    paintServiceResult(box, serviceTestView(out, body.model));
  } catch (error) {
    paintServiceResult(box, { tone: "bad", text: `不可用 · ${String(error?.message || error)}` });
  } finally {
    serviceTestPending.delete(kind);
    button.disabled = false;
    button.textContent = label;
  }
}

async function runRerankChannelTest() {
  const button = $("rerankTestBtn");
  const box = $("rerankTestResult");
  if (!button || !box || rerankTestPending) return;
  rerankTestPending = true;
  button.disabled = true;
  button.textContent = "测试中…";
  box.hidden = false;
  box.textContent = "正在用这个会话最近一轮的真实候选测试…";
  try {
    const sid = await currentSessionKey();
    if (!sid) throw new Error("当前会话还没绑定，先打开一次对话再试");
    // 先落盘当前编辑，再用服务端刚存下的通道跑；失败会由 saveLayers 自己回滚。
    await saveLayers();
    const out = await jsonPost("/recall-mode/test", { session: sid });
    if (!out || out.ok === false) throw new Error(out?.error || "测试失败");
    box.textContent = formatChannelTest(out);
  } catch (error) {
    box.textContent = `测试失败：${String(error?.message || error)}`;
  } finally {
    rerankTestPending = false;
    button.disabled = false;
    button.textContent = "测试";
  }
}

/** 提示词旁那行小字：默认 / 已修改 / 空（不拦截）。 */
function paintPromptStatus() {
  const node = $("gatePromptStatus");
  if (node) node.textContent = promptStatus($("gatePrompt").value);
  const rerankNode = $("rerankPromptStatus");
  if (rerankNode) rerankNode.textContent = rerankPromptStatus($("rerankPrompt").value);
}

function setOptions(select, options, value) {
  if (!select) return;
  select.textContent = "";
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
  const wanted = String(value || "");
  // 存量值不在目录里也要留住，否则一打开面板就像配置丢了。
  if (wanted && !options.some((option) => option.value === wanted)) {
    const node = document.createElement("option");
    node.value = wanted;
    node.textContent = `${wanted}（不在目录里）`;
    select.appendChild(node);
  }
  select.value = wanted || options[0]?.value || "";
}

/**
 * 一个下拉选到底：首项是默认，其余是目录里的每个模型。
 *
 * 目录读不到时只留首项、旁边写一行原因，但不禁用这块：默认通道照样能选、能保存。
 * gate 与 rerank 共用这一份，只换节点和当前值。
 */
function paintModelSelectInto(selectId, hintId, value) {
  const select = $(selectId);
  const hint = $(hintId);
  if (!select) return;

  const options = modelCatalog.ok
    ? [DEFAULT_MODEL_OPTION, ...modelOptions(modelCatalog.models)]
    : [DEFAULT_MODEL_OPTION];
  setOptions(select, options, value);

  if (!hint) return;
  if (!modelCatalog.loaded) {
    hint.hidden = false;
    hint.textContent = "正在读取模型目录…";
  } else if (!modelCatalog.ok) {
    hint.hidden = false;
    hint.textContent = `模型目录不可用：${modelCatalog.error || "读不到"}。现在只能用默认模型。`;
  } else if (options.length <= 1) {
    hint.hidden = false;
    hint.textContent = "宿主没有可用模型，只能用默认模型。";
  } else {
    hint.hidden = true;
    hint.textContent = "";
  }
}

function paintModelSelect() {
  paintModelSelectInto("gateModel", "gateModelsHint", layers.gateModel);
  paintModelSelectInto("rerankModel", "rerankModelsHint", layers.rerankModel);
}

function renderModels(payload) {
  const ok = Boolean(payload && payload.ok !== false && Array.isArray(payload.models));
  modelCatalog = {
    loaded: true,
    ok,
    models: ok ? payload.models : [],
    error: ok ? "" : String(payload?.error || "读不到模型目录"),
  };
  paintModelSelect();
}

// 面板打开时多读一次目录；它失败只影响模型下拉的候选，不阻断其它区块。
async function loadModels() {
  if (modelsLoading) return;
  modelsLoading = true;
  try {
    renderModels(await jsonGet("/models"));
  } catch (error) {
    renderModels({ ok: false, error: String(error?.message || error) });
  } finally {
    modelsLoading = false;
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
    // 模型目录单独读、不 await：它慢或失败只影响「自选模型」，不拖住整页。
    loadModels();
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
    if (layerOut) applyLayers(layerOut);
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

// 控件只回写、不重算：服务端存下什么就显示什么，脏值已在 paintRecallConfig 收敛。
function applyLayers(next) {
  // 还没填完的新通道行先留在界面上：它们不在服务端配置里，但正在被编辑。
  const pending = rerankChannelsDraft.filter((channel) => !isCompleteRerankChannel(channel));
  layers = paintRecallConfig(next);
  $("recallGate").value = layers.recallGate;
  $("queryMode").value = layers.queryMode;
  $("rerank").value = layers.rerank;
  // 用户正在改提示词时不要被一次刷新抢走光标与内容。
  if (document.activeElement !== $("gatePrompt")) {
    // 配置为空时拿默认提示词当草稿填上：一打开就能直接改，不靠 placeholder。
    $("gatePrompt").value = promptDraft(layers.gatePrompt, promptTouched);
  }
  if (document.activeElement !== $("rerankPrompt")) {
    $("rerankPrompt").value = rerankPromptDraft(layers.rerankPrompt, rerankPromptTouched);
  }
  paintPromptStatus();
  paintGatePanels();
  paintRerankPanels();
  // 打分服务：正在输入的那一格不被一次刷新抢走光标与内容。
  for (const [id, key] of SERVICE_FIELDS) {
    if (document.activeElement !== $(id)) {
      $(id).value = id.endsWith("TimeoutMs")
        ? serviceTimeoutInput(layers[key], kindOfServiceField(id))
        : layers[key] || "";
    }
  }
  renderRerankChannels([...layers.rerankChannels, ...pending]);
  paintModelSelect();
}

function readLayers() {
  return {
    recallGate: $("recallGate").value,
    queryMode: $("queryMode").value,
    gatePrompt: normalizeGatePrompt($("gatePrompt").value),
    gateModel: $("gateModel").value,
    rerank: $("rerank").value,
    rerankPrompt: normalizeRerankPrompt($("rerankPrompt").value),
    rerankModel: $("rerankModel").value,
    // 没填完的行不提交；服务端只认完整通道，整单校验会直接 400。
    rerankChannels: rerankChannelsDraft.filter(isCompleteRerankChannel),
    // 打分服务：原样发，合法性由服务端整单校验；被拒就整组回滚。
    rerankServiceUrl: $("rerankServiceUrl").value.trim(),
    rerankServiceModel: $("rerankServiceModel").value.trim(),
    // 超时收成数字或 null，与服务端投影同形：否则「没改」与「改了」比不出来。
    rerankServiceTimeoutMs: normalizeServiceTimeout($("rerankServiceTimeoutMs").value, "rerank"),
    systemoneServiceUrl: $("systemoneServiceUrl").value.trim(),
    systemoneServiceModel: $("systemoneServiceModel").value.trim(),
    systemoneServiceTimeoutMs: normalizeServiceTimeout(
      $("systemoneServiceTimeoutMs").value,
      "systemone",
    ),
  };
}

/** 一个输入框属于哪一类服务：按字段名前缀分，两类超时的边界不同。 */
function kindOfServiceField(id) {
  return id.startsWith("systemone") ? "systemone" : "rerank";
}

// 打分服务六字段与输入框 id 一一对应（id 与配置键同名）。
const SERVICE_FIELDS = [
  ["rerankServiceUrl", "rerankServiceUrl"],
  ["rerankServiceModel", "rerankServiceModel"],
  ["rerankServiceTimeoutMs", "rerankServiceTimeoutMs"],
  ["systemoneServiceUrl", "systemoneServiceUrl"],
  ["systemoneServiceModel", "systemoneServiceModel"],
  ["systemoneServiceTimeoutMs", "systemoneServiceTimeoutMs"],
];

// 两组服务的「测试」按钮：kind -> 按钮 id。结果行 id 按 kind 推出来。
const SERVICE_TESTS = [
  ["rerank", "rerankServiceTest"],
  ["systemone", "systemoneServiceTest"],
];

const LAYER_KEYS = [
  "recallGate",
  "queryMode",
  "gatePrompt",
  "gateModel",
  "rerank",
  "rerankPrompt",
  "rerankModel",
  "rerankChannels",
  "rerankServiceUrl",
  "rerankServiceModel",
  "rerankServiceTimeoutMs",
  "systemoneServiceUrl",
  "systemoneServiceModel",
  "systemoneServiceTimeoutMs",
];

function sameLayers(a, b) {
  return LAYER_KEYS.every((key) =>
    key === "rerankChannels"
      ? rerankChannelsText(a?.[key]) === rerankChannelsText(b?.[key])
      : a?.[key] === b?.[key],
  );
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
        send: (body) => {
          const { rerankChannels, ...rest } = body;
          return jsonPost("/recall-mode", {
            ...rest,
            rerankChannels: rerankChannelsText(rerankChannels),
          });
        },
        apply: applyLayers,
        flash,
        // llm 的提示词、判断模型与精排通道也在同一单里；失败时整组一起回滚。
        normalize: paintRecallConfig,
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

// llm 展开块：显隐即时生效，内容改动同样走 saveLayers 整单提交。
$("recallGate").addEventListener("change", paintGatePanels);
$("gatePrompt").addEventListener("input", () => {
  promptTouched = true;
  paintPromptStatus();
});
$("gatePrompt").addEventListener("change", saveLayers);

// 恢复默认：只把文字填回框里，然后走正常提交，不绕过校验也不偷写配置。
$("gateResetPrompt").addEventListener("click", () => {
  promptTouched = true;
  $("gatePrompt").value = DEFAULT_GATE_PROMPT;
  paintPromptStatus();
  saveLayers();
});

$("gateModel").addEventListener("change", saveLayers);

// 结果重排：第三项下拉即时提交，展开块跟着它显隐。
$("rerank").addEventListener("change", saveLayers);
$("rerank").addEventListener("change", paintRerankPanels);
$("rerankPrompt").addEventListener("input", () => {
  rerankPromptTouched = true;
  paintPromptStatus();
});
$("rerankPrompt").addEventListener("change", saveLayers);
$("rerankResetPrompt").addEventListener("click", () => {
  rerankPromptTouched = true;
  $("rerankPrompt").value = DEFAULT_RERANK_PROMPT;
  paintPromptStatus();
  saveLayers();
});
$("rerankModel").addEventListener("change", saveLayers);

for (const [id] of SERVICE_FIELDS) {
  $(id).addEventListener("change", () => {
    // 改了一格，上一次的测试结果就不是对这一组值的结论了。
    clearServiceResult(kindOfServiceField(id));
    saveLayers();
  });
  $(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $(id).blur();
    }
  });
}

for (const [kind, buttonId] of SERVICE_TESTS) {
  $(buttonId).addEventListener("click", () => runServiceTest(kind));
}

$("rerankAddChannel").addEventListener("click", () => {
  if (rerankChannelsDraft.length >= RERANK_CHANNELS_MAX) return;
  // 新行默认用当前可选的第一类；两个服务都没配时按钮已禁用。
  const firstType = channelTypeOptions(layers)[0]?.value || "model";
  rerankChannelsDraft = [...rerankChannelsDraft, emptyRerankChannel(firstType)];
  renderRerankChannels(rerankChannelsDraft);
  saveLayers();
});
$("rerankTestBtn").addEventListener("click", () => runRerankChannelTest());

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

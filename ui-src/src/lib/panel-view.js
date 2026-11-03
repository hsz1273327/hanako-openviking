// 面板的“显示文本 / 状态词 / 颜色档”纯函数：从手写 ui/assets/panel.js 里原样搬出来，
// 只把「写 DOM」换成「返回字符串」，语义一字不改。
//
// 这么做有两个好处：
//   1. 组件只负责排版，不再各自拼一遍文案（手写版曾在三处拼过副标题）；
//   2. dev/smoke.mjs 能直接 import 验这些字符串，不用起浏览器。
//
// 这里不许碰 DOM、不许碰响应式、不许发请求。

import { RERANK_CHANNEL_LABELS } from "./recall-layers.js";

/* ---------------- 顶部身份条 ---------------- */

// 出口的三种模式：受管代理 / ctx.network 直连 / 两条都不可用。
export const TRANSPORT_TEXT = Object.freeze({
  runtime: "受管代理",
  direct: "直连（仅白名单）",
});

export const TRANSPORT_UNAVAILABLE = "不可用";

export function transportTextOf(transport) {
  return TRANSPORT_TEXT[transport] || TRANSPORT_UNAVAILABLE;
}

/** /health 回的版本本来就带 v；再拼一个就成 vv0.4.16。 */
export function versionTextOf(rawVersion) {
  const raw = String(rawVersion || "").trim();
  if (!raw) return "";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

/** 圆点的档位：只有 ok / down 是确定的，其余（idle / 没读到）都是中性。 */
export function dotClassOf(reach) {
  return reach === "ok" ? "dot ok" : reach === "down" ? "dot down" : "dot idle";
}

export const MASTER_HINT_ON = "已开启。召回与写回按下面的开关执行。";
export const MASTER_HINT_OFF = "关着等于没装。打开之后，下面这些开关才有意义。";

/**
 * /status 的一份投影 → 顶部条与身份卡要显示的一切。
 *
 * readError 非空表示这一轮 /status 本身没读到（网络错 / 服务端抛）：
 * 这时整页照旧显示，但状态必须说「读取失败」，不能继续挂着上一次的「已连接」。
 */
export function statusView(data, latencyMs, readError = "") {
  const source = data && typeof data === "object" ? data : {};
  if (readError) {
    return {
      reach: "down",
      dotClass: "dot down",
      pillText: "读取失败",
      pillTone: "down",
      subLine: "",
      masterHint: MASTER_HINT_OFF,
      masterHintWarn: true,
      latency: "—",
      version: "—",
      transport: TRANSPORT_UNAVAILABLE,
      serverUrl: typeof source.serverUrl === "string" ? source.serverUrl : "",
      apiKeySet: Boolean(source.apiKeySet),
      apiKeyPlaceholder: apiKeyPlaceholder(source.apiKeySet),
      error: "",
      readError: String(readError),
      checks: [],
    };
  }

  const reach = source.reach || "idle";
  const transport = transportTextOf(source.transport);
  const version = versionTextOf(source.health?.version);
  const hasLatency = reach === "ok" && latencyMs != null;

  let pillText = "待命";
  let pillTone = "";
  if (!source.enabled) pillText = "未启用";
  else if (!source.apiKeySet) pillText = "缺 API Key";
  else if (reach === "down") {
    pillText = "连不上";
    pillTone = "down";
  } else if (reach === "ok") {
    pillText = "已连接";
    pillTone = "ok";
  }

  const bits = [transport];
  if (version) bits.push(version);
  if (hasLatency) bits.push(`${latencyMs} ms`);

  const error = source.error || source.readyError || "";

  return {
    reach,
    dotClass: dotClassOf(reach),
    pillText,
    pillTone,
    subLine: bits.join(" · "),
    masterHint: source.enabled ? MASTER_HINT_ON : MASTER_HINT_OFF,
    masterHintWarn: !source.enabled,
    latency: hasLatency ? `${latencyMs} ms` : "—",
    version: version || "—",
    transport,
    serverUrl: typeof source.serverUrl === "string" ? source.serverUrl : "",
    apiKeySet: Boolean(source.apiKeySet),
    apiKeyPlaceholder: apiKeyPlaceholder(source.apiKeySet),
    error,
    readError: "",
    checks: Array.isArray(source.ready?.checks) ? source.ready.checks : [],
  };
}

/** API Key 框的占位：已填的不回显，只说「留空表示不改」。 */
export function apiKeyPlaceholder(apiKeySet) {
  return apiKeySet ? "已填写（留空表示不改）" : "未填写";
}

/* ---------------- 下拉选项 ---------------- */

/**
 * 存量值不在候选里也要留住，否则一打开面板就像配置丢了。
 *
 * 手写面板在 setOptions 里做过同一件事：追加一项「<值>（不在目录里）」并选中它。
 * 这里只生成选项，不碰 DOM。
 */
export function withStoredOption(options, value) {
  const list = Array.isArray(options) ? options : [];
  const wanted = String(value ?? "");
  if (!wanted || list.some((option) => option.value === wanted)) return list;
  return [...list, { value: wanted, label: `${wanted}（不在目录里）` }];
}

/* ---------------- peer 名单 ---------------- */

/** 本机的 peer 永远不参与排除。 */
export function peerExcluded(peer) {
  return Boolean(peer?.excluded) && !peer?.self;
}

/**
 * 一行小字：归属 · 记忆条数 · 是否参与召回。
 *
 * count 为 null 表示这一条没读到，显示「—」而不是骗人的 0；
 * countCapped 表示数到了树节点上限，加个 + 说明真实可能更多。
 * 别改成固定的「500+」：500 是 fs/tree 的节点总数上限，目录与别的文件都占额度，
 * md 条数一定小于 500，写死会造一个数不到的数字。
 */
export function peerMetaText(peer) {
  const items = [peer?.self ? "本机" : "外部"];
  items.push(
    peer?.count == null
      ? "—"
      : peer.countCapped === true
        ? `${peer.count}+ 条`
        : `${peer.count} 条`,
  );
  items.push(peerExcluded(peer) ? "已排除" : "参与召回");
  return items.join(" · ");
}

/** 整行的悬停说明。本机不可点，所以不说「点击」。 */
export function peerTitle(peer) {
  if (peer?.self) return "本机，不参与排除";
  if (peerExcluded(peer)) return "已排除，不参与召回，点击恢复";
  return "点击排除，之后召回不再包含它的记忆";
}

/** 一行能不能点：本机不能，没名字的也不能（提交时按名字整单写）。 */
export function peerTappable(peer) {
  return Boolean(peer?.name) && !peer?.self;
}

export const PEER_EMPTY = "中枢里还没有别的 peer";
export const PEER_UNREADABLE = "读不到 peer 列表";

/* ---------------- 日志 ---------------- */

/** 事件名 → 条数。事件名缺失的记 unknown，与后端 summarizeLog 同口径。 */
export function logCounts(lines) {
  const counts = {};
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== "object") continue;
    const name = line.event || line.kind || "unknown";
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

/** 计数条：一行一个「事件 × 次数」；没有事件时给一句“暂无事件”。 */
export function logChips(lines) {
  const chips = Object.entries(logCounts(lines)).map(([name, count]) => ({
    text: `${name} × ${count}`,
    muted: false,
  }));
  if (chips.length) return chips;
  return [{ text: "暂无事件", muted: true }];
}

export const LOG_EMPTY = "（还没有记录）";

/**
 * 日志正文：倒序（最新在最上面），一行一条 JSON。
 *
 * 行数上限由服务端定（/probe 只回最后 60 条），面板不截断：
 * 漏掉哪一条都不该由前端悄悄决定。
 */
export function logBodyText(lines) {
  const list = (Array.isArray(lines) ? lines : []).filter((line) => line != null);
  if (!list.length) return LOG_EMPTY;
  return list
    .slice()
    .reverse()
    .map((line) => JSON.stringify(line))
    .join("\n");
}

/* ---------------- 精排通道测试结果 ---------------- */

function fixed2(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}

/**
 * POST /recall-mode/test 的结果 → 一段纯文本（pre 里原样显示）。
 * 只做排版：哪一路成功 / 弃权、原始分、标准化分、权重、合并与保留。
 */
export function formatChannelTest(out) {
  const lines = [];
  const channels = Array.isArray(out?.channels) ? out.channels : [];
  lines.push(
    `候选 ${out?.candidates ?? 0} 条 · ${channels.length} 路通道 · ${out?.elapsedMs ?? 0}ms`,
  );
  for (const channel of channels) {
    const label = RERANK_CHANNEL_LABELS[channel?.type] || channel?.type || "通道";
    const name = channel?.name ? `${label} ${channel.name}` : label;
    if (channel?.ok) {
      const raw = (Array.isArray(channel.scores) ? channel.scores : []).map(fixed2).join(", ");
      const scaled = (Array.isArray(channel.normalized) ? channel.normalized : [])
        .map(fixed2)
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
      `合并：[${(Array.isArray(out?.merged) ? out.merged : []).map((score) => Number(score).toFixed(2)).join(", ")}]`,
    );
    const kept = Array.isArray(out?.kept) ? out.kept.map((index) => `#${index + 1}`) : [];
    lines.push(`保留：${kept.join(", ") || "无"}`);
  }
  return lines.join("\n");
}

/* ---------------- 门牌前缀 ---------------- */

export const PREFIX_WARN = (prefix, note = "") =>
  `门牌前缀「${prefix}」不会生效，请改成字母、数字或连字符${note}`;

export const PREFIX_TITLE = (prefix) =>
  `「${prefix}」不能用：门牌前缀只能用字母、数字和连字符`;

/* ---------------- 时间 ---------------- */

/** 页脚：「上次读取 12:00:00」。取不到时间就空着，不编一个。 */
export function readFootText(date) {
  const value = date instanceof Date ? date : null;
  if (!value || Number.isNaN(value.getTime())) return "";
  return `上次读取 ${value.toLocaleTimeString()}`;
}

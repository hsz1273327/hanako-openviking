// 召回前两层（判断 / 查询）以及 llm 判断的提示词、模型来源的界面状态。
//
// /recall-mode 是整单校验：同一次提交里只要有一个值不合法，一个键都不落库。
// 所以这里也只发一单，所有键一起带走，界面就不可能停在「一半生效」上。
// 提交失败必须把界面退回上一次确认过的值，否则会显示成已经改了。

export const RECALL_GATES = Object.freeze(["off", "rules", "llm"]);
export const QUERY_MODES = Object.freeze(["last", "context"]);
export const RERANK_MODES = Object.freeze(["off", "llm"]);
export const RERANK_CHANNEL_TYPES = Object.freeze(["rerank", "systemone", "model"]);
export const RERANK_CHANNELS_MAX = 8;
export const RERANK_CHANNEL_LABELS = Object.freeze({
  rerank: "精排服务",
  systemone: "决策服务",
  model: "宿主模型",
});
// 打分服务的模型名上限，与 src/ov/settings.js 的 SERVICE_MODEL_MAX 同值。
export const SERVICE_MODEL_MAX = 128;
// 打分服务地址上限，与 src/ov/settings.js 的 RERANK_CHANNEL_URL_MAX 同值。
export const SERVICE_URL_MAX = 512;
// 每种通道的默认超时（ms）。与 src/memory/recall.js 的常量同值：
// systemone 一次问完全部候选，候选越多越慢，所以给得比另两种宽。
// 后端在没手配超时时会按候选数自适应（每条 +700，上限 8000），
// 这里显示的是基础值，也就是候选很少时的那个数。
export const RERANK_CHANNEL_TIMEOUT_DEFAULTS = Object.freeze({
  rerank: 800,
  systemone: 3500,
  model: 1500,
});
// systemone 的超时上限，配得再大也只认这个数。
export const SYSTEMONE_TIMEOUT_MAX = 8000;
// 自适应超时的两个参数：基础值与每条候选的增量。
export const SYSTEMONE_TIMEOUT_BASE = 3500;
export const SYSTEMONE_TIMEOUT_STEP = 700;
// systemone 一次只问前这么多条候选。
export const SYSTEMONE_MAX_CANDIDATES = 5;
export const GATE_PROMPT_MAX = 2000;
export const RERANK_PROMPT_MAX = 2000;

function oneOf(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** 与 src/ov/settings.js 的 normalizeServiceUrl 同口径：只认 http / https，去尾斜杠。 */
export function normalizeServiceUrl(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || Array.from(text).length > SERVICE_URL_MAX) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";
  return text.replace(/\/+$/, "");
}

/** 与 src/ov/settings.js 的 normalizeServiceModel 同口径：去空白，按字符截断。 */
export function normalizeServiceModel(value) {
  if (typeof value !== "string") return "";
  return Array.from(value.trim()).slice(0, SERVICE_MODEL_MAX).join("");
}

/** 打分服务四字段的显示值：非法地址在读取侧收敛成空串（= 未配置）。 */
export function paintScoringConfig(out) {
  return {
    rerankServiceUrl: normalizeServiceUrl(out?.rerankServiceUrl),
    rerankServiceModel: normalizeServiceModel(out?.rerankServiceModel),
    systemoneServiceUrl: normalizeServiceUrl(out?.systemoneServiceUrl),
    systemoneServiceModel: normalizeServiceModel(out?.systemoneServiceModel),
  };
}

/**
 * 通道类型下拉的选项：按已配置的打分服务动态生成。
 *
 * 精排服务配了才出现「精排服务」，决策服务配了才出现「决策服务」；
 * 宿主模型不需要端点，所以始终在。两个服务都没配时只剩这一项。
 */
export function channelTypeOptions(config) {
  const options = [];
  if (normalizeServiceUrl(config?.rerankServiceUrl)) {
    options.push({ value: "rerank", label: RERANK_CHANNEL_LABELS.rerank });
  }
  if (normalizeServiceUrl(config?.systemoneServiceUrl)) {
    options.push({ value: "systemone", label: RERANK_CHANNEL_LABELS.systemone });
  }
  options.push({ value: "model", label: RERANK_CHANNEL_LABELS.model });
  return options;
}

/**
 * 这一行通道运行时会不会变成废票：类型是 rerank / systemone，但通道里没写 URL、
 * 对应的打分服务也没配。留着数据不自动删，只在界面上标红。
 */
export function channelServiceMissing(value, config) {
  const channel = normalizeRerankChannel(value);
  if (channel.type === "model") return false;
  if (normalizeServiceUrl(channel.url)) return false;
  if (channel.type === "rerank") return !normalizeServiceUrl(config?.rerankServiceUrl);
  if (channel.type === "systemone") return !normalizeServiceUrl(config?.systemoneServiceUrl);
  return false;
}

/** 与 src/ov/settings.js 的 normalizeGateModel 同口径：空串 = 用宿主辅助模型。 */
export function normalizeGateModel(value) {
  const text = textOf(value);
  if (!text) return "";
  const cut = text.indexOf("/");
  if (cut <= 0 || cut === text.length - 1) return "";
  return text;
}

/** 与 src/ov/settings.js 的 normalizeGatePrompt 同口径：按字符截断。 */
export function normalizeGatePrompt(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, GATE_PROMPT_MAX).join("");
}

/** 与 src/ov/settings.js 的 normalizeRerank 同口径：不认识的、类型不对的一律回 off。 */
export function normalizeRerank(value) {
  return oneOf(value, RERANK_MODES, "off");
}

/** 与 src/ov/settings.js 的 normalizeRerankModel 同口径：空串 = 用宿主辅助模型。 */
export function normalizeRerankModel(value) {
  return normalizeGateModel(value);
}

/** 与 src/ov/settings.js 的 normalizeRerankPrompt 同口径：按字符截断。 */
export function normalizeRerankPrompt(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, RERANK_PROMPT_MAX).join("");
}

/**
 * 默认提示词。与 src/memory/recall.js 里的 DEFAULT_GATE_PROMPT 逐字一致。
 *
 * 浏览器这侧加载不了 App 的 Node 模块，只能各存一份；冒烟会断言两边相等，
 * 改一边忘了另一边会直接发红。
 */
export const DEFAULT_GATE_PROMPT = `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。

用户消息：{{message}}`;

/**
 * 重排的默认提示词。与 src/memory/recall.js 里的 DEFAULT_RERANK_PROMPT 逐字一致。
 * HTML 里不嵌这段字：面板加载不了 Node 模块，只能在这里存一份，
 * 冒烟会断言两边相等，也会断言 HTML 里没有第二份。
 */
export const DEFAULT_RERANK_PROMPT = `用户在问：{{message}}

下面是从记忆库里查到的候选，每条一行，前面是编号：

{{candidates}}

挑出真正能帮助回答这个问题的候选。只回编号，用逗号分隔，例如 1,3。
如果一条都用不上，只回两个字：无。
不要解释。`;

/**
 * textarea 里该显示什么。
 *
 * 配置为空时把默认提示词整段填进去当草稿：placeholder 一敲键盘就消失，
 * 而人很可能就是拿默认这份当底稿直接改。
 * touched 为真（用户动过或已经提交过空值）就不再拿默认去盖他。
 */
export function promptDraft(configValue, touched = false) {
  const value = normalizeGatePrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_GATE_PROMPT;
}

/** 提示词旁边那行小字：默认 / 已修改 / 空（不拦截）。 */
export function promptStatus(text) {
  const value = normalizeGatePrompt(text);
  if (value === DEFAULT_GATE_PROMPT) return "当前为默认提示词";
  if (!value.trim()) return "已修改 · 提示词为空时不会拦截任何召回";
  return "已修改";
}

/** 重排提示词框的草稿：配置为空时同样把默认模板整段填进去。 */
export function rerankPromptDraft(configValue, touched = false) {
  const value = normalizeRerankPrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_RERANK_PROMPT;
}

/** 重排提示词旁边那行小字：默认 / 已修改 / 空（回默认模板）。 */
export function rerankPromptStatus(text) {
  const value = normalizeRerankPrompt(text);
  if (value === DEFAULT_RERANK_PROMPT) return "当前为默认提示词";
  if (!value.trim()) return "已修改 · 提示词为空时使用默认模板";
  return "已修改";
}

// 服务端回的投影 -> 下拉值。宿主回半个形状时回退默认值，别让下拉变空。
// 判定口径与 src/ov/settings.js 的 normalizeRecallGate / normalizeQueryMode 一致。
export function paintLayers(out) {
  return {
    recallGate: oneOf(out?.recallGate, RECALL_GATES, "off"),
    queryMode: oneOf(out?.queryMode, QUERY_MODES, "last"),
  };
}

/** llm 那一块自己的两个字段：提示词，以及一个模型标识（空串 = 默认）。 */
export function paintGateConfig(out) {
  return {
    gatePrompt: normalizeGatePrompt(out?.gatePrompt),
    gateModel: normalizeGateModel(out?.gateModel),
  };
}

/** 重排通道的界面归一化：只收敛形状，不丢用户正在编辑的行。 */
export function normalizeRerankChannel(value) {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = oneOf(item.type, RERANK_CHANNEL_TYPES, "rerank");
  const weight = Number(item.weight);
  const timeout = Number(item.timeoutMs);
  return {
    type,
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url.trim() : "",
    model: typeof item.model === "string" ? item.model.trim() : "",
    weight: Number.isFinite(weight) && weight >= 0.1 && weight <= 10 ? weight : 1,
    enabled: item.enabled !== false,
    // 界面不编辑超时，但存量通道里填了要原样带回去，不能被一次保存洗掉。
    ...(Number.isFinite(timeout) && timeout > 0 && timeout <= 30000
      ? { timeoutMs: Math.floor(timeout) }
      : {}),
  };
}

/**
 * /recall-mode 回的是数组；存量配置可能是 JSON 串。两种都接，形状坏了回空数组。
 * 与 src/ov/settings.js 的 parseRerankChannels 同方向，但这里不丢行、不记日志：
 * 面板只负责把服务端确认过的值画出来。
 */
export function normalizeRerankChannels(value) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  return list.slice(0, RERANK_CHANNELS_MAX).map(normalizeRerankChannel);
}

/** 通道数组 -> POST 用的 JSON 串。 */
export function rerankChannelsText(list) {
  return JSON.stringify(normalizeRerankChannels(list));
}

/**
 * 一行通道是否已经填到“可以提交”的程度。
 *
 * rerank / systemone 的端点由上面的打分服务提供，通道行不再要求 URL 与模型；
 * 存量里带了 URL 的，一旦填了就必须是合法的 http(s)，否则整行不提交。
 * model 通道的模型标识留空算完整（空 = 宿主辅助模型）。
 */
export function isCompleteRerankChannel(value) {
  const channel = normalizeRerankChannel(value);
  if (channel.type === "model") {
    return !channel.model || normalizeGateModel(channel.model) !== "";
  }
  if (!channel.url) return true;
  try {
    const url = new URL(channel.url);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** 「添加通道」推入的空模板。默认给一个 rerank 行。 */
export function emptyRerankChannel(type = "rerank") {
  return normalizeRerankChannel({ type, name: "", url: "", model: "", weight: 1, enabled: true });
}

/** 一行通道的说明：给列表底部计数用。 */
export function rerankChannelsCountText(list) {
  const channels = normalizeRerankChannels(list);
  const enabled = channels.filter((channel) => channel.enabled).length;
  if (!channels.length) return "还没有通道";
  return `${channels.length} 路通道 · ${enabled} 路启用`;
}

/** 重排三个字段：开关、提示词模板、模型标识。 */
export function paintRerankConfig(out) {
  return {
    rerank: normalizeRerank(out?.rerank),
    rerankPrompt: normalizeRerankPrompt(out?.rerankPrompt),
    rerankModel: normalizeRerankModel(out?.rerankModel),
    rerankChannels: normalizeRerankChannels(out?.rerankChannels),
  };
}

/** 模型下拉的首项：空值代表“用宿主辅助模型”，也就是 utility 通道。 */
export const DEFAULT_MODEL_OPTION = Object.freeze({
  value: "",
  label: "默认（宿主辅助模型）",
});

/**
 * 模型目录 -> 下拉选项。一步选到位，没有 provider / 模型两层。
 *
 * 值取 `provider/id`（后端按第一个斜杠切），文案带 provider，避免不同家的同名模型分不清。
 * 目录形状不对的条目直接丢掉，不猜字段。
 */
export function modelOptions(models) {
  const list = Array.isArray(models) ? models : [];
  const out = [];
  const seen = new Set();
  for (const model of list) {
    if (!model || typeof model !== "object") continue;
    const provider = textOf(model.provider);
    const id = textOf(model.id);
    if (!provider || !id) continue;
    const value = `${provider}/${id}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: `${provider} · ${id}` });
  }
  return out;
}

/** 面板用的完整投影：判断 / 查询 + llm 提示词与模型来源 + 重排配置 + 打分服务。 */
export function paintRecallConfig(out) {
  return {
    ...paintLayers(out),
    ...paintGateConfig(out),
    ...paintRerankConfig(out),
    ...paintScoringConfig(out),
  };
}

/**
 * 提交整单并收笔。
 *
 * send(body) 负责一次 POST，返回服务端投影；网络错自己抛，业务拒（ok:false）由这里判。
 * apply(layers) 把界面刷成给定值——成功时是服务端回的投影，失败时是回滚值。
 * normalize 默认只收敛两个基础下拉；面板传 paintRecallConfig 把 llm 的四个字段也带上。
 * 返回值 { ok, layers }：layers 永远是界面此刻显示的值。
 */
export async function commitLayers({
  before,
  next,
  send,
  apply,
  flash,
  normalize = paintLayers,
}) {
  const previous = normalize(before);
  try {
    const target = normalize(next);
    const out = await send({ ...target });
    if (!out || out.ok === false) throw new Error(out?.error || "写入失败");
    const layers = normalize(out);
    apply(layers);
    flash("召回策略已生效", false);
    return { ok: true, layers };
  } catch (error) {
    // 回滚：宁可显示旧值，也不让界面谎报新值已生效。
    apply(previous);
    flash(String(error?.message || error), true);
    return { ok: false, layers: previous };
  }
}

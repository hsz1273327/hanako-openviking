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
  rerank: "Rerank（/v1/rerank）",
  systemone: "SystemOne（/v1/systemone）",
  model: "宿主模型",
});
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
 * 新加的空模板先留在界面上让人填，不写服务端；否则第一次 change 就会被
 * 服务端的整单校验打回，用户刚敲的字也会跟着回滚掉。
 */
export function isCompleteRerankChannel(value) {
  const channel = normalizeRerankChannel(value);
  if (channel.type === "model") {
    return !channel.model || normalizeGateModel(channel.model) !== "";
  }
  if (!channel.url || !channel.model) return false;
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

/** 面板用的完整投影：判断 / 查询 + llm 提示词与模型来源 + 重排配置。 */
export function paintRecallConfig(out) {
  return { ...paintLayers(out), ...paintGateConfig(out), ...paintRerankConfig(out) };
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

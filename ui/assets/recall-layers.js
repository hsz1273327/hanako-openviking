// 召回前两层（判断 / 查询）以及 llm 判断的提示词、模型来源的界面状态。
//
// /recall-mode 是整单校验：同一次提交里只要有一个值不合法，一个键都不落库。
// 所以这里也只发一单，所有键一起带走，界面就不可能停在「一半生效」上。
// 提交失败必须把界面退回上一次确认过的值，否则会显示成已经改了。

export const RECALL_GATES = Object.freeze(["off", "rules", "llm"]);
export const QUERY_MODES = Object.freeze(["last", "context"]);
export const GATE_PROMPT_MAX = 2000;

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

/** 面板用的完整投影：判断 / 查询 + llm 提示词与模型来源。 */
export function paintRecallConfig(out) {
  return { ...paintLayers(out), ...paintGateConfig(out) };
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

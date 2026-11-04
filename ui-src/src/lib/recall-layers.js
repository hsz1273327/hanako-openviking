// 召回前两层（判断 / 查询）以及 llm 判断的提示词、模型来源的界面状态。
//
// /recall-mode 是整单校验：同一次提交里只要有一个值不合法，一个键都不落库。
// 所以这里也只发一单，所有键一起带走，界面就不可能停在「一半生效」上。
// 提交失败必须把界面退回上一次确认过的值，否则会显示成已经改了。

// 四档：off / rules / llm（语言模型判断）/ decision（决策模型判断）。
// 文案与外发值分开：外发值永远是这个枚举，界面说的是 RECALL_GATE_LABELS 里那四个词。
export const RECALL_GATES = Object.freeze(["off", "rules", "llm", "decision"]);

/**
 * 四档的中文说法，与 manifest.json 的 enumLabels 逐字一致。
 *
 * 不用缩写，也不把两档都说成「模型」：语言模型与决策模型是两个东西，
 * 名字里各自带上是哪一个，下拉里才分得清。
 */
export const RECALL_GATE_LABELS = Object.freeze({
  off: "关闭",
  rules: "规则判断",
  llm: "语言模型判断",
  decision: "决策模型判断",
});

/**
 * 召回判断下拉的选项：前三项固定，决策服务配好了才追加第四项。
 *
 * 没配服务时列表里没有这一档——选得到却永远不生效，比看不到更难查。
 * 存着的 decision 遇到服务没配由 paintLayers 归一化回 off，不让下拉显示一个假档位。
 */
export function recallGateOptions(configured) {
  const options = [
    { value: "off", label: RECALL_GATE_LABELS.off },
    { value: "rules", label: RECALL_GATE_LABELS.rules },
    { value: "llm", label: RECALL_GATE_LABELS.llm },
  ];
  if (configured) options.push({ value: "decision", label: RECALL_GATE_LABELS.decision });
  return options;
}

/**
 * 判断失败时的兜底：recall 照常召回（默认）/ rules 退到规则判断。
 *
 * 与 src/ov/settings.js 的 RECALL_GATE_FALLBACKS 同值；只对 llm / decision 两档有意义。
 */
export const RECALL_GATE_FALLBACKS = Object.freeze(["recall", "rules"]);

/** 兜底的两条中文说法，与 manifest.json 的 enumLabels 逐字一致。 */
export const RECALL_GATE_FALLBACK_LABELS = Object.freeze({
  recall: "照常召回（不过滤）",
  rules: "退到规则判断",
});

/** 「判断失败时」下拉的选项（只有两个，不看服务是否配好）。 */
export function gateFallbackOptions() {
  return RECALL_GATE_FALLBACKS.map((value) => ({
    value,
    label: RECALL_GATE_FALLBACK_LABELS[value],
  }));
}

/** 与 src/ov/settings.js 的 normalizeGateFallback 同口径：非法值回 recall。 */
export function normalizeGateFallback(value) {
  return oneOf(value, RECALL_GATE_FALLBACKS, "recall");
}

/**
 * 这一档有没有失败路径：只有 llm / decision 会去问外部服务。
 *
 * off / rules 自己就是判据，没有「失败」这回事，面板上也不该出现这一项。
 */
export function gateHasFailurePath(gate) {
  return gate === "llm" || gate === "decision";
}

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
// 打分服务密钥上限，与 src/ov/settings.js 的 SERVICE_KEY_MAX 同值。
export const SERVICE_KEY_MAX = 512;
// 密钥掩码中间的圆点个数，与 src/ov/mask.js 的 MASK_DOTS 同值。
export const SERVICE_KEY_MASK_DOTS = 8;
// 两类打分服务的超时边界，与 src/ov/settings.js 的 SERVICE_TIMEOUT_LIMITS 同值。
// fallback 就是留空时的默认值，输入框的 placeholder 用它。
export const SERVICE_TIMEOUT_LIMITS = Object.freeze({
  rerank: Object.freeze({ min: 100, max: 10000, fallback: 800 }),
  systemone: Object.freeze({ min: 100, max: 8000, fallback: 3500 }),
});

/**
 * 打分服务的描述表。面板按这张表渲染「一行一个服务」，HTML 里不写死行。
 *
 * 加第三种服务：在表里加一项，再让后端多认一个 kind。
 * hint 只参与拼接列表下方那段总说明，不会单独显示在每一行下面。
 */
export const SCORING_SERVICES = Object.freeze([
  Object.freeze({
    kind: "rerank",
    label: "精排",
    urlKey: "rerankServiceUrl",
    modelKey: "rerankServiceModel",
    timeoutKey: "rerankServiceTimeoutMs",
    keyKey: "rerankServiceKey",
    defaultTimeoutMs: SERVICE_TIMEOUT_LIMITS.rerank.fallback,
    hint: "交叉编码器走 /v1/rerank",
    urlPlaceholder: "http://主机:端口",
    modelPlaceholder: "bge-reranker-v2-m3",
  }),
  Object.freeze({
    kind: "systemone",
    label: "决策",
    urlKey: "systemoneServiceUrl",
    modelKey: "systemoneServiceModel",
    timeoutKey: "systemoneServiceTimeoutMs",
    keyKey: "systemoneServiceKey",
    defaultTimeoutMs: SERVICE_TIMEOUT_LIMITS.systemone.fallback,
    hint: "决策模型走 /v1/systemone",
    urlPlaceholder: "http://主机:端口",
    modelPlaceholder: "kev-4b",
  }),
]);

/** 按 kind 找一项服务描述；不认识的 kind 返回 null（比如宿主的 model 通道）。 */
export function scoringServiceOf(kind) {
  return SCORING_SERVICES.find((service) => service.kind === kind) || null;
}

function scoringRowField(id, key, label, extra = {}) {
  return { id, key, label, ...extra };
}

/** 一项服务描述 -> 一行界面的完整渲染数据（纯函数，冒烟直接验）。 */
export function scoringServiceRow(service) {
  const limits = SERVICE_TIMEOUT_LIMITS[service?.kind] || SERVICE_TIMEOUT_LIMITS.rerank;
  const kind = service?.kind || "";
  return {
    kind,
    label: service?.label || kind,
    hint: service?.hint || "",
    url: scoringRowField(service?.urlKey || `${kind}ServiceUrl`, service?.urlKey, "地址", {
      type: "url",
      spellcheck: false,
      placeholder: service?.urlPlaceholder || "",
    }),
    model: scoringRowField(service?.modelKey || `${kind}ServiceModel`, service?.modelKey, "模型", {
      type: "text",
      spellcheck: false,
      placeholder: service?.modelPlaceholder || "",
    }),
    timeout: scoringRowField(
      service?.timeoutKey || `${kind}ServiceTimeoutMs`,
      service?.timeoutKey,
      "超时",
      {
        type: "number",
        min: limits.min,
        max: limits.max,
        step: 100,
        placeholder: `${service?.defaultTimeoutMs ?? limits.fallback} ms`,
        narrow: true,
      },
    ),
    // 密钥：可选，插在超时之后、测试之前。留空合法（服务端没开鉴权）。
    // password 类型 + show-password-on="click"：默认是圆点，用户自己点开才看得到。
    key: scoringRowField(service?.keyKey || `${kind}ServiceKey`, service?.keyKey, "密钥", {
      type: "password",
      spellcheck: false,
      placeholder: "可选",
      showPasswordOn: "click",
    }),
    testId: `${kind}ServiceTest`,
    resultId: `${kind}ServiceResult`,
  };
}

/** 列表下方唯一那段总说明：服务路径、成对规则、各类型默认超时。 */
export function scoringServicesNote(services = SCORING_SERVICES) {
  const list = Array.isArray(services) ? services : SCORING_SERVICES;
  const routes = list.map((service) => service?.hint).filter(Boolean).join("，");
  const defaults = list
    .map((service) => `${service?.label || service?.kind} ${service?.defaultTimeoutMs}ms`)
    .join("、");
  return `${routes}。地址与模型成对；超时留空用默认（${defaults}）；密钥可选，留空表示该服务没开鉴权。留空的类型不会出现在精排通道里。`;
}

/**
 * 整张打分服务表的渲染计划：标题、若干行、列表下方一段说明。
 * 面板只负责把这份计划落成 DOM，加服务时不用改渲染代码。
 */
export function scoringServiceLayout(services = SCORING_SERVICES) {
  const list = Array.isArray(services) ? services : SCORING_SERVICES;
  return {
    title: "打分服务",
    rows: list.map(scoringServiceRow),
    note: scoringServicesNote(list),
  };
}
// 结果行的三种开头词，与失败原因一起拼成一行字。
export const SERVICE_TEST_TEXT = Object.freeze({
  missing: "先填地址和模型",
  ok: "可用",
  bad: "不可用",
});
// 整对回退的两句说明，与 src/memory/recall.js 的 CHANNEL_PAIR_NOTE_* 逐字一致。
export const CHANNEL_PAIR_NOTE_MODEL = "通道自带的模型名为空，已改用服务配置";
export const CHANNEL_PAIR_NOTE_URL = "通道自带的地址为空，已改用服务配置";
// 失败原因最多显示这么多个字，超出截断。
export const SERVICE_TEST_ERROR_MAX = 120;
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

/**
 * 与 src/ov/settings.js 的 normalizeServiceKey 同口径：去空白、带换行当没填、按字符截断。
 *
 * 面板只拿它做输入侧的收敛：真正落库的值由服务端重算一遍。
 */
export function normalizeServiceKey(value) {
  if (typeof value !== "string") return "";
  if (/[\r\n]/.test(value)) return "";
  return Array.from(value.trim()).slice(0, SERVICE_KEY_MAX).join("");
}

/**
 * GET 回来的掩码（`<keyKey>Masked`）：只认字符串，没配就是空串。
 *
 * 面板把这一串直接填进输入框当 value（与设置页的 API Key 同一套习惯）：
 * 能看出「填过了」，又不可能是明文。聚焦时清空、失焦仍为空就填回来。
 */
export function serviceKeyMask(value) {
  return typeof value === "string" ? value : "";
}

function serviceLimits(kind) {
  return SERVICE_TIMEOUT_LIMITS[kind] || SERVICE_TIMEOUT_LIMITS.rerank;
}

/**
 * 与 src/ov/settings.js 的 normalizeServiceTimeout 同口径：合法值给数字，
 * 空串 / 非数字 / 越界给 null（= 用默认值）。
 */
export function normalizeServiceTimeout(value, kind = "rerank") {
  const limits = serviceLimits(kind);
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const ms = Math.floor(parsed);
  if (ms < limits.min || ms > limits.max) return null;
  return ms;
}

/** 输入框里该显示什么：没配就是空串（placeholder 会写默认值）。 */
export function serviceTimeoutInput(value, kind = "rerank") {
  const ms = normalizeServiceTimeout(value, kind);
  return ms === null ? "" : String(ms);
}

/**
 * 打分服务的显示值：按描述表逐项收敛，非法地址 / 超时在读取侧收敛成空（= 未配置）。
 *
 * 密钥的入参可能是两种形状：服务端回的原始投影（只有 `<keyKey>Masked`，没有明文），
 * 或者已经画过一遍的投影（有 `<keyKey>`、没有 Masked）。必须两种都认：
 * commitLayers 会拿 normalize 过的对象再画一次（applyLayers），只认 Masked
 * 会让掩码在第二次过滤里变成空串，密钥框就“自己清空”了。
 * 两个都读不到就是没配。
 */
export function paintScoringConfig(out) {
  const painted = {};
  for (const service of SCORING_SERVICES) {
    painted[service.urlKey] = normalizeServiceUrl(out?.[service.urlKey]);
    painted[service.modelKey] = normalizeServiceModel(out?.[service.modelKey]);
    painted[service.timeoutKey] = normalizeServiceTimeout(out?.[service.timeoutKey], service.kind);
    painted[service.keyKey] =
      serviceKeyMask(out?.[`${service.keyKey}Masked`]) || serviceKeyMask(out?.[service.keyKey]);
  }
  return painted;
}

/** 「测试」按钮要发的那一单：用的就是界面此刻填的值，不是已保存的配置。 */
export function serviceTestBody(kind, { url, model, timeoutMs, key } = {}) {
  const value = normalizeServiceTimeout(timeoutMs, kind);
  const serviceKey = normalizeServiceKey(key);
  return {
    kind,
    url: normalizeServiceUrl(url),
    model: normalizeServiceModel(model),
    ...(value === null ? {} : { timeoutMs: value }),
    // 密钥留空就不带这个键：服务端当「没填密钥」发一发没有 Authorization 的请求。
    ...(serviceKey ? { key: serviceKey } : {}),
  };
}

/**
 * 地址与模型都填了才有可测的东西。缺任何一个，结果行直接显示「先填地址和模型」。
 */
export function serviceTestReady(value) {
  const input = value && typeof value === "object" ? value : {};
  return Boolean(textOf(input.url) && textOf(input.model));
}

function clipText(value, max) {
  const chars = Array.from(typeof value === "string" ? value : "");
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
}

/**
 * 结果行的一句话与它的状态档：
 *   ok   → 绿字「可用 · 187ms · bge-reranker-v2-m3」
 *   bad  → 红字「不可用 · connect ECONNREFUSED」
 *   muted→ 灰字「先填地址和模型」
 *
 * 模型名以服务端返回的为准，取不到（服务不回 model 字段）就用配置里那个。
 */
export function serviceTestView(result, configuredModel = "") {
  if (!result || typeof result !== "object") {
    return { tone: "muted", text: SERVICE_TEST_TEXT.missing };
  }
  if (result.ok === true) {
    const model = normalizeServiceModel(result.model) || normalizeServiceModel(configuredModel);
    const parts = [SERVICE_TEST_TEXT.ok, `${Math.max(0, Math.floor(Number(result.elapsedMs) || 0))}ms`];
    if (model) parts.push(model);
    return { tone: "ok", text: parts.join(" · ") };
  }
  const reason = clipText(String(result.error || "失败"), SERVICE_TEST_ERROR_MAX) || "失败";
  return { tone: "bad", text: `${SERVICE_TEST_TEXT.bad} · ${reason}` };
}

/**
 * 一行通道的整对说明：自己的地址与模型只填了一半时，运行时那一对会整个改用服务配置。
 * 地址、模型都有自己的（或都没有）就没有这行字。
 */
export function channelPairNote(value, config) {
  const channel = normalizeRerankChannel(value);
  const service = scoringServiceOf(channel.type);
  if (!service) return "";
  const hasUrl = Boolean(channel.url);
  const hasModel = Boolean(channel.model);
  if (hasUrl === hasModel) return "";
  // 服务也没配时，这行通道根本不会生效，说明由「服务未配置」那一句接管。
  const serviceUrl = normalizeServiceUrl(config?.[service.urlKey]);
  if (!serviceUrl) return "";
  return hasUrl ? CHANNEL_PAIR_NOTE_MODEL : CHANNEL_PAIR_NOTE_URL;
}

/**
 * 通道类型下拉的选项：按已配置的打分服务动态生成。
 *
 * 精排服务配了才出现「精排服务」，决策服务配了才出现「决策服务」；
 * 宿主模型不需要端点，所以始终在。两个服务都没配时只剩这一项。
 */
export function channelTypeOptions(config) {
  const options = [];
  for (const service of SCORING_SERVICES) {
    if (!normalizeServiceUrl(config?.[service.urlKey])) continue;
    options.push({
      value: service.kind,
      label: RERANK_CHANNEL_LABELS[service.kind] || service.label,
    });
  }
  options.push({ value: "model", label: RERANK_CHANNEL_LABELS.model });
  return options;
}

/**
 * 这一行通道运行时会不会变成废票：类型是 rerank / systemone，但自己的地址与模型
 * 没成对、对应的打分服务也没配。留着数据不自动删，只在界面上标红。
 */
export function channelServiceMissing(value, config) {
  const channel = normalizeRerankChannel(value);
  const service = scoringServiceOf(channel.type);
  if (!service) return false;
  // 自己的地址与模型都有 = 这一行自己成对，不依赖服务配置。
  if (channel.url && channel.model) return false;
  return !normalizeServiceUrl(config?.[service.urlKey]);
}

/**
 * 决策服务配好了吗：地址与模型都在才算（与 src/ov/settings.js 的
 * decisionServiceConfigured 同一条判据）。判断模型下拉与第四档都看它。
 */
export function decisionServiceConfigured(config) {
  return Boolean(
    normalizeServiceUrl(config?.systemoneServiceUrl) &&
      normalizeServiceModel(config?.systemoneServiceModel),
  );
}

/**
 * 「决策模型判断」这一档的状态行。
 *
 * 与 src/memory/recall.js 的 decisionGateServiceOf 同口径：地址与模型都在才算配好，
 * 只填一半按未配置算。未配置不是「什么都不显示」——没配时第四档根本不会出现在下拉里，
 * 这一行只在存量页面 / 刚清空的那一刻说清「现在不会判断，每轮都召回」。
 */
export function decisionServiceView(config) {
  const url = normalizeServiceUrl(config?.systemoneServiceUrl);
  const model = normalizeServiceModel(config?.systemoneServiceModel);
  if (!url || !model) {
    return {
      configured: false,
      text: "决策服务还没配置，先在全局配置里填决策服务（未配置时每轮都召回）",
    };
  }
  return { configured: true, text: `决策服务：${url} · ${model}` };
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

/** 决策模型的判据与 gatePrompt 同口径：同一份长度上限，空串 = 没有判据（照常召回）。 */
export function normalizeGateDecisionPrompt(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, GATE_PROMPT_MAX).join("");
}

// 召回门槛的默认值 / 边界 / 步长，与 src/ov/settings.js 的 GATE_DECISION_THRESHOLD_* 同值。
// 步长只影响数字框的加减手感，不是归一化要圆整到的格点。
export const GATE_DECISION_THRESHOLD_DEFAULT = 0.45;
export const GATE_DECISION_THRESHOLD_MIN = 0;
export const GATE_DECISION_THRESHOLD_MAX = 1;
export const GATE_DECISION_THRESHOLD_STEP = 0.05;

/**
 * 与 src/ov/settings.js 的 normalizeGateDecisionThreshold 同口径：
 * 0–1 之间（含两端）给数字，空串 / 非数字 / 越界一律回 0.45。
 * 越界值不夹到边界：夹成 0 或 1 会把「填错了」变成「永远查 / 永远不查」。
 */
export function normalizeGateDecisionThreshold(value) {
  let parsed;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim()) parsed = Number(value.trim());
  else return GATE_DECISION_THRESHOLD_DEFAULT;
  if (!Number.isFinite(parsed)) return GATE_DECISION_THRESHOLD_DEFAULT;
  if (parsed < GATE_DECISION_THRESHOLD_MIN || parsed > GATE_DECISION_THRESHOLD_MAX) {
    return GATE_DECISION_THRESHOLD_DEFAULT;
  }
  return parsed;
}

/**
 * 数字框旁边那句小字。方向必须写出来：「调高」听起来像「查得更狠」，实际是更少查。
 */
export const GATE_DECISION_THRESHOLD_HINT = "0.45 为默认；调高更少查，调低更多查";

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
 * 决策模型判断的默认题面。与 src/ov/settings.js 的 DEFAULT_GATE_DECISION_PROMPT 逐字一致。
 *
 * 它只是「配过没配过」时的默认值：空值仍然是空（没有判据，照常召回），
 * 面板只在用户还没动过这一格时拿它当草稿。判定标准是内置的两条 criteria，
 * 不在这份可编辑文本里。
 */
export const DEFAULT_GATE_DECISION_PROMPT =
  "把这句话单独发给一个没看过聊天记录的人，他能不能立刻知道在说什么？";

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

/** 决策提示词框的草稿：配置为空时同样把默认题面填进去当底稿。 */
export function decisionPromptDraft(configValue, touched = false) {
  const value = normalizeGateDecisionPrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_GATE_DECISION_PROMPT;
}

/** 决策提示词旁边那行小字：默认 / 已修改 / 空（不拦截，照常召回）。 */
export function decisionPromptStatus(text) {
  const value = normalizeGateDecisionPrompt(text);
  if (value === DEFAULT_GATE_DECISION_PROMPT) return "当前为默认提示词";
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
// 判定口径与 src/ov/settings.js 的 normalizeRecallGate / resolveRecallGate 一致：
// decision 但决策服务没配 → off，别处漏过来的脏值也在这一层收掉。
export function paintLayers(out) {
  const gate = oneOf(out?.recallGate, RECALL_GATES, "off");
  return {
    recallGate: gate === "decision" && !decisionServiceConfigured(out) ? "off" : gate,
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

/** decision 那一块自己的字段：一份与 gatePrompt 完全分开的判据，加一个自己的召回门槛。 */
export function paintDecisionConfig(out) {
  return {
    gateDecisionPrompt: normalizeGateDecisionPrompt(out?.gateDecisionPrompt),
    gateDecisionThreshold: normalizeGateDecisionThreshold(out?.gateDecisionThreshold),
  };
}

/** 兜底那一格：服务端投影的脏值 / 缺项一律画成 recall。 */
export function paintGateFallbackConfig(out) {
  return { gateFallback: normalizeGateFallback(out?.gateFallback) };
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

/** 面板用的完整投影：判断 / 查询 + 两份判据 Prompt（llm / decision）+ 重排配置 + 打分服务。 */
export function paintRecallConfig(out) {
  return {
    ...paintLayers(out),
    ...paintGateConfig(out),
    ...paintDecisionConfig(out),
    ...paintGateFallbackConfig(out),
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

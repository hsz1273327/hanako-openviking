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

/**
 * 组装的两档：off 原样拼（与加这一层之前一致）/ rules 去重 + 按分精排。
 * 与 src/ov/settings.js 的 ASSEMBLE_MODES 同值；模型档没做，所以没有第三个值。
 */
export const ASSEMBLE_MODES = Object.freeze(["off", "rules"]);

/** 与 src/ov/settings.js 的 normalizeAssembleMode 同口径：认不出的值回 rules（默认开着）。 */
export function normalizeAssembleMode(value) {
  return oneOf(value, ASSEMBLE_MODES, "rules");
}

export const RERANK_CHANNEL_TYPES = Object.freeze(["rerank", "systemone", "model"]);
export const RERANK_CHANNELS_MAX = 8;

/**
 * 精排页那三条固定的路的顺序：判别模型 → rerank 模型 → 语言模型。
 *
 * 与 RERANK_CHANNEL_TYPES（配置里的枚举）故意分成两份：那边是存量数据的写法，
 * 这边是给人看的顺序。语言模型永远在最后：它是主路都不通时接手的那一道兜底，
 * 不是主力，所以不放在顶上。前两条是主路，并行跑、按权重合并。
 */
export const RERANK_LANE_ORDER = Object.freeze(["systemone", "rerank", "model"]);

/** 语言模型那一路的角色：排在最后，且不可关（它是兜底）。 */
export const RERANK_FALLBACK_LANE = "model";

/** 语言模型名字旁边那个小标签。 */
export const RERANK_FALLBACK_TAG = "兜底";

/**
 * 语言模型那个开关旁边的小字。
 *
 * 那个开关管的是「要不要额外参与主路打分」，不是「要不要兜底」：两者都行，兜底都在。
 */
export const RERANK_LANE_PARTICIPATE_NOTE =
  "开启则每次也参与打分；关闭则只在其他路不通时接手。";

export const RERANK_LANE_LABELS = Object.freeze({
  systemone: "判别模型",
  rerank: "rerank 模型",
  model: "语言模型",
});

/** 每种路的默认超时显示（超时框的 placeholder）。systemone 没配时是自适应的。 */
export const RERANK_LANE_TIMEOUT_PLACEHOLDERS = Object.freeze({
  systemone: "自适应",
  rerank: "800",
  model: "1500",
});

/**
 * rerank 模型那一条规则区里的那一句：它没有提示词可配。
 *
 * 语言模型与判别模型的规则区是输入框，自己就把事说清了；只有这一条需要一句解释，
 * 否则「只看到权重和超时」会让人以为少了一个输入框。
 */
export const RERANK_LANE_NO_PROMPT_NOTE =
  "交叉编码器直接对问题和候选成对打分，没有提示词可配。";
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
  rerank: Object.freeze({ min: 100, max: 10000, fallback: 2500 }),
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
 * 一条路对应哪一组打分服务（语言模型没有服务，返回 null）。
 *
 * 服务配了哪一类，精排页就多出哪一条路；两者都不配时只剩语言模型那一条。
 */
export function rerankLaneService(type) {
  return type === "model" ? null : scoringServiceOf(type);
}

/** 这一条路对应的打分服务配好了吗（语言模型不需要服务，永远算配好）。 */
export function rerankLaneConfigured(type, config) {
  const service = rerankLaneService(type);
  if (!service) return true;
  return Boolean(normalizeServiceUrl(config?.[service.urlKey]));
}

/**
 * 精排页要画的那几条路（纯函数，冒烟直接验）。
 *
 * 规则只有四条：
 *   1. 顺序固定：判别模型 → rerank 模型 → 语言模型（RERANK_LANE_ORDER）；
 *   2. 语言模型恒有（不需要服务），它的开关只是「要不要额外参与主路打分」，任何时候都能拨；
 *   3. 判别模型 / rerank 模型：配了对应的打分服务才出现；已经有通道的也留下
 *      （服务被清空时行还在，只标记不会生效，不自动删用户的数据）；
 *   4. 启用状态看那条通道；还没有通道就是没启用（开启会在 store 里建出这一条）。
 *
 * 返回的是展示模型，不是配置：组件只读它，不反过来写回配置。
 */
export function rerankLanes(config) {
  const channels = normalizeRerankChannels(config?.rerankChannels);
  const byType = new Map();
  for (const channel of channels) {
    if (!byType.has(channel.type)) byType.set(channel.type, channel);
  }

  const lanes = [];
  for (const type of RERANK_LANE_ORDER) {
    const channel = byType.get(type) || null;
    const configured = rerankLaneConfigured(type, config);
    const isFallback = type === RERANK_FALLBACK_LANE;
    if (!isFallback && !channel && !configured) continue;
    lanes.push({
      type,
      label: RERANK_LANE_LABELS[type],
      channel,
      // 这一格只管「要不要额外参与主路打分」，缺省是不参与（主路能跑通时不必多打一次 LLM）。
      // 语言模型没通道时也是不参与；它是兜底这件事不靠这个开关。
      enabled: Boolean(channel && channel.enabled),
      fallback: isFallback,
      hasChannel: Boolean(channel),
      // 有通道、但那一类服务已经不在了（且它自己也没成对配上地址 + 模型）：
      // 运行时这一路会直接弃权，界面要说出来。判据与 channelServiceMissing 同一份。
      unavailable: channel ? channelServiceMissing(channel, config) : false,
      weight: channel ? channel.weight : 1,
      timeoutMs: channel && channel.timeoutMs !== undefined ? channel.timeoutMs : null,
      timeoutPlaceholder: RERANK_LANE_TIMEOUT_PLACEHOLDERS[type] || "",
      timeoutCeiling: type === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000,
    });
  }
  return lanes;
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

/** 带前文模式那份题面：与 gateDecisionPrompt 同口径。 */
export function normalizeGateContextPrompt(value) {
  if (typeof value !== "string" || !value) return "";
  return Array.from(value).slice(0, GATE_PROMPT_MAX).join("");
}

// 判断前文：与 src/ov/settings.js 的 GATE_CONTEXT_MODES 同值。
// 默认是 turns：只看当前消息时，模型只能判「这句话自不自足」，判不出
// 「前文里找不找得到」，结果是前文明明有的也去查一次库。
export const GATE_CONTEXT_MODES = Object.freeze(["none", "turns"]);
export const GATE_CONTEXT_DEFAULT = "turns";
export const GATE_CONTEXT_LABELS = Object.freeze({
  none: "不看前文",
  turns: "带最近几轮对话",
});

/** 与 src/ov/settings.js 的 normalizeGateContext 同口径：非法值回默认。 */
export function normalizeGateContext(value) {
  return oneOf(value, GATE_CONTEXT_MODES, GATE_CONTEXT_DEFAULT);
}

/** 「判断前文」下拉的选项：两项，文案与 manifest 的 enumLabels 逐字一致。 */
export function gateContextOptions() {
  return GATE_CONTEXT_MODES.map((value) => ({ value, label: GATE_CONTEXT_LABELS[value] }));
}

/**
 * 同一个 textarea 此刻绑哪一份题面：llm 一份；decision 下按 gateContext 分两份。
 * 组件按它切键，切回来时各份草稿都还在（panel-store 的 prompts 分开存）。
 */
export function recallPromptKey(recallGate, gateContext) {
  if (recallGate === "llm") return "gate";
  if (recallGate === "decision" && normalizeGateContext(gateContext) === "turns") return "context";
  return "decision";
}

/** 题面 key -> 配置键（也是输入框 id / state.focus 的值）。 */
export function recallPromptField(recallGate, gateContext) {
  const key = recallPromptKey(recallGate, gateContext);
  if (key === "gate") return "gatePrompt";
  if (key === "context") return "gateContextPrompt";
  return "gateDecisionPrompt";
}

/** 精排保留条数：默认 / 边界 / 步长与 src/ov/settings.js 的 RERANK_KEEP_* 同值（0 = 不限）。 */
export const RERANK_KEEP_DEFAULT = 5;
export const RERANK_KEEP_MIN = 1;
export const RERANK_KEEP_MAX = 20;
export const RERANK_KEEP_STEP = 1;

/**
 * 与 src/ov/settings.js 的 normalizeRerankKeep 同口径：1–20 的整数给数字，0 = 不限。
 *
 * 缺省（undefined，服务端回包里没这一项）回默认 5；
 * 其余非法的（空串 / 0 / null / 小数 / 负数 / 越界）一律回 0 = 不限。
 * 两种「不生效」分开：没配过是没意见，填错了是填错了。
 */
export function normalizeRerankKeep(value) {
  if (value === undefined) return RERANK_KEEP_DEFAULT;
  let parsed;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim()) parsed = Number(value.trim());
  else return 0;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return 0;
  if (parsed < RERANK_KEEP_MIN || parsed > RERANK_KEEP_MAX) return 0;
  return parsed;
}

/** 带前文的轮数：默认 / 边界 / 步长与 src/ov/settings.js 同值。 */
export const GATE_CONTEXT_TURNS_DEFAULT = 4;
export const GATE_CONTEXT_TURNS_MIN = 1;
export const GATE_CONTEXT_TURNS_MAX = 12;
export const GATE_CONTEXT_TURNS_STEP = 1;

/**
 * 与 src/ov/settings.js 的 normalizeGateContextTurns 同口径：
 * 1–12 的整数，其余（空串 / 非数字 / 小数 / 越界 / null）一律回 4。
 * 不夹边界：填错了就老实回默认，别静默变成「永远带 1 轮 / 12 轮」。
 */
export function normalizeGateContextTurns(value) {
  let parsed;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim()) parsed = Number(value.trim());
  else return GATE_CONTEXT_TURNS_DEFAULT;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return GATE_CONTEXT_TURNS_DEFAULT;
  if (parsed < GATE_CONTEXT_TURNS_MIN || parsed > GATE_CONTEXT_TURNS_MAX) {
    return GATE_CONTEXT_TURNS_DEFAULT;
  }
  return parsed;
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

/** 判别模型的题面与精排提示词同一口径（同一个上限，空串 = 用默认题面）。 */
export const normalizeRerankSystemonePrompt = normalizeRerankPrompt;

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
  "只看这一句话、不看之前的对话，够不够回答它？";

/**
 * 带前文模式专用题面。与 src/ov/settings.js 的 DEFAULT_GATE_CONTEXT_PROMPT
 * 逐字一致（浏览器侧读不到 App 的 Node 模块，只能各存一份，冒烟会比对）。
 */
export const DEFAULT_GATE_CONTEXT_PROMPT =
  "这句话要的信息，上面的对话里有吗？还是要翻更早的记录？";

/**
 * 精排的默认提示词。与 src/memory/recall.js 里的 DEFAULT_RERANK_PROMPT 逐字一致。
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
 * 判别模型的默认题面。与 src/memory/recall.js 里的 DEFAULT_RERANK_SYSTEMONE_PROMPT
 * 逐字一致（冒烟比对两边）。{{n}} 是候选在本批里的序号，从 1 开始。
 */
export const DEFAULT_RERANK_SYSTEMONE_PROMPT = "第 {{n}} 条候选能帮助回答用户的问题吗";

/** 判别模型题面里的序号占位符，与 src/memory/recall.js 的 SYSTEMONE_N_PLACEHOLDER 同值。 */
export const SYSTEMONE_N_PLACEHOLDER = "{{n}}";

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

/** 带前文模式题面的草稿：空配置时坐默认题面，动过之后不再拿默认去盖。 */
export function contextPromptDraft(configValue, touched = false) {
  const value = normalizeGateContextPrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_GATE_CONTEXT_PROMPT;
}

/** 带前文模式题面的三态小字。 */
export function contextPromptStatus(text) {
  const value = normalizeGateContextPrompt(text);
  if (value === DEFAULT_GATE_CONTEXT_PROMPT) return "当前为默认提示词";
  if (!value.trim()) return "已修改 · 提示词为空时不会拦截任何召回";
  return "已修改";
}

/** 精排提示词框的草稿：配置为空时同样把默认模板整段填进去。 */
export function rerankPromptDraft(configValue, touched = false) {
  const value = normalizeRerankPrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_RERANK_PROMPT;
}

/** 精排提示词旁边那行小字：默认 / 已修改 / 空（回默认模板）。 */
export function rerankPromptStatus(text) {
  const value = normalizeRerankPrompt(text);
  if (value === DEFAULT_RERANK_PROMPT) return "当前为默认提示词";
  if (!value.trim()) return "已修改 · 提示词为空时使用默认模板";
  return "已修改";
}

/** 判别模型题面的草稿：空配置时同样把默认题面填进去当底稿。 */
export function systemonePromptDraft(configValue, touched = false) {
  const value = normalizeRerankSystemonePrompt(configValue);
  if (value) return value;
  return touched ? "" : DEFAULT_RERANK_SYSTEMONE_PROMPT;
}

/** 判别模型题面的三态小字：默认 / 已修改 / 空（回默认题面）。 */
export function systemonePromptStatus(text) {
  const value = normalizeRerankSystemonePrompt(text);
  if (value === DEFAULT_RERANK_SYSTEMONE_PROMPT) return "当前为默认题面";
  if (!value.trim()) return "已修改 · 题面为空时使用默认题面";
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

/**
 * decision 那一块自己的字段：两份分开存的题面（不看前文 / 带前文）、
 * 判断前文的开关与轮数，加一个自己的召回门槛。
 */
export function paintDecisionConfig(out) {
  return {
    gateDecisionPrompt: normalizeGateDecisionPrompt(out?.gateDecisionPrompt),
    gateContext: normalizeGateContext(out?.gateContext),
    gateContextTurns: normalizeGateContextTurns(out?.gateContextTurns),
    gateContextPrompt: normalizeGateContextPrompt(out?.gateContextPrompt),
    gateDecisionThreshold: normalizeGateDecisionThreshold(out?.gateDecisionThreshold),
  };
}

/** 兜底那一格：服务端投影的脏值 / 缺项一律画成 recall。 */
export function paintGateFallbackConfig(out) {
  return { gateFallback: normalizeGateFallback(out?.gateFallback) };
}

/** 精排通道的界面归一化：只收敛形状，不丢用户正在编辑的行。 */
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
    // 这一格只管「要不要额外参与主路打分」，缺省不参与；语言模型也一样（兜底不靠它）。
    enabled: item.enabled !== false,
    // 超时那一格用户可以留空（= 用该类型默认值），存量里填了要原样带回去。
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

/** 「添加通道」推入的空模板（只在 store 里给某一条路建配置时用，界面上没有这个按钮）。 */
export function emptyRerankChannel(type = "rerank") {
  return normalizeRerankChannel({ type, name: "", url: "", model: "", weight: 1, enabled: true });
}

/** 三条路下面那行计数：「N 路通道 · M 路启用」。 */
export function rerankLanesCountText(lanes) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return "还没有可用的路";
  const enabled = list.filter((lane) => lane && lane.enabled).length;
  return `${list.length} 路通道 · ${enabled} 路启用`;
}

/** 精排那几个字段：开关、保留条数、两份提示词、通道表。 */
export function paintRerankConfig(out) {
  return {
    rerank: normalizeRerank(out?.rerank),
    // 保留条数：脏值 / 缺项一律画（缺项画默认 5，填错的画 0 = 不限，与运行时同口径）。
    rerankKeep: normalizeRerankKeep(out?.rerankKeep),
    rerankPrompt: normalizeRerankPrompt(out?.rerankPrompt),
    // 判别模型那份题面与语言模型那份分开画，谁也不会把对方盖掉。
    rerankSystemonePrompt: normalizeRerankSystemonePrompt(out?.rerankSystemonePrompt),
    // 存量兜底模型：界面不再用它，留着只为了让服务端投影与本地投影同形。
    rerankModel: normalizeRerankModel(out?.rerankModel),
    rerankChannels: normalizeRerankChannels(out?.rerankChannels),
  };
}

/** 组装自己的字段（一个开关）。脏值 / 缺项一律画成 rules。 */
export function paintAssembleConfig(out) {
  return { assembleMode: normalizeAssembleMode(out?.assembleMode) };
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

/** 面板用的完整投影：判断 / 查询 + 两份判据 Prompt（llm / decision）+ 精排 + 组装 + 打分服务。 */
export function paintRecallConfig(out) {
  return {
    ...paintLayers(out),
    ...paintGateConfig(out),
    ...paintDecisionConfig(out),
    ...paintGateFallbackConfig(out),
    ...paintRerankConfig(out),
    ...paintAssembleConfig(out),
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

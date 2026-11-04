// 配置读取层。
//
// 铁律：所有开关在"使用的那一刻"从 sdk.config 现读，不在加载时缓存。
// 因此设置页里点一下关，下一轮立刻生效，不用重载 App。

/**
 * 决策模型判断的默认题面（不是提示词模板）。
 *
 * 与 gatePrompt 的默认值不一样：那一条默认是空串（空 = 不拦截），这一条默认给一句完整问法，
 * 因为决策模型的题型固定是 choice + criteria（两条内置描述写在 src/memory/recall.js 的
 * DECISION_GATE_CRITERIA 里），用户能改的只是「题面」怎么问，不是判定标准。
 * 空值仍然是「没有判据，照常召回」——这里给的是「没配过时读到什么」，不是「空值时偷偷套什么」。
 *
 * 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 里存了逐字相同的一份，
 * 冒烟会比对两边。
 */
export const DEFAULT_GATE_DECISION_PROMPT =
  "把这句话单独发给一个没看过聊天记录的人，他能不能立刻知道在说什么？";

/**
 * 决策模型判断的召回门槛：choice 是 need 且 confidence 不低于这个数才算「需要召回」。
 *
 * 0.45 是从 16 条样例上拟合出来的，不是某个客观常数：换一个决策模型、换一批对话风格，
 * 最优阈值就会变。而且两个方向的错代价不同——漏召回用户立刻觉得「你怎么不记得」，
 * 误召回只是多查一次，所以这个取舍交给用户，代码不再替他定。
 */
export const GATE_DECISION_THRESHOLD_DEFAULT = 0.45;

/** 门槛的边界与输入步长。步长只影响面板上的加减手感，不是归一化要圆整到的格点。 */
export const GATE_DECISION_THRESHOLD_MIN = 0;
export const GATE_DECISION_THRESHOLD_MAX = 1;
export const GATE_DECISION_THRESHOLD_STEP = 0.05;

export const DEFAULTS = {
  enabled: false,
  serverUrl: "http://127.0.0.1:8000",
  apiKey: "",
  peerPrefix: "",
  mergeMemory: false,
  autoRecall: true,
  autoCapture: true,
  readOnly: false,
  recallPeerScope: "all",
  requestTimeoutMs: 1500,
  injectBudgetTokens: 2500,
  skillRouting: true,
  probe: false,
  excludedPeers: "",
  recallGate: "off",
  gateFallback: "recall",
  queryMode: "last",
  gatePrompt: "",
  gateDecisionPrompt: DEFAULT_GATE_DECISION_PROMPT,
  gateDecisionThreshold: GATE_DECISION_THRESHOLD_DEFAULT,
  gateModel: "",
  rerank: "off",
  rerankPrompt: "",
  rerankModel: "",
  rerankChannels: "",
  rerankServiceUrl: "",
  rerankServiceModel: "",
  rerankServiceTimeoutMs: "",
  rerankServiceKey: "",
  systemoneServiceUrl: "",
  systemoneServiceModel: "",
  systemoneServiceTimeoutMs: "",
  systemoneServiceKey: "",
};

/**
 * 召回判断（四档，界面文案见 ui-src/src/lib/recall-layers.js 的 RECALL_GATE_LABELS）：
 *   off      关闭，每轮都召回
 *   rules    规则判断，只跳过极短的纯操作指令
 *   llm      语言模型判断：让宿主的生成式模型回答「要不要查」
 *   decision 决策模型判断：让决策模型（/v1/systemone）在 need / standalone 之间选一个
 *
 * 后两者不是同一条路数：一个生成文本，一个只出概率。混用一个枚举名会把区别抹掉。
 * 第四档要有决策服务才有意义，所以归一化时按服务是否配好回退，见 resolveRecallGate。
 */
export const RECALL_GATES = Object.freeze(["off", "rules", "llm", "decision"]);

/**
 * 判断失败时的兜底（只对 llm / decision 两档有意义）：
 *   recall 照常召回（默认，保守；判断失败不能变成漏召回）
 *   rules  退到规则判断跑一遍，规则说跳过才跳过
 *
 * off / rules 自己就是判据，不依赖外部服务，没有失败路径，这一项对它们不生效。
 * 判据本身没有变（≤8 字、无问号、无疑问词、无指代词），变的只是「什么时候用它」。
 */
export const RECALL_GATE_FALLBACKS = Object.freeze(["recall", "rules"]);

/** 召回查询：last 只用最后一句，context 拼最近几条用户文本。 */
export const QUERY_MODES = Object.freeze(["last", "context"]);

/** 结果重排：off 原样注入，llm 按 rerankChannels 跑配置好的通道。 */
export const RERANK_MODES = Object.freeze(["off", "llm"]);

/** 精排通道类型：OpenAI 兼容 rerank、llama.cpp systemone、宿主模型。 */
export const RERANK_CHANNEL_TYPES = Object.freeze(["rerank", "systemone", "model"]);

/** 一次最多跑几路。超出的部分不解析，避免一张配置把一轮召回拖成十几跳。 */
export const RERANK_CHANNELS_MAX = 8;

/** 权重边界。合并时按 Σ(score×weight) / Σ(weight) 算，只统计成功的通道。 */
export const RERANK_WEIGHT_MIN = 0.1;
export const RERANK_WEIGHT_MAX = 10;

/** 通道字段的存留上限。名称只是显示用，URL / 模型标识按与其它配置同口径收敛。 */
export const RERANK_CHANNEL_NAME_MAX = 64;
export const RERANK_CHANNEL_URL_MAX = 512;

/** 打分服务的模型名上限。服务名与通道模型名同一口径。 */
export const SERVICE_MODEL_MAX = 128;

/**
 * 打分服务密钥的长度上限。留空合法（服务端没开鉴权）。
 *
 * 上限只防「把一整段配置粘进来」：Authorization 头的实际长度各家服务都远低于这个数，
 * 512 足够放下任何真实 key，又不至于让一单配置把日志 / 请求头撑爆。
 */
export const SERVICE_KEY_MAX = 512;

/**
 * 打分服务超时的边界。单位是毫秒，给的是「一次打分请求」的上限，不是整轮召回。
 *
 * fallback 是留空时的默认值：精排一份候选一次往返，800 够；决策服务一次问完全部
 * 候选、每问一次都是前向，所以给到 3500。越界的值不夹到边界上，而是回默认值——
 * 用户把 99999 填进来通常是想「别超时」，悄悄夹成 10000 会让原因更难查。
 */
export const SERVICE_TIMEOUT_LIMITS = Object.freeze({
  rerank: Object.freeze({ min: 100, max: 10000, fallback: 800 }),
  // 运行时 systemoneTimeoutFor 的硬上限也是 8000：配置允许更大的值只会被压回去，
  // 所以写入侧直接对齐，不让两个数字打架。
  systemone: Object.freeze({ min: 100, max: 8000, fallback: 3500 }),
});

/** 两类打分服务的名字。路由与界面按它取边界，认不出来的一律按精排那组。 */
export const SERVICE_KINDS = Object.freeze(["rerank", "systemone"]);

function serviceLimits(kind) {
  return SERVICE_TIMEOUT_LIMITS[kind] || SERVICE_TIMEOUT_LIMITS.rerank;
}

/** 自定义提示词上限。超过这个长度的存量值在读取侧截断，POST 侧整单拒绝。 */
export const GATE_PROMPT_MAX = 2000;

/** 重排提示词上限，与判断提示词同一口径。 */
export const RERANK_PROMPT_MAX = 2000;

/** 枚举值收敛：不认识的、缺省的、类型不对的一律回默认值。 */
function oneOf(raw, allowed, fallback) {
  return typeof raw === "string" && allowed.includes(raw) ? raw : fallback;
}

export function normalizeRecallGate(raw) {
  return oneOf(raw, RECALL_GATES, DEFAULTS.recallGate);
}

/** 非法值（含缺省、类型不对）一律归一化回 recall：宁可多召回，也不静默少召回。 */
export function normalizeGateFallback(raw) {
  return oneOf(raw, RECALL_GATE_FALLBACKS, DEFAULTS.gateFallback);
}

export function normalizeQueryMode(raw) {
  return oneOf(raw, QUERY_MODES, DEFAULTS.queryMode);
}

export function normalizeRerank(raw) {
  return oneOf(raw, RERANK_MODES, DEFAULTS.rerank);
}

/** 提示词按字符截断，不把代理对切成两半。空串表示“没有提示词，不拦截”。 */
export function normalizeGatePrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
}

/** 决策模型的判据与 gatePrompt 同口径：同一份长度上限，空串 = 没有判据（照常召回）。 */
export function normalizeGateDecisionPrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
}

/**
 * 召回门槛的归一化：0–1 之间（含两端）给数字，其余一律回 0.45。
 *
 * 越界的值不夹到边界上：夹成 0 或 1 会让「我填错了」静默变成「永远查 / 永远不查」
 * 两个极端之一，比直接回默认更难查。空串也回默认——Number("") 是 0，那不是用户的意思。
 * 数字串接受（配置里可能被人手写成 "0.6"），读出来统一是数字。
 */
export function normalizeGateDecisionThreshold(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return GATE_DECISION_THRESHOLD_DEFAULT;
  if (!Number.isFinite(value)) return GATE_DECISION_THRESHOLD_DEFAULT;
  if (value < GATE_DECISION_THRESHOLD_MIN || value > GATE_DECISION_THRESHOLD_MAX) {
    return GATE_DECISION_THRESHOLD_DEFAULT;
  }
  return value;
}

/** 写回配置的形状：一律存归一化后的数字串（与 serviceTimeout 同一口径，非法值存 "0.45"，不留脏值）。 */
export function serializeGateDecisionThreshold(raw) {
  return String(normalizeGateDecisionThreshold(raw));
}

/** 重排提示词与判断提示词同口径：空串表示“用内置默认模板”。 */
export function normalizeRerankPrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, RERANK_PROMPT_MAX).join("");
}

/** 模型标识的单项上限。与 APPS.md 里可调用模型标识的边界一致。 */
export const MODEL_REF_PART_MAX = 128;

/**
 * 判断模型的标识：`provider/model`，空串表示用宿主辅助模型。
 *
 * 形状不对的存量值一律当空（回到 default 通道），不剪字符去硬凑：
 * 把一个写错的标识改成一个看着像真的的标识，比直接忽略更难排查。
 */
export function normalizeGateModel(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  const cut = value.indexOf("/");
  if (cut <= 0) return "";
  const provider = value.slice(0, cut);
  const model = value.slice(cut + 1);
  if (!provider || !model) return "";
  if (Array.from(provider).length > MODEL_REF_PART_MAX) return "";
  if (Array.from(model).length > MODEL_REF_PART_MAX) return "";
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return "";
  return `${provider}/${model}`;
}

/** 重排模型与 gateModel 同形：复用同一份解析。 */
export const normalizeRerankModel = normalizeGateModel;

/** 通道 URL 只认 http / https；末尾斜杠在这里统一去掉，拼接端点时不会再出现双斜杠。 */
export function normalizeChannelUrl(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value || Array.from(value).length > RERANK_CHANNEL_URL_MAX) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";
  return value.replace(/\/+$/, "");
}

/**
 * 打分服务地址：与通道 URL 同口径（只认 http / https、去尾斜杠），非法值在读取侧
 * 收敛成空串（= 该服务未配置）。写入侧另有整单校验，非法值直接 400，不悄悄清空。
 */
export function normalizeServiceUrl(raw) {
  return normalizeChannelUrl(raw);
}

/** 打分服务的模型名：去空白后按字符截断。空串合法（有的服务只有一个模型）。 */
export function normalizeServiceModel(raw) {
  if (typeof raw !== "string") return "";
  return Array.from(raw.trim()).slice(0, SERVICE_MODEL_MAX).join("");
}

/**
 * 打分服务密钥：留空合法（= 该服务没开鉴权），非法值当没配。
 *
 * 换行（\n / \r）一律丢：拼进 Authorization 头会让底层 fetch 直接抛，
 * 而那个异常发生在「召回时」，用户看到的是一轮静默弃权而不是「密钥填错了」。
 * 这是读取侧的收敛，写入侧另有规则（非法值丢弃、保留原值，不打断整单）。
 */
export function normalizeServiceKey(raw) {
  if (typeof raw !== "string") return "";
  if (/[\r\n]/.test(raw)) return "";
  return Array.from(raw.trim()).slice(0, SERVICE_KEY_MAX).join("");
}

/**
 * 打分服务超时的归一化：合法值给数字，空串 / 非数字 / 越界给 null（= 用默认值）。
 *
 * 返回 null 而不是默认值，是为了让「没配」和「配了正好等于默认值」能区分开：
 * systemone 那一路在没配时要按候选数自适应，配了就不再自适应。
 */
export function normalizeServiceTimeout(raw, kind = "rerank") {
  const limits = serviceLimits(kind);
  const text =
    typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const ms = Math.floor(parsed);
  if (ms < limits.min || ms > limits.max) return null;
  return ms;
}

/** 读数：归一化拿不到数字时用该类型的默认值（精排 800 / 决策 3500）。 */
export function serviceTimeoutOrDefault(raw, kind = "rerank") {
  const value = normalizeServiceTimeout(raw, kind);
  return value === null ? serviceLimits(kind).fallback : value;
}

/** 写回配置的形状：合法值存数字串，非法值存空串（= 回默认值，不留非法值）。 */
export function serializeServiceTimeout(raw, kind = "rerank") {
  const value = normalizeServiceTimeout(raw, kind);
  return value === null ? "" : String(value);
}

/**
 * 地址与模型成对：两边要么都有，要么都空。
 *
 * 只看最终生效的那一对（请求体里的值叠在已存值上），所以一次提交里给全两个字段
 * 不会被拆成中间状态。只给模型不给地址同样拒绝：地址为空等于该服务未配置，
 * 孤立的模型名运行时会被整对回退静默忽略，不如在写入侧直接说清楚。
 *
 * 返回错误文案，null 表示这一对没问题。
 */
export function servicePairError(url, model, urlField, modelField) {
  const hasUrl = Boolean(normalizeServiceUrl(url));
  const hasModel = Boolean(normalizeServiceModel(model));
  if (hasUrl && !hasModel) {
    return `${urlField} 配了地址就要填模型名（${modelField}）`;
  }
  if (hasModel && !hasUrl) {
    return `${urlField} 配了模型名就要填地址`;
  }
  return null;
}

/**
 * 单项通道解析。返回 null 表示整项丢弃——字段出现了但形状不对就整项不要。
 *
 * 默认值只有两处，而且是任务书明确写下的：weight 缺省 1，enabled 缺省 true。
 * type 必须是三种之一。rerank / systemone 的 url 与 model 现在可以缺省：端点与模型
 * 由「打分服务」那组配置提供，通道自带的 url / model 仍然接受并优先使用（存量配置
 * 不失效）。model 类型的模型标识可以留空（空 = 宿主辅助模型），非空则必须形如
 * provider/model。
 */
export function parseRerankChannel(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const type = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!RERANK_CHANNEL_TYPES.includes(type)) return null;

  // name 可以缺省；一旦出现就必须是字符串，避免把数字 / 对象当显示名。
  if (raw.name !== undefined && typeof raw.name !== "string") return null;
  const name = typeof raw.name === "string"
    ? Array.from(raw.name.trim()).slice(0, RERANK_CHANNEL_NAME_MAX).join("")
    : "";

  if (raw.model !== undefined && typeof raw.model !== "string") return null;
  const model = typeof raw.model === "string" ? raw.model.trim() : "";

  let url = "";
  if (type === "model") {
    // 模型通道填 provider/model 或空；空走宿主辅助模型。
    if (model && !normalizeGateModel(model)) return null;
  } else {
    // url 缺省 = 用对应打分服务的地址；一旦出现就必须是合法的 http(s)。
    if (raw.url !== undefined && typeof raw.url !== "string") return null;
    const givenUrl = typeof raw.url === "string" ? raw.url.trim() : "";
    if (givenUrl) {
      url = normalizeChannelUrl(givenUrl);
      if (!url) return null;
    }
    if (model) {
      if (Array.from(model).length > MODEL_REF_PART_MAX) return null;
      if (/[\u0000-\u001f\u007f\s]/.test(model)) return null;
    }
  }

  let weight = 1;
  if (raw.weight !== undefined) {
    const parsed = Number(raw.weight);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < RERANK_WEIGHT_MIN || parsed > RERANK_WEIGHT_MAX) return null;
    weight = parsed;
  }

  // 可选：这一路自己的超时。缺省由调用方按类型给（rerank / systemone 800，model 1500）。
  let timeoutMs;
  if (raw.timeoutMs !== undefined) {
    const parsed = Number(raw.timeoutMs);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 30000) return null;
    timeoutMs = Math.floor(parsed);
  }

  let enabled = true;
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") return null;
    enabled = raw.enabled;
  }

  return {
    type,
    name,
    url,
    model: type === "model" ? (model ? normalizeGateModel(model) : "") : model,
    weight,
    enabled,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

/**
 * rerankChannels 的读取侧解析：JSON 串 -> 通道数组。
 *
 * 非法 JSON / 不是数组：回空数组并记一条 warn。单项不完整：丢掉那一项。
 * 超过 8 路：只留前 8 路。warn 是可选的函数参数，测试与路由都能自己接。
 */
export function parseRerankChannels(raw, warn) {
  const report = typeof warn === "function" ? warn : () => {};
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    report("rerankChannels 不是合法 JSON，按空通道处理");
    return [];
  }
  if (!Array.isArray(parsed)) {
    report("rerankChannels 不是数组，按空通道处理");
    return [];
  }

  const out = [];
  for (const item of parsed) {
    const channel = parseRerankChannel(item);
    if (!channel) {
      report("rerankChannels 有一项字段不全，整项丢弃");
      continue;
    }
    out.push(channel);
    if (out.length >= RERANK_CHANNELS_MAX) {
      if (parsed.length > RERANK_CHANNELS_MAX) {
        report(`rerankChannels 超过 ${RERANK_CHANNELS_MAX} 路，只保留前 ${RERANK_CHANNELS_MAX} 路`);
      }
      break;
    }
  }
  return out;
}

/** 通道数组 -> 配置里那份 JSON 串。路由写入前用它把校验过的形状落库。 */
export function serializeRerankChannels(list) {
  const channels = Array.isArray(list) ? list : [];
  const normalized = channels
    .map((item) => parseRerankChannel(item))
    .filter(Boolean)
    .slice(0, RERANK_CHANNELS_MAX);
  return JSON.stringify(normalized);
}

/** 排除名单的单项形状：字母（大小写都认）、数字、点、下划线、连字符。 */
const EXCLUDED_PEER_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** 配置里最多记多少个 peer。与 POST /peers 的上限保持一致。 */
export const EXCLUDED_PEERS_MAX = 50;

/**
 * 把配置里的逗号串解析成 peer 名数组。
 *
 * 按逗号切、trim、去空、按大小写精确去重；形状不对的条目整条丢掉（不剪字符，
 * 否则 `../etc` 会被悄悄变成 `etc`，比忽略更难排查）。顺序按首次出现保留。
 *
 * 不折大小写：中枢目录名大小写敏感，折成小写会让 `Hermes` 这种 peer 读侧匹配不上。
 */
export function parseExcludedPeers(raw) {
  const text = typeof raw === "string" ? raw : "";
  const out = [];
  const seen = new Set();
  for (const part of text.split(",")) {
    const name = part.trim();
    if (!name || !EXCLUDED_PEER_RE.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= EXCLUDED_PEERS_MAX) break;
  }
  return out;
}

async function read(sdk, key) {
  try {
    const value = await sdk.config.get(key);
    return value === undefined || value === null ? DEFAULTS[key] : value;
  } catch {
    return DEFAULTS[key];
  }
}

export async function readSwitches(sdk) {
  // 决策服务的地址与模型先读出来：recallGate 的归一化要用它们当判据
  // （选了 decision 但服务没配 → off），与路由 GET / 面板投影同一份规则。
  const systemoneServiceUrl = normalizeServiceUrl(await read(sdk, "systemoneServiceUrl"));
  const systemoneServiceModel = normalizeServiceModel(await read(sdk, "systemoneServiceModel"));
  return {
    enabled: await read(sdk, "enabled"),
    autoRecall: await read(sdk, "autoRecall"),
    autoCapture: await read(sdk, "autoCapture"),
    readOnly: await read(sdk, "readOnly"),
    skillRouting: await read(sdk, "skillRouting"),
    probe: await read(sdk, "probe"),
    recallGate: resolveRecallGate(await read(sdk, "recallGate"), {
      systemoneServiceUrl,
      systemoneServiceModel,
    }),
    gateFallback: normalizeGateFallback(await read(sdk, "gateFallback")),
    queryMode: normalizeQueryMode(await read(sdk, "queryMode")),
    gatePrompt: normalizeGatePrompt(await read(sdk, "gatePrompt")),
    gateDecisionPrompt: normalizeGateDecisionPrompt(await read(sdk, "gateDecisionPrompt")),
    // 只在 decision 档生效；别的档读到了也不用（见 src/memory/recall.js 的调用处）。
    gateDecisionThreshold: normalizeGateDecisionThreshold(await read(sdk, "gateDecisionThreshold")),
    gateModel: normalizeGateModel(await read(sdk, "gateModel")),
    rerank: normalizeRerank(await read(sdk, "rerank")),
    rerankPrompt: normalizeRerankPrompt(await read(sdk, "rerankPrompt")),
    rerankModel: normalizeRerankModel(await read(sdk, "rerankModel")),
    rerankChannels: parseRerankChannels(await read(sdk, "rerankChannels"), (message) => {
      try {
        sdk?.logger?.warn?.(`openviking ${message}`);
      } catch {
        /* 日志不能影响配置读取 */
      }
    }),
    rerankServiceUrl: normalizeServiceUrl(await read(sdk, "rerankServiceUrl")),
    rerankServiceModel: normalizeServiceModel(await read(sdk, "rerankServiceModel")),
    // null = 没配（用默认值）；数字 = 用户配的那个。运行时靠这个区分「没配」与「配了默认值」。
    rerankServiceTimeoutMs: normalizeServiceTimeout(
      await read(sdk, "rerankServiceTimeoutMs"),
      "rerank",
    ),
    rerankServiceKey: normalizeServiceKey(await read(sdk, "rerankServiceKey")),
    systemoneServiceUrl,
    systemoneServiceModel,
    systemoneServiceTimeoutMs: normalizeServiceTimeout(
      await read(sdk, "systemoneServiceTimeoutMs"),
      "systemone",
    ),
    systemoneServiceKey: normalizeServiceKey(await read(sdk, "systemoneServiceKey")),
  };
}

/**
 * 决策服务配好了吗：地址与模型都在才算（与 resolveRerankChannel 的成对规则一致）。
 *
 * 只填一半按没配算：地址为空等于该服务未配置，孤立的模型名运行时会被整对忽略。
 * 这是「第四档能不能选」与「已选的第四档还算不算数」的唯一判据，运行时 / 路由 / 面板共用。
 */
export function decisionServiceConfigured(switches) {
  return Boolean(
    normalizeServiceUrl(switches?.systemoneServiceUrl) &&
      normalizeServiceModel(switches?.systemoneServiceModel),
  );
}

/**
 * 归一化召回判断：decision 但服务没配 → 回退 off。
 *
 * 除了「认不认这个枚举值」，还有一条「此刻算不算数」：决策服务被清掉之后，
 * 存着的 decision 已经没有意义了，界面与运行时都必须看到 off，不能显示一个
 * 实际不生效的档位。只在 decision 这一档上判，别的档与服务无关。
 */
export function resolveRecallGate(gate, switches) {
  const value = normalizeRecallGate(gate);
  if (value === "decision" && !decisionServiceConfigured(switches)) return "off";
  return value;
}

export async function readExcludedPeers(sdk) {
  return parseExcludedPeers(await read(sdk, "excludedPeers"));
}

export async function readConnection(sdk) {
  return {
    serverUrl: String(await read(sdk, "serverUrl") || "").replace(/\/+$/, ""),
    apiKey: await read(sdk, "apiKey"),
    peerPrefix: await read(sdk, "peerPrefix"),
    mergeMemory: await read(sdk, "mergeMemory"),
    recallPeerScope: await read(sdk, "recallPeerScope"),
    timeoutMs: Number(await read(sdk, "requestTimeoutMs")) || DEFAULTS.requestTimeoutMs,
    injectBudgetTokens:
      Number(await read(sdk, "injectBudgetTokens")) || DEFAULTS.injectBudgetTokens,
  };
}

// 身份是否填全。缺值时应直接短路，不去联网。
export async function hasIdentity(sdk) {
  const conn = await readConnection(sdk);
  return Boolean(conn.serverUrl && conn.apiKey);
}

// 总闸 + 身份双重判定：任何一项不满足，链路钩子都必须零成本返回。
export async function isActive(sdk) {
  const sw = await readSwitches(sdk);
  if (!sw.enabled) return false;
  return hasIdentity(sdk);
}

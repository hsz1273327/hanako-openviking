// 配置读取层。
//
// 铁律：所有开关在"使用的那一刻"从 sdk.config 现读，不在加载时缓存。
// 因此设置页里点一下关，下一轮立刻生效，不用重载 App。

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
  queryMode: "last",
  gatePrompt: "",
  gateModel: "",
  rerank: "off",
  rerankPrompt: "",
  rerankModel: "",
  rerankChannels: "",
  rerankServiceUrl: "",
  rerankServiceModel: "",
  rerankServiceTimeoutMs: "",
  systemoneServiceUrl: "",
  systemoneServiceModel: "",
  systemoneServiceTimeoutMs: "",
};

/** 召回判断：off 永远召回，rules 只跳过极短的纯操作指令，llm 让宿主模型判断。 */
export const RECALL_GATES = Object.freeze(["off", "rules", "llm"]);

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
 * 打分服务超时的边界。单位是毫秒，给的是「一次打分请求」的上限，不是整轮召回。
 *
 * fallback 是留空时的默认值：精排一份候选一次往返，800 够；决策服务一次问完全部
 * 候选、每问一次都是前向，所以给到 3500。越界的值不夹到边界上，而是回默认值——
 * 用户把 99999 填进来通常是想「别超时」，悄悄夹成 10000 会让原因更难查。
 */
export const SERVICE_TIMEOUT_LIMITS = Object.freeze({
  rerank: Object.freeze({ min: 100, max: 10000, fallback: 800 }),
  systemone: Object.freeze({ min: 100, max: 15000, fallback: 3500 }),
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
 * 地址与模型成对：配了地址就必须填模型名，清空时两个一起清。
 *
 * 只看最终生效的那一对（请求体里的值叠在已存值上），所以「先存地址、再补模型」
 * 两步提交不会被拆成一次非法状态。只给模型不给地址是允许的：地址为空等于该服务
 * 未配置，孤立的模型名不会拿去拼端点（见 resolveRerankChannel 的整对回退）。
 *
 * 返回错误文案，null 表示这一对没问题。
 */
export function servicePairError(url, model, urlField, modelField) {
  const hasUrl = Boolean(normalizeServiceUrl(url));
  const hasModel = Boolean(normalizeServiceModel(model));
  if (hasUrl && !hasModel) {
    return `${urlField} 配了地址就要填模型名（${modelField}）`;
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
  return {
    enabled: await read(sdk, "enabled"),
    autoRecall: await read(sdk, "autoRecall"),
    autoCapture: await read(sdk, "autoCapture"),
    readOnly: await read(sdk, "readOnly"),
    skillRouting: await read(sdk, "skillRouting"),
    probe: await read(sdk, "probe"),
    recallGate: normalizeRecallGate(await read(sdk, "recallGate")),
    queryMode: normalizeQueryMode(await read(sdk, "queryMode")),
    gatePrompt: normalizeGatePrompt(await read(sdk, "gatePrompt")),
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
    systemoneServiceUrl: normalizeServiceUrl(await read(sdk, "systemoneServiceUrl")),
    systemoneServiceModel: normalizeServiceModel(await read(sdk, "systemoneServiceModel")),
    systemoneServiceTimeoutMs: normalizeServiceTimeout(
      await read(sdk, "systemoneServiceTimeoutMs"),
      "systemone",
    ),
  };
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

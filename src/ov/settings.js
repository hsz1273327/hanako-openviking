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
function normalizeChannelUrl(raw) {
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
 * 单项通道解析。返回 null 表示整项丢弃——缺字段就是缺字段，不拿默认值去猜。
 *
 * 默认值只有两处，而且是任务书明确写下的：weight 缺省 1，enabled 缺省 true。
 * type 必须是三种之一；rerank / systemone 必须有 URL 与模型；model 类型的模型标识
 * 可以留空（空 = 宿主辅助模型），非空则必须形如 provider/model。
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
    url = normalizeChannelUrl(raw.url);
    if (!url || !model) return null;
    if (Array.from(model).length > MODEL_REF_PART_MAX) return null;
    if (/[\u0000-\u001f\u007f\s]/.test(model)) return null;
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

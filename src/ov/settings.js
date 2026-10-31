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
};

/** 召回判断：off 永远召回，rules 只跳过极短的纯操作指令，llm 让宿主模型判断。 */
export const RECALL_GATES = Object.freeze(["off", "rules", "llm"]);

/** 召回查询：last 只用最后一句，context 拼最近几条用户文本。 */
export const QUERY_MODES = Object.freeze(["last", "context"]);

/** 自定义提示词上限。超过这个长度的存量值在读取侧截断，POST 侧整单拒绝。 */
export const GATE_PROMPT_MAX = 2000;

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

/** 提示词按字符截断，不把代理对切成两半。空串表示“没有提示词，不拦截”。 */
export function normalizeGatePrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
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

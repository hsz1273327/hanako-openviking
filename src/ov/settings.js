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
};

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

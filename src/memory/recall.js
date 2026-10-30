// 记忆召回：把 OpenViking 拼好的记忆块放进"即将发给 provider 的请求"。
//
// 这个文件只在 provider/before-request 里跑。该接缝按**模型步**触发（DESIGN 五.C），
// 一个用户轮可能调用十几次，所以这里有一条硬纪律：同一个 (sessionId, 用户文本指纹)
// 在一次进程里只召回一次。去重键建立在 stripInjected 之后的干净文本上，
// 否则第二次调用看到的是"上次注过的那段"，指纹永远不同，去重形同虚设。
//
// 失败即沉默：未启用 / 没 key / 没身份 / 超时 / 网络错 / 响应里没有文本 / payload 形状不认识，
// 一律 return undefined（不干预）。调用方拿回 undefined 就不会改载荷，本轮对话照常。
// 注意 readOnly 只约束写回，不约束召回：观察模式仍然要能看到记忆。

import { createHash } from "node:crypto";
import { createClient } from "../ov/client.js";
import { transportFor } from "../ov/transport.js";
import { resolvePeer } from "../ov/identity.js";
import { readConnection, readExcludedPeers, readSwitches } from "../ov/settings.js";
import { effective, patchSession, readSession } from "../state/session.js";
import {
  MEMORY_TAG_CLOSE,
  MEMORY_TAG_OPEN,
  estimateTokens,
  injectMemory,
  lastUserText,
  recallQuery,
  trimToBudget,
} from "../inject/plan.js";

const LOG_PREFIX = "openviking recall";

/** 召回判断的上限：超过这个字数的文本一律召回。 */
export const GATE_MAX_CHARS = 8;

/** 疑问词：出现任一个就说明用户在问事，不能跳过。 */
export const GATE_QUESTION_WORDS = Object.freeze([
  "为什么",
  "怎么",
  "什么",
  "哪",
  "如何",
  "是否",
  "吗",
  "呢",
  "多少",
  "谁",
]);

/** 指代词：出现任一个就说明这句依赖上下文，不能跳过。 */
export const GATE_REFERENCE_WORDS = Object.freeze([
  "这",
  "那",
  "它",
  "其",
  "刚才",
  "上次",
  "之前",
  "继续",
  "还",
  "再",
]);

function charLength(text) {
  return Array.from(text).length;
}

/**
 * 极短的纯操作指令：四条全中才算。
 *
 * 判据刻意保守：只认“运行测试”这种说完就完、不指向任何东西的句子。
 * 带问号、带疑问词、带指代词，或者超过 8 个字，一律召回。
 */
export function isShortOperationCommand(text, limit = GATE_MAX_CHARS) {
  const query = typeof text === "string" ? text.trim() : "";
  if (!query) return false;
  if (charLength(query) > limit) return false;
  if (query.includes("?") || query.includes("？")) return false;
  if (GATE_QUESTION_WORDS.some((word) => query.includes(word))) return false;
  if (GATE_REFERENCE_WORDS.some((word) => query.includes(word))) return false;
  return true;
}

/** 配置是 off（或任何不认识的值）时永远不跳；只有 rules 才看判据。 */
export function shouldSkipRecall(text, gate = "off") {
  if (gate !== "rules") return false;
  return isShortOperationCommand(text);
}

/** 进程内去重表容量。一个键约 100 字节，200 条足够覆盖同时活跃的几个会话。 */
export const DEDUP_LIMIT = 200;

/** 记忆块的服务端预算上限（DESIGN 五.C：记忆块默认 2000 token）。 */
export const MEMORY_MAX_TOKENS = 2000;

/** 指纹长度。32 个十六进制字符足以区分一个进程里见过的句子。 */
const FINGERPRINT_CHARS = 32;

/**
 * 响应形状未识别的告警是否已经报过。以"进程"为界，不跟着会话或 handler 走：
 * 一个坏响应会被 before-request 的十几次调用各看见一遍，按会话报还是会刷屏。
 */
let shapeWarned = false;

/** 测试用：把"只报一次"的进程级标记复位。生产路径不要调用。 */
export function resetShapeWarning() {
  shapeWarned = false;
}

/** 用户文本的稳定指纹。去重键由 sessionId + 这个值组成。 */
export function fingerprint(text) {
  return createHash("sha256")
    .update(String(text), "utf8")
    .digest("hex")
    .slice(0, FINGERPRINT_CHARS);
}

/**
 * 去重表。Map 保持插入顺序，超容量时删掉最早插入的那个（最旧淘汰）。
 * claim 返回 true 表示"这个键归你"，false 表示本轮已经处理过。
 */
export function createDeduper(limit = DEDUP_LIMIT) {
  const seen = new Map();

  return {
    claim(key) {
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.set(key, Date.now());
      if (seen.size > limit) {
        const oldest = seen.keys().next().value;
        seen.delete(oldest);
      }
      return true;
    },
    has(key) {
      return seen.has(key);
    },
    get size() {
      return seen.size;
    },
  };
}

function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 从召回响应里读出纯文本，只认实测过的三处，按服务端"最省事到最原始"排列：
 *   1. rendered —— mode=context 时服务端拼好的扁平 XML 块，文档称 ready to inject；
 *   2. digest   —— 摘要，可能为空串；
 *   3. entries[].text —— 原始命中条目，用空行连接。
 * 其余形状一律给空串（调用方据此 return undefined 并告警一次），不猜字段名。
 */
export function extractRecallText(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const rendered = textOf(value.rendered);
  if (rendered) return rendered;

  const digest = textOf(value.digest);
  if (digest) return digest;

  if (Array.isArray(value.entries)) {
    const joined = value.entries
      .map((entry) => (entry && typeof entry === "object" ? textOf(entry.text) : ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (joined) return joined;
  }

  return "";
}

/** 只报一次：响应形状未识别 + 顶层键名，方便对着真实服务端改代码。 */
function warnShapeOnce(sdk, result) {
  if (shapeWarned) return;
  shapeWarned = true;
  const keys =
    result && typeof result === "object" && !Array.isArray(result)
      ? Object.keys(result).join(", ")
      : `(${Array.isArray(result) ? "array" : typeof result})`;
  log(sdk, "warn", `响应形状未识别 (keys=${keys || "none"})`);
}

/**
 * 记忆块：固定标记包住服务端裁好的文本。
 * 先按本地预算截断再包标记，保证关闭标记不会被截掉——写回时靠它剥离。
 */
export function memoryBlock(text, budgetTokens) {
  const body = trimToBudget(String(text || "").trim(), budgetTokens);
  if (!body) return "";
  return `${MEMORY_TAG_OPEN}\n${body}\n${MEMORY_TAG_CLOSE}`;
}

/** 记忆块预算：全局配置与 DESIGN 上限取小。配置缺省或非法时用上限。 */
function recallBudget(conn) {
  const configured = Number(conn?.injectBudgetTokens);
  if (!Number.isFinite(configured) || configured <= 0) return MEMORY_MAX_TOKENS;
  return Math.min(configured, MEMORY_MAX_TOKENS);
}

function log(sdk, level, message) {
  try {
    sdk?.logger?.[level]?.(`${LOG_PREFIX} ${message}`);
  } catch {
    /* 日志永远不能影响本轮对话 */
  }
}

function reasonOf(error) {
  const message = String(error?.message || error || "unknown");
  return message.replace(/\s+/g, " ").slice(0, 160);
}

/** 召回成功后记一笔会话进度。写盘失败只警告，不撤销已经做成的注入。 */
function bumpRecall(sdk, sessionId, tokens) {
  try {
    const fresh = readSession(sdk.dataDir, sessionId);
    patchSession(sdk.dataDir, sessionId, {
      recall: {
        turns: (fresh.recall?.turns || 0) + 1,
        injectedTokens: (fresh.recall?.injectedTokens || 0) + tokens,
        lastAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log(sdk, "warn", `session state update failed: ${reasonOf(error)}`);
  }
}

/**
 * 生成 provider/before-request 的召回处理器。
 *
 * 返回值契约：
 *   注入成功 -> { payload }（新对象，原 payload 不动）
 *   其余一切 -> undefined（钩子据此判定"不干预"）
 *
 * options.deduper 供测试注入；生产环境每次 createRecallHandler 一份进程内表。
 * options.probe 是探针函数：只在 gate 跳过时调用一次，写入一行事实。
 */
export function createRecallHandler(sdk, options = {}) {
  const deduper = options.deduper || createDeduper();

  return async function recallOnBeforeRequest(invocation) {
    const session = invocation?.session;
    const sessionId = session?.sessionId;
    const payload = invocation?.payload;

    // 没有会话就没有可去重的桶，也没有地方记进度：不做召回，也不发请求。
    if (!sessionId) {
      log(sdk, "info", "skip: no sessionId");
      return undefined;
    }

    // 干净的用户文本（既往注入已剥离）。空则本轮没有可检索的意图。
    // 去重键用最后一句：queryMode 改成 context 后，查询文本会随历史增长，
    // 但“这一轮用户说了什么”没变，键必须仍然稳定。
    const lastText = lastUserText(payload);
    if (!lastText) {
      log(sdk, "info", `skip: empty query (session=${sessionId})`);
      return undefined;
    }

    // 去重键最先占：后面的每一步（读配置、读会话文件、发请求）都只该为一条用户消息做一次。
    // 同一 (sessionId, 用户文本) 的后续调用直接静默返回 undefined——不读配置，也不记跳过日志。
    // 这也是“总闸关着”时不再刷屏的原因：跳过日志排在这一步之后，一轮只可能出现一次。
    const key = `${sessionId}\u0000${fingerprint(lastText)}`;
    if (!deduper.claim(key)) return undefined;

    // 总闸：关着就一次配置之外的活儿都不干。
    const switches = await readSwitches(sdk);
    if (!switches.enabled) {
      log(sdk, "info", `skip: disabled (session=${sessionId})`);
      return undefined;
    }

    const conn = await readConnection(sdk);
    if (!conn.serverUrl || !conn.apiKey) {
      log(sdk, "info", `skip: no identity (session=${sessionId})`);
      return undefined;
    }

    // 全局值 + 会话覆盖 = 这一轮真正生效的开关。总闸不在覆盖名单里。
    const state = readSession(sdk.dataDir, sessionId);
    const live = effective(
      { ...switches, recallPeerScope: conn.recallPeerScope },
      state,
    );
    if (!live.autoRecall) {
      log(sdk, "info", `skip: autoRecall off (session=${sessionId})`);
      return undefined;
    }

    // 召回判断：只跳过极短的纯操作指令，且在发请求之前。
    // 判据看最后一条用户原话，不看拼接后的查询：gate 回答的是“这句话需不需要查记忆”，
    // queryMode 回答的是“用什么去查”，两件事分开。若用拼接结果判断，context 模式
    // 一旦有历史就必然超 8 字，rules 会被整个抵消掉。
    if (shouldSkipRecall(lastText, switches.recallGate)) {
      log(sdk, "info", `gate: skipped (session=${sessionId} chars=${charLength(lastText)})`);
      if (switches.probe && typeof options.probe === "function") {
        try {
          await options.probe("recall/gate-skip", {
            session,
            query: lastText,
            reason: "short-operation-command",
          });
        } catch {
          /* 探针写不进去不能影响本轮对话 */
        }
      }
      return undefined;
    }

    // 用什么去查：与上面的判断无关，按 queryMode 取。
    const query = recallQuery(payload, switches.queryMode);

    // 排除名单只对跨门牌（all）有意义：actor 范围本来就不含别人，
    // 多带这个键只会让请求体多一个不必要的字段。
    const excludedPeers =
      live.recallPeerScope === "all" ? await readExcludedPeers(sdk) : [];
    const excludeUris = excludedPeers.map((name) => `viking://user/default/peers/${name}`);

    const budget = recallBudget(conn);
    const client = createClient({
      ...conn,
      peer: resolvePeer(conn, session?.sessionPath),
      ...transportFor(sdk),
    });

    let result;
    try {
      result = await client.recall(query, {
        peerScope: live.recallPeerScope,
        maxTokens: budget,
        excludeUris,
      });
    } catch (error) {
      log(sdk, "info", `skip: request failed (session=${sessionId}) ${reasonOf(error)}`);
      return undefined;
    }

    const text = extractRecallText(result);
    if (!text) {
      warnShapeOnce(sdk, result);
      log(sdk, "info", `skip: no text in response (session=${sessionId})`);
      return undefined;
    }

    const block = memoryBlock(text, budget);
    if (!block) {
      log(sdk, "info", `skip: empty block (session=${sessionId})`);
      return undefined;
    }

    const injected = injectMemory(payload, block);
    if (!injected) {
      log(sdk, "info", `skip: unknown payload shape (session=${sessionId})`);
      return undefined;
    }

    bumpRecall(sdk, sessionId, estimateTokens(block));
    log(
      sdk,
      "info",
      `ok (session=${sessionId} scope=${live.recallPeerScope} tokens=${estimateTokens(block)})`,
    );

    return { payload: injected };
  };
}

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

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "../ov/client.js";
import { transportFor } from "../ov/transport.js";
import { resolvePeer } from "../ov/identity.js";
import {
  parseRerankChannels,
  readConnection,
  readExcludedPeers,
  readSwitches,
} from "../ov/settings.js";
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

/**
 * 疑问词：出现任一个就说明用户在问事，不能跳过。
 *
 * 前半截是书面词，后半截是口语：口语问句常常很短、也不带问号
 * （「啥意思」「咋办」「为啥」），只收书面词会把它们当成纯指令跳过。
 * 宁滥勿缺——多认几个词的代价只是多召回一次。
 * 「怎么样」被「怎么」覆盖，「为何」被「何」覆盖，「干吗」实际也已被「吗」覆盖，
 * 这里仍显式列出，是为了让词表本身读得出完整意图。
 */
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
  "啥",
  "咋",
  "干嘛",
  "干吗",
  "几",
  "何",
  "怎样",
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

/**
 * 模板里代表"当前这条用户消息"的占位符。
 *
 * 提示词要判断的是"这条消息需不需要查记忆"，消息本身就是材料，所以它是模板的一部分，
 * 不是另发一段 systemPrompt。写成常量是为了让面板文案与测试引同一份字面量。
 */
export const GATE_MESSAGE_PLACEHOLDER = "{{message}}";

/**
 * llm 判断的默认提示词模板。导出给测试与面板文案对照。
 * 面板里的 textarea 以它作为草稿（配置为空时直接填进去让人改），两边必须是同一段文字，
 * 冒烟会比对 ui/assets/recall-layers.js 里的副本与这里的字面量。
 */
export const DEFAULT_GATE_PROMPT = `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。

用户消息：{{message}}`;

/** 重排模板里的两个占位符：当前消息，以及带编号的候选清单。 */
export const RERANK_MESSAGE_PLACEHOLDER = "{{message}}";
export const RERANK_CANDIDATES_PLACEHOLDER = "{{candidates}}";

/**
 * llm 重排的默认提示词模板。导出给测试与面板文案对照。
 * 面板加载不了 App 的 Node 模块，ui/assets/recall-layers.js 里存了逐字相同的一份，
 * 冒烟会比对两边；配置里的 rerankPrompt 为空时就用这段。
 */
export const DEFAULT_RERANK_PROMPT = `用户在问：{{message}}

下面是从记忆库里查到的候选，每条一行，前面是编号：

{{candidates}}

挑出真正能帮助回答这个问题的候选。只回编号，用逗号分隔，例如 1,3。
如果一条都用不上，只回两个字：无。
不要解释。`;

/**
 * 模板 + 消息 -> 真正要发给模型的那一段文本。
 *
 * 三条规矩：
 *   1. 有占位符就整体替换（多处出现都换，位置不限）；
 *   2. 没占位符就把消息接在末尾，中间空一行——用户可能写了个别的形状的提示词；
 *   3. 模板为空返回空串，调用方据此不问模型（空提示词不拦截召回）。
 *
 * 消息原样插入：不转义、不裁剪、也不再扫一遍占位符。用户消息里恰好写着
 * `{{message}}` 时它只是文字，二次替换会把消息复制进自己肚子里。
 */
export function renderGatePrompt(template, message) {
  const text = typeof template === "string" ? template : "";
  if (!text) return "";
  const body = typeof message === "string" ? message : "";
  if (text.includes(GATE_MESSAGE_PLACEHOLDER)) {
    return text.split(GATE_MESSAGE_PLACEHOLDER).join(body);
  }
  if (!body) return text;
  return `${text}\n\n${body}`;
}

/** 候选摘要：首 120 字、压平换行、去首尾空白。 */
export function candidateSummary(text) {
  const body = typeof text === "string" ? text : "";
  return Array.from(body)
    .slice(0, 120)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** 候选 -> `1. <摘要>` 每行一条。也接受纯字符串数组，方便测试直接传文本。 */
function candidateLines(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.map((candidate, index) => {
    const text =
      typeof candidate === "string"
        ? candidate
        : candidate && typeof candidate === "object"
          ? candidate.text
          : "";
    return `${index + 1}. ${candidateSummary(text)}`;
  });
}

/**
 * 重排模板 + 消息 + 候选 -> 发给模型的那一段文本。
 *
 * 两个占位符各自只展开一次，而且是在原模板上单次扫描替换的：
 * 消息或候选摘要里恰好带着 `{{message}}` / `{{candidates}}` 时，
 * 它们只是文字，不会被二次替换。模板缺 `{{candidates}}` 时清单接在末尾，隔一空行；
 * 模板为空返回空串，调用方据此不问模型。
 */
export function renderRerankPrompt(template, message, candidates) {
  const text = typeof template === "string" ? template : "";
  if (!text) return "";
  const body = typeof message === "string" ? message : "";
  const list = candidateLines(candidates).join("\n");
  const hasCandidates = text.includes(RERANK_CANDIDATES_PLACEHOLDER);

  let out = "";
  let usedMessage = false;
  let usedCandidates = false;
  let index = 0;
  while (index < text.length) {
    if (!usedMessage && text.startsWith(RERANK_MESSAGE_PLACEHOLDER, index)) {
      out += body;
      usedMessage = true;
      index += RERANK_MESSAGE_PLACEHOLDER.length;
      continue;
    }
    if (!usedCandidates && text.startsWith(RERANK_CANDIDATES_PLACEHOLDER, index)) {
      out += list;
      usedCandidates = true;
      index += RERANK_CANDIDATES_PLACEHOLDER.length;
      continue;
    }
    out += text[index];
    index += 1;
  }

  if (!hasCandidates && list) out = `${out}\n\n${list}`;
  return out;
}

/** 判断最多等 600ms；超时后按「召回」处理，不能把这一轮挂在模型上。 */
export const GATE_TIMEOUT_MS = 600;

/** 判断只要一个词，给 8 个 token 足够；再大只会让超时来得更早。 */
export const GATE_MAX_TOKENS = 8;

/**
 * 空串表示“没有提示词”，不是“用默认”。
 *
 * 这层语义改过一次：早先空值会静默回退成 DEFAULT_GATE_PROMPT，用户以为自己在用默认、
 * 其实配置里是空的，清空也清不掉。现在空就是空，由调用方决定空的时候怎么办
 * （llm 档的处理是“不拦截”，见 handler 里那段）。
 */
export function gatePromptOf(switches) {
  return typeof switches?.gatePrompt === "string" ? switches.gatePrompt.trim() : "";
}

/**
 * 判断模型的标识：空串意味着“用宿主辅助模型”，非空形如 `provider/model`。
 *
 * 不再有单独的“模型来源”开关：值本身就说清了走哪条通道，少一层就少一处不一致。
 */
export function gateModelOf(switches) {
  return typeof switches?.gateModel === "string" ? switches.gateModel.trim() : "";
}

/** 重排模型与 gateModel 同形：空串表示用宿主辅助模型。 */
export function rerankModelOf(switches) {
  return typeof switches?.rerankModel === "string" ? switches.rerankModel.trim() : "";
}

/**
 * 重排提示词：与 gate 相反，空串不是“不问”，而是“用内置默认模板”。
 * rerank 本身就是 opt-in 的（默认 off），打开之后总得有个判据。
 */
export function rerankPromptOf(switches) {
  const value = typeof switches?.rerankPrompt === "string" ? switches.rerankPrompt.trim() : "";
  return value || DEFAULT_RERANK_PROMPT;
}

/** `provider/model` -> { provider, model }。按第一个斜杠切，模型 id 里允许再有斜杠。 */
export function parseModelRef(ref) {
  const value = typeof ref === "string" ? ref.trim() : "";
  const cut = value.indexOf("/");
  if (cut <= 0) return null;
  const provider = value.slice(0, cut).trim();
  const model = value.slice(cut + 1).trim();
  if (!provider || !model) return null;
  return { provider, model };
}

/**
 * 模型回答 -> 是否召回。
 *
 * 顺序不能反：「不需要」里包含「需要」，必须先判否定。
 * 空、跑题、乱码都召回——这是安全默认，判断失败不能变成漏召回。
 */
export function gateAnswerRecalls(answer) {
  const text = typeof answer === "string" ? answer : "";
  if (text.includes("不需要")) return false;
  if (text.includes("需要")) return true;
  // 显式安全分支：模型没给明确答案时宁可多召回，也不静默漏掉历史。
  return true;
}

/** 把一行 NDJSON 吃进文本或抛错；error 事件必须立即失败。 */
function consumeGateStreamLine(line, state) {
  const raw = line.trim();
  if (!raw) return;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new Error("模型流不是合法 NDJSON");
  }
  if (event?.type === "text-delta") {
    if (typeof event.delta === "string") state.text += event.delta;
    return;
  }
  if (event?.type === "error") {
    throw new Error(String(event.message || event.code || "模型流返回错误"));
  }
}

/** 从 stream 的 NDJSON 里拼 text-delta；遇到 error 事件立刻抛。 */
export async function readGateStreamText(response) {
  if (!response || typeof response !== "object") {
    throw new Error("模型流没有返回响应");
  }

  const state = { text: "" };
  const body = response.body;
  // 测试或宿主给了普通 Response 时走 text() 兜底，逻辑仍是同一套逐行解析。
  if (!body || typeof body.getReader !== "function") {
    const raw = typeof response.text === "function" ? await response.text() : "";
    for (const line of String(raw).split("\n")) consumeGateStreamLine(line, state);
    return state.text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        consumeGateStreamLine(line, state);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeGateStreamLine(buffer, state);
    return state.text;
  } catch (error) {
    // 失败时释放读者；不 await，取消本身不能再把这一轮挂住。
    try {
      Promise.resolve(reader.cancel()).catch(() => {});
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/**
 * 问宿主模型这条消息要不要查记忆。
 *
 * 只有两个通道，不再分“默认 / 自选”两层：gateModel 为空走 utility（宿主自己的辅助
 * 模型配置），非空（形如 provider/model）走 stream。两条路都用 Promise.race 加 600ms
 * 上限：超时/失败主动 cancel，让宿主那边尽快收尾；调用方把异常当作「召回」。
 */
export async function askGateModel(sdk, switches, text) {
  const models = sdk?.models;
  if (!models) throw new Error("宿主没有提供 ctx.models");

  const ref = gateModelOf(switches);
  const picked = ref ? parseModelRef(ref) : null;
  // 只检查当前这条通道需要的方法：自选只要 stream，默认只要 utility。
  if (picked && typeof models.stream !== "function") {
    throw new Error("宿主没有提供 ctx.models.stream");
  }
  if (!picked && typeof models.utility !== "function") {
    throw new Error("宿主没有提供 ctx.models.utility");
  }

  const requestId = `openviking-gate-${randomUUID()}`;
  // 提示词模板已经把"判断什么"和"材料是什么"写在一段里，渲染后整段作为单条 user 消息。
  // 不再拆成 systemPrompt + messages：拆两段会让小模型分不清哪段是要求、哪段是材料。
  const base = {
    requestId,
    messages: [
      { role: "user", content: renderGatePrompt(gatePromptOf(switches), text) },
    ],
    maxTokens: GATE_MAX_TOKENS,
    temperature: 0,
  };

  let work;
  if (picked) {
    work = Promise.resolve(
      models.stream({ ...base, provider: picked.provider, model: picked.model }),
    ).then(readGateStreamText);
  } else {
    work = Promise.resolve(models.utility({ ...base, scope: "app" })).then((result) => {
      if (typeof result?.text !== "string") throw new Error("utility 没有返回文本");
      return result.text;
    });
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT ${GATE_TIMEOUT_MS}ms`)), GATE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    // 超时、error 事件、宿主播错都撤销在途请求；不 await，避免取消本身再挂住。
    try {
      Promise.resolve(models.cancel(requestId)).catch(() => {});
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 重排比判断多要几个编号，但同样不能把这一轮挂在模型上。 */
export const RERANK_TIMEOUT_MS = 600;

/** 32 个 token 足够吐出几十个编号；再大只会让超时来得更早。 */
export const RERANK_MAX_TOKENS = 32;

/** 外部精排通道的默认超时。每路独立计时，一路慢不拖住另一路。 */
export const RERANK_CHANNEL_TIMEOUT_MS = 800;

/** 模型通道比 HTTP 通道多给一点时间：它还要等宿主调度。 */
export const RERANK_MODEL_CHANNEL_TIMEOUT_MS = 1500;

/** 送进 rerank 的候选正文上限。 */
export const RERANK_DOCUMENT_CHARS = 800;

/** 测试按钮用最近一轮候选，最多留这么多条，避免状态文件无限长。 */
export const RERANK_SAMPLE_ITEMS_MAX = 20;

/**
 * systemone 的默认超时与上限。
 *
 * 它一次问完全部候选，一次前向比一条一次更贵：5 条约 2.9s，8 条接近 5s。
 * 所以缺省给 2500，配得再大也只认 5000——超了不如直接弃权，别把这一轮挂住。
 */
export const SYSTEMONE_CHANNEL_TIMEOUT_MS = 2500;
export const SYSTEMONE_TIMEOUT_MAX_MS = 5000;

/** systemone 一次只问前这么多条：每题一次前向，再多的收益抵不过延迟。 */
export const SYSTEMONE_MAX_CANDIDATES = 8;

/** 送进 systemone 的单条候选正文上限。全部候选挤同一个 state，长条目会挤掉后面的人。 */
export const SYSTEMONE_DOCUMENT_CHARS = 500;

/** systemone 的 state 总长上限。放不下的候选不再塞进去，按未打分处理。 */
export const SYSTEMONE_STATE_MAX_CHARS = 12000;

/**
 * systemone 的逐条提问。
 *
 * /v1/systemone 的设计是「一个 state + 多个问题」，不是「多条 state 各问一次」。
 * 所以每条候选配一个问题，序号必须与 state 里候选列表的编号一一对应。
 */
export function systemoneInstructions(position) {
  return `第 ${position} 条候选能帮助回答用户的问题吗`;
}

function raceTimeout(promise, timeoutMs, label = "channel") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`TIMEOUT ${timeoutMs}ms ${label}`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 通过现有出口发一次 JSON POST。
 *
 * 优先受管运行时（runtime.fetch 的代理信封支持任意 http/https URL）；
 * 运行时没起来时退回 ctx.network.fetch（受 manifest 白名单限制）。
 * 两条路都不通时直接抛，调用方把这一路当弃权处理。
 */
async function postJson(sdk, url, payload, timeoutMs) {
  const transport = transportFor(sdk);
  const body = JSON.stringify(payload);

  if (transport.mode === "runtime") {
    const out = await raceTimeout(
      transport.send(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        timeoutMs,
      }),
      timeoutMs,
    );
    if (!out || typeof out !== "object") throw new Error("通道没有返回信封");
    if (!out.ok) throw new Error(`HTTP ${out.status}`);
    if (!out.data || typeof out.data !== "object") {
      throw new Error("通道返回的不是 JSON 对象");
    }
    return out.data;
  }

  if (transport.mode === "direct") {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    // 有 AbortSignal.timeout 就让底层也早点收手；外层 race 仍然是硬上限。
    try {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        init.signal = AbortSignal.timeout(timeoutMs);
      }
    } catch {
      /* 老运行时没有这个静态方法，外层 race 照样管用 */
    }
    let response;
    try {
      response = await raceTimeout(transport.fetchImpl(url, init), timeoutMs);
    } catch (error) {
      // AbortSignal 先手时底层会扔 TimeoutError / AbortError，
      // 统一成同一句，不然探针里两种出口的超时原因长得不一样。
      const name = String(error?.name || "");
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`TIMEOUT ${timeoutMs}ms channel`);
      }
      throw error;
    }
    if (!response || !response.ok) throw new Error(`HTTP ${response?.status || 0}`);
    const text = typeof response.text === "function" ? await response.text() : "";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("通道返回的不是 JSON");
    }
    if (!data || typeof data !== "object") throw new Error("通道返回的不是 JSON 对象");
    return data;
  }

  throw new Error("没有可用的出站通道");
}

function clipChars(text, max) {
  const chars = Array.from(typeof text === "string" ? text : "");
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
}

function channelEndpoint(url, suffix) {
  return `${String(url || "").replace(/\/+$/, "")}${suffix}`;
}

/** 每路自己的超时；没有填就用类型默认值，配超了按这一路的上限收。 */
function channelTimeout(channel, fallback, max = 30000) {
  const value = Number(channel?.timeoutMs);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

/** 分数只在 0..1 有意义。解析不出数字给 null，由调用方判为这一路失败。 */
function scoreOf(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * systemone 单条答案的读数。
 *
 * 只认数字或数字串：显式 null / 缺项 / 字符串 "abc" 一律算「这条没答」，
 * 不能借 Number(null) === 0 混成一张反对票。
 */
function noulScoreOf(value) {
  if (typeof value === "number") return scoreOf(value);
  if (typeof value === "string" && value.trim()) return scoreOf(Number(value));
  return null;
}

/**
 * 宿主模型通道的通用调用。askRerankModel 与可配置的 model 通道共用这一份；
 * 唯一区别是模型标识与超时由调用方给。
 */
async function askModelChannel(sdk, { modelRef = "", prompt = "", timeoutMs = RERANK_TIMEOUT_MS } = {}) {
  const models = sdk?.models;
  if (!models) throw new Error("宿主没有提供 ctx.models");

  const ref = typeof modelRef === "string" ? modelRef.trim() : "";
  const picked = ref ? parseModelRef(ref) : null;
  if (picked && typeof models.stream !== "function") {
    throw new Error("宿主没有提供 ctx.models.stream");
  }
  if (!picked && typeof models.utility !== "function") {
    throw new Error("宿主没有提供 ctx.models.utility");
  }

  const requestId = `openviking-rerank-${randomUUID()}`;
  const base = {
    requestId,
    messages: [{ role: "user", content: prompt }],
    maxTokens: RERANK_MAX_TOKENS,
    temperature: 0,
  };

  let work;
  if (picked) {
    work = Promise.resolve(
      models.stream({ ...base, provider: picked.provider, model: picked.model }),
    ).then(readGateStreamText);
  } else {
    work = Promise.resolve(models.utility({ ...base, scope: "app" })).then((result) => {
      if (typeof result?.text !== "string") throw new Error("utility 没有返回文本");
      return result.text;
    });
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    try {
      Promise.resolve(models.cancel(requestId)).catch(() => {});
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 问宿主模型哪些候选真正有用。
 *
 * 保留旧签名：没有启用任何通道时，这就是兜底那一路。
 * 超时 / 抛错都抛给调用方，由调用方决定“保留全部”。
 */
export async function askRerankModel(sdk, switches, prompt) {
  return askModelChannel(sdk, {
    modelRef: rerankModelOf(switches),
    prompt,
    timeoutMs: RERANK_TIMEOUT_MS,
  });
}

/** OpenAI 兼容 /v1/rerank：一次带上全部候选，按 relevance_score 打分。 */
async function scoreRerankChannel(sdk, channel, query, items) {
  const data = await postJson(
    sdk,
    channelEndpoint(channel.url, "/v1/rerank"),
    {
      model: channel.model,
      query,
      documents: items.map((item) => clipChars(item.text, RERANK_DOCUMENT_CHARS)),
    },
    channelTimeout(channel, RERANK_CHANNEL_TIMEOUT_MS),
  );

  const list = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
      ? data.data
      : null;
  if (!list || !list.length) throw new Error("rerank 没有返回 results");

  const scores = new Array(items.length).fill(0);
  list.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") throw new Error("rerank 结果项不是对象");
    const index = Number.isInteger(entry.index) ? entry.index : position;
    const score = scoreOf(entry.relevance_score ?? entry.score);
    if (score === null) throw new Error("rerank 结果缺少 relevance_score");
    if (index >= 0 && index < items.length) scores[index] = score;
  });
  return scores;
}

/**
 * 把用户问题与候选列表拼成 systemone 的 state。
 *
 * 序号是 rN 与候选下标的唯一纽带：只顺序编号，只在放不下时截断尾部，
 * 所以「第 N 条」永远对应 items[N-1]。返回真正收进去的条数，调用方按它生成 r1..rN。
 */
export function buildSystemOneState(query, items) {
  const list = (Array.isArray(items) ? items : []).map((item) =>
    typeof item === "string" ? item : item?.text,
  );
  const head = `用户问题：${clipChars(query, SYSTEMONE_STATE_MAX_CHARS)}\n候选列表：`;
  const lines = [];
  let length = charLength(head);
  for (const raw of list) {
    const text = clipChars(typeof raw === "string" ? raw : "", SYSTEMONE_DOCUMENT_CHARS);
    const line = `${lines.length + 1}. ${text}`;
    const cost = charLength(line) + 1; // 前面那行换行
    if (length + cost > SYSTEMONE_STATE_MAX_CHARS) break;
    length += cost;
    lines.push(line);
  }
  return {
    state: lines.length ? `${head}\n${lines.join("\n")}` : head,
    count: lines.length,
  };
}

/**
 * llama.cpp /v1/systemone：全部候选拼进同一个 state，一次请求问回全部概率。
 *
 * 逐条串行并不更快（每问一次前向），批量省的是 HTTP 往返和重复的 state 编码。
 * 返回数组与 items 等长：没问的（超过 8 条、state 放不下、宿主没答）一律 null，
 * 这些位置不参与这一路的标准化，但仍然是合法下标，供其它路投票。
 */
async function scoreSystemOneChannel(sdk, channel, query, items) {
  const scores = new Array(items.length).fill(null);
  const asked = items.slice(0, SYSTEMONE_MAX_CANDIDATES);
  if (!asked.length) return scores;

  const { state, count } = buildSystemOneState(query, asked);
  if (!count) return scores;

  const questions = {};
  for (let position = 1; position <= count; position += 1) {
    questions[`r${position}`] = { type: "noul", instructions: systemoneInstructions(position) };
  }

  const data = await postJson(
    sdk,
    channelEndpoint(channel.url, "/v1/systemone"),
    { model: channel.model, state, questions },
    channelTimeout(channel, SYSTEMONE_CHANNEL_TIMEOUT_MS, SYSTEMONE_TIMEOUT_MAX_MS),
  );

  const answers = data?.answers;
  let missing = 0;
  for (let position = 1; position <= count; position += 1) {
    const score = noulScoreOf(answers?.[`r${position}`]?.noul);
    if (score === null) missing += 1;
    else scores[position - 1] = score;
  }
  // 超过一半没答：不是个别缺项，是这一路整体不可信，整路弃权。
  if (missing * 2 > count) {
    throw new Error(`systemone 有 ${missing}/${count} 条没有返回分数`);
  }
  return scores;
}

/** 宿主模型通道：沿用编号清单，挑中 1、未挑中 0。 */
async function scoreModelChannel(sdk, switches, channel, query, items) {
  const prompt = renderRerankPrompt(rerankPromptOf(switches), query, items);
  if (!prompt) throw new Error("重排提示词为空");

  const answer = channel.legacy
    ? await askRerankModel(sdk, switches, prompt)
    : await askModelChannel(sdk, {
        modelRef: channel.model,
        prompt,
        timeoutMs: channelTimeout(channel, RERANK_MODEL_CHANNEL_TIMEOUT_MS),
      });
  const indexes = parseRerankAnswer(answer, items.length);
  if (indexes === null) throw new Error("模型回答解析不出编号");
  const picked = new Set(indexes);
  return items.map((_, index) => (picked.has(index) ? 1 : 0));
}

/**
 * 这一轮实际要跑的通道。
 *
 * 有启用通道就按配置跑；一个启用通道都没有时，退回旧的 rerankPrompt / rerankModel
 * 那一路（等价于一个 weight=1 的 model 通道），已有配置不会突然失灵。
 */
export function rerankChannelsOf(switches) {
  const raw = switches?.rerankChannels;
  const configured = Array.isArray(raw) ? raw : parseRerankChannels(raw);
  const enabled = configured.filter((channel) => channel && channel.enabled !== false);
  if (enabled.length) return enabled;
  return [
    {
      type: "model",
      name: "兜底模型",
      url: "",
      model: rerankModelOf(switches),
      weight: 1,
      enabled: true,
      legacy: true,
    },
  ];
}

/**
 * 一路分数先在自己这批候选内做 min-max 标准化，拉平到 0..1。
 *
 * 三种通道的量纲完全不同：relevance_score 常落在 0..0.9，noul 落 0.04..0.91，
 * model 那路干脆是 0/1。不标准化就直接加权，等于用三把不同的尺子量同一样东西，
 * 跨度大的那把会自动盖住跨度小的那把。
 *
 * 全部候选同分（max === min）时返回 null：这一路在这批上没有区分力，
 * 投出去也是废票，顺便避开除零。
 * 例外：全 0（max === 0）不是“没有区分力”，是这一路明确说一条都不要，
 * 按全 0 参与合并，交给 dropRejectedIndexes 去落实。
 *
 * null 表示「这一路没给这条打分」（systemone 只问前 8 条、某条作答缺失）：
 * 它不参与 min/max，也不表态，在 normalized 里保持 null。
 */
export function normalizeChannelScores(scores) {
  if (!Array.isArray(scores) || !scores.length) return null;
  const absent = (raw) => raw === null || raw === undefined;
  let min = Infinity;
  let max = -Infinity;
  let seen = 0;
  for (const raw of scores) {
    if (absent(raw)) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    if (value < min) min = value;
    if (value > max) max = value;
    seen += 1;
  }
  if (!seen) return null;
  if (!(max > min)) {
    if (max === 0) {
      return {
        min: 0,
        max: 0,
        normalized: scores.map((raw) => (absent(raw) ? null : 0)),
        allZero: true,
      };
    }
    return null;
  }
  const span = max - min;
  return {
    min,
    max,
    normalized: scores.map((raw) => (absent(raw) ? null : (Number(raw) - min) / span)),
  };
}

/**
 * 先标准化、再加权合并。只统计成功且未弃权的通道；全部弃权时返回 null，
 * 调用方据此原样保留全部候选。
 * 纯函数，测试可以直接喂原始分数。
 */
export function mergeRerankScores(results, total) {
  if (!Array.isArray(results) || !Number.isFinite(total) || total <= 0) return null;
  const active = [];
  for (const result of results) {
    if (!result || !result.ok || result.abstained === true) continue;
    if (!Number.isFinite(result.weight) || result.weight <= 0) continue;

    let normalized = null;
    if (Array.isArray(result.normalized) && result.normalized.length === total) {
      // null = 这一路没给这条打分，原样留空，合并时按 0 贡献算。
      normalized = result.normalized.map((value) =>
        value === null || value === undefined ? null : Number(value),
      );
      if (normalized.some((value) => value !== null && !Number.isFinite(value))) normalized = null;
    }
    if (!normalized) {
      if (!Array.isArray(result.scores) || result.scores.length !== total) continue;
      const scaled = normalizeChannelScores(result.scores);
      if (!scaled) continue;
      normalized = scaled.normalized;
    }
    active.push({ weight: result.weight, normalized });
  }
  if (!active.length) return null;

  // 逐条算分母：这一条没被某路打分的，那一路就不该对它投票。
  // 若把 null 当 0 算进去，只需这一路漏一条，那条就会被自家分母拉下去。
  return Array.from({ length: total }, (_, index) => {
    let sum = 0;
    let weightSum = 0;
    for (const result of active) {
      const value = result.normalized[index];
      if (value === null || value === undefined) continue;
      sum += value * result.weight;
      weightSum += result.weight;
    }
    return weightSum > 0 ? sum / weightSum : 0;
  });
}

/** 合并分降序；同分保持原顺序。排序不管取舍，取舍看 dropRejectedIndexes。 */
export function rankRerankIndexes(scores) {
  if (!Array.isArray(scores)) return [];
  return scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.index);
}

/**
 * 丢掉“所有成功通道的原始分都是 0”的候选。
 *
 * 只看原始分，不看标准化后的分：标准化后每路的最小值一定是 0，
 * 要是拿它当“明确不要”，任何连续通道的末位都会被丢，等于标准化本身在削召回。
 * 原始分 0 才是真的投了反对票（model 没挑中、rerank 给了 0）。
 * null（这一路没给这条打分）不算反对票：没人打分的那条照旧保留。
 */
export function dropRejectedIndexes(indexes, results) {
  if (!Array.isArray(indexes)) return [];
  const active = (Array.isArray(results) ? results : []).filter(
    (result) => result && result.ok && result.abstained !== true && Array.isArray(result.scores),
  );
  if (!active.length) return indexes;
  return indexes.filter((index) => {
    const scored = active
      .map((result) => result.scores[index])
      .filter((value) => value !== null && value !== undefined);
    if (!scored.length) return true;
    return scored.some((value) => Number(value) > 0);
  });
}

/**
 * 跑一轮多路精排。
 *
 * 每路先在自己批内 min-max 标准化，再按权重平均；同分的一路直接弃权。
 * 没一路可用 -> fallback=true、indexes 是全部候选（不排序、不删）。
 * 单路失败只让那一路弃权，不参与分母，也不会把它的失败当成 0 分。
 */
export async function runRerankChannels({ sdk, switches, query, items, channels } = {}) {
  const startedAt = Date.now();
  // 接受 [{text}] 与纯字符串两种候选，测试可直接传文本。
  const candidates = (Array.isArray(items) ? items : []).map((item) =>
    typeof item === "string" ? { text: item } : item,
  );
  const list = Array.isArray(channels) && channels.length ? channels : rerankChannelsOf(switches);

  const results = await Promise.all(
    list.map(async (channel) => {
      const channelStarted = Date.now();
      try {
        let scores;
        if (channel.type === "rerank") {
          scores = await scoreRerankChannel(sdk, channel, query, candidates);
        } else if (channel.type === "systemone") {
          scores = await scoreSystemOneChannel(sdk, channel, query, candidates);
        } else if (channel.type === "model") {
          scores = await scoreModelChannel(sdk, switches, channel, query, candidates);
        } else {
          throw new Error(`未知通道类型 ${channel.type}`);
        }
        const scaled = normalizeChannelScores(scores);
        if (!scaled) {
          // 所有候选同分：这一路在这批上没有区分力，弃权，不进分母。
          // 全是 null 是另一回事：这一路一条都没打分，同样没票可投。
          return {
            channel,
            weight: channel.weight,
            ok: false,
            abstained: true,
            scores,
            error: Array.isArray(scores) && scores.some((score) => score !== null && score !== undefined)
              ? "候选全部同分，这一路没有区分力"
              : "这一路没有给任何候选打分",
            elapsedMs: Date.now() - channelStarted,
          };
        }
        return {
          channel,
          weight: channel.weight,
          ok: true,
          scores,
          normalized: scaled.normalized,
          range: [scaled.min, scaled.max],
          elapsedMs: Date.now() - channelStarted,
        };
      } catch (error) {
        return {
          channel,
          weight: channel.weight,
          ok: false,
          error: reasonOf(error),
          elapsedMs: Date.now() - channelStarted,
        };
      }
    }),
  );

  const merged = mergeRerankScores(results, candidates.length);
  const fallback = merged === null;
  const indexes = fallback
    ? candidates.map((_, index) => index)
    : dropRejectedIndexes(rankRerankIndexes(merged), results);

  return {
    // 探针把两段数字都留下：原始分数看量纲，标准化分数看实际贡献。
    channels: results.map((result) => ({
      name: result.channel.name || "",
      type: result.channel.type,
      weight: result.channel.weight,
      ok: result.ok,
      abstained: result.abstained === true,
      elapsedMs: result.elapsedMs,
      ...(Array.isArray(result.scores) ? { scores: result.scores } : {}),
      ...(result.ok
        ? { normalized: result.normalized, range: result.range }
        : { error: result.error }),
    })),
    merged,
    indexes,
    kept: indexes.map((index) => candidates[index]),
    fallback,
    channelCount: list.length,
    elapsedMs: Date.now() - startedAt,
  };
}

function sampleFile(dataDir, sessionId) {
  const safe = String(sessionId || "unknown")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 160);
  return path.join(dataDir || ".", "rerank-samples", `${safe}.json`);
}

/**
 * 留一份最近一轮的真实候选，供面板「测试」按钮复跑，不注入。
 * 写不进去不影响召回，所以整段吞异常。
 */
export function writeRerankSample(sdk, sessionId, { query, items } = {}) {
  if (!sessionId || !Array.isArray(items)) return;
  try {
    const file = sampleFile(sdk?.dataDir, sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = {
      sessionId,
      at: new Date().toISOString(),
      query: clipChars(typeof query === "string" ? query : "", 2000),
      items: items
        .slice(0, RERANK_SAMPLE_ITEMS_MAX)
        .map((item) => ({
          text: clipChars(
            typeof item === "string" ? item : item?.text,
            RERANK_DOCUMENT_CHARS,
          ),
        }))
        .filter((item) => item.text),
    };
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, "utf8");
    fs.renameSync(tmp, file);
  } catch {
    /* 样本只是测试用的，留不下来也不能影响这一轮 */
  }
}

/** 读回最近一轮候选。没有样本时返回 null。 */
export function readRerankSample(sdk, sessionId) {
  if (!sessionId) return null;
  try {
    const raw = fs.readFileSync(sampleFile(sdk?.dataDir, sessionId), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => ({ text: typeof item?.text === "string" ? item.text : "" }))
          .filter((item) => item.text)
      : [];
    if (!items.length) return null;
    return {
      at: typeof parsed.at === "string" ? parsed.at : "",
      query: typeof parsed.query === "string" ? parsed.query : "",
      items,
    };
  } catch {
    return null;
  }
}

/**
 * 模型回答 -> 要保留的候选下标（0 基）。
 *
 *   文本含「无」且完全没有数字 -> []（全都用不上）
 *   提取 1..total 之间的整数、去重、转 0 基 -> 下标数组
 *   什么都没提取到（包括数字全都越界）-> null（解析失败，调用方保留全部）
 *
 * null 与 [] 必须分开：前者是“看不懂，别删东西”，后者是“模型明确说都不要”。
 */
export function parseRerankAnswer(text, total) {
  const body = typeof text === "string" ? text : "";
  const limit = Number.isFinite(total) ? Math.floor(total) : 0;
  if (body.includes("无") && !/\d/.test(body)) return [];

  const kept = new Set();
  for (const match of body.matchAll(/\d+/g)) {
    const value = Number.parseInt(match[0], 10);
    if (!Number.isFinite(value)) continue;
    if (value < 1 || value > limit) continue;
    kept.add(value - 1);
  }
  if (!kept.size) return null;
  return [...kept].sort((a, b) => a - b);
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
 * 从召回响应里读出候选条目，只认实测过的三处，按服务端"最省事到最原始"排列：
 *   1. rendered —— mode=context 时服务端拼好的扁平 XML 块，视为单条；
 *   2. digest   —— 摘要，视为单条；
 *   3. entries[].text —— 原始命中条目，逐条保留，跳过空项。
 * 其余形状一律给空数组（调用方据此 return undefined 并告警一次），不猜字段名。
 *
 * 重排必须在拼成一段文本之前做，所以这里保留条目边界；
 * extractRecallText 只是把它按原有规则拼回去。
 */
export function extractRecallItems(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ text }] : [];
  }
  if (!value || typeof value !== "object") return [];

  const rendered = textOf(value.rendered);
  if (rendered) return [{ text: rendered }];

  const digest = textOf(value.digest);
  if (digest) return [{ text: digest }];

  if (Array.isArray(value.entries)) {
    return value.entries
      .map((entry) => (entry && typeof entry === "object" ? textOf(entry.text) : ""))
      .filter(Boolean)
      .map((text) => ({ text }));
  }

  return [];
}

export function extractRecallText(value) {
  const text = extractRecallItems(value)
    .map((item) => item.text)
    .join("\n\n")
    .trim();
  return text;
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

    // 判据看最后一条用户原话，不看拼接后的查询：gate 回答的是“这句话需不需要查记忆”，
    // queryMode 回答的是“用什么去查”，两件事分开。若用拼接结果判断，context 模式
    // 一旦有历史就必然超 8 字，rules 会被整个抵消掉。
    // 召回判断：rules 只看极短纯操作指令；llm 让宿主模型判断。
    // llm 失败 / 超时 / 没权限一律按「召回」走——判断失败不能变成漏召回。
    let gateSkip = null;
    if (switches.recallGate === "llm") {
      const prompt = gatePromptOf(switches);
      if (!prompt) {
        // 空提示词不是“用默认”：没有判据就不拦，模型根本不问。
        log(sdk, "info", `gate: llm prompt empty, recall anyway (session=${sessionId})`);
      } else {
        try {
          const answer = await askGateModel(sdk, switches, lastText);
          if (!gateAnswerRecalls(answer)) {
            gateSkip = { by: "llm", reason: "llm-no-need" };
          }
        } catch (error) {
          log(
            sdk,
            "info",
            `gate: llm failed, recall anyway (session=${sessionId}) ${reasonOf(error)}`,
          );
        }
      }
    } else if (shouldSkipRecall(lastText, switches.recallGate)) {
      gateSkip = { by: "rules", reason: "short-operation-command" };
    }

    if (gateSkip) {
      log(
        sdk,
        "info",
        `gate: skipped by=${gateSkip.by} (session=${sessionId} chars=${charLength(lastText)})`,
      );
      if (switches.probe && typeof options.probe === "function") {
        try {
          await options.probe("recall/gate-skip", {
            session,
            query: lastText,
            reason: gateSkip.reason,
            by: gateSkip.by,
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

    const items = extractRecallItems(result);
    if (!items.length) {
      warnShapeOnce(sdk, result);
      log(sdk, "info", `skip: no text in response (session=${sessionId})`);
      return undefined;
    }

    // 重排必须在拼成一段文本之前做：拼完就分不清候选边界了。
    // 默认 off，一次通道都不跑；只有 llm 且候选 ≥ 2 条才值得精排。
    let kept = items;
    if (switches.rerank === "llm" && items.length >= 2) {
      // 面板「测试」按钮要拿最近一轮的真实候选复跑；先留样本，失败不影响本轮。
      writeRerankSample(sdk, sessionId, { query: lastText, items });

      const outcome = await runRerankChannels({
        sdk,
        switches,
        query: lastText,
        items,
      });
      kept = outcome.kept;

      for (const channel of outcome.channels) {
        if (!channel.ok) {
          log(
            sdk,
            "info",
            `rerank: channel ${channel.type} failed, abstained (session=${sessionId}) ${channel.error}`,
          );
        }
      }
      if (outcome.fallback) {
        log(sdk, "info", `rerank: all channels abstained, keep all (session=${sessionId})`);
      }

      if (switches.probe && typeof options.probe === "function") {
        try {
          await options.probe("recall/rerank", {
            session,
            query: lastText,
            candidates: items.length,
            enabledChannels: outcome.channelCount,
            channels: outcome.channels,
            kept: kept.length,
            fallback: outcome.fallback,
            elapsedMs: outcome.elapsedMs,
          });
        } catch {
          /* 探针写不进去不能影响本轮对话 */
        }
      }

      if (!kept.length) {
        // 有通道成功，且把所有候选都打了 0 分：本轮不注入。
        log(sdk, "info", `rerank: dropped all (session=${sessionId})`);
        return undefined;
      }
    }

    const text = kept
      .map((item) => item.text)
      .join("\n\n")
      .trim();

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

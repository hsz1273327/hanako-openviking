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
  GATE_DECISION_THRESHOLD_DEFAULT,
  RERANK_FALLBACK_CHANNEL_TYPE,
  RERANK_FALLBACK_MODEL,
  RERANK_FALLBACK_NONE,
  RERANK_FALLBACK_VALUES,
  ensureModelChannel,
  normalizeGateContext,
  normalizeGateContextPrompt,
  normalizeGateContextTurns,
  normalizeGateDecisionThreshold,
  normalizeGateFallback,
  normalizeServiceTimeout,
  parseRerankChannels,
  readConnection,
  readExcludedPeers,
  readSwitches,
  serviceTimeoutOrDefault,
} from "../ov/settings.js";
import { effective, patchSession, readSession } from "../state/session.js";
import { assembleCandidates, peerOfUri } from "./assemble.js";
import {
  MEMORY_TAG_CLOSE,
  MEMORY_TAG_OPEN,
  estimateTokens,
  injectMemory,
  lastUserText,
  recallQueryPlan,
  recentDialogue,
  trimToBudget,
} from "../inject/plan.js";

const LOG_PREFIX = "openviking recall";

/** 召回判断的上限：超过这个字数的文本一律召回。 */
export const GATE_MAX_CHARS = 8;

/**
 * 请求失败只归一个类别，不抄原文、不抄地址。
 *
 * 两类够了：超时（请求发出去了，服务端没在预算内答完）与其它（连不上、代理挂了、
 * 服务端报错）。这两类的处置完全相反——超时就该放宽 recallTimeoutMs 或缩短 queryChars，
 * 其它该去查地址与 key——所以先分清它们，再看别的。
 * 判据只看 code 与 message 的关键词：宿主 / 代理 / fetch 三层的超时都是这套写法。
 */
const TIMEOUT_HINTS = /timeout|timed out|etimedout|esockettimedout|aborted/i;

export function recallErrorKind(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code.includes("TIMEOUT")) return "timeout";
  const name = String(error?.name || "");
  if (name === "TimeoutError") return "timeout";
  const message = String(error?.message || error || "");
  if (TIMEOUT_HINTS.test(message)) return "timeout";
  return "network";
}

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
 * 判断失败时的兜底：recall（照常召回，默认）或 rules（退到规则判断）。
 *
 * 只有 llm / decision 两档有失败路径，但这里不按档位过滤：调用方只在两档的失败
 * 分支里用它，所以 off / rules 拿到什么都没人看。取值仍走一遍归一化，脏值回 recall。
 */
export function gateFallbackOf(switches) {
  return normalizeGateFallback(switches?.gateFallback);
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
 * 冒烟会比对 ui-src/src/lib/recall-layers.js 里的副本与这里的字面量。
 */
export const DEFAULT_GATE_PROMPT = `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。

用户消息：{{message}}`;

/** 精排模板里的两个占位符：当前消息，以及带编号的候选清单。 */
export const RERANK_MESSAGE_PLACEHOLDER = "{{message}}";
export const RERANK_CANDIDATES_PLACEHOLDER = "{{candidates}}";

/**
 * 判别模型题面里的序号占位符。
 *
 * 不是候选清单那种模板：一份题面只问一条候选，所以这里换进去的是一个数字。
 */
export const SYSTEMONE_N_PLACEHOLDER = "{{n}}";

/**
 * 判别模型的默认题面。导出给测试与面板文案对照。
 * 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 里存了逐字相同的一份，
 * 冒烟会比对两边；rerankSystemonePrompt 为空时就用这段。
 */
export const DEFAULT_RERANK_SYSTEMONE_PROMPT = "第 {{n}} 条候选能帮助回答用户的问题吗";

/**
 * llm 精排的默认提示词模板。导出给测试与面板文案对照。
 * 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 里存了逐字相同的一份，
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

/**
 * 决策档的判据渲染：与 renderGatePrompt 只差一条规矩。
 *
 * 决策模型的 state 里已经坐着这条用户消息，判据再自动把消息接一遍就成了
 * 同一句话发两次（一个喂材料、一个喂问题），读数会飘。所以这里：
 *   1. 写了 {{message}} 就地替换（用户想把消息拼进问法，随他）；
 *   2. 没写就只发这句判据，消息本身留在 state 里。
 * 空模板仍然返回空串：调用方据此不发请求、照常召回。
 */
export function renderDecisionPrompt(template, message) {
  const text = typeof template === "string" ? template : "";
  if (!text) return "";
  const body = typeof message === "string" ? message : "";
  return text.split(GATE_MESSAGE_PLACEHOLDER).join(body);
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
 * 精排模板 + 消息 + 候选 -> 发给模型的那一段文本。
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

/**
 * 精排提示词：与 gate 相反，空串不是“不问”，而是“用内置默认模板”。
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

/** 精排比判断多要几个编号，但同样不能把这一轮挂在模型上。 */
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
 * 它一次问完全部候选：实测 5 条约 2.9s，8 条接近 5s。
 * 所以基础值给 3500（留给 5 条约 20% 余量），候选每多一条再加 700，
 * 上限 8000——超了不如直接弃权，别把这一轮挂住。
 */
export const SYSTEMONE_CHANNEL_TIMEOUT_MS = 3500;
export const SYSTEMONE_TIMEOUT_MAX_MS = 8000;

/**
 * systemone 一次只问前这么多条：每题一次前向，实测 5 条约 2.9s，
 * 再往上就顶超时上限了，多问的收益抵不过整路弃权。
 */
export const SYSTEMONE_MAX_CANDIDATES = 5;

/** 不手动配超时时，每多一条候选多给这么多时间。 */
export const SYSTEMONE_TIMEOUT_PER_CANDIDATE_MS = 700;

/** 送进 systemone 的单条候选正文上限。全部候选挤同一个 state，长条目会挤掉后面的人。 */
export const SYSTEMONE_DOCUMENT_CHARS = 500;

/** systemone 的 state 总长上限。放不下的候选不再塞进去，按未打分处理。 */
export const SYSTEMONE_STATE_MAX_CHARS = 12000;

/**
 * 判别模型（systemone）的逐条提问。
 *
 * /v1/systemone 的设计是「一个 state + 多个问题」，不是「多条 state 各问一次」。
 * 所以每条候选配一个问题，序号必须与 state 里候选列表的编号一一对应。
 *
 * 题面可配（rerankSystemonePrompt），{{n}} 是候选在本批里的序号（从 1 开始）：
 *   1. 写了 {{n}} 就在原地换成序号（多处出现都换）；
 *   2. 没写就把序号补在题面最前面（默认题面带 {{n}}，所以空配置时的输出
 *      与加这个配置之前逐字一致：「第 1 条候选能帮助回答用户的问题吗」）；
 *   3. 空串 / 全是空白 = 用内置的默认题面。
 *
 * 与 renderRerankPrompt 不同：那边的空模板返回空串（等于不问），这边不允许「没有问题」——
 * systemone 的 questions 少一项就等于那一条候选没被打分，静默少一条比报错更难查。
 */
export function renderSystemoneInstruction(template, position) {
  const index = Math.max(1, Math.floor(Number(position) || 1));
  const text =
    typeof template === "string" && template.trim() ? template : DEFAULT_RERANK_SYSTEMONE_PROMPT;
  if (text.includes(SYSTEMONE_N_PLACEHOLDER)) {
    return text.split(SYSTEMONE_N_PLACEHOLDER).join(String(index));
  }
  return `第 ${index} 条 ${text}`;
}

/** 默认题面渲染出来的那一句（没有配题面时运行时实际发的东西）。 */
export function systemoneInstructions(position) {
  return renderSystemoneInstruction(DEFAULT_RERANK_SYSTEMONE_PROMPT, position);
}

/** 判别模型题面的读数：空串表示用默认题面（与 rerankPrompt 同一个取舍）。 */
export function systemonePromptOf(switches) {
  const value =
    typeof switches?.rerankSystemonePrompt === "string"
      ? switches.rerankSystemonePrompt.trim()
      : "";
  return value || DEFAULT_RERANK_SYSTEMONE_PROMPT;
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
 * 服务端鉴权头：只有 key 非空时才加 Authorization。
 *
 * 空 key 绝不能发一个 `Bearer `：不少服务看到这个头就认为请求要鉴权，直接 401，
 * 于是「密钥留空 = 服务没开鉴权」这种正当配置反而跑不通。
 * 带换行的 key 一律当没配：拼进头会让 fetch 抛 TypeError，而那个异常发生在
 * 召回路径上，用户只会看到一轮静默弃权。写入侧与读取侧都拦过一遍，这里是最后一道。
 */
function serviceAuthHeaders(key) {
  const value = typeof key === "string" ? key.trim() : "";
  if (!value || /[\r\n]/.test(value)) return {};
  return { Authorization: `Bearer ${value}` };
}

/**
 * 通过现有出口发一次 JSON POST。
 *
 * 优先受管运行时（runtime.fetch 的代理信封支持任意 http/https URL）；
 * 运行时没起来时退回 ctx.network.fetch（受 manifest 白名单限制）。
 * 两条路都不通时直接抛，调用方把这一路当弃权处理。
 *
 * headers 是可选的服务级鉴权头：content-type 先写、额外头后写，覆盖不了 content-type
 * （也没有任何调用方需要覆盖它）。两条出口都并进各自的 headers，不复制第二个请求函数。
 */
async function postJson(sdk, url, payload, timeoutMs, headers = {}) {
  const transport = transportFor(sdk);
  const body = JSON.stringify(payload);
  const extra = headers && typeof headers === "object" ? headers : {};
  const requestHeaders = { "content-type": "application/json", ...extra };

  if (transport.mode === "runtime") {
    const out = await raceTimeout(
      transport.send(url, {
        method: "POST",
        headers: requestHeaders,
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
      headers: requestHeaders,
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

/**
 * systemone 的超时：手动配了就用配的（仍受上限管），没配就按候选数自适应。
 *
 * 实测 5 条约 2.9s，所以基础值给 3500；每条候选再多给 700，顶到上限为止。
 * 固定一个数不行：5 条和 1 条差一个数量级，按大的给会让 1 条那种白等。
 */
export function systemoneTimeoutFor(channel, count) {
  const given = Number(channel?.timeoutMs);
  if (Number.isFinite(given) && given > 0) {
    return Math.min(Math.floor(given), SYSTEMONE_TIMEOUT_MAX_MS);
  }
  const asked = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const adaptive = Math.max(
    SYSTEMONE_CHANNEL_TIMEOUT_MS,
    asked * SYSTEMONE_TIMEOUT_PER_CANDIDATE_MS,
  );
  return Math.min(adaptive, SYSTEMONE_TIMEOUT_MAX_MS);
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

/* ---------------- 决策模型判断（decision 档） ----------------
 *
 * 这一档与 llm 档是两条路数：llm 让宿主的生成式模型回答一句话，
 * decision 让决策模型（/v1/systemone）做一道选择题——这句话自己说完整了，
 * 还是得靠上文才知道在说什么。题型是 type=choice + criteria 两条内置描述，
 * 服务端回 choice 与 confidence，不生成文本。所以它不吃 gatePrompt / gateModel，
 * 用的是「打分服务」那组配置（systemoneService*）、自己的题面 gateDecisionPrompt，
 * 以及自己的召回门槛 gateDecisionThreshold（confidence 要够得着才召回）。
 *
 * 为什么不是 noul：noul 等于让模型对一句话泛泛打一个相似度，实测真实对话 17 条
 * 分数全挤在 0.20–0.42，该召回的十条一条没判出来。choice + criteria 把判定标准
 * 写成两条互斥的描述，同一个服务同一个模型就能分得开。
 */

/**
 * 决策那一档的判据：空串 = 没有判据（照常召回），与 gatePromptOf 同一条语义。
 *
 * 默认题面（DEFAULT_GATE_DECISION_PROMPT，在 src/ov/settings.js）是配置的默认值，
 * 不是空值时的兜底：用户把这一格清空就是「不想判」，不能偷偷把默认题面塞回去。
 */
export function gateDecisionPromptOf(switches) {
  return typeof switches?.gateDecisionPrompt === "string"
    ? switches.gateDecisionPrompt.trim()
    : "";
}

/**
 * 内置判据：两个选项各配一段「什么样的句子算这一类」。
 *
 * choice 题型必须带 criteria，缺了服务端直接 400（questions.q: "criteria" must be
 * a non-empty object）。这两段是判定标准，不由用户改——用户改的是题面
 * gateDecisionPrompt。措辞是实测调过参的，照抄，不要顺手改写。
 */
export const DECISION_GATE_CRITERIA = Object.freeze({
  need: "这句话里有指代或省略。比如「这个」「那个」「它」「修吧」「可以」「进度如何」，或者「那就不对了」「也就是说」这种接着上文的话。必须知道之前聊过什么，才知道它指的是什么、在回应哪件事。还有一种情况也算：问一个只有在之前对话里才出现过的名词是什么、干什么用的（例如「探针是干嘛的」「那些胶囊有啥用」），因为不知道前文就不知道在问哪个东西。",
  standalone: "这句话自己把话说完整了。它给出了具体对象、具体诉求或具体判断，即使完全没有上下文，也能直接照着做或直接回答。问句里主语和对象都写全了的（例如「主进程的 node 能不能用」），算这一边。",
});

/**
 * 带前文模式的判据：问的不是「这句话自不自足」，而是「上面那几轮里有没有」。
 *
 * 同一道 choice 题，选项名不变（need / standalone），变的只是两段描述的看的地方：
 * 前文已经解释过的东西算 standalone（不用翻更早的记录），前文没出现过的算 need。
 */
export const DECISION_GATE_CONTEXT_CRITERIA = Object.freeze({
  need: "这句话要的信息，上面的对话里没有。开了个新话题；问一件在这次会话里从没提过的事；提到一个上面没出现过的名词、文件、项目、配置项；要查证一个之前没讨论过的结论。还有一种要特别注意：用户明确指向这次会话之前的事，比如「上次」「之前跟你提过」「你还记得…吗」「我们之前是不是讨论过」，即使上面的对话里有相似的词，也属于这一边——他要的是更早的记录。",
  standalone: "这句话要的信息，上面的对话里已经有了；或者它自己就把话说全了，不需要额外信息。上面提到过的名词、正在处理的那件事、刚刚说过的结论，都算这一边。",
});

/** 这一轮看不看前文：认不出的值按 none（与读取侧同一个归一化）。 */
export function gateContextOf(switches) {
  return normalizeGateContext(switches?.gateContext);
}

/** 带前文时带几轮：越界 / 非整数 / 缺项一律回 4。 */
export function gateContextTurnsOf(switches) {
  return normalizeGateContextTurns(switches?.gateContextTurns);
}

/**
 * 带前文模式那份题面的读数：与 gateDecisionPromptOf 同一条语义。
 * 空串 = 没有判据（不是「偷偷用默认」）。
 */
export function gateContextPromptOf(switches) {
  return typeof switches?.gateContextPrompt === "string"
    ? normalizeGateContextPrompt(switches.gateContextPrompt).trim()
    : "";
}

/**
 * 默认召回门槛（need 且置信度不低于它才算需要召回）。
 *
 * 与配置默认值（src/ov/settings.js 的 DEFAULTS.gateDecisionThreshold）同一个数：调用方不给门槛
 * 时用它，所以「没配过」与「配了 0.45」是同一个行为。
 */
export const DECISION_GATE_THRESHOLD = GATE_DECISION_THRESHOLD_DEFAULT;

/**
 * 这一轮生效的召回门槛：配置项 gateDecisionThreshold（0–1，默认 0.45）。
 *
 * 归一化（非法值回 0.45）在读取侧已经做过一次，这里再走同一条函数，
 * 是为了让直接拿裸配置调用的地方（测试 / 将来的其它入口）也吃同一份边界。
 */
export function gateDecisionThresholdOf(switches) {
  return normalizeGateDecisionThreshold(switches?.gateDecisionThreshold);
}

/**
 * 没配超时时的默认值：这一档一次只问一个问题（单题一次前向），
 * 比 systemone 那套「5 题批量」小得多，但它挡在每一轮对话前面。
 */
export const DECISION_GATE_TIMEOUT_MS = 1200;

/**
 * 这一档自己的超时上限：配了 systemoneServiceTimeoutMs 也按这个数封顶。
 * 不能直接套 systemoneTimeoutFor：那条是按候选数自适应的，语义是「批量打分」。
 */
export const DECISION_GATE_TIMEOUT_MAX_MS = 2000;

/**
 * 决策这一档的服务读数：地址与模型都在才算配好了。
 *
 * 只填一半（存量里常见）整对当没配，与 resolveRerankChannel 的成对规则同口径。
 * 面板的状态行也按同一判据说话（ui-src/src/lib/recall-layers.js 的 decisionServiceView）。
 */
export function decisionGateServiceOf(switches) {
  const url =
    typeof switches?.systemoneServiceUrl === "string"
      ? switches.systemoneServiceUrl.trim()
      : "";
  const model =
    typeof switches?.systemoneServiceModel === "string"
      ? switches.systemoneServiceModel.trim()
      : "";
  const key = typeof switches?.systemoneServiceKey === "string" ? switches.systemoneServiceKey : "";
  const given = Number(switches?.systemoneServiceTimeoutMs);
  const timeoutMs =
    Number.isFinite(given) && given > 0
      ? Math.min(Math.floor(given), DECISION_GATE_TIMEOUT_MAX_MS)
      : DECISION_GATE_TIMEOUT_MS;
  return { url, model, key, timeoutMs, configured: Boolean(url && model) };
}

/**
 * 决策答案的读数：只认 choice + confidence 这一种形状。
 *
 * 旧格式（answers.q.noul 一个概率）不再算有效答案：那是「泛泛打一个相似度」的题型，
 * 实测分数全挤在 0.2–0.42。把它当「没答」，调用方据此照常召回，
 * 比拿一个错的读数去拦截安全。
 *
 * confidence 只认数字或数字串（与 noulScoreOf 同一条边界：显式 null / 缺项不算 0）；
 * choice 不是 need / standalone 的也算没答。
 */
function decisionAnswerOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const choice = value.choice === "need" || value.choice === "standalone" ? value.choice : "";
  if (!choice) return null;
  const confidence =
    typeof value.confidence === "number"
      ? scoreOf(value.confidence)
      : typeof value.confidence === "string" && value.confidence.trim()
        ? scoreOf(Number(value.confidence))
        : null;
  if (confidence === null) return null;
  return { choice, confidence };
}

/**
 * 问决策服务这条消息要不要查记忆，返回 { choice, confidence }。
 *
 * 判据看最后一条用户原话（调用方传进来的就是 lastText），与 llm 档同源，
 * 不看拼接后的查询。提示词复用 renderDecisionPrompt：谁想用占位符就把 {{message}}
 * 写进去，没写就只发题面；渲染后的那一段就是 instructions。
 *
 * context 是可选的前文（recentDialogue 的结果）：
 *   - 空串（默认）——行为与没加这个参数之前完全一样：state.content 就是最后一条
 *     用户消息，题面里的 {{message}} 也用它；
 *   - 非空——state.content = 前文 + 空行 + 当前消息，当前消息仍在最下面，
 *     criteria 换成 DECISION_GATE_CONTEXT_CRITERIA（问「上面有没有」而不是「自不自足」）。
 *     题面里的 {{message}} 仍然替换当前消息，不把整段前文再塞进 instructions。
 *
 * 题型固定 choice + criteria：criteria 缺了服务端 400，所以它跟着请求一起发，
 * 不放在用户可编辑的提示词里。两套 criteria 的选项名都是 need / standalone，
 * 判定逻辑（need 且 confidence 够门槛）不随模式变化。
 */
export async function askDecisionGate(sdk, switches, text, prompt, context = "") {
  const service = decisionGateServiceOf(switches);
  if (!service.configured) throw new Error("决策服务未配置");
  const body = typeof text === "string" ? text : "";
  const history = typeof context === "string" ? context.trim() : "";
  const withContext = Boolean(history);
  const stateContent = withContext ? `${history}\n\n${body}` : body;
  const data = await postJson(
    sdk,
    channelEndpoint(service.url, "/v1/systemone"),
    {
      model: service.model,
      state: { type: "text", content: stateContent },
      questions: {
        q: {
          type: "choice",
          instructions: renderDecisionPrompt(prompt, body),
          criteria: withContext ? DECISION_GATE_CONTEXT_CRITERIA : DECISION_GATE_CRITERIA,
        },
      },
    },
    service.timeoutMs,
    serviceAuthHeaders(service.key),
  );
  const answer = decisionAnswerOf(data?.answers?.q);
  if (!answer) {
    throw new Error("决策服务没有返回 answers.q.choice / answers.q.confidence");
  }
  return answer;
}

/**
 * 答案 -> 这一轮跳不跳召回。
 *
 * 需要召回 ⟺ choice === "need" 且 confidence >= 门槛；其余一律跳过召回。
 * 方向与 llm 档同源：need（有指代 / 省略）= 得靠上文，所以召回；
 * standalone（自己把话说完整）= 不靠上文，所以跳过。置信度用服务端算好的那一个，
 * 不拿 probabilities 重算；need 但置信度不够（< 门槛）按「不算需要召回」处理。
 *
 * 门槛由调用方按配置给（gateDecisionThresholdOf），不给就用默认 0.45。
 * 比的是 >=：等于门槛算「够」，所以跳过要求严格小于——差一个等号就是差一整条行为。
 * 形状不对的答案（没 choice / choice 不认识 / confidence 不是数）不该走到这里
 * （askDecisionGate 已经拦过），真到了也按「召回」处理——判断失败不能变成漏召回。
 */
export function decisionGateSkips(answer, threshold = DECISION_GATE_THRESHOLD) {
  if (!answer || typeof answer !== "object") return false;
  if (answer.choice !== "need" && answer.choice !== "standalone") return false;
  const confidence = Number(answer.confidence);
  if (!Number.isFinite(confidence)) return false;
  if (answer.choice === "standalone") return true;
  return confidence < normalizeGateDecisionThreshold(threshold);
}

/**
 * 宿主模型通道的通用调用。提示词由 scoreModelChannel 渲染好，模型标识与超时也由它给。
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
    serviceAuthHeaders(channel.serviceKey),
  );

  const list = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
      ? data.data
      : null;
  if (!list || !list.length) throw new Error("rerank 没有返回 results");

  const scores = new Array(items.length).fill(null);
  let rawScores = [];
  list.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") throw new Error("rerank 结果项不是对象");
    const raw = Number(entry.relevance_score ?? entry.score);
    if (!Number.isFinite(raw)) throw new Error("rerank 结果缺少 relevance_score");
    rawScores.push(raw);
    const index = Number.isInteger(entry.index) ? entry.index : position;
    if (index >= 0 && index < items.length) scores[index] = raw;
  });
  return {
    scores: squashRerankScores(scores, rawScores),
    scoreScale: rerankScoreScale(rawScores),
  };
}

/**
 * 这一批 rerank 原始分被当成哪种量纲处理：出现越界值就是 logit，否则是 probability。
 *
 * 判定本身是启发式：真有服务返回大于 1 的相关度会被误判成 logit。这里不改判定，
 * 只把结果显式记进探针，排序反常时能直接看出是不是误判，不用猜。
 */
export function rerankScoreScale(probe = []) {
  const list = (Array.isArray(probe) ? probe : []).filter((value) => Number.isFinite(Number(value)));
  return list.some((value) => Number(value) < 0 || Number(value) > 1)
    ? "logit"
    : "probability";
}

/**
 * 把 rerank 的原始分收拢到 0..1。
 *
 * 两类服务给的分数不是一个东西：Cohere 那派返回的就是 0..1 的相关度，
 * 而 llama.cpp 接的 bge-reranker 返回的是**交叉编码器的原始 logit**，实测能到 ±10。
 * 对 logit 直接做 clamp 会出两个坑：负分全变 0（被当成“明确不要”而丢掉候选），
 * 正分全变 1（排序信息没了，全正时整路还会计成“同分”而弃权）。
 * 所以：只要出现越界值，就判定这批是 logit，整批过 sigmoid；否则原样保留。
 * null（服务没给这一条的分）不参与，保持 null。
 */
export function squashRerankScores(scores, probe = scores) {
  const looksLikeLogit = rerankScoreScale(probe) === "logit";
  return scores.map((raw) => {
    if (raw === null || raw === undefined) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    if (looksLikeLogit) return 1 / (1 + Math.exp(-value));
    return Math.min(1, Math.max(0, value));
  });
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
 * 返回数组与 items 等长：没问的（超过 5 条、state 放不下、宿主没答）一律 null，
 * 这些位置不参与这一路的标准化，但仍然是合法下标，供其它路投票。
 *
 * instructionFor 是题面渲染（position -> 一句完整问法），由调用方把配置里的
 * rerankSystemonePrompt 带进来；缺省时用内置默认题面。
 */
async function scoreSystemOneChannel(sdk, channel, query, items, instructionFor) {
  const scores = new Array(items.length).fill(null);
  const asked = items.slice(0, SYSTEMONE_MAX_CANDIDATES);
  if (!asked.length) return scores;

  const { state, count } = buildSystemOneState(query, asked);
  if (!count) return scores;

  const render = typeof instructionFor === "function" ? instructionFor : systemoneInstructions;
  const questions = {};
  for (let position = 1; position <= count; position += 1) {
    questions[`r${position}`] = { type: "noul", instructions: render(position) };
  }

  const data = await postJson(
    sdk,
    channelEndpoint(channel.url, "/v1/systemone"),
    { model: channel.model, state, questions },
    systemoneTimeoutFor(channel, count),
    serviceAuthHeaders(channel.serviceKey),
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

/**
 * 打分服务的连通性测试。
 *
 * 用的是调用方传进来的那一组（地址 + 模型 + 可选的密钥），不是已存配置：面板上填了
 * 还没保存的值也要能先试一把。只发一发最小请求，不读也不写任何会话 / 配置状态。
 *
 * 判定「可用」比运行时严一点：HTTP 2xx 只是必要条件，结构对不上同样算不可用。
 * 一个 200 但缺 results 的服务能让整轮召回静默地一路弃权，用户在界面上却看到
 * 「可用」，那比直接报错更浪费时间。
 */
export async function testScoringService({ sdk, kind, url, model, timeoutMs, key } = {}) {
  const started = Date.now();
  const elapsed = () => Math.max(0, Date.now() - started);
  if (kind !== "rerank" && kind !== "systemone") {
    return { ok: false, elapsedMs: 0, error: `未知的打分服务类型：${String(kind)}` };
  }

  const endpoint = kind === "rerank" ? "/v1/rerank" : "/v1/systemone";
  const payload =
    kind === "rerank"
      ? {
          model,
          query: "连通性测试",
          documents: ["这是一条用于测试的文档"],
        }
      : {
          model,
          state: { type: "text", content: "连通性测试" },
          questions: { q: { type: "noul", instructions: "这是一条测试提问吗" } },
        };
  const limit = serviceTimeoutOrDefault(timeoutMs, kind);

  let data;
  try {
    data = await postJson(
      sdk,
      channelEndpoint(url, endpoint),
      payload,
      limit,
      serviceAuthHeaders(key),
    );
  } catch (error) {
    // Node 的 fetch 只把一句「fetch failed」抛到 message 上，真正的原因在 cause 里。
    // 不把 cause 带出来，面板上就只剩个看不出所以然的「fetch failed」。
    const cause = error?.cause?.message ?? error?.cause?.code ?? "";
    const message = String(error?.message || error || "unknown");
    return {
      ok: false,
      elapsedMs: elapsed(),
      error: reasonOf(cause ? `${message}：${String(cause)}` : message),
    };
  }

  const serverModel =
    typeof data?.model === "string" && data.model.trim() ? data.model.trim() : null;

  if (kind === "rerank") {
    const list = Array.isArray(data?.results) ? data.results : null;
    if (!list || !list.length) {
      return { ok: false, elapsedMs: elapsed(), error: "返回结构不符合预期（缺 results）" };
    }
    for (const entry of list) {
      const raw = entry && typeof entry === "object" ? entry.relevance_score ?? entry.score : null;
      if (!Number.isFinite(Number(raw))) {
        return {
          ok: false,
          elapsedMs: elapsed(),
          error: "返回结构不符合预期（缺 relevance_score / score）",
        };
      }
    }
    return {
      ok: true,
      elapsedMs: elapsed(),
      model: serverModel,
      detail: `返回 ${list.length} 条打分结果`,
    };
  }

  const answer = data?.answers?.q;
  if (!answer || typeof answer !== "object") {
    return { ok: false, elapsedMs: elapsed(), error: "返回结构不符合预期（缺 answers.q）" };
  }
  return {
    ok: true,
    elapsedMs: elapsed(),
    model: serverModel,
    detail: `返回 1 个回答（${Object.keys(answer).join(", ") || "空对象"}）`,
  };
}

/** 宿主模型通道：沿用编号清单，挑中 1、未挑中 0。提示词是 rerankPrompt（与判别模型那份无关）。 */
async function scoreModelChannel(sdk, switches, channel, query, items) {
  const prompt = renderRerankPrompt(rerankPromptOf(switches), query, items);
  if (!prompt) throw new Error("精排提示词为空");

  const answer = await askModelChannel(sdk, {
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
 * 地址与模型成对对不上时给界面看的一句话。缺模型是最常见的存量形态
 * （老通道只填了地址），两条文案都要能被界面原样展示。
 */
export const CHANNEL_PAIR_NOTE_MODEL = "通道自带的模型名为空，已改用服务配置";
export const CHANNEL_PAIR_NOTE_URL = "通道自带的地址为空，已改用服务配置";

/** 通道自己的超时读数：非数字 / 非正数一律当没填。 */
function normalizeChannelTimeoutValue(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/**
 * 通道的端点解析：通道自带的地址与模型「要么都有、要么都不用」，缺一个整对改用
 * 对应打分服务配置里的那一对。
 *
 * 为什么是整对而不是逐项：两半各自回退会拼出「自己的地址 + 别人的模型名」这种
 * 现场，请求发得出去，返回也像真的，只有分数不对——比直接弃权更难查。
 *
 * 返回新对象，不改调用方手里那份配置。pairNote 是给界面看的一句话，说明为什么
 * 这一行没用自己的值；运行时不读它。
 *
 * 超时优先级：通道自带 > 服务配置 > 缺省。缺省时 rerank 落到
 * RERANK_CHANNEL_TIMEOUT_MS（800），systemone 落到按候选数自适应；服务配置与
 * systemoneTimeoutFor 的上限同为 8000，配置侧与运行时不再各自压一个数。
 *
 * serviceKey 是服务级密钥（可选）：按 type 取，model 通道没有。取的是已归一化的值，
 * 空串 = 这个服务没开鉴权，调用点据此决定加不加 Authorization 头。
 */
export function resolveRerankChannel(channel, switches) {
  if (!channel || typeof channel !== "object") return channel;
  const serviceUrl =
    channel.type === "rerank"
      ? switches?.rerankServiceUrl
      : channel.type === "systemone"
        ? switches?.systemoneServiceUrl
        : "";
  const serviceModel =
    channel.type === "rerank"
      ? switches?.rerankServiceModel
      : channel.type === "systemone"
        ? switches?.systemoneServiceModel
        : "";
  const serviceTimeout =
    channel.type === "rerank"
      ? switches?.rerankServiceTimeoutMs
      : channel.type === "systemone"
        ? switches?.systemoneServiceTimeoutMs
        : null;
  // 服务级密钥跟着类型走：调用点是 scoreRerankChannel / scoreSystemOneChannel，
  // 它们手里只有 channel，没有 switches。宿主模型通道不碰网络服务，也就没有密钥。
  const serviceKey =
    channel.type === "rerank"
      ? switches?.rerankServiceKey
      : channel.type === "systemone"
        ? switches?.systemoneServiceKey
        : "";

  const ownUrl = typeof channel.url === "string" ? channel.url.trim() : "";
  const ownModel = typeof channel.model === "string" ? channel.model.trim() : "";
  const ownPair = Boolean(ownUrl && ownModel);

  const fallbackUrl = String(serviceUrl || "").trim();
  // 地址为空 = 整个服务未配置，模型也一并忽略，不拿孤立模型去拼一个端点。
  const fallbackModel = fallbackUrl ? String(serviceModel || "").trim() : "";

  // 通道自己的超时优先；没填才看服务配置；两边都没配 = 缺省（交给按类型给值 / 自适应）。
  // 服务配置那一份过一遍归一化：越界的存量值当没配，不能拿一个非法值去拼请求。
  const ownTimeout = normalizeChannelTimeoutValue(channel.timeoutMs);
  const declaredTimeout =
    ownTimeout ??
    (channel.type === "rerank" || channel.type === "systemone"
      ? normalizeServiceTimeout(serviceTimeout, channel.type)
      : null);

  let pairNote = "";
  // 服务也没配时这一路根本不生效，说明由「服务未配置」那一句接管，不在这里说回退。
  if (
    fallbackUrl &&
    channel.type !== "model" &&
    Boolean(ownUrl) !== Boolean(ownModel)
  ) {
    pairNote = ownUrl ? CHANNEL_PAIR_NOTE_MODEL : CHANNEL_PAIR_NOTE_URL;
  }

  return {
    ...channel,
    url: channel.type === "model" ? "" : ownPair ? ownUrl : fallbackUrl,
    // 宿主模型通道只认自己的模型标识，跟打分服务那一对无关。
    model: channel.type === "model" ? ownModel : ownPair ? ownModel : fallbackModel,
    ...(pairNote ? { pairNote } : {}),
    ...(declaredTimeout === null ? {} : { timeoutMs: declaredTimeout }),
    // 密钥不随地址回退：通道用自己的地址、模型时，key 仍然属于「这个类型对应的服务」，
    // 而通道自带的地址只是存量兼容写法（多数指回同一台服务），所以照常带上。
    // 模型通道没有服务，也就没有这一项。
    ...(channel.type === "model" ? {} : { serviceKey: String(serviceKey || "").trim() }),
  };
}

/**
 * 这一轮要考虑的全部路：配置里那几条 + 兜底那一条（不管它的开关）。
 *
 * 兜底不可关，所以它必须在这个列表里：开关只决定它「要不要额外参与主路合并」，
 * 不决定它能不能兜底。配置里没有 model 通道时由 ensureModelChannel 补一条（默认不参与主路）。
 * 存量 rerankModel 的值由 src/ov/settings.js 的 migrateRerankChannels 在读取侧
 * 并成一条 model 通道，所以到这里已经没有需要兼容的旧形态。
 */
export function rerankLanesOf(switches) {
  const raw = switches?.rerankChannels;
  return ensureModelChannel(Array.isArray(raw) ? raw : parseRerankChannels(raw));
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
 * 这一路吃哪一份提示词：
 *   model     -> rerankPrompt（语言模型，编号清单）
 *   systemone -> rerankSystemonePrompt（判别模型，逐条题面）
 *   rerank    -> none（交叉编码器直接对问题和候选成对打分，没有提示词可配）
 *
 * 探针只记这个来源名，不记全文。
 */
export function promptSourceOf(type) {
  if (type === "model") return "rerankPrompt";
  if (type === "systemone") return "rerankSystemonePrompt";
  return "none";
}

export { RERANK_FALLBACK_MODEL, RERANK_FALLBACK_NONE, RERANK_FALLBACK_VALUES };

/**
 * 跑一路打分：成功回分数与标准化结果，失败只标记这一路，绝不把失败当成 0 分。
 *
 * 从 runRerankChannels 里拆出来是因为现在分两段跑：先主路（并行），主路没结果才跑兜底。
 * 两段用的是同一份打分逻辑，只是调用时机不同。
 */
async function scoreRerankLane({ sdk, switches, channel, query, candidates, instructionFor }) {
  const channelStarted = Date.now();
  let scoreScale = "probability";
  try {
    // 端点解析完之后仍为空：这一类打分服务没配，这一路直接弃权。
    if ((channel.type === "rerank" || channel.type === "systemone") && !channel.url) {
      throw new Error("打分服务未配置，这一路不会生效");
    }
    let scores;
    if (channel.type === "rerank") {
      const result = await scoreRerankChannel(sdk, channel, query, candidates);
      scores = result.scores;
      scoreScale = result.scoreScale;
    } else if (channel.type === "systemone") {
      scores = await scoreSystemOneChannel(sdk, channel, query, candidates, instructionFor);
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
        scoreScale,
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
      scoreScale,
      normalized: scaled.normalized,
      range: [scaled.min, scaled.max],
      elapsedMs: Date.now() - channelStarted,
    };
  } catch (error) {
    return {
      channel,
      weight: channel.weight,
      ok: false,
      scoreScale,
      error: reasonOf(error),
      elapsedMs: Date.now() - channelStarted,
    };
  }
}

/**
 * 跑一轮多路精排。两层：主路（当前启用的所有路，并行合并）+ 兜底（语言模型，无条件值班）。
 *
 *   1. 参与的路（判别模型 / rerank 模型 / 语言模型 任意组合）并行跑、按权重合并；
 *      拿到结果就用；
 *   2. 主路全失败 / 全弃权（合并结果为 null）/ 一条参与的路都没有 -> 无条件调兜底一次；
 *   3. 兜底也失败（抛错 / 解析不出）-> 原样保留全部候选。
 *
 * 语言模型那一路的 enabled 管的是「要不要进主路参加合并」，不是「能不能兜底」：
 * 开着时它就是主路里的一路（与另两条一起算分），关着时它不参与主路。两种情况下兜底都在。
 *
 * 它已经在主路里跑过而且失败了，兜底仍然会再调它一次：这是故意的。
 * 主路那一次与兜底那一次隔着一段时间，服务拥塞、瞬时超时、模型排障都可能已恢复；
 * 兜底本来就是“再试一手”的位置，为了省一次调用而把这一步去掉，就白留了这层保险。
 *
 * 每路先在自己批内 min-max 标准化，再按权重平均；同分的一路直接弃权。
 * 单路失败只让那一路弃权，不参与分母，也不会把它的失败当成 0 分。
 *
 * fallback 只有两个取值，探针与日志都看它：
 *   none  主路成功，没触发兜底
 *   model 主路垮了，走了兜底（它自己也失败是另一层：fallbackError 非空）
 */
export async function runRerankChannels({ sdk, switches, query, items, channels } = {}) {
  const startedAt = Date.now();
  // 接受 [{text}] 与纯字符串两种候选，测试可直接传文本。
  const candidates = (Array.isArray(items) ? items : []).map((item) =>
    typeof item === "string" ? { text: item } : item,
  );
  const given = Array.isArray(channels) && channels.length ? channels : rerankLanesOf(switches);
  const lanes = given
    .map((channel) => resolveRerankChannel(channel, switches))
    .filter((channel) => channel && channel.type);
  // 兜底那一路永远在（配置里没有时由投影补上）；它的开关只管要不要参与主路。
  const fallbackLane = lanes.find((lane) => lane.type === RERANK_FALLBACK_CHANNEL_TYPE) || null;
  const participating = lanes.filter((lane) => lane.enabled !== false);
  // 判别模型的题面只在这里渲染一次：同一个模板给全部候选逐条换序号。
  const systemoneTemplate = systemonePromptOf(switches);
  const instructionFor = (position) => renderSystemoneInstruction(systemoneTemplate, position);
  const runLane = (lane) =>
    scoreRerankLane({ sdk, switches, channel: lane, query, candidates, instructionFor });

  const mainResults = await Promise.all(participating.map(runLane));
  let results = mainResults;
  // 主路自己拿到的合并结果：兜底那个取值看的就是它（而不是兜完之后的结果）。
  const mainMerged = mergeRerankScores(mainResults, candidates.length);
  let merged = mainMerged;
  let fallbackError = "";

  if (merged === null) {
    if (!fallbackLane) {
      // 只可能发生在调用方手写了不含语言模型的通道表时：没有兜底可调。
      fallbackError = "没有可用的兜底路";
    } else {
      // 无条件调一次：它在主路里跑过也一样再试一手（网络抖动、瞬时拥塞可能已恢复）。
      const spare = await runLane(fallbackLane);
      results = [...mainResults, spare];
      const spareMerged = mergeRerankScores([spare], candidates.length);
      if (spareMerged !== null) merged = spareMerged;
      else if (!spare.ok && spare.abstained !== true) {
        // 只有真失败（抛错 / 解析不出）才多记一句；它自己弃权不算失败，那句日志会误导。
        fallbackError = spare.error;
      }
    }
  }

  const fallback = mainMerged === null ? RERANK_FALLBACK_MODEL : RERANK_FALLBACK_NONE;
  const indexes =
    merged === null
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
      // 这一路实际吃的是哪一份提示词。只记来源名，不记全文：探针里放全文
      // 既会把日志撞爆，也让「用户改了提示词」这件事变成一件能被读到内容的事。
      promptSource: promptSourceOf(result.channel.type),
      // 这一批原始分被当成 logit 还是 probability。判定是启发式的，把结果留下，
      // 排序反常时看探针就能判断是不是误判。
      scoreScale: result.scoreScale,
      elapsedMs: result.elapsedMs,
      // 这一路实际用的端点 / 超时 / 整对回退的原因，面板「测试」结果行直接展开。
      url: result.channel.url || "",
      model: result.channel.model || "",
      ...(result.channel.timeoutMs === undefined
        ? {}
        : { timeoutMs: result.channel.timeoutMs }),
      ...(result.channel.pairNote ? { pairNote: result.channel.pairNote } : {}),
      ...(Array.isArray(result.scores) ? { scores: result.scores } : {}),
      ...(result.ok
        ? { normalized: result.normalized, range: result.range }
        : { error: result.error }),
    })),
    merged,
    indexes,
    kept: indexes.map((index) => candidates[index]),
    fallback,
    // 兜底没能给出结果的原因（只有在 fallback=model 时才会有）。日志靠它分两句。
    ...(fallbackError ? { fallbackError } : {}),
    // 配置里那几条路的条数 / 这一轮真跑了的条数。
    laneCount: lanes.length,
    channelCount: results.length,
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
 * 候选的元信息：uri / 分数 / 时间 / 来源门牌。
 *
 * 四个字段都可能没有：字符串形态的返回值、别的服务实现、自己的假数据。
 * 缺一个字段就整条丢掉是不行的——文本还在，就还是一条可用候选。
 * 所以一律降级成空值（空串 / null），不报错、不猜字段。
 *
 * score 不能用 Number() 一把梭：Number(null) 是 0，那会把「没给分」静默写成「零分」，
 * 后面的按分精排会把它当成最不相关的一条。
 */
export function recallMetaOf(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const uri = typeof source.uri === "string" ? source.uri.trim() : "";
  const rawScore = source.score;
  const score =
    rawScore === null || rawScore === undefined || rawScore === ""
      ? null
      : Number.isFinite(Number(rawScore))
        ? Number(rawScore)
        : null;
  // 时间是给人看的定位信息（只进探针 / 日志），数字时间戳也留成串，不在这里做格式化。
  const rawTime = source.modTime ?? source.timestamp;
  const time =
    typeof rawTime === "string" ? rawTime.trim() : typeof rawTime === "number" ? String(rawTime) : "";
  // type / detail 只有 rendered 的 <memory> 开标签带：前者是条目类别（events / entities /
  // preferences ...），后者是服务端实际给的档位（full / overview / abstract / uri）。
  // 其余形态没有这两项，一律空串，不拿别的字段顶替。
  const type = typeof source.type === "string" ? source.type.trim() : "";
  const detail = typeof source.detail === "string" ? source.detail.trim() : "";
  return { uri, score, time, peer: peerOfUri(uri), type, detail };
}

/** 一条候选：文本 + 元信息。 */
function recallItem(text, entry) {
  return { text, ...recallMetaOf(entry) };
}

/** 条目之间没有原始分隔时的拼法：空行（与 assemble.js 一致）。 */
const ITEM_SEPARATOR = "\n\n";

/**
 * 开标签结束的位置（`>` 之后）。引号里的 `>` 属于属性值，不算标签结束。
 * 找不到收尾的 `>` 返回 -1：这半截不像标签，交给调用方退到「整段一条」。
 */
function openTagEnd(text, start) {
  let quote = "";
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index + 1;
  }
  return -1;
}

/** 属性值里的实体还原。服务端写属性时会转义，读回来要还原成原字符。 */
function unescapeAttr(value) {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

/**
 * 从开标签里读 uri / score / type / detail。缺哪个就不给哪个，由 recallMetaOf 降级成空值。
 * 正则建在函数里：带 g 的正则共用一份 lastIndex，跨次调用会从上次停下的位置接着扫。
 */
function memoryAttrsOf(head) {
  const attrs = {};
  const pattern = /\b(uri|score|type|detail)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match;
  while ((match = pattern.exec(head))) {
    const name = match[1].toLowerCase();
    attrs[name] = unescapeAttr(match[2] ?? match[3] ?? "").trim();
  }
  return attrs;
}

/**
 * 扫出 rendered 里的 `<memory>` 块：位置 + 开标签属性。
 *
 * 三种收尾都认，按服务端真实形态排：
 *   1. `</memory>`——正常块；
 *   2. 自闭合 `<memory ... />`——正文为空时的形态，块就是那个开标签；
 *   3. 没有闭标签——预算截断留下的尾巴，切到下一个开标签（或整段末尾），
 *      尾随空白留给条目之间的分隔，不算进块正文。
 * 块体里的 `<memory` 已经被服务端转义成 `<\memory`，所以这里扫到的开标签都是真块的。
 */
function memoryBlocksOf(text) {
  const blocks = [];
  const openPattern = /<memory(?=[\s/>])/gi;
  let cursor = 0;

  for (;;) {
    openPattern.lastIndex = cursor;
    const open = openPattern.exec(text);
    if (!open) return blocks;

    const start = open.index;
    const headEnd = openTagEnd(text, start);
    if (headEnd < 0) return blocks;
    const head = text.slice(start, headEnd);

    let end;
    if (/\/\s*>$/.test(head)) {
      end = headEnd;
    } else {
      const closePattern = /<\/memory\s*>/gi;
      closePattern.lastIndex = headEnd;
      const close = closePattern.exec(text);
      const nextPattern = /<memory(?=[\s/>])/gi;
      nextPattern.lastIndex = headEnd;
      const next = nextPattern.exec(text);
      if (close && (!next || close.index < next.index)) {
        end = close.index + close[0].length;
      } else {
        let stop = next ? next.index : text.length;
        while (stop > headEnd && /\s/.test(text[stop - 1])) stop -= 1;
        end = stop;
      }
    }

    blocks.push({ start, end, attrs: memoryAttrsOf(head) });
    cursor = end;
  }
}

/**
 * rendered -> 条目。块与块之间用服务端的分隔符（OpenViking 是单个换行）连着，
 * 靠每条的 sep 记住「它前面原本隔着什么」，拼回去才能逐字一致。
 *
 * 块外的散落文本（服务端偶尔加的抬头、尾注）各自留一条，不静默丢掉：
 * 丢了之后条数与原文对不上，只能靠猜。纯空白不单独立条，它是分隔本身：
 * 跟着 sep 走，拼回去照样一个字节不少。
 *
 * 返回空数组表示一个块都没认出来，调用方退到「整段一条」。
 */
function renderedItemsOf(rendered) {
  const blocks = memoryBlocksOf(rendered);
  if (!blocks.length) return [];

  const items = [];
  let cursor = 0;
  let pending = "";

  const keepStray = (chunk) => {
    const body = chunk.trim();
    if (!body) {
      pending += chunk;
      return;
    }
    const lead = chunk.length - chunk.trimStart().length;
    pending += chunk.slice(0, lead);
    items.push({ ...recallItem(body), sep: pending });
    pending = chunk.slice(lead + body.length);
  };

  for (const block of blocks) {
    if (block.start > cursor) keepStray(rendered.slice(cursor, block.start));
    items.push({ ...recallItem(rendered.slice(block.start, block.end), block.attrs), sep: pending });
    pending = "";
    cursor = block.end;
  }
  if (cursor < rendered.length) keepStray(rendered.slice(cursor));
  return items;
}

/**
 * 从召回响应里读出候选条目，只认实测过的三处，按服务端"最省事到最原始"排列：
 *   1. rendered —— mode=context 时服务端拼好的扁平 XML 块，按 `<memory>` 块拆条；
 *   2. digest   —— 摘要，视为单条；
 *   3. entries[].text —— 原始命中条目，逐条保留，跳过空项。
 * 其余形状一律给空数组（调用方据此 return undefined 并告警一次），不猜字段名。
 *
 * rendered 必须拆：它是一整段字符串里装着十几个块，整段当一条会让精排的入口条件
 * （条数 ≥ 2）永远不成立，去重与按分精排也无从下手，十条无关记忆原样注入。
 * 拆不出块时退回「整段一条」——真实服务端可能有别的形态，降级路径必须留着。
 *
 * 精排与组装都必须在拼成一段文本之前做，所以这里保留条目边界；
 * 元信息（uri / 分数 / 时间 / 门牌 / 类别 / 档位）尽量带上，缺失降级成空值，不会因此丢条目。
 * extractRecallText 只是把它按原有规则拼回去。
 */
export function extractRecallItems(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [recallItem(text)] : [];
  }
  if (!value || typeof value !== "object") return [];

  const rendered = textOf(value.rendered);
  if (rendered) {
    const items = renderedItemsOf(rendered);
    return items.length ? items : [recallItem(rendered)];
  }

  const digest = textOf(value.digest);
  if (digest) return [recallItem(digest)];

  if (Array.isArray(value.entries)) {
    return value.entries
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => recallItem(textOf(entry.text), entry))
      .filter((item) => item.text);
  }

  return [];
}

/**
 * 条目 -> 一段文本。有 sep 的照抄原始分隔（rendered 拆出来的那些），
 * 没有的按空行连（entries / digest / 字符串形态，与加拆条之前的行为一致）。
 * 于是「拆开再拼回来」对 rendered 是逐字无损的。
 */
export function extractRecallText(value) {
  const items = extractRecallItems(value);
  if (!items.length) return "";

  let text = items[0].text;
  for (let index = 1; index < items.length; index += 1) {
    const sep = typeof items[index].sep === "string" ? items[index].sep : ITEM_SEPARATOR;
    text += sep + items[index].text;
  }
  return text.trim();
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
 * options.probe 是探针函数：每轮记一条 recall/result 汇总（正常那轮也记），
 * 另在 gate 跳过 / 精排跑过 / 组装跑过时各记一条细节。全部只写事实，不改返回值。
 * 探针只在 switches.probe 开着时写（会话可以覆盖这一项）。
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

    // 每轮一条汇总（recall/result）：这一轮走到哪、gate 怎么判的、召回多少条、精排跑没跑、
    // 组装剩多少、最后注了多少，全摆在一行里。
    //
    // 为什么要有：原来只有三个探针点，全是异常分支（跳过 / 精排跑过 / 组装跑过），
    // 正常那一轮一片空白——「精排跑没跑」从日志里判断不了，只记跑了的情况，
    // 没跑就没记录，是循环论证。这条汇总行每轮必记，与那三个细节探针并存，不替代。
    //
    // 只记档位与数字，不记任何正文：日志不该成为凭据的第二个落点。
    // 它仍然受探针总开关管（switches.probe），关着就不写——那是“我不要任何探针”，
    // 不是“这一轮没发生”。
    const summary = {
      // off 表示这一档关着；passed 表示判过且要召回；skipped:* 表示跳过及其原因。
      gate: switches.recallGate === "off" ? "off" : "passed",
      // gate 就跳过的那一轮根本没有查询文本，先按 gate 看的那句话记，查到再改。
      query: { mode: switches.queryMode, chars: charLength(lastText) },
      recalled: 0,
      rerank: null,
      assemble: null,
      injected: null,
    };
    let reported = false;
    const report = async () => {
      if (reported) return;
      reported = true;
      if (!switches.probe || typeof options.probe !== "function") return;
      try {
        await options.probe("recall/result", { session, ...summary });
      } catch {
        /* 探针写不进去不能影响本轮对话 */
      }
    };

    // 判据看最后一条用户原话，不看拼接后的查询：gate 回答的是“这句话需不需要查记忆”，
    // queryMode 回答的是“用什么去查”，两件事分开。若用拼接结果判断，context 模式
    // 一旦有历史就必然超 8 字，rules 会被整个抵消掉。
    // 召回判断：rules 只看极短纯操作指令；llm 让宿主的生成式模型回答（语言模型判断）；
    // decision 让决策模型（/v1/systemone）在 need / standalone 之间选一个（决策模型判断）。
    //
    // 判断失败（网络错 / 超时 / 返回结构不认识 / 题面为空）时按 gateFallback 兜底：
    //   recall（默认）——照常召回，判断失败不能变成漏召回；
    //   rules        ——退到规则判断跑一遍，规则说跳过才跳过。
    // 兜底日志一律带 fallback=<走的那条>，看得出这一轮是模型判的、规则判的，还是干脆没判。
    let gateSkip = null;
    const fallback = gateFallbackOf(switches);
    const gateFailure = (label, detail = "") => {
      const rulesSkip = fallback === "rules" && shouldSkipRecall(lastText, "rules");
      if (rulesSkip) gateSkip = { by: "rules", reason: "short-operation-command" };
      // 走哪条兜底说在前面，规则判了什么跟在后面：看日志就能分出
      // 「问了模型但没做成」和「干脆没问」两件事，也能看出退到规则后规则怎么判的。
      const tail =
        fallback === "rules"
          ? `fallback=rules, ${rulesSkip ? "skip" : "recall"}`
          : "recall anyway, fallback=recall";
      log(
        sdk,
        "info",
        `gate: ${label}, ${tail} (session=${sessionId})${detail ? ` ${detail}` : ""}`,
      );
    };

    if (switches.recallGate === "llm") {
      const prompt = gatePromptOf(switches);
      if (!prompt) {
        // 空提示词不是“用默认”：没有判据就不问，按兜底走。
        gateFailure("llm prompt empty");
      } else {
        try {
          const answer = await askGateModel(sdk, switches, lastText);
          if (!gateAnswerRecalls(answer)) {
            gateSkip = { by: "llm", reason: "llm-no-need" };
          }
        } catch (error) {
          gateFailure("llm failed", reasonOf(error));
        }
      }
    } else if (switches.recallGate === "decision") {
      const service = decisionGateServiceOf(switches);
      // 前文只在 turns 模式下取；取不到（会话第一句）就按 none 走，
      // 不发一个只有题面、没有前文的请求，也不因此算失败。
      const context =
        gateContextOf(switches) === "turns"
          ? recentDialogue(payload, gateContextTurnsOf(switches))
          : "";
      const prompt = context
        ? gateContextPromptOf(switches)
        : gateDecisionPromptOf(switches);
      if (!service.configured) {
        // 没配不是失败，是「没有判据」：照常召回，面板另给一句提示。不退回 llm。
        // 这一档在读取侧就已经归一化成 off 了，走到这里只是兜底。
        log(sdk, "info", `gate: decision unconfigured, recall anyway (session=${sessionId})`);
      } else if (!prompt) {
        // 空判据不是「用默认问法」：没有判据就不问，按兜底走。
        gateFailure("decision prompt empty");
      } else {
        try {
          const answer = await askDecisionGate(sdk, switches, lastText, prompt, context);
          // 门槛只在这一档生效：配置项读在调用处，别的档根本不会碰到它。
          if (decisionGateSkips(answer, gateDecisionThresholdOf(switches))) {
            gateSkip = { by: "decision", reason: "decision-no-need" };
          }
        } catch (error) {
          gateFailure("decision failed", reasonOf(error));
        }
      }
    } else if (shouldSkipRecall(lastText, switches.recallGate)) {
      gateSkip = { by: "rules", reason: "short-operation-command" };
    }

    if (gateSkip) {
      summary.gate = `skipped:${gateSkip.by}`;
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
      await report();
      return undefined;
    }

    // 用什么去查：与上面的判断无关，按 queryMode 取。上限来自配置 queryChars（默认 600）：
    // context 档从最近一轮往回整轮拼，装不了就停手，不切半句。
    const planned = recallQueryPlan(payload, switches.queryMode, {
      maxChars: conn.queryChars,
    });
    const query = planned.text;
    // 字数记真正发出去的那个，不是上限。
    // context 档额外记两笔：拼了几条（turns）、是不是因为字数上限丢了更旧的整条（truncated）。
    summary.query =
      switches.queryMode === "context"
        ? {
            mode: switches.queryMode,
            chars: charLength(query),
            turns: planned.turns,
            ...(planned.truncated ? { truncated: true } : {}),
          }
        : { mode: switches.queryMode, chars: charLength(query) };

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
        // 召回用自己那一档超时（默认 5000），不用通用的 1500：
        // 查询长起来服务端要好几秒，通用超时会把整轮召回掐成 recalled:0。
        timeoutMs: conn.recallTimeoutMs,
      });
    } catch (error) {
      // 面板上看不出失败原因就是什么都没记：类别进汇总（只记类别，不记地址与正文）。
      summary.error = recallErrorKind(error);
      log(
        sdk,
        "info",
        `skip: request failed (session=${sessionId}) error=${summary.error} ${reasonOf(error)}`,
      );
      await report();
      return undefined;
    }

    const items = extractRecallItems(result);
    // 召回数记过滤前的候选条数：后面精排与组装各自会减，三个数摆在一起才知道减在哪一步。
    summary.recalled = items.length;
    if (!items.length) {
      warnShapeOnce(sdk, result);
      log(sdk, "info", `skip: no text in response (session=${sessionId})`);
      await report();
      return undefined;
    }

    // 精排必须在拼成一段文本之前做：拼完就分不清候选边界了。
    // 默认 off，一次通道都不跑；只有 llm 且候选 ≥ 2 条才值得精排。
    let kept = items;
    if (switches.rerank === "llm" && items.length >= 2) {
      // 兜底不可关，所以这里不存在「没有路可跑」那一种状态：配置里没有 model 通道时
      // 由 rerankLanesOf 补一条，它至少能在主路垮了之后接一手。
      const lanes = rerankLanesOf(switches);
      // 面板「测试」按钮要拿最近一轮的真实候选复跑；先留样本，失败不影响本轮。
      writeRerankSample(sdk, sessionId, { query: lastText, items });

      const outcome = await runRerankChannels({
        sdk,
        switches,
        query: lastText,
        items,
        channels: lanes,
      });
      kept = outcome.kept;
      // 精排这一轮真跑了几路（含兜底那一路）与留了几条：没跑时整个字段是 null，
      // 「跑了但一条没留」和「压根没跑」在日志里必须分得开。
      summary.rerank = {
        mode: switches.rerank,
        lanes: outcome.channelCount,
        kept: kept.length,
        fallback: outcome.fallback,
      };

      for (const channel of outcome.channels) {
        if (!channel.ok) {
          log(
            sdk,
            "info",
            `rerank: channel ${channel.type} failed, abstained (session=${sessionId}) ${channel.error}`,
          );
        }
      }
      // 两句：主路算出来的，还是兜底接的。兜底自己也失败时多一句说明（候选原样保留）。
      if (outcome.fallback === RERANK_FALLBACK_MODEL) {
        if (outcome.fallbackError) {
          log(
            sdk,
            "info",
            `rerank: fallback failed, keep all (session=${sessionId}) ${outcome.fallbackError}`,
          );
        } else {
          log(sdk, "info", `rerank: fallback to model (kept=${kept.length}) (session=${sessionId})`);
        }
      } else {
        log(sdk, "info", `rerank: main lanes ok (kept=${kept.length}) (session=${sessionId})`);
      }

      if (switches.probe && typeof options.probe === "function") {
        try {
          await options.probe("recall/rerank", {
            session,
            query: lastText,
            candidates: items.length,
            // 配置里那几条路的总数（含没被叫上的兜底那一路）；下面 channels 里只有真跑了的。
            enabledChannels: outcome.laneCount,
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
        // 有路成功，且把所有候选都打了 0 分：本轮不注入。
        log(sdk, "info", `rerank: dropped all (session=${sessionId})`);
        await report();
        return undefined;
      }
    }

    // 组装：精排之后、拼成一段文本之前的最后一步。
    //
    // 这个位置不能再往下：再往下一步就只剩一个字符串，去重与按分精排只能靠猜。
    // off 档原样拼（与加这一层之前逐字一致）；rules 档去重 + 按分精排。
    // 预算裁剪仍然在下面的 memoryBlock 里做（按拼好之后的文本算 token）。
    const assembled = assembleCandidates(kept, switches.assembleMode);
    const text = assembled.text;
    // kept 是组装之后的段数（凭据过滤已经在这里发生过），droppedCredential 单独记；
    // 记条数不记原文，命中内容进了日志等于又把凭据搬了一处。
    summary.assemble = {
      mode: switches.assembleMode,
      kept: assembled.refs.length,
      droppedCredential: assembled.dropped.credential,
    };

    // 回指表只进探针与日志，不进注入文本：目标是「这一轮拼了谁」可查，不是把元信息喂给模型。
    log(
      sdk,
      "info",
      `assemble: mode=${switches.assembleMode} kept=${kept.length} segments=${
        assembled.refs.length
      } (session=${sessionId})`,
    );
    if (switches.probe && typeof options.probe === "function") {
      try {
        await options.probe("recall/assemble", {
          session,
          query: lastText,
          assemble: {
            mode: switches.assembleMode,
            kept: kept.length,
            refs: assembled.refs,
            // 凭据过滤的命中数：只记条数，不记命中原文。
            droppedCredential: assembled.dropped.credential,
          },
        });
      } catch {
        /* 探针写不进去不能影响本轮对话 */
      }
    }

    const block = memoryBlock(text, budget);
    if (!block) {
      log(sdk, "info", `skip: empty block (session=${sessionId})`);
      await report();
      return undefined;
    }

    const injected = injectMemory(payload, block);
    if (!injected) {
      log(sdk, "info", `skip: unknown payload shape (session=${sessionId})`);
      await report();
      return undefined;
    }

    const tokens = estimateTokens(block);
    // 字数是最终拼进上下文的那一段（含标记）的长度，与 token 估算同一个对象。
    summary.injected = { chars: block.length, tokens };
    await report();

    bumpRecall(sdk, sessionId, tokens);
    log(
      sdk,
      "info",
      `ok (session=${sessionId} scope=${live.recallPeerScope} tokens=${tokens})`,
    );

    return { payload: injected };
  };
}

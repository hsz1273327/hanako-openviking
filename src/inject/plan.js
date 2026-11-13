// 注入计划：把一段记忆块放进"即将发给 provider 的请求"。
//
// 三条纪律（DESIGN 五.C）：
//   1. 不新增 message，只改最后一条 user 消息的内容。消息条数一变，宿主与 provider
//      都可能重新解释这段历史；改内容不会。
//   2. 标记固定且可剥离。写回时要靠它把注入段滤掉，否则召回的内容会被当成
//      "这轮说过的话"再写回去，几轮之后库里的记忆就全是关于记忆的记忆。
//   3. 形状不认识就返回 null。宁可这轮不召回，也不能把 payload 改坏。

import { QUERY_CHARS_DEFAULT } from "../ov/settings.js";

export const MEMORY_TAG_OPEN = "<openviking-memory>";
export const MEMORY_TAG_CLOSE = "</openviking-memory>";

// 开标签可能带 time / type 属性；不认属性的话，写回剥离会漏掉带属性的块。
const INJECTED_RE = /<openviking-memory(?:\s[^>]*)?>[\s\S]*?<\/openviking-memory>\s*/g;
// codeblock：围栏长度是动态的（正文里反引号更长时会更长），靠反向引用配同一串。
const CODEBLOCK_RE = /(`{3,})memory\n[\s\S]*?\n\1\s*/g;
// document：只认我们自己写的那种 type，误伤用户文本的概率最低。
const DOCUMENT_RE = /<document\s+type="openviking-memory"[^>]*>[\s\S]*?<\/document>\s*/g;
// plain：固定标题行 + 固定收尾行，按行首匹配。
const PLAIN_RE = /^--- openviking-memory ---[ \t]*\n[\s\S]*?^--- \/openviking-memory ---[ \t]*\n?/gm;

/** 从 `{` 开始扫到配对的 `}`；字符串里的括号与转义不参与计数。 */
function balancedJsonEnd(text, start) {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') {
      quote = true;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/** 去掉 JSON 形态的整块。扫描器按配对括号收尾，不靠非贪婪正则猜。 */
function stripJsonBlocks(text) {
  const marker = '{"memories":';
  let out = "";
  let cursor = 0;
  for (;;) {
    const start = text.indexOf(marker, cursor);
    if (start < 0) return out + text.slice(cursor);
    out += text.slice(cursor, start);
    const end = balancedJsonEnd(text, start);
    if (end < 0) return out + text.slice(start);
    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  }
}

/** 去掉已经注进去的记忆块，得到"人真正说过的话"。去重键必须建立在干净文本上。 */
export function stripInjected(text) {
  if (typeof text !== "string") return "";
  let out = text.replace(CODEBLOCK_RE, "").replace(DOCUMENT_RE, "");
  out = stripJsonBlocks(out).replace(PLAIN_RE, "").replace(INJECTED_RE, "");
  return out.trim();
}

/** 把消息内容（string 或 parts 数组）里的纯文本读出来。 */
export function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n");
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }
  return "";
}

/** 一条消息的载荷字段可能是 content，也可能是 parts。 */
function readContent(message) {
  if (!message || typeof message !== "object") return undefined;
  if (message.content !== undefined) return message.content;
  if (message.parts !== undefined) return message.parts;
  return undefined;
}

function writeContent(message, value) {
  if (message.parts !== undefined && message.content === undefined) {
    return { ...message, parts: value };
  }
  return { ...message, content: value };
}

/** 找到最后一条用户消息的下标。有些链路用 human 表示用户。 */
export function lastUserIndex(messages) {
  if (!Array.isArray(messages)) return -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const role = messages[i]?.role;
    if (role === "user" || role === "human") return i;
  }
  return -1;
}

/** 本轮用户说的话，已剥离既往注入。没有就返回空串。 */
export function lastUserText(payload) {
  const messages = payload?.messages;
  const index = lastUserIndex(messages);
  if (index < 0) return "";
  return stripInjected(contentText(readContent(messages[index])));
}

/** context 查询最多拼几条用户文本。 */
export const CONTEXT_MESSAGES_MAX = 3;

/**
 * context 查询的总长上限（按字符 / 码点算，不按 UTF-16 码元）。
 *
 * 真正生效的上限来自配置 queryChars（默认与这里同一个数），这里只是调用方不传时的缺省。
 * 上限为什么是 600：服务端耗时约 2.3ms/字，600 字落在召回超时之内还留足余量。
 */
export const CONTEXT_CHARS_MAX = QUERY_CHARS_DEFAULT;

function charLength(text) {
  return Array.from(text).length;
}

/** 上限归一化：拿不到正数就用缺省，不认小数（字数不取半）。 */
function clampChars(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return CONTEXT_CHARS_MAX;
  return Math.max(1, Math.floor(parsed));
}

/**
 * 从开头截断、保留尾部。
 *
 * 只给 recentDialogue（判断前文）用：那一份是喂给模型的题面材料，不是搜索查询，
 * 半句也能帮助判断，所以那里仍然允许裁到一半。召回查询不走这里，它停在整轮边界。
 */
function clipStart(text, keep) {
  if (keep <= 0) return "";
  const chars = Array.from(text);
  return chars.length <= keep ? text : chars.slice(chars.length - keep).join("");
}

/**
 * 拼最近几条用户文本的计划：从最新一条往回整条累加，停在**完整的一轮边界**上。
 *
 * 规则：
 *   1. 从新到旧最多取 CONTEXT_MESSAGES_MAX 条 user 消息；相邻两条文本完全相同就去重；
 *   2. 最新那一条无条件完整保留（哪怕它自己就超上限）——宁可多带一点，也不把
 *      用户刚说的话切掉一半，更不能拼出一个空查询；
 *   3. 再往旧加时按**整条**算：加了会超上限就停手，不截半句。
 *      截断的做法改过一次：早先在最旧一条上按字符裁，查询尾巴上会挂着半句话，
 *      而服务端是拿整段做检索，半句对检索没有帮助，还白白占掉字数预算；
 *   4. 一条都没有时返回空串文本，由 recallQueryPlan 退回 last 的单条行为。
 *
 * 返回 { text, turns, truncated }：turns 是真正拼了几条，truncated 表示「因为字数
 * 上限丢掉了更旧的整条」——它只记得为字数丢的，不算被条数上限挡在外面的那些。
 */
export function contextQueryPlan(
  payload,
  { limit = CONTEXT_MESSAGES_MAX, maxChars = CONTEXT_CHARS_MAX } = {},
) {
  const messages = payload?.messages;
  if (!Array.isArray(messages) || limit <= 0) return { text: "", turns: 0, truncated: false };

  const picked = [];
  for (let i = messages.length - 1; i >= 0 && picked.length < limit; i -= 1) {
    const role = messages[i]?.role;
    if (role !== "user" && role !== "human") continue;
    const text = stripInjected(contentText(readContent(messages[i]))).trim();
    if (!text) continue;
    // 相邻去重：此时 picked 是新到旧，比较的是“更旧的这条”与“刚收进来的那条”。
    if (picked.length && picked[picked.length - 1] === text) continue;
    picked.push(text);
  }
  if (!picked.length) return { text: "", turns: 0, truncated: false };

  const cap = clampChars(maxChars);
  // picked 是新到旧；从最新一条开始往旧拼，装不下就停在整条边界上。
  let text = picked[0];
  let turns = 1;
  let truncated = false;
  for (let i = 1; i < picked.length; i += 1) {
    const candidate = `${picked[i]}\n${text}`;
    if (charLength(candidate) > cap) {
      truncated = true;
      break;
    }
    text = candidate;
    turns += 1;
  }
  return { text, turns, truncated };
}

/** 只要拼接结果（旧到新、换行分隔）。语义见 contextQueryPlan。 */
export function contextQuery(payload, options = {}) {
  return contextQueryPlan(payload, options).text;
}

/**
 * 判断前文用的对话：从 payload.messages 倒着取最近几轮，**不含当前这条用户消息**。
 *
 * 当前这条由调用方单独接在末尾（state.content = 前文 + 当前消息），所以这里只回
 * 「前文」。一问一答各算半轮（一问一答正好一轮）；连续几条 user 消息各自算半轮，
 * 不会被「没有 assistant 配对」整条丢掉。只收 user / assistant，别的角色跳过。
 *
 * 每条前面带角色前缀（用户：/ 助手：），已剥离既往注入。总长超过 maxChars 时
 * 从最旧的一条开始截，最新的一条保持完整——与 contextQuery 同一个策略。
 * 一条都没有（比如这就是会话第一句）返回空串，调用方据此退回不带前文的判断。
 */
export function recentDialogue(payload, turns = 4, maxChars = 1200) {
  const messages = payload?.messages;
  if (!Array.isArray(messages) || !Number.isFinite(Number(turns)) || Number(turns) <= 0) {
    return "";
  }
  const current = lastUserIndex(messages);
  if (current < 0) return "";

  const limit = Number(turns);
  const picked = [];
  let used = 0;
  for (let i = current - 1; i >= 0 && used < limit; i -= 1) {
    const role = messages[i]?.role;
    if (role !== "user" && role !== "human" && role !== "assistant") continue;
    const text = stripInjected(contentText(readContent(messages[i]))).trim();
    if (!text) continue;
    const prefix = role === "assistant" ? "助手：" : "用户：";
    picked.push(`${prefix}${text}`);
    used += 0.5;
  }
  if (!picked.length) return "";

  const ordered = picked.reverse();
  const joined = ordered.join("\n");
  if (charLength(joined) <= maxChars) return joined;

  // 从最新一条往前拼；装不下的那条只保留尾部，然后停手。
  let tail = ordered[ordered.length - 1];
  for (let i = ordered.length - 2; i >= 0; i -= 1) {
    const candidate = `${ordered[i]}\n${tail}`;
    if (charLength(candidate) <= maxChars) {
      tail = candidate;
      continue;
    }
    const room = maxChars - charLength(tail) - 1;
    if (room > 0) tail = `${clipStart(ordered[i], room)}\n${tail}`;
    break;
  }
  return tail;
}

/**
 * 按配置取查询文本与它的拼接账：{ text, turns, truncated }。
 *
 * context 拼不出东西（会话第一句、或者上面全是 assistant）时退回 last 的单条行为，
 * 此时 turns=1 / truncated=false——它本来就只有一条，没拼也没截。
 */
export function recallQueryPlan(payload, mode = "last", options = {}) {
  if (mode === "context") {
    const planned = contextQueryPlan(payload, options);
    if (planned.text) return planned;
  }
  const text = lastUserText(payload);
  return { text, turns: text ? 1 : 0, truncated: false };
}

/** 按配置取查询文本。语义见 recallQueryPlan。 */
export function recallQuery(payload, mode = "last", options = {}) {
  return recallQueryPlan(payload, mode, options).text;
}

/** 把记忆块拼到内容前面。string 与 parts 两种形态各自处理，尽量不新增 part。 */
export function prependBlock(content, block) {
  if (typeof content === "string") return `${block}\n\n${content}`;
  if (Array.isArray(content)) {
    const first = content[0];
    if (first && typeof first === "object" && typeof first.text === "string") {
      return [{ ...first, text: `${block}\n\n${first.text}` }, ...content.slice(1)];
    }
    return [{ type: "text", text: block }, ...content];
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return { ...content, text: `${block}\n\n${content.text}` };
  }
  return [{ type: "text", text: block }];
}

/** 把块接在内容末尾，string / parts / object 三种形态都尽量不新增 part。 */
function appendBlock(content, block) {
  if (typeof content === "string") return content ? `${content}\n\n${block}` : block;
  if (Array.isArray(content)) {
    const parts = content.slice();
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      if (part && typeof part === "object" && typeof part.text === "string") {
        parts[index] = { ...part, text: part.text ? `${part.text}\n\n${block}` : block };
        return parts;
      }
    }
    return [...parts, { type: "text", text: block }];
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return { ...content, text: content.text ? `${content.text}\n\n${block}` : block };
  }
  return [{ type: "text", text: block }];
}

/**
 * system 形态：把记忆放进 system prompt，用户消息保持干净。
 *
 * Hana 发出去的 payload 是 OpenAI 兼容形状，实测 system 在 messages[0] 的
 * role="system" 里（payload 没有独立的 system / systemPrompt 字段）。这里仍兼容
 * 那两种独立字段：字段存在就接在字段末尾；否则找第一条 system 消息；都没有就
 * 在最前面插一条。追加而不是替换：改得越少，模型原有系统指令越不容易被冲掉。
 */
export function injectSystemMemory(payload, block) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.system === "string") {
    return { ...payload, system: appendBlock(payload.system, block) };
  }
  if (typeof payload.systemPrompt === "string") {
    return { ...payload, systemPrompt: appendBlock(payload.systemPrompt, block) };
  }
  if (!Array.isArray(payload.messages)) return null;
  const messages = payload.messages.slice();
  const index = messages.findIndex((message) => message?.role === "system");
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      content: appendBlock(readContent(messages[index]), block),
    };
  } else {
    messages.unshift({ role: "system", content: block });
  }
  return { ...payload, messages };
}

/**
 * 往 payload 里注一段记忆。成功返回新 payload，不认识的形状返回 null。
 * 不改原对象：宿主手里那份要原样留着。
 */
export function injectMemory(payload, block) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!Array.isArray(payload.messages)) return null;
  const index = lastUserIndex(payload.messages);
  if (index < 0) return null;

  const message = payload.messages[index];
  const content = readContent(message);
  const next = writeContent(message, prependBlock(content, block));

  const messages = payload.messages.slice();
  messages[index] = next;
  return { ...payload, messages };
}

/** 粗估 token：CJK 一字按 1，其余按 4 字符 1。只用于本地兜底，不用于计费。 */
export function estimateTokens(text) {
  if (typeof text !== "string" || !text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x3400 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return cjk + Math.ceil(other / 4);
}

/** 超预算就从尾部截断，保留开头（检索结果按相关度降序）。 */
export function trimToBudget(text, budgetTokens) {
  if (!text) return "";
  if (!budgetTokens || estimateTokens(text) <= budgetTokens) return text;
  const chars = Array.from(text);
  let keep = Math.max(16, Math.floor(chars.length * (budgetTokens / estimateTokens(text))));
  keep = Math.min(keep, chars.length);
  return `${chars.slice(0, keep).join("").trimEnd()}…`;
}

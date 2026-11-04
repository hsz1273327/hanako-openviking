// 注入计划：把一段记忆块放进"即将发给 provider 的请求"。
//
// 三条纪律（DESIGN 五.C）：
//   1. 不新增 message，只改最后一条 user 消息的内容。消息条数一变，宿主与 provider
//      都可能重新解释这段历史；改内容不会。
//   2. 标记固定且可剥离。写回时要靠它把注入段滤掉，否则召回的内容会被当成
//      "这轮说过的话"再写回去，几轮之后库里的记忆就全是关于记忆的记忆。
//   3. 形状不认识就返回 null。宁可这轮不召回，也不能把 payload 改坏。

export const MEMORY_TAG_OPEN = "<openviking-memory>";
export const MEMORY_TAG_CLOSE = "</openviking-memory>";

const INJECTED_RE = /<openviking-memory>[\s\S]*?<\/openviking-memory>\s*/g;

/** 去掉已经注进去的记忆块，得到"人真正说过的话"。去重键必须建立在干净文本上。 */
export function stripInjected(text) {
  if (typeof text !== "string") return "";
  return text.replace(INJECTED_RE, "").trim();
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

/** context 查询的总长上限（按字符/码点算，不按 UTF-16 码元）。 */
export const CONTEXT_CHARS_MAX = 300;

function charLength(text) {
  return Array.from(text).length;
}

/** 从开头截断，保留尾部：最旧那条被截的是开头，最新那条保持完整。 */
function clipStart(text, keep) {
  if (keep <= 0) return "";
  const chars = Array.from(text);
  return chars.length <= keep ? text : chars.slice(chars.length - keep).join("");
}

/**
 * 拼最近几条用户文本（从旧到新，换行分隔）。
 *
 * 规则：
 *   1. 从新到旧最多取 CONTEXT_MESSAGES_MAX 条 user 消息；
 *   2. 相邻两条文本完全相同就去重；
 *   3. 总量超过 CONTEXT_CHARS_MAX 时从最旧一条的开头截断，最新一条保持完整；
 *   4. 一条都没有时返回空串，由 recallQuery 退回 last 的单条行为。
 *
 * 最新一条自己就超过上限时同样保持完整：宁可多带一点，也不把用户刚说的话切掉。
 */
export function contextQuery(
  payload,
  { limit = CONTEXT_MESSAGES_MAX, maxChars = CONTEXT_CHARS_MAX } = {},
) {
  const messages = payload?.messages;
  if (!Array.isArray(messages) || limit <= 0) return "";

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

/** 按配置取查询文本。context 拼不出东西时退回 last 的单条行为。 */
export function recallQuery(payload, mode = "last") {
  if (mode !== "context") return lastUserText(payload);
  return contextQuery(payload) || lastUserText(payload);
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

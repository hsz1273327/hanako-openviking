// 写回：把本地会话增量送进 OpenViking。
//
// 链路（agent/settled 触发一次）：
//   settled → 读 JSONL 增量 → 与服务端会话状态对账 → 建会话 / 同步兜底策略
//   → 写消息（messages/batch）→ 按策略判断要不要提交 → commit → 落本地游标
//
// 硬纪律：
//   - 上传不触发提取，只有 commit 触发；所以「什么时候 commit」是这条链路的核心。
//   - 任何失败都不许把异常丢回宿主：钩子失败只记一条 warn，下一轮 settled 再试。
//   - 日志里不写正文、API Key、服务地址。
//   - 网络一律走 client.js / transport / postJson，不裸 fetch。

import fs from "node:fs";
import { createClient } from "../ov/client.js";
import { resolvePeer } from "../ov/identity.js";
import {
  CAPTURE_TOPIC_QUESTION,
  DEFAULT_CAPTURE_CONSISTENCY_PROMPT,
  DEFAULT_CAPTURE_FORMAT,
  DEFAULT_CAPTURE_TEMPLATE,
} from "../ov/prompt-defaults.js";
import {
  CAPTURE_COMMIT_TURNS_DEFAULT,
  CAPTURE_MIN_TURNS_DEFAULT,
  readConnection,
  readSwitches,
} from "../ov/settings.js";
import { transportFor } from "../ov/transport.js";
import { effective, patchSession, readSession, sessionKeyOf } from "../state/session.js";
import {
  advanceCursor,
  batchMessagesByTurn,
  captureMessages,
  collectDelta,
  countTurns,
  markCommitted,
  normalizeCursor,
  parseSessionLines,
  reconcileCapture,
  tailTurns,
} from "./cursor.js";
import { askModelChannel, postJson, serviceAuthHeaders } from "./recall.js";
import { readSessionText } from "./session-reader.js";
import { candidatePool, readTopics, recordSegment, withTopics } from "./topics.js";

/**
 * 内置默认题面（面板里可编辑的那一格）。字面量在 src/ov/prompt-defaults.js——
 * settings.js 的写时归一与启动迁移也要用它。继续从本模块导出，原有引用不用改。
 * 答案格式由 captureFormat 决定，空串时用 DEFAULT_CAPTURE_FORMAT。
 */
export { CAPTURE_TOPIC_QUESTION };

/** 答案格式的默认值；字面量在 prompt-defaults.js（= DEFAULT_CAPTURE_FORMAT），settings 的写时归一也要用。 */
export const CAPTURE_TOPIC_FORMAT = DEFAULT_CAPTURE_FORMAT;

/** 提前提交第一步的默认题面；空串 = 用这一份。 */
export const CAPTURE_CONSISTENCY_PROMPT = DEFAULT_CAPTURE_CONSISTENCY_PROMPT;

export const CAPTURE_SAMPLE_CHARS = 1200;
export const CAPTURE_ASK_TIMEOUT_MS = 6000;
// 三行回答里简述最长 500 字，64 个 token 会被截断；给足预算，别让 label/summary 因为截断变空。
export const CAPTURE_ASK_MAX_TOKENS = 1024;

function clipChars(text, max) {
  const chars = Array.from(typeof text === "string" ? text : "");
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
}

const ROLE_LABELS = Object.freeze({ user: "[用户]", assistant: "[助手]" });

function renderMessages(messages) {
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const label = ROLE_LABELS[message?.role];
    if (!label) continue;
    const text = typeof message?.content === "string" ? message.content : "";
    out.push(`${label} ${clipChars(text, CAPTURE_SAMPLE_CHARS)}`);
  }
  return out;
}

/**
 * 候选题面：先问属于哪个，再列已有话题，最后给「之前 / 现在」两段上下文。
 *
 * 骨架由 captureTemplate 决定（默认见 DEFAULT_CAPTURE_TEMPLATE），五个占位符单次替换：
 * 值里再出现 {{xxx}} 不会被二次展开。format 为空时，{{format}} 那一行连同前面的空行一起去掉。
 * 每条消息各自截到 CAPTURE_SAMPLE_CHARS，不做整段截断。
 */
export function renderTopicPrompt(
  previousMessages,
  currentMessages,
  candidates = [],
  question = CAPTURE_TOPIC_QUESTION,
  format = CAPTURE_TOPIC_FORMAT,
  template = DEFAULT_CAPTURE_TEMPLATE,
) {
  const list = Array.isArray(candidates) ? candidates : [];
  const values = {
    question: String(question || CAPTURE_TOPIC_QUESTION),
    candidates: list.length
      ? list.map((topic, index) => `[${index + 1}] ${topic.label} —— ${topic.summary}`).join("\n")
      : "（无）",
    previous: renderMessages(previousMessages).join("\n"),
    current: renderMessages(currentMessages).join("\n"),
    format: format ? String(format) : "",
  };
  let tpl = String(template || DEFAULT_CAPTURE_TEMPLATE);
  // 空段落不留一行空行：占位符独占一行且值为空时，连它前面那个换行一起去掉。
  for (const key of ["previous", "current"]) {
    if (!values[key]) tpl = tpl.split(`\n{{${key}}}`).join("");
  }
  if (!values.format) {
    // 跟旧的 if (format) 一致：没有格式说明就不留那一段和它前面的空行。
    tpl = tpl.replace(/\n\n\{\{format\}\}(?=\n|$)/g, "").replace(/\{\{format\}\}\n?/g, "");
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

// 模板缺 {{current}} 时只在第一次回退时警告，不每轮刷屏。
let templateFallbackWarned = false;

/** 测试用：让「只警告一次」重新生效。 */
export function resetCaptureTemplateWarning() {
  templateFallbackWarned = false;
}

/**
 * 取这一轮该用的骨架。空串 = 内置默认；缺 {{current}} 的模板判无效，回退内置并警告一次。
 * 模板写坏了、模型只看到一堆空话，判断会悄悄失效——所以这里不能静默。
 */
export function resolveCaptureTemplate(switches, sdk) {
  const raw = typeof switches?.captureTemplate === "string" ? switches.captureTemplate : "";
  if (!raw) return DEFAULT_CAPTURE_TEMPLATE;
  if (!raw.includes("{{current}}")) {
    if (!templateFallbackWarned) {
      templateFallbackWarned = true;
      warn(sdk, "captureTemplate 缺少 {{current}}，已回退内置模板");
    }
    return DEFAULT_CAPTURE_TEMPLATE;
  }
  return raw;
}

/** 取这一轮该用的答案格式：空串 = 内置默认，没有「判无效回退」这一说。 */
export function resolveCaptureFormat(switches) {
  const raw = typeof switches?.captureFormat === "string" ? switches.captureFormat : "";
  return raw || DEFAULT_CAPTURE_FORMAT;
}

/** 去掉 markdown 装饰（加粗 / 斜体 / 代码 / 引用），保留正文。 */
function stripDecoration(text) {
  return String(text ?? "").replace(/[*_`>]/g, "");
}

/** 一行里冒号后面的那段值；认全角与半角冒号，允许行首空格与 markdown 装饰。 */
function fieldValue(line, name) {
  const cleaned = stripDecoration(line).replace(/^[\s#\-]+/, "");
  // 冒号（全角/半角）与「是」都认：模型常写「主题是…」「**主题**：…」。
  const match = cleaned.match(new RegExp(`^${name}\\s*(?:[：:]|是)\\s*(.*)$`));
  return match ? match[1].trim() : "";
}

function saysNew(text) {
  const value = stripDecoration(text).trim();
  if (!value) return false;
  return (
    value.toLowerCase().includes("new") ||
    value.includes("新话题") ||
    value.includes("都不是") ||
    /^新(\s|$)/.test(value)
  );
}

/** 在这段文字里找第一个落在 1..max 的整数。 */
function pickNumber(text, max) {
  for (const match of stripDecoration(text).matchAll(/\d+/g)) {
    const value = Number(match[0]);
    if (Number.isInteger(value) && value >= 1 && value <= max) return value;
  }
  return null;
}

/**
 * 归类读数：返回 { choice, label }，认不出返回 null（不猜）。
 *
 * choice 是 "new" 或 1..candidates.length；label 是「主题：」那行，没有就是空串。
 * 顺序：先看「归属：」行，再退到全文（兼容只回编号的老回答与带解释的回答）。
 */
export function parseTopicAnswer(text, candidates) {
  if (typeof text !== "string") return null;
  const normalized = text.trim();
  if (!normalized) return null;
  const list = Array.isArray(candidates) ? candidates : [];
  const max = list.length;
  const lines = normalized.split(/\r?\n/);

  let label = "";
  let summary = "";
  let choice = null;

  for (const line of lines) {
    const theme = fieldValue(line, "主题");
    if (theme) {
      // 主题与归属写在同一行时，只取「归属」之前那截。
      const cut = theme.split(/(?:^|\s)归属\s*(?:[：:]|是)/)[0];
      label = stripDecoration(cut).replace(/\s+/g, " ").trim();
      break;
    }
  }

  // 简述：只认「简述：」这一种写法。
  for (const line of lines) {
    const value = fieldValue(line, "简述");
    if (value) {
      summary = clipTopicSummary(stripDecoration(value));
      break;
    }
  }

  // 1. 「归属：」行优先：只在这一行里认。
  for (const line of lines) {
    const value = fieldValue(line, "归属");
    if (!value) continue;
    if (saysNew(value)) {
      choice = "new";
    } else {
      choice = pickNumber(value, max);
    }
    break;
  }

  // 2. 全文兜底：new 同义词 → 整行裸数字 → 第一个 1..N 的整数 → 候选 label 原文。
  if (choice === null) {
    if (saysNew(normalized)) {
      choice = "new";
    } else {
      for (const line of lines) {
        const bare = stripDecoration(line).replace(/^[\s#\-]+/, "").trim();
        if (!/^\d+$/.test(bare)) continue;
        const value = Number(bare);
        if (Number.isInteger(value) && value >= 1 && value <= max) {
          choice = value;
          break;
        }
      }
      if (choice === null) choice = pickNumber(normalized, max);
      if (choice === null) {
        const labels = list
          .map((topic, index) => ({ label: String(topic?.label ?? "").trim(), index }))
          .filter((item) => item.label)
          .sort((a, b) => b.label.length - a.label.length);
        for (const item of labels) {
          if (normalized.includes(item.label)) {
            choice = item.index + 1;
            break;
          }
        }
      }
    }
  }

  if (choice === null) return null;
  return { choice, label: clipTopicLabel(label), summary };
}

/** 把一段消息压成一行，按字符截断。 */
/** 一致性题面的生效值：空串 / 空白 → 内置默认，其余原样（不 trim 用户那句）。 */
export function resolveCaptureConsistencyPrompt(switches) {
  const value =
    typeof switches?.captureConsistencyPrompt === "string"
      ? switches.captureConsistencyPrompt
      : "";
  return value.trim() ? value : CAPTURE_CONSISTENCY_PROMPT;
}

/** 第一步的上下文：当前话题是什么 + 这一段新对话，不含题面本身。 */
export function renderConsistencyContext(topic, messages) {
  const label = String(topic?.label ?? "").trim();
  const summary = String(topic?.summary ?? "").trim();
  const head = summary ? `${label} —— ${summary}` : label;
  const body = renderMessages(messages).join("\n");
  return `当前话题：${head || "（未命名）"}\n\n新的对话：\n${body}`;
}

/** 第一步的完整题面：题面 + 上下文。 */
export function renderConsistencyPrompt(topic, messages, question = CAPTURE_CONSISTENCY_PROMPT) {
  const ask = String(question || CAPTURE_CONSISTENCY_PROMPT);
  return `${ask}\n\n${renderConsistencyContext(topic, messages)}`;
}

/**
 * 第一步答案的读数：宽容匹配一致 / 换了，两边都不像就是没答。
 *
 * 「不一致」先按换了算，别被里面的「一致」带跑。只认一个词或一句话里的明确措辞，
 * 不做模糊相似度：判不出来就让这一轮不提交，比猜一个错的方向安全。
 */
export function parseConsistencyAnswer(text) {
  const cleaned = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[。．.!！?？,，、;；:："'“”‘’\s]/g, "");
  if (!cleaned) return null;
  if (/换了|不同|不一致|新话题|另一个|diff|different|new/.test(cleaned)) return false;
  if (/一致|相同|同一|继续|same/.test(cleaned)) return true;
  if (cleaned === "同") return true;
  if (cleaned === "新") return false;
  return null;
}

function oneLine(text, max) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  return clipChars(collapsed, max);
}

/** 标题 30 字、简述 500 字：中文按字、英文单词按 1 个计数；截断后去掉尾部标点。 */
export const CAPTURE_TITLE_MAX_UNITS = 30;
export const CAPTURE_SUMMARY_MAX_UNITS = 500;
const TRAILING_PUNCT = /[\s，。；、！？：,.;:!?…—–~·]+$/u;

function takeUnits(text, max) {
  const source = String(text ?? "");
  let out = "";
  let count = 0;
  for (let index = 0; index < source.length; ) {
    const ch = String.fromCodePoint(source.codePointAt(index));
    if (/[A-Za-z0-9]/.test(ch)) {
      let end = index;
      while (end < source.length && /[A-Za-z0-9'’_-]/.test(source[end])) end += 1;
      if (count + 1 > max) break;
      out += source.slice(index, end);
      count += 1;
      index = end;
    } else {
      if (count + 1 > max) break;
      out += ch;
      count += 1;
      index += ch.length;
    }
  }
  return out;
}

function clipWithUnits(text, max) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return takeUnits(flat, max).replace(TRAILING_PUNCT, "").trim();
}

export function clipTopicLabel(text, max = CAPTURE_TITLE_MAX_UNITS) {
  return clipWithUnits(text, max);
}

export function clipTopicSummary(text, max = CAPTURE_SUMMARY_MAX_UNITS) {
  return clipWithUnits(text, max);
}

/** 命令行 / 路径 / 代码块这类开头不像话题标题，清洗后返回空串。 */
const COMMAND_PREFIX =
  /^(?:cd|git|npm|pnpm|yarn|npx|ls|cat|head|tail|grep|rg|find|node|python3?|pip3?|uv|curl|wget|docker|make|sudo|brew|ssh|scp|rsync|chmod|mkdir|rm|mv|cp|sed|awk|tar|systemctl|journalctl)\b/i;

/**
 * 把一段原文清洗成能当标题的一句：去 markdown 装饰与行首标记，跳过路径、代码块、
 * 命令行、纯符号。返回空串表示「这句不像人话」，由调用方继续找下一句。
 */
export function cleanTitleText(text) {
  if (String(text ?? "").trimStart().startsWith("```")) return "";
  const stripped = stripDecoration(text)
    .replace(/^[\s#>\-+]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  if (stripped.startsWith("```")) return "";
  if (stripped.startsWith("/") || stripped.startsWith("~")) return "";
  if (COMMAND_PREFIX.test(stripped)) return "";
  if (!/[0-9A-Za-z\u4e00-\u9fff]/.test(stripped)) return "";
  return stripped;
}

/**
 * 新话题的 label / summary 就地派生，不再多花一次模型调用。
 * label 优先用判断器给的「主题」，没有就退回本段第一条 user 消息（没有 user 用第一条）。
 * summary 始终取本段第一条消息。
 */
export function deriveTopicTitle(segment, theme = "", modelSummary = "") {
  const list = Array.isArray(segment) ? segment : [];
  const first = list[0];
  const firstUser = list.find((message) => message?.role === "user") || first;
  const fromTheme = clipTopicLabel(cleanTitleText(theme));
  // 模型给了主题就优先用；没有主题才从本段消息里找第一句像人话的。
  let labelText = fromTheme;
  if (!labelText) {
    // 优先从 user 消息里找（用户的话更像话题），再轮到其它角色。
    const ordered = [firstUser, ...list.filter((message) => message !== firstUser)];
    for (const message of ordered) {
      const candidate = cleanTitleText(message?.content);
      if (candidate) {
        labelText = candidate;
        break;
      }
    }
  }
  // 一条像样的都没有：退回原文（至少能看见是什么），不要凭空造标题。
  if (!labelText) labelText = String(theme ?? "").trim() || String(firstUser?.content ?? "");
  const label = clipTopicLabel(labelText);
  // 简述优先用模型那句；只给了主题就用主题；都没有才退回清洗后的第一条消息。
  const summarySource =
    clipTopicSummary(modelSummary) ||
    fromTheme ||
    cleanTitleText(first?.content) ||
    first?.content ||
    "";
  const summary = clipTopicSummary(summarySource);
  return { label: label || "新话题", summary };
}

/** 提交时的三件套 tag。key=value 严格格式：空白与 = 都换成 -。 */
export function captureTags(topic, seq) {
  const slug = (s) =>
    String(s ?? "")
      .replace(/[\s=]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return [
    `topic-id=${topic?.id ?? ""}`,
    `topic-seq=${seq}`,
    `topic-label=${slug(topic?.label) || "topic"}`,
  ];
}

/**
 * 这一轮该不该提交。纯判断，不碰网络；classify 由调用方注入。
 *
 * 顺序就是优先级：强制轮数先于「提前提交」；判断失败一律不提交，等下一轮。
 */
export async function captureDecision({
  early,
  pendingTurns,
  forcedTurns,
  minTurns,
  currentTopic,
  probe,
  classify,
} = {}) {
  const turns = Number(pendingTurns);
  if (!Number.isFinite(turns) || turns <= 0) return { commit: false, reason: "empty" };

  const forced = Number.isFinite(Number(forcedTurns))
    ? Number(forcedTurns)
    : CAPTURE_COMMIT_TURNS_DEFAULT;
  const runClassify = async () => {
    if (typeof classify !== "function") return null;
    try {
      const verdict = await classify();
      return verdict && typeof verdict === "object" ? verdict : null;
    } catch {
      return null;
    }
  };

  // 强制线也走第二步：提交出去的东西必须有归属，不能因为轮数到了就跳过归类。
  // 只跳过第一步的一致性比较（没必要再问「还在不在」）。
  if (turns >= forced) {
    return { commit: true, reason: "turns", verdict: await runClassify() };
  }
  if (early !== true) return { commit: false, reason: "below-limit" };

  const min = Number.isFinite(Number(minTurns))
    ? Number(minTurns)
    : CAPTURE_MIN_TURNS_DEFAULT;
  if (turns < min) return { commit: false, reason: "too-few-turns" };

  // 没有缓存话题：先归类建锚点，但不提交、不推进游标。
  // 下次才有东西可以拿来做一致性比较；这一步不能顺手把记忆写出去。
  const topic = currentTopic && typeof currentTopic === "object" ? currentTopic : null;
  if (!topic || !topic.id) {
    return { commit: false, anchor: true, reason: "anchor", verdict: await runClassify() };
  }

  // 第一步：只回答还在这条话题上，还是换了。判不出来不提交，也不进第二步。
  if (typeof probe !== "function") return { commit: false, reason: "consistency-failed" };
  let same;
  try {
    same = await probe();
  } catch {
    return { commit: false, reason: "consistency-failed" };
  }
  if (same === true) return { commit: false, reason: "same-topic" };
  if (same !== false) return { commit: false, reason: "consistency-failed" };

  // 第二步：确定换了之后才归类，复用原来的题面 / 骨架 / 格式。
  if (typeof classify !== "function") return { commit: false, reason: "classify-failed" };
  let verdict;
  try {
    verdict = await classify();
  } catch {
    return { commit: false, reason: "classify-failed" };
  }
  if (!verdict || typeof verdict !== "object") {
    return { commit: false, reason: "classify-failed" };
  }
  // 第一步已经判定换了，就提交；第二步只决定归到哪个话题（哪怕归回当前这条，
  // 也以第一步的「换了」为准，不能把一次已经发生的切换吞掉）。
  return { commit: true, reason: "topic", verdict };
}

function reportOf(partial = {}) {
  return {
    skipped: null,
    reconcile: null,
    created: false,
    wrote: 0,
    patched: false,
    committed: false,
    anchored: false,
    mode: "fixed",
    topic: null,
    pendingTurns: 0,
    written: 0,
    error: null,
    ...partial,
  };
}

function errorText(error) {
  return String(error?.message || error || "unknown");
}

function warn(sdk, message) {
  try {
    sdk?.logger?.warn?.(`openviking capture: ${message}`);
  } catch {
    /* 日志不能反过来打断写回 */
  }
}

function warnFailed(sdk, error) {
  try {
    sdk?.logger?.warn?.(`openviking capture failed: ${errorText(error)}`);
  } catch {
    /* 同上 */
  }
}

function samePolicy(recorded, desired) {
  if (!recorded || typeof recorded !== "object") return false;
  return recorded.enabled === desired.enabled && recorded.idleSeconds === desired.idleSeconds;
}

function desiredPolicyOf(switches) {
  return switches.captureServerFallback === true
    ? { enabled: true, idleSeconds: switches.captureServerIdleSeconds }
    : { enabled: false, idleSeconds: null };
}

/**
 * 造归类器：判断方式只决定「怎么问」，返回的 verdict 形状是同一份。
 *
 * candidates 为空时不调模型，直接按新话题：没有候选就没有选项，空题面只会白花一次调用。
 * 判断失败（抛错 / 答案认不出 / 置信度缺失）返回 null，由调用方决定后果。
 */
function buildClassifier({ judge, sdk, switches, previous, segment, candidates }) {
  const current = Array.isArray(segment) ? segment : [];
  const pool = Array.isArray(candidates) ? candidates : [];
  const fallback = () => ({ kind: "new", ...deriveTopicTitle(current) });
  // 配置非空就用用户写的那句，否则用内置默认。trim 只用来判空，不把用户那句本身 trim 掉。
  const question = String(switches.capturePrompt ?? "").trim()
    ? switches.capturePrompt
    : CAPTURE_TOPIC_QUESTION;
  const template = resolveCaptureTemplate(switches, sdk);
  const format = resolveCaptureFormat(switches);
  const rendered = renderTopicPrompt(previous, current, pool, question, format, template);

  if (!pool.length) return async () => fallback();

  if (judge === "llm") {
    return async () => {
      const answer = await askModelChannel(sdk, {
        modelRef: switches.captureModel,
        prompt: rendered,
        timeoutMs: CAPTURE_ASK_TIMEOUT_MS,
        maxTokens: CAPTURE_ASK_MAX_TOKENS,
      });
      // 只打前 300 字与行数：用来分辨「模型没给主题」还是「给了但没解析出来」。
      const rawAnswer = String(answer ?? "");
      let answerHead = "";
      try {
        answerHead = JSON.stringify(rawAnswer.slice(0, 300));
        sdk.logger?.debug?.(
          `openviking topic answer: chars=${Array.from(rawAnswer).length} lines=${rawAnswer.split(/\r?\n/).length} head=${answerHead}`,
        );
      } catch {
        /* 日志不能影响判断 */
      }
      const parsed = parseTopicAnswer(answer, pool);
      // 宿主日志不落 debug（实测 0 条 DEBUG），新话题又没解析出主题时用 warn 再打一条：
      // 这正是会退回「第一句前 24 字」的那条路，不刷正常回答。
      if (parsed?.choice === "new" && !parsed.label) {
        try {
          sdk.logger?.warn?.(
            `openviking topic answer has no label: chars=${Array.from(rawAnswer).length} lines=${rawAnswer.split(/\r?\n/).length} head=${answerHead}`,
          );
        } catch {
          /* 日志不能影响判断 */
        }
      }
      if (!parsed) return null;
      if (parsed.choice === "new") {
        return { kind: "new", ...deriveTopicTitle(current, parsed.label, parsed.summary) };
      }
      return { kind: "existing", id: pool[parsed.choice - 1].id };
    };
  }

  if (judge === "discriminator") {
    return async () => {
      const endpoint = `${String(switches.systemoneServiceUrl || "").replace(/\/+$/, "")}/v1/systemone`;
      const criteria = {};
      pool.forEach((topic, index) => {
        criteria[`t${index + 1}`] = `属于话题「${topic.label}」`;
      });
      criteria.new = "不属于上面任何一个话题";
      const data = await postJson(
        sdk,
        endpoint,
        {
          model: switches.systemoneServiceModel,
          // choice 题的答案形状由 questions.q 决定，题面末尾不能带「只输出这两行」那类格式说明。
          state: { type: "text", content: renderTopicPrompt(previous, current, pool, question, "", template) },
          questions: {
            q: {
              type: "choice",
              instructions: question,
              criteria,
            },
          },
        },
        CAPTURE_ASK_TIMEOUT_MS,
        serviceAuthHeaders(switches.systemoneServiceKey),
      );
      const answer = data?.answers?.q;
      if (!answer || typeof answer !== "object") return null;
      if (!Number.isFinite(Number(answer.confidence))) return null;
      const choice = String(answer.choice ?? "").trim();
      if (choice === "new") return fallback();
      const match = /^t(\d+)$/i.exec(choice);
      if (!match) return null;
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index < 1 || index > pool.length) return null;
      return { kind: "existing", id: pool[index - 1].id };
    };
  }

  return async () => null;
}

/**
 * 一致性判断（提前提交第一步）的两条 criteria：判别模型只在这两者之间选。
 * 描述互斥、各自说清「什么样算这一边」；不由用户改，用户改的是题面。
 */
export const CAPTURE_CONSISTENCY_CRITERIA = Object.freeze({
  same: "这段新对话还在讲当前话题：在推进同一个问题、同一个模块、同一个决定。",
  changed: "这段新对话已经换到另一件事、另一个问题，或者另一个地方去了。",
});

/**
 * 造第一步的探针：返回 true=还在这条话题上，false=换了，null=没答出来。
 *
 * 大语言模型走宿主模型，只让回一个词；判别模型走 /v1/systemone 的 choice 题，
 * 两条 criteria 对应 same / changed，答案形状与召回那条一样是 answers.q.choice。
 */
function buildConsistencyProbe({ judge, sdk, switches, topic, segment }) {
  const current = Array.isArray(segment) ? segment : [];
  const question = resolveCaptureConsistencyPrompt(switches);

  if (judge === "llm") {
    const rendered = renderConsistencyPrompt(topic, current, question);
    return async () =>
      parseConsistencyAnswer(
        await askModelChannel(sdk, {
          modelRef: switches.captureModel,
          prompt: rendered,
          timeoutMs: CAPTURE_ASK_TIMEOUT_MS,
          // 只要一个词，给 32 个 token 足够；判不出来比编一个词安全。
          maxTokens: 32,
        }),
      );
  }

  if (judge === "discriminator") {
    const endpoint = `${String(switches.systemoneServiceUrl || "").replace(/\/+$/, "")}/v1/systemone`;
    const context = renderConsistencyContext(topic, current);
    return async () => {
      const data = await postJson(
        sdk,
        endpoint,
        {
          model: switches.systemoneServiceModel,
          state: { type: "text", content: context },
          questions: {
            q: {
              type: "choice",
              instructions: question,
              criteria: { ...CAPTURE_CONSISTENCY_CRITERIA },
            },
          },
        },
        CAPTURE_ASK_TIMEOUT_MS,
        serviceAuthHeaders(switches.systemoneServiceKey),
      );
      const answer = data?.answers?.q;
      if (!answer || typeof answer !== "object") return null;
      const choice = String(answer.choice ?? "").trim();
      if (choice === "same") return true;
      if (choice === "changed") return false;
      return null;
    };
  }

  return null;
}

/** 一次提交 / 锚点共用的判据范围：这一段、之前的上下文、候选池。 */
function segmentContextOf({ dataDir, sessionId, messages, cursor, switches }) {
  const list = Array.isArray(messages) ? messages : [];
  const base = normalizeCursor(cursor);
  const segment = list.slice(base.lastCommitMessageCount, base.lastMessageCount);
  const previous = tailTurns(
    list.slice(0, base.lastCommitMessageCount),
    switches?.captureContextTurns,
  );
  const candidates = candidatePool(readTopics(dataDir), {
    sessionId,
    scope: switches?.captureTopicScope,
    limit: switches?.captureTopicCandidates,
  });
  return { list, base, segment, previous, candidates };
}

/**
 * 拿到这一段的归类结论：调用方给了就用，没给才自己归类。
 * 判断失败按新话题处理，不让一次模型抽风变成漏写。
 */
async function resolveTopicVerdict({
  sdk,
  switches,
  judge,
  previous,
  segment,
  candidates,
  verdict,
  warnLine,
}) {
  if (verdict && typeof verdict === "object") return verdict;
  // 默认与实时链路同口径：恒取 captureEarlyJudge（顶层报告里的 mode 仍然是
  // captureEffectiveEarly ? judge : "fixed"，那个字段不动）。fixed 只作为兜底。
  const effectiveJudge = judge || switches?.captureEarlyJudge || "fixed";
  let topicVerdict = null;
  let classifyError = null;
  try {
    topicVerdict = await buildClassifier({
      judge: effectiveJudge,
      sdk,
      switches,
      previous,
      segment,
      candidates,
    })();
  } catch (error) {
    classifyError = error;
    warnLine(`topic judge failed at commit: ${errorText(error)}`);
  }
  if (topicVerdict && typeof topicVerdict === "object") return topicVerdict;
  // 判断失败不能变成漏写：按新话题落表。
  if (!classifyError) warnLine("topic judge failed at commit: 按新话题处理");
  return { kind: "new", ...deriveTopicTitle(segment) };
}

/**
 * 只建话题锚点：归类 → 落话题表，不 commit、不推进游标。
 *
 * 与 commitSegment 分开，是因为「记下这一段属于哪个话题」和「把这一段记忆提交出去」
 * 是两件事：首次提交前要先把锚点立起来，下一次才有东西可以比一致性，但这时
 * 不该产生任何服务端记忆。返回 { topic }。
 */
export async function anchorSegment({
  sdk,
  dataDir,
  sessionId,
  messages,
  cursor,
  switches,
  judge,
  nowIso,
  verdict,
  onWarn,
}) {
  const warnLine = typeof onWarn === "function" ? onWarn : (message) => warn(sdk, message);
  const { segment, previous, candidates } = segmentContextOf({
    dataDir,
    sessionId,
    messages,
    cursor,
    switches,
  });
  const topicVerdict = await resolveTopicVerdict({
    sdk,
    switches,
    judge,
    previous,
    segment,
    candidates,
    verdict,
    warnLine,
  });
  const at = typeof nowIso === "string" && nowIso ? nowIso : new Date().toISOString();
  const recorded = await withTopics(
    dataDir,
    (table) =>
      recordSegment(table, {
        verdict: topicVerdict,
        sessionId,
        at,
        label: topicVerdict.label,
        summary: topicVerdict.summary,
      }),
    { onWriteError: warnLine },
  );
  return {
    topic: {
      id: recorded.topic.id,
      seq: recorded.seq,
      label: recorded.topic.label,
      isNew: recorded.isNew,
    },
  };
}

/**
 * 提交一段：归类 → 落话题表 → 带三件套标签 commit → 推进本地游标。
 *
 * 实时写回（createCaptureHandler 的第 12 步）与存量补交（src/memory/backfill.js）
 * 共用这一份，否则两条路会各自长出「什么时候建话题」的两套规则。
 *
 * verdict 是调用方已经拿到的归类结论（实时链路的提前提交用过的那一份）；
 * 没有就自己归类，判断失败按新话题落表，不阻塞提交。
 * 提交失败会抛：调用方决定游标怎么收（实时链路不动，补交只推进 lastMessageCount）。
 *
 * 返回 { cursor, committed, topic }；topic = { id, seq, label, isNew }。
 */
export async function commitSegment({
  sdk,
  client,
  dataDir,
  sessionId,
  messages,
  cursor,
  switches,
  judge,
  nowIso,
  verdict,
  onWarn,
}) {
  const warnLine = typeof onWarn === "function" ? onWarn : (message) => warn(sdk, message);
  const { base, segment, previous, candidates } = segmentContextOf({
    dataDir,
    sessionId,
    messages,
    cursor,
    switches,
  });

  const topicVerdict = await resolveTopicVerdict({
    sdk,
    switches,
    judge,
    previous,
    segment,
    candidates,
    verdict,
    warnLine,
  });

  // 表与 commit 在同一次 withTopics 里：commit 失败表不落盘，游标也不动。
  const at = typeof nowIso === "string" && nowIso ? nowIso : new Date().toISOString();
  const recorded = await withTopics(
    dataDir,
    async (table) => {
      const outcome = recordSegment(table, {
        verdict: topicVerdict,
        sessionId,
        at,
        label: topicVerdict.label,
        summary: topicVerdict.summary,
      });
      const tags = captureTags(outcome.topic, outcome.seq);
      await client.commit(sessionId, { tags });
      return outcome;
    },
    { onWriteError: warnLine },
  );

  // 提交成功之后的游标。
  const next = markCommitted(base, {
    at,
    commitCount: base.lastCommitCount + 1,
  });
  return {
    cursor: next,
    committed: true,
    topic: {
      id: recorded.topic.id,
      seq: recorded.seq,
      label: recorded.topic.label,
      isNew: recorded.isNew,
    },
  };
}

/**
 * 造写回钩子。deps 只给冒烟换假实现用，生产传空对象。
 *
 * 每一步失败都短路成报告：off / no-session / readonly / no-connection /
 * no-transport / unreachable / error。报告是这条链路唯一可被断言的外观。
 */
export function createCaptureHandler(sdk, deps = {}) {
  // 会话文件在 Node 权限模型之外：fs 被拒时由 session-reader 降级到 runtime 子进程。
  const readFile = deps.readFile || ((file) => readSessionText(file, { logger: sdk?.logger }));
  const now = deps.now || (() => new Date().toISOString());
  const clientFor = deps.clientFor || createClient;
  // 同一个会话同时只跑一个写回：两轮 settled 挨得太近时，两次会读到同一份游标，
  // 把同一段增量写两遍。宁可这一轮 busy 跳过，下一轮 settled 会补上。
  const inFlight = new Set();

  return async function capture(invocation) {
    let mode = "fixed";
    try {
      const switches = await readSwitches(sdk);
      // 报告里的 mode = 这一轮的切段方式：提前提交生效时是判断方式，否则 fixed。
      const judge = switches.captureEarlyJudge;
      mode = switches.captureEffectiveEarly ? judge : "fixed";

      // 1. 总闸与写回开关：任一关掉都零网络。
      if (!switches.enabled || !switches.autoCapture) {
        return reportOf({ skipped: "off", mode });
      }

      // 2. 会话身份：宿主稳定 id（sess_…）与畸形串都过不了 sessionKeyOf。
      const sessionId = sessionKeyOf(invocation?.session?.sessionId);
      const sessionPath = invocation?.session?.sessionPath;
      if (!sessionId || typeof sessionPath !== "string" || !sessionPath) {
        return reportOf({ skipped: "no-session", mode });
      }

      // 已经有人在跑同一个会话：立刻返回，不读 JSONL、不发请求、不动游标。
      if (inFlight.has(sessionId)) return reportOf({ skipped: "busy", mode });
      inFlight.add(sessionId);
      try {
        const dataDir = deps.dataDir ?? sdk?.dataDir;
        const state = readSession(dataDir, sessionId);
        const eff = effective(switches, state);

        // 3. 只读是会话可覆盖的，必须看 effective。
        if (eff.readOnly) return reportOf({ skipped: "readonly", mode });

        // 4. 连接：没有地址 / key 不联网。
        const conn = await readConnection(sdk);
        if (!conn.serverUrl || !conn.apiKey) {
          return reportOf({ skipped: "no-connection", mode });
        }

        // 5. 读 JSONL，算增量。会话刚建、还没落盘时文件不存在，按空文件处理。
        let text = "";
        try {
          text = await readFile(sessionPath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        const records = parseSessionLines(typeof text === "string" ? text : String(text ?? ""));
        const messages = captureMessages(records);
        let cursor = normalizeCursor(state?.capture?.cursor);
        const delta = collectDelta(messages, cursor);

        // 6. 出站通道。
        const transport = transportFor(sdk);
        if (transport.mode === "down") {
          return reportOf({
            skipped: "no-transport",
            mode,
            written: cursor.lastMessageCount,
            pendingTurns: cursor.pendingTurns,
          });
        }
        const client = clientFor({ ...conn, ...transport });

        // 7. 读服务端会话。404 = 还没有这个会话，不是失败。
        let server = null;
        try {
          server = (await client.getSession(sessionId)) ?? null;
        } catch (error) {
          if (error?.status === 404) {
            server = null;
          } else {
            warn(sdk, `read session failed: ${errorText(error)}`);
            return reportOf({
              skipped: "unreachable",
              mode,
              written: cursor.lastMessageCount,
              pendingTurns: cursor.pendingTurns,
              error: errorText(error),
            });
          }
        }

        // 8. 对账。
        const verdict = reconcileCapture({ cursor, server });
        const fallback = switches.captureServerFallback === true;
        const desiredPolicy = desiredPolicyOf(switches);
        const idleSeconds = switches.captureServerIdleSeconds;
        let created = false;
        let patched = false;
        let wrote = 0;

        // 9. 会话生命周期。
        if (server === null) {
          try {
            await client.createSession({
              sessionId,
              ...(fallback
                ? { autoCommitPolicy: { idle_timeout_seconds: idleSeconds } }
                : {}),
            });
            created = true;
            cursor = normalizeCursor({ ...cursor, serverPolicy: desiredPolicy });
          } catch (error) {
            warn(sdk, `create session failed: ${errorText(error)}`);
            return reportOf({
              reconcile: verdict.state,
              mode,
              written: cursor.lastMessageCount,
              pendingTurns: cursor.pendingTurns,
              error: errorText(error),
            });
          }
        } else {
          // 只有「现在要开」或「本地记着它曾经是开的，需要撤销」才值得发 PATCH。
          // 从没给它设过策略（serverPolicy 为 null）时没有东西要撤：记成关即可，
          // 否则每台机器的每个已有会话都会白挨一发 PATCH。
          const needsPatch = fallback || cursor.serverPolicy?.enabled === true;
          if (samePolicy(cursor.serverPolicy, desiredPolicy)) {
            // 已经是想要的策略，不发请求。
          } else if (needsPatch) {
            try {
              await client.patchSessionConfig(sessionId, {
                auto_commit_policy: fallback
                  ? { idle_timeout_seconds: idleSeconds }
                  : null,
              });
              cursor = normalizeCursor({ ...cursor, serverPolicy: desiredPolicy });
              patched = true;
            } catch (error) {
              // 兜底是附加项：PATCH 失败不阻断本轮写消息。
              warn(sdk, `patch session config failed: ${errorText(error)}`);
            }
          } else {
            cursor = normalizeCursor({ ...cursor, serverPolicy: desiredPolicy });
          }
        }

        // 10. 写增量。失败即本轮结束：游标不动，下一轮靠对账兜住。
        if (verdict.write && delta.messages.length) {
          const peer = resolvePeer(conn, sessionPath);
          const batch = delta.messages.map((message) => ({
            role: message.role,
            content: message.content,
            created_at: message.timestamp,
            ...(peer ? { peer_id: peer } : {}),
          }));
          // messages/batch 一次最多 100 条；按轮切批，同一轮不跨批。
          const batches = batchMessagesByTurn(batch);
          for (const [index, part] of batches.entries()) {
            try {
              await client.addMessages(sessionId, part);
            } catch (error) {
              // 停在这一批：前面的批已经发出去了，游标不推进，下一轮按对账补。
              const detail = `batch ${index + 1}/${batches.length}: ${errorText(error)}`;
              warn(sdk, `write messages failed: ${detail}`);
              return reportOf({
                reconcile: verdict.state,
                mode,
                created,
                patched,
                written: cursor.lastMessageCount,
                pendingTurns: cursor.pendingTurns,
                error: detail,
              });
            }
          }
          cursor = advanceCursor(cursor, delta);
          wrote = batch.length;
        }

        // 11. 上次 commit 的回执：只更新本地计数，不许再提交一次。
        if (verdict.patch) {
          cursor = normalizeCursor({ ...cursor, ...verdict.patch });
        }

        // 12. 归类与 commit 判断。判据范围 = 上次提交之后的所有消息。
        const segment = messages.slice(cursor.lastCommitMessageCount, cursor.lastMessageCount);
        const pendingTurns = countTurns(segment);
        // 「之前」= 上次提交之前、最近 captureContextTurns 个完整轮；悬空 user 作引子。
        const previous = tailTurns(
          messages.slice(0, cursor.lastCommitMessageCount),
          switches.captureContextTurns,
        );
        const currentTopicId =
          typeof state?.capture?.topicId === "string" ? state.capture.topicId : "";
        // 候选池只读不写；归类本身不改表，落表要等 commit 成功（见下面 withTopics）。
        const topTable = readTopics(dataDir);
        // 会话缓存的当前话题：第一步拿它的 label + summary 跟这一段比。
        // 表里查不到（被删了 / 换了机器）按「没有缓存话题」处理，直接立基线。
        const currentTopic = currentTopicId
          ? topTable.topics.find((topic) => topic?.id === currentTopicId) || null
          : null;
        const candidates = candidatePool(topTable, {
          sessionId,
          scope: switches.captureTopicScope,
          limit: switches.captureTopicCandidates,
        });
        let classifyError = null;
        const probe = buildConsistencyProbe({
          judge,
          sdk,
          switches,
          topic: currentTopic,
          segment,
        });
        const classify = async () => {
          try {
            return await buildClassifier({
              judge,
              sdk,
              switches,
              previous,
              segment,
              candidates,
            })();
          } catch (error) {
            classifyError = error;
            throw error;
          }
        };

        let decision = { commit: false, reason: "empty" };
        if (verdict.mayCommit) {
          decision = await captureDecision({
            early: switches.captureEffectiveEarly,
            pendingTurns,
            forcedTurns: switches.captureCommitTurns,
            minTurns: switches.captureMinTurns,
            currentTopic,
            probe,
            classify,
          });
          if (classifyError) {
            // 探路失败本轮不切段；日志留证据，下一轮或强制轮数再来。
            warn(sdk, `topic judge failed: ${errorText(classifyError)}`);
            classifyError = null;
          } else if (decision.reason === "consistency-failed") {
            warn(sdk, "topic consistency check failed: 答案认不出，本轮不切段");
          } else if (decision.reason === "classify-failed") {
            warn(sdk, "topic judge failed: 答案认不出，本轮不切段");
          }
        }

        let committed = false;
        let anchored = false;
        let topicReport = null;
        let committedTopicId = "";
        if (decision.commit) {
          // 强制轮数 / 基线这两条路没有 verdict；commitSegment 内部补一次归类
          // （失败按新话题落，不阻塞写入）。判断失败不能变成漏写。
          const commitAt = now();
          try {
            const out = await commitSegment({
              sdk,
              client,
              dataDir,
              sessionId,
              messages,
              cursor,
              switches,
              // 归类方式与实时链路原来的 classify 一致：取 captureEarlyJudge，
              // 与「这一轮是不是提前提交」无关（报告里的 mode 才看 early）。
              judge,
              nowIso: commitAt,
              verdict: decision.verdict || null,
            });
            cursor = out.cursor;
            committed = true;
            committedTopicId = out.topic.id;
            topicReport = out.topic;
          } catch (error) {
            // 提交失败：游标不动，话题表也不落。下一轮对账会认出来。
            warn(sdk, `commit failed: ${errorText(error)}`);
          }
        } else if (decision.anchor) {
          // 只建锚点：归类落表 + 写 capture.topicId，不 commit、不推进游标。
          // 这是「先有可比的对象」，与服务端记忆无关。
          try {
            const out = await anchorSegment({
              sdk,
              dataDir,
              sessionId,
              messages,
              cursor,
              switches,
              judge,
              nowIso: now(),
              verdict: decision.verdict || { kind: "new", ...deriveTopicTitle(segment) },
            });
            committedTopicId = out.topic.id;
            topicReport = out.topic;
            anchored = true;
          } catch (error) {
            warn(sdk, `anchor topic failed: ${errorText(error)}`);
          }
        }

        // 13. 落盘：会话卡的四行与下一轮游标。
        //
        // pendingTurns 以 segment 口径为准（上次提交之后的所有消息），不沿用
        // advanceCursor 那份只看 delta 的累加：跨边界的半轮必须在这里补齐，
        // 否则「会话卡显示待提交 N 轮」与「提交判断」会各说各话。
        cursor = normalizeCursor({
          ...cursor,
          pendingTurns: countTurns(
            messages.slice(cursor.lastCommitMessageCount, cursor.lastMessageCount),
          ),
        });
        const at = now();
        const totalTurns = countTurns(messages.slice(0, cursor.lastMessageCount));
        patchSession(dataDir, sessionId, {
          capture: {
            turns: totalTurns,
            cursor,
            lastAt: at,
            ...(committedTopicId ? { topicId: committedTopicId } : {}),
          },
        });

        return reportOf({
          reconcile: verdict.state,
          mode,
          created,
          wrote,
          patched,
          committed,
          anchored,
          topic: topicReport,
          pendingTurns: cursor.pendingTurns,
          written: cursor.lastMessageCount,
          error: null,
        });
      } finally {
        inFlight.delete(sessionId);
      }
    } catch (error) {
      // 钩子绝不把异常丢回宿主。
      warnFailed(sdk, error);
      return reportOf({ skipped: "error", mode, error: errorText(error) });
    }
  };
}

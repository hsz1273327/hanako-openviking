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
  CAPTURE_COMMIT_TURNS_DEFAULT,
  CAPTURE_MIN_TURNS_DEFAULT,
  readConnection,
  readSwitches,
} from "../ov/settings.js";
import { transportFor } from "../ov/transport.js";
import { effective, patchSession, readSession, sessionKeyOf } from "../state/session.js";
import {
  advanceCursor,
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
import { candidatePool, readTopics, recordSegment, withTopics } from "./topics.js";

/** 内置默认题面（面板里可编辑的那一格）；答案格式由代码固定追加，见 CAPTURE_TOPIC_FORMAT。 */
export const CAPTURE_TOPIC_QUESTION =
  "下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。";

/** 答案格式：固定追加，不进用户可编辑的那一格。解析靠它，题面只决定怎么问。 */
export const CAPTURE_TOPIC_FORMAT = [
  "按这个格式回答：",
  "主题：<一句话概括这段在讲什么>",
  "归属：<编号> 或 new",
  "只输出这两行。",
].join("\n");

export const CAPTURE_SAMPLE_CHARS = 1200;
export const CAPTURE_ASK_TIMEOUT_MS = 1500;
// 回答从一行变成两行（主题 + 归属），12 会把「主题」那句截没，新话题的 label 就永远是空的。
export const CAPTURE_ASK_MAX_TOKENS = 64;

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
 * 每条消息各自截到 CAPTURE_SAMPLE_CHARS，不做整段截断：前一条被截了，
 * 后面的消息仍然要在题面里。
 */
export function renderTopicPrompt(
  previousMessages,
  currentMessages,
  candidates = [],
  question = CAPTURE_TOPIC_QUESTION,
  format = CAPTURE_TOPIC_FORMAT,
) {
  const list = Array.isArray(candidates) ? candidates : [];
  const lines = [
    String(question || CAPTURE_TOPIC_QUESTION),
    "",
    "已有话题：",
    ...(list.length
      ? list.map((topic, index) => `[${index + 1}] ${topic.label} —— ${topic.summary}`)
      : ["（无）"]),
    "",
    "之前（供参考）：",
    ...renderMessages(previousMessages),
    "",
    "对话：",
    ...renderMessages(currentMessages),
  ];
  // 答案格式是给生成式模型的；choice 题的答案形状由 questions 决定，传空串就不追加。
  if (format) lines.push("", String(format));
  return lines.join("\n");
}

/** 去掉 markdown 装饰（加粗 / 斜体 / 代码 / 引用），保留正文。 */
function stripDecoration(text) {
  return String(text ?? "").replace(/[*_`>]/g, "");
}

/** 一行里冒号后面的那段值；认全角与半角冒号，允许行首空格与 markdown 装饰。 */
function fieldValue(line, name) {
  const cleaned = stripDecoration(line).replace(/^[\s#\-]+/, "");
  const match = cleaned.match(new RegExp(`^${name}\\s*[：:]\\s*(.*)$`));
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
  let choice = null;

  for (const line of lines) {
    const theme = fieldValue(line, "主题");
    if (theme) {
      label = stripDecoration(theme).replace(/\s+/g, " ").trim();
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
  return { choice, label };
}

/** 把一段消息压成一行，按字符截断。 */
function oneLine(text, max) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  return clipChars(collapsed, max);
}

/**
 * 新话题的 label / summary 就地派生，不再多花一次模型调用。
 * label 优先用判断器给的「主题」，没有就退回本段第一条 user 消息（没有 user 用第一条）。
 * summary 始终取本段第一条消息。
 */
export function deriveTopicTitle(segment, theme = "") {
  const list = Array.isArray(segment) ? segment : [];
  const first = list[0];
  const firstUser = list.find((message) => message?.role === "user") || first;
  const label = oneLine(String(theme ?? "").trim() ? theme : firstUser?.content, 24);
  const summary = oneLine(first?.content, 80);
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
  previousEmpty,
  currentTopicId,
  classify,
} = {}) {
  const turns = Number(pendingTurns);
  if (!Number.isFinite(turns) || turns <= 0) return { commit: false, reason: "empty" };

  const forced = Number.isFinite(Number(forcedTurns))
    ? Number(forcedTurns)
    : CAPTURE_COMMIT_TURNS_DEFAULT;
  // 强制线不吃最少轮数，也不问模型：攒够了就交。
  if (turns >= forced) return { commit: true, reason: "turns" };
  if (early !== true) return { commit: false, reason: "below-limit" };

  const min = Number.isFinite(Number(minTurns))
    ? Number(minTurns)
    : CAPTURE_MIN_TURNS_DEFAULT;
  if (turns < min) return { commit: false, reason: "too-few-turns" };
  // 「之前」还是空的（全新建会话 / 刚从零开始）：没有可比的一段，直接立基线。
  if (previousEmpty === true) return { commit: true, reason: "baseline" };
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
  if (verdict.kind === "new") return { commit: true, reason: "topic", verdict };
  if (verdict.id === currentTopicId) return { commit: false, reason: "same-topic" };
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
  const rendered = renderTopicPrompt(previous, current, pool, question);

  if (!pool.length) return async () => fallback();

  if (judge === "llm") {
    return async () => {
      const answer = await askModelChannel(sdk, {
        modelRef: switches.captureModel,
        prompt: rendered,
        timeoutMs: CAPTURE_ASK_TIMEOUT_MS,
        maxTokens: CAPTURE_ASK_MAX_TOKENS,
      });
      const parsed = parseTopicAnswer(answer, pool);
      if (!parsed) return null;
      if (parsed.choice === "new") {
        return { kind: "new", ...deriveTopicTitle(current, parsed.label) };
      }
      return { kind: "existing", id: pool[parsed.choice - 1].id };
    };
  }

  if (judge === "discriminator") {
    return async () => {
      const endpoint = `${String(switches.captureServiceUrl || "").replace(/\/+$/, "")}/v1/systemone`;
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
          state: { type: "text", content: renderTopicPrompt(previous, current, pool, question, "") },
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
 * 造写回钩子。deps 只给冒烟换假实现用，生产传空对象。
 *
 * 每一步失败都短路成报告：off / no-session / readonly / no-connection /
 * no-transport / unreachable / error。报告是这条链路唯一可被断言的外观。
 */
export function createCaptureHandler(sdk, deps = {}) {
  const readFile = deps.readFile || ((file) => fs.readFileSync(file, "utf8"));
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
          try {
            await client.addMessages(sessionId, batch);
            cursor = advanceCursor(cursor, delta);
            wrote = batch.length;
          } catch (error) {
            warn(sdk, `write messages failed: ${errorText(error)}`);
            return reportOf({
              reconcile: verdict.state,
              mode,
              created,
              patched,
              written: cursor.lastMessageCount,
              pendingTurns: cursor.pendingTurns,
              error: errorText(error),
            });
          }
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
        const previousEmpty = previous.length === 0;
        const currentTopicId =
          typeof state?.capture?.topicId === "string" ? state.capture.topicId : "";
        // 候选池只读不写；归类本身不改表，落表要等 commit 成功（见下面 withTopics）。
        const topics = readTopics(dataDir);
        const candidates = candidatePool(topics, {
          sessionId,
          scope: switches.captureTopicScope,
          limit: switches.captureTopicCandidates,
        });
        let classifyError = null;
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
            previousEmpty,
            currentTopicId,
            classify,
          });
          if (classifyError) {
            // 探路失败本轮不切段；日志留证据，下一轮或强制轮数再来。
            warn(sdk, `topic judge failed: ${errorText(classifyError)}`);
            classifyError = null;
          } else if (decision.reason === "classify-failed") {
            warn(sdk, "topic judge failed: 答案认不出，本轮不切段");
          }
        }

        let committed = false;
        let topicReport = null;
        let committedTopicId = "";
        if (decision.commit) {
          // 强制轮数 / 基线这两条路没有 verdict；提交时补一次归类。
          // 这里失败按新话题落，不阻塞写入（判断失败不能变成漏写）。
          let topicVerdict = decision.verdict || null;
          if (!topicVerdict) {
            try {
              topicVerdict = await classify();
            } catch (error) {
              warn(sdk, `topic judge failed at commit: ${errorText(error)}`);
              topicVerdict = null;
            }
            if (!topicVerdict) {
              if (!classifyError) {
                warn(sdk, "topic judge failed at commit: 按新话题处理");
              }
              topicVerdict = { kind: "new", ...deriveTopicTitle(segment) };
            }
            classifyError = null;
          }
          const commitAt = now();
          try {
            const recorded = await withTopics(
              dataDir,
              async (table) => {
                const outcome = recordSegment(table, {
                  verdict: topicVerdict,
                  sessionId,
                  at: commitAt,
                  label: topicVerdict.label,
                  summary: topicVerdict.summary,
                });
                const tags = captureTags(outcome.topic, outcome.seq);
                // commit 失败就抛：withTopics 只在 fn 正常返回后写盘，表与游标一起不动。
                await client.commit(sessionId, { tags });
                return outcome;
              },
              { onWriteError: (message) => warn(sdk, message) },
            );
            cursor = markCommitted(cursor, {
              at: commitAt,
              commitCount: cursor.lastCommitCount + 1,
            });
            committed = true;
            committedTopicId = recorded.topic.id;
            topicReport = {
              id: recorded.topic.id,
              seq: recorded.seq,
              label: recorded.topic.label,
              isNew: recorded.isNew,
            };
          } catch (error) {
            // 提交失败：游标不动，话题表也不落。下一轮对账会认出来。
            warn(sdk, `commit failed: ${errorText(error)}`);
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

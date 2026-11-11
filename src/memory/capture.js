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
} from "./cursor.js";
import { askModelChannel, postJson, serviceAuthHeaders } from "./recall.js";

/** 内置默认题面；配置 capturePrompt 非空时以配置为准（见 buildAsker）。 */
export const CAPTURE_TOPIC_QUESTION = "只看下面这两段，它们是不是在讲同一件事？只回 yes 或 no。";
export const CAPTURE_SAMPLE_CHARS = 1200;
export const CAPTURE_ASK_TIMEOUT_MS = 1500;
export const CAPTURE_ASK_MAX_TOKENS = 8;

function clipChars(text, max) {
  const chars = Array.from(typeof text === "string" ? text : "");
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("");
}

function tailChars(text, max) {
  const chars = Array.from(typeof text === "string" ? text : "");
  return chars.length <= max ? chars.join("") : chars.slice(chars.length - max).join("");
}

/** 两段各自截断后拼成判据。题面（CAPTURE_TOPIC_QUESTION）由调用方另给。 */
export function renderTopicPrompt(previous, current) {
  return [
    "上一段：",
    clipChars(previous, CAPTURE_SAMPLE_CHARS),
    "",
    "这一段：",
    clipChars(current, CAPTURE_SAMPLE_CHARS),
  ].join("\n");
}

/**
 * 主题判断的读数：先认否定，再认肯定，认不出给 null。
 *
 * null 表示「判断失败」，不是「不同」也不是「相同」——失败一律不提交，等下一轮。
 */
export function parseTopicAnswer(text) {
  if (typeof text !== "string") return null;
  const normalized = text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  if (!normalized) return null;
  if (["no", "否", "不是", "不同", "不一样"].some((word) => normalized.includes(word))) {
    return "different";
  }
  if (["yes", "是", "同", "一样", "同一"].some((word) => normalized.includes(word))) {
    return "same";
  }
  return null;
}

/**
 * 这一轮该不该提交。纯判断，不碰网络；ask 由调用方按档位造。
 *
 * 失败（ask 抛错 / 答案不认识）不算提交：宁可等下一轮，也不在语义边界之外切开。
 */
export async function captureDecision({ mode, pendingTurns, turnsLimit, ask } = {}) {
  const turns = Number(pendingTurns);
  if (!Number.isFinite(turns) || turns <= 0) return { commit: false, reason: "empty" };

  if (mode === "fixed") {
    const limit = Number.isFinite(Number(turnsLimit))
      ? Number(turnsLimit)
      : CAPTURE_COMMIT_TURNS_DEFAULT;
    return turns >= limit
      ? { commit: true, reason: "turns" }
      : { commit: false, reason: "below-limit" };
  }

  if (mode === "llm" || mode === "discriminator") {
    if (typeof ask !== "function") return { commit: false, reason: "no-asker" };
    // ask 抛错直接往上抛：由 handler 记日志并当作「本轮不提交」。
    const answer = await ask();
    if (answer === "different") return { commit: true, reason: "topic" };
    if (answer === "same") return { commit: false, reason: "same-topic" };
    return { commit: false, reason: "ask-failed" };
  }

  return { commit: false, reason: "unknown-mode" };
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

function segmentText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => (typeof message?.content === "string" ? message.content : ""))
    .join("\n");
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
 * 按档位造 ask：
 *   fixed        不需要
 *   llm          宿主模型，题面 + 两段
 *   discriminator  判别模型 /v1/systemone，choice + criteria
 *
 * 还没提交过（lastCommitSample 为空）时直接给 null：没有「上一段」可比，
 * 这一轮不提交，等下一段有了参照再判断。ask 只有 verdict.mayCommit 为真时才会被调。
 */
function buildAsker({ mode, sdk, switches, cursor, segment }) {
  const previous = cursor.lastCommitSample;
  const current = segmentText(segment);
  // 两档共用同一句题面：配置非空就用用户写的那句，否则用内置默认。
  // trim 只用来判空，不把用户那句本身 trim 掉。
  const question = String(switches.capturePrompt ?? "").trim()
    ? switches.capturePrompt
    : CAPTURE_TOPIC_QUESTION;

  if (mode === "llm") {
    return async () => {
      if (!previous) return null;
      const answer = await askModelChannel(sdk, {
        modelRef: switches.captureModel,
        prompt: `${question}\n\n${renderTopicPrompt(previous, current)}`,
        timeoutMs: CAPTURE_ASK_TIMEOUT_MS,
        maxTokens: CAPTURE_ASK_MAX_TOKENS,
      });
      return parseTopicAnswer(answer);
    };
  }

  if (mode === "discriminator") {
    return async () => {
      if (!previous) return null;
      const endpoint = `${String(switches.captureServiceUrl || "").replace(/\/+$/, "")}/v1/systemone`;
      const data = await postJson(
        sdk,
        endpoint,
        {
          model: switches.systemoneServiceModel,
          state: { type: "text", content: renderTopicPrompt(previous, current) },
          questions: {
            q: {
              type: "choice",
              instructions: question,
              criteria: {
                yes: "两段在讲同一件事",
                no: "两段换了一件事",
              },
            },
          },
        },
        CAPTURE_ASK_TIMEOUT_MS,
        serviceAuthHeaders(switches.systemoneServiceKey),
      );
      const answer = data?.answers?.q;
      if (!answer || typeof answer !== "object") return null;
      if (answer.choice !== "yes" && answer.choice !== "no") return null;
      if (!Number.isFinite(Number(answer.confidence))) return null;
      return answer.choice === "no" ? "different" : "same";
    };
  }

  return undefined;
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
      mode = switches.captureEffectiveMode;

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

        // 12. commit 判断。判据范围 = 上次提交之后的所有消息。
        const segment = messages.slice(cursor.lastCommitMessageCount, cursor.lastMessageCount);
        const pendingTurns = countTurns(segment);
        let decision = { commit: false, reason: "empty" };
        if (verdict.mayCommit) {
          const ask = buildAsker({ mode, sdk, switches, cursor, segment });
          try {
            decision = await captureDecision({
              mode,
              pendingTurns,
              turnsLimit: switches.captureCommitTurns,
              ask,
            });
          } catch (error) {
            // 主题判断失败不提交，也不把整轮写回打回去。
            warn(sdk, `topic judge failed: ${errorText(error)}`);
            decision = { commit: false, reason: "ask-failed" };
          }
        }

        let committed = false;
        if (decision.commit) {
          try {
            await client.commit(sessionId);
            cursor = markCommitted(cursor, {
              at: now(),
              commitCount: cursor.lastCommitCount + 1,
              sample: tailChars(segmentText(segment), CAPTURE_SAMPLE_CHARS),
            });
            committed = true;
          } catch (error) {
            // 提交失败：游标不动。下一轮「commit 前进」那条对账会认出来。
            warn(sdk, `commit failed: ${errorText(error)}`);
          }
        }

        // 13. 落盘：会话卡的三行与下一轮游标。
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
          capture: { turns: totalTurns, cursor, lastAt: at },
        });

        return reportOf({
          reconcile: verdict.state,
          mode,
          created,
          wrote,
          patched,
          committed,
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

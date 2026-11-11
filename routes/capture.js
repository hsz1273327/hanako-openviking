// 写回的设置页与侧边栏会话卡。
//
// 两个端点的边界必须分开：
//   /capture-config  机器级设置（提交策略、轮次上限、服务端兜底、判断模型 / 服务地址）。
//                    整单保存：一项不合法就 400，一个字段都不写。
//   /capture-status  会话级状态（本会话已写几条、上次提交、待提交轮数）。只读，
//                    打开卡片不建状态文件、不联网、不写游标。
//
// 两者不许混在一个响应里：机器级设置跟具体会话无关，会话级数字也不该被写进全局配置。

import {
  CAPTURE_COMMIT_SCHEMA,
  CAPTURE_COMMIT_TURNS_MAX,
  CAPTURE_COMMIT_TURNS_MIN,
  CAPTURE_CONTEXT_TURNS_MAX,
  CAPTURE_CONTEXT_TURNS_MIN,
  CAPTURE_EARLY_JUDGES,
  CAPTURE_IDLE_SECONDS_MAX,
  CAPTURE_IDLE_SECONDS_MIN,
  CAPTURE_MIN_TURNS_MAX,
  CAPTURE_MIN_TURNS_MIN,
  CAPTURE_PROMPT_MAX,
  CAPTURE_TEMPLATE_MAX,
  CAPTURE_TOPIC_CANDIDATES_MAX,
  CAPTURE_TOPIC_CANDIDATES_MIN,
  CAPTURE_TOPIC_SCOPES,
  captureModeMissing,
  normalizeGateModel,
  normalizeServiceUrl,
  promptForStorage,
  readSwitches,
  serializeCaptureCommitSchema,
  serializeCaptureCommitTurns,
  serializeCaptureContextTurns,
  serializeCaptureIdleSeconds,
  serializeCaptureMinTurns,
  serializeCaptureTopicCandidates,
} from "../src/ov/settings.js";
import { captureCounts } from "../src/memory/cursor.js";
import { readTopics, topicsForSession } from "../src/memory/topics.js";
import { readSession, sessionKeyOf } from "../src/state/session.js";

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

/**
 * 机器级设置投影：全部是「此刻生效的值」，脏值已在 readSwitches 里归一化。
 * 轮次 / 秒数按入库口径回数字串，面板不必自己判断该显示什么。
 */
async function project(ctx) {
  const switches = await readSwitches(ctx);
  return {
    early: switches.captureEffectiveEarly,
    earlyStored: switches.captureEarlyCommit,
    judge: switches.captureEarlyJudge,
    missing: captureModeMissing(switches, switches.captureEarlyJudge),
    turns: serializeCaptureCommitTurns(switches.captureCommitTurns),
    contextTurns: serializeCaptureContextTurns(switches.captureContextTurns),
    minTurns: serializeCaptureMinTurns(switches.captureMinTurns),
    topicScope: switches.captureTopicScope,
    topicCandidates: serializeCaptureTopicCandidates(switches.captureTopicCandidates),
    serverFallback: switches.captureServerFallback,
    idleSeconds: serializeCaptureIdleSeconds(switches.captureServerIdleSeconds),
    model: switches.captureModel,
    serviceUrl: switches.captureServiceUrl,
    prompt: switches.capturePrompt,
    template: switches.captureTemplate,
    judges: [...CAPTURE_EARLY_JUDGES],
    scopes: [...CAPTURE_TOPIC_SCOPES],
    turnsRange: [CAPTURE_COMMIT_TURNS_MIN, CAPTURE_COMMIT_TURNS_MAX],
    contextTurnsRange: [CAPTURE_CONTEXT_TURNS_MIN, CAPTURE_CONTEXT_TURNS_MAX],
    minTurnsRange: [CAPTURE_MIN_TURNS_MIN, CAPTURE_MIN_TURNS_MAX],
    topicCandidatesRange: [CAPTURE_TOPIC_CANDIDATES_MIN, CAPTURE_TOPIC_CANDIDATES_MAX],
    idleRange: [CAPTURE_IDLE_SECONDS_MIN, CAPTURE_IDLE_SECONDS_MAX],
  };
}

/** 数字或数字串 → 边界内的整数；合法返回 null，不合法返回给用户看的错误。 */
function integerError(raw, field, min, max) {
  if (typeof raw !== "number" && typeof raw !== "string") {
    return `${field} 必须是数字或数字串`;
  }
  const text = typeof raw === "number" ? String(raw) : raw.trim();
  const value = text ? Number(text) : NaN;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return `${field} 必须是整数`;
  }
  if (value < min || value > max) {
    return `${field} 必须在 ${min} 到 ${max} 之间`;
  }
  return null;
}

export default function registerCaptureRoutes(app, ctx) {
  app.get("/capture-config", async (c) => c.json(await project(ctx), 200));

  app.post("/capture-config", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "body 必须是对象" }, 400);
    }

    const changes = [];

    // 提前提交：开关 / 判断方式 / 话题作用域 / 候选池上限。
    // 旧键已删除：当未知键忽略，不再 400，也不再写。
    if (has(body, "captureEarlyCommit")) {
      if (typeof body.captureEarlyCommit !== "boolean") {
        return c.json({ ok: false, error: "captureEarlyCommit 只能是 true / false" }, 400);
      }
      changes.push(["captureEarlyCommit", body.captureEarlyCommit]);
    }

    if (has(body, "captureEarlyJudge")) {
      const value = body.captureEarlyJudge;
      if (typeof value !== "string" || !CAPTURE_EARLY_JUDGES.includes(value)) {
        return c.json(
          { ok: false, error: `captureEarlyJudge 只能是 ${CAPTURE_EARLY_JUDGES.join(" / ")}` },
          400,
        );
      }
      changes.push(["captureEarlyJudge", value]);
    }

    if (has(body, "captureTopicScope")) {
      const value = body.captureTopicScope;
      if (typeof value !== "string" || !CAPTURE_TOPIC_SCOPES.includes(value)) {
        return c.json(
          { ok: false, error: `captureTopicScope 只能是 ${CAPTURE_TOPIC_SCOPES.join(" / ")}` },
          400,
        );
      }
      changes.push(["captureTopicScope", value]);
    }

    if (has(body, "captureTopicCandidates")) {
      const problem = integerError(
        body.captureTopicCandidates,
        "captureTopicCandidates",
        CAPTURE_TOPIC_CANDIDATES_MIN,
        CAPTURE_TOPIC_CANDIDATES_MAX,
      );
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push([
        "captureTopicCandidates",
        serializeCaptureTopicCandidates(body.captureTopicCandidates),
      ]);
    }

    if (has(body, "captureCommitTurns")) {
      const problem = integerError(
        body.captureCommitTurns,
        "captureCommitTurns",
        CAPTURE_COMMIT_TURNS_MIN,
        CAPTURE_COMMIT_TURNS_MAX,
      );
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["captureCommitTurns", serializeCaptureCommitTurns(body.captureCommitTurns)]);
    }

    if (has(body, "captureContextTurns")) {
      const problem = integerError(
        body.captureContextTurns,
        "captureContextTurns",
        CAPTURE_CONTEXT_TURNS_MIN,
        CAPTURE_CONTEXT_TURNS_MAX,
      );
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push([
        "captureContextTurns",
        serializeCaptureContextTurns(body.captureContextTurns),
      ]);
    }

    if (has(body, "captureMinTurns")) {
      const problem = integerError(
        body.captureMinTurns,
        "captureMinTurns",
        CAPTURE_MIN_TURNS_MIN,
        CAPTURE_MIN_TURNS_MAX,
      );
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["captureMinTurns", serializeCaptureMinTurns(body.captureMinTurns)]);
    }

    if (has(body, "captureServerFallback")) {
      if (typeof body.captureServerFallback !== "boolean") {
        return c.json({ ok: false, error: "captureServerFallback 只能是 true / false" }, 400);
      }
      changes.push(["captureServerFallback", body.captureServerFallback]);
    }

    if (has(body, "captureServerIdleSeconds")) {
      const problem = integerError(
        body.captureServerIdleSeconds,
        "captureServerIdleSeconds",
        CAPTURE_IDLE_SECONDS_MIN,
        CAPTURE_IDLE_SECONDS_MAX,
      );
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push([
        "captureServerIdleSeconds",
        serializeCaptureIdleSeconds(body.captureServerIdleSeconds),
      ]);
    }

    // 判断模型：空串合法（= 用宿主辅助模型）；非空必须形如 provider/model。
    if (has(body, "captureModel")) {
      if (typeof body.captureModel !== "string") {
        return c.json({ ok: false, error: "captureModel 必须是字符串" }, 400);
      }
      const value = body.captureModel.trim();
      if (value && !normalizeGateModel(value)) {
        return c.json({ ok: false, error: "captureModel 必须形如 provider/model" }, 400);
      }
      changes.push(["captureModel", value]);
    }

    // 判别服务地址：空串合法；非空必须是 http / https，存规范化后的串。
    if (has(body, "captureServiceUrl")) {
      if (typeof body.captureServiceUrl !== "string") {
        return c.json({ ok: false, error: "captureServiceUrl 必须是字符串" }, 400);
      }
      const value = body.captureServiceUrl.trim();
      if (!value) {
        changes.push(["captureServiceUrl", ""]);
      } else {
        const normalized = normalizeServiceUrl(value);
        if (!normalized) {
          return c.json({ ok: false, error: "captureServiceUrl 必须是合法的 http(s) 地址" }, 400);
        }
        changes.push(["captureServiceUrl", normalized]);
      }
    }

    // 判断题面：非字符串直接拒，超长整单拒；长度按用户提交的原文判断。
    // 写时归一：等于内置默认（含历史默认）就存空串，其余原样（不 trim、不截断）。
    if (has(body, "capturePrompt")) {
      if (typeof body.capturePrompt !== "string") {
        return c.json({ ok: false, error: "capturePrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.capturePrompt).length > CAPTURE_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `capturePrompt 最多 ${CAPTURE_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["capturePrompt", promptForStorage("capturePrompt", body.capturePrompt)]);
    }

    // 题面骨架模板：同样的规则（非字符串拒、按字符限长、写时归一）。
    if (has(body, "captureTemplate")) {
      if (typeof body.captureTemplate !== "string") {
        return c.json({ ok: false, error: "captureTemplate 必须是字符串" }, 400);
      }
      if (Array.from(body.captureTemplate).length > CAPTURE_TEMPLATE_MAX) {
        return c.json(
          { ok: false, error: `captureTemplate 最多 ${CAPTURE_TEMPLATE_MAX} 个字符` },
          400,
        );
      }
      changes.push(["captureTemplate", promptForStorage("captureTemplate", body.captureTemplate)]);
    }

    // 认不出的键一律忽略：前端半新半旧不该整单失败。
    // 保存成功就写语义版本：下一次读侧不再把这份配置当老三档迁移。
    if (changes.length) {
      changes.push(["captureCommitSchema", serializeCaptureCommitSchema(CAPTURE_COMMIT_SCHEMA)]);
    }
    for (const [key, value] of changes) await ctx.config.set(key, value);

    return c.json(
      { ok: true, applied: changes.map(([key]) => key), ...(await project(ctx)) },
      200,
    );
  });

  app.get("/capture-status", async (c) => {
    const raw = typeof c.req?.query === "function" ? c.req.query("sessionId") : "";
    const sessionId = sessionKeyOf(raw);
    const switches = await readSwitches(ctx);
    const base = {
      sessionId: sessionId || null,
      active: Boolean(sessionId),
      autoCapture: Boolean(switches.autoCapture),
      mode: switches.captureEffectiveEarly ? switches.captureEarlyJudge : "fixed",
      written: 0,
      lastCommitAt: null,
      pendingTurns: 0,
      topics: 0,
    };
    if (!sessionId) return c.json(base, 200);

    // 只读：readSession / readTopics 都不会建文件；captureCounts 与写回链路同源。
    const dataDir = dataDirOf(ctx);
    const state = readSession(dataDir, sessionId);
    const counts = captureCounts(state.capture?.cursor);
    const topics = topicsForSession(readTopics(dataDir), sessionId).length;
    return c.json({ ...base, ...counts, topics }, 200);
  });
}

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
  CAPTURE_COMMIT_MODES,
  CAPTURE_COMMIT_TURNS_MAX,
  CAPTURE_COMMIT_TURNS_MIN,
  CAPTURE_IDLE_SECONDS_MAX,
  CAPTURE_IDLE_SECONDS_MIN,
  captureModeMissing,
  normalizeGateModel,
  normalizeServiceUrl,
  readSwitches,
  serializeCaptureCommitTurns,
  serializeCaptureIdleSeconds,
} from "../src/ov/settings.js";
import { captureCounts } from "../src/memory/cursor.js";
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
    mode: switches.captureCommitMode,
    effectiveMode: switches.captureEffectiveMode,
    missing: captureModeMissing(switches, switches.captureCommitMode),
    turns: serializeCaptureCommitTurns(switches.captureCommitTurns),
    serverFallback: switches.captureServerFallback,
    idleSeconds: serializeCaptureIdleSeconds(switches.captureServerIdleSeconds),
    model: switches.captureModel,
    serviceUrl: switches.captureServiceUrl,
    modes: [...CAPTURE_COMMIT_MODES],
    turnsRange: [CAPTURE_COMMIT_TURNS_MIN, CAPTURE_COMMIT_TURNS_MAX],
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

    if (has(body, "captureCommitMode")) {
      const value = body.captureCommitMode;
      if (typeof value !== "string" || !CAPTURE_COMMIT_MODES.includes(value)) {
        return c.json(
          { ok: false, error: `captureCommitMode 只能是 ${CAPTURE_COMMIT_MODES.join(" / ")}` },
          400,
        );
      }
      changes.push(["captureCommitMode", value]);
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

    // 认不出的键一律忽略：前端半新半旧不该整单失败。
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
      mode: switches.captureEffectiveMode,
      written: 0,
      lastCommitAt: null,
      pendingTurns: 0,
    };
    if (!sessionId) return c.json(base, 200);

    // 只读：readSession 不会建文件；captureCounts 与写回链路同源。
    const state = readSession(dataDirOf(ctx), sessionId);
    const counts = captureCounts(state.capture?.cursor);
    return c.json({ ...base, ...counts }, 200);
  });
}

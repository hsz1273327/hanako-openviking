// 存量补交的路由面：状态 / 会话清单 / 发起 / 取消。
//
// 控制器在注册时建一个，所有请求共用——补交是单任务，不能一个请求起一轮。
// 被拒的 start 一律 200 { ok:false, error }，不把「没连上」这种预期结果抛成 500。

import {
  agentsRootOf,
  createBackfillController,
  listBackfillSessions,
} from "../src/memory/backfill.js";
import { sessionKeyOf } from "../src/state/session.js";

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

export default function registerBackfillRoutes(app, ctx, deps = {}) {
  const controller = createBackfillController(ctx, deps);

  app.get("/backfill-status", async (c) => c.json(controller.status(), 200));

  app.get("/backfill-sessions", async (c) => {
    const raw = typeof c.req?.query === "function" ? c.req.query("sessionId") : "";
    const wanted = sessionKeyOf(typeof raw === "string" ? raw : "");
    const all = await listBackfillSessions(ctx, deps);
    const sessions = wanted ? all.filter((row) => row.sessionId === wanted) : all;
    const root = agentsRootOf(dataDirOf(ctx), deps);
    return c.json(
      {
        root,
        sessions,
        totals: {
          sessions: sessions.length,
          segments: sessions.reduce((sum, row) => sum + row.pendingSegments, 0),
        },
      },
      200,
    );
  });

  app.post("/backfill", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 200);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "body 必须是对象" }, 200);
    }
    if (body.scope !== "session" && body.scope !== "all") {
      return c.json({ ok: false, error: "scope 只能是 session / all" }, 200);
    }
    const result = await controller.start({
      scope: body.scope,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : "",
    });
    return result.ok
      ? c.json({ ok: true, total: result.total, sessions: result.sessions }, 200)
      : c.json({ ok: false, error: result.error }, 200);
  });

  app.post("/backfill/cancel", async (c) => {
    const result = controller.cancel();
    return c.json({ ok: result.ok === true, running: controller.status().running }, 200);
  });
}

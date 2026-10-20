// 会话级路由：右侧小卡的数据面。
//
// 一条原则：这里写的东西只影响这一个会话。总闸不在此列——关整台机器是全局决定。
// 覆盖值撤销用 null，回来跟随全局。

import fs from "node:fs";
import path from "node:path";
import { readConnection, readSwitches } from "../src/ov/settings.js";
import { resolvePeer } from "../src/ov/identity.js";
import {
  OVERRIDE_KEYS,
  effective,
  listSessions,
  patchSession,
  readSession,
} from "../src/state/session.js";

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

function probeStats(dataDir, sessionId) {
  const file = path.join(dataDir, "probe.log");
  const stats = { events: {}, lastAt: null, lines: 0 };
  if (!sessionId) return stats;
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return stats;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.sessionId !== sessionId) continue;
    const name = record.event || record.kind || "unknown";
    stats.events[name] = (stats.events[name] || 0) + 1;
    stats.lines += 1;
    if (record.at) stats.lastAt = record.at;
  }
  return stats;
}

function shape(ctx, sessionId) {
  const dataDir = dataDirOf(ctx);
  const state = readSession(dataDir, sessionId);
  return { dataDir, state };
}

export default function registerSessionRoutes(app, ctx) {
  app.get("/sessions", async (c) => {
    return c.json({ sessions: listSessions(dataDirOf(ctx)) }, 200);
  });

  app.get("/session/:sid", async (c) => {
    const sessionId = c.req.param("sid");
    const dataDir = dataDirOf(ctx);
    const state = readSession(dataDir, sessionId);
    const base = await readSwitches(ctx);
    const conn = await readConnection(ctx);

    return c.json(
      {
        sessionId,
        state,
        effective: effective({ ...base, recallPeerScope: conn.recallPeerScope }, state),
        overridable: OVERRIDE_KEYS,
        peer: resolvePeer(conn, null),
        probe: probeStats(dataDir, sessionId),
      },
      200,
    );
  });

  app.post("/session/:sid", async (c) => {
    const sessionId = c.req.param("sid");
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }

    const patch = {};
    if (body?.overrides && typeof body.overrides === "object") patch.overrides = body.overrides;
    if (body?.recall && typeof body.recall === "object") patch.recall = body.recall;
    if (body?.capture && typeof body.capture === "object") patch.capture = body.capture;

    const dataDir = dataDirOf(ctx);
    const state = patchSession(dataDir, sessionId, patch);
    const base = await readSwitches(ctx);
    const conn = await readConnection(ctx);

    return c.json(
      {
        ok: true,
        sessionId,
        state,
        effective: effective({ ...base, recallPeerScope: conn.recallPeerScope }, state),
      },
      200,
    );
  });
}

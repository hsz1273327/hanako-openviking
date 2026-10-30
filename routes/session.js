// 会话级路由：右侧小卡的数据面。
//
// 一条原则：这里写的东西只影响这一个会话。总闸不在此列——关整台机器是全局决定。
// 覆盖值撤销用 null，回来跟随全局。

import fs from "node:fs";
import path from "node:path";
import { readConnection, readSwitches } from "../src/ov/settings.js";
import { describePeer } from "../src/ov/identity.js";
import {
  OVERRIDE_KEYS,
  effective,
  listSessions,
  patchSession,
  readSession,
  sessionKeyOf,
} from "../src/state/session.js";

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

// 认不出来的 key 一律当"没有这段会话"：既不读也不写。
// 只回一个错不够——前端要知道这是"没绑定"，不是"服务挂了"，所以照常带 peer 字段。
function unknownSession(c) {
  return c.json({ ok: false, error: "unknown session key", peer: null, peerSource: "unbound" }, 400);
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
    // 会话 key 统一收口：宿主给的可能是会话路径，也可能是 sess_… 形式的稳定 id。
    // 认不出来就到此为止——readSession 会给任何字符串回一份空状态，而下面的
    // write 路径更会直接建文件，sess_… 会留下一地孤儿。
    const sessionId = sessionKeyOf(c.req.param("sid"));
    if (!sessionId) return unknownSession(c);
    const dataDir = dataDirOf(ctx);
    const state = readSession(dataDir, sessionId);
    const base = await readSwitches(ctx);
    const conn = await readConnection(ctx);
    // peer 跟着会话所属的助手走，不是跟着“打开面板的那只手”走。
    // 拿不到身份时 peer 为 null、peerSource 为 "unbound"，不拿别的会话顶上。
    // readSession 不会抛（内部吞异常、恒返回一份状态），所以这里不需要异常分支。
    const { peer, peerSource, peerAgentDir } = describePeer(conn, state.agentDir);

    return c.json(
      {
        sessionId,
        state,
        effective: effective({ ...base, recallPeerScope: conn.recallPeerScope }, state),
        overridable: OVERRIDE_KEYS,
        peer,
        peerSource,
        // 合并记忆把“其实是哪个助手”盖住了；拿得到就单独带出去，拿不到就不出现这个键。
        ...(peerAgentDir ? { peerAgentDir } : {}),
        probe: probeStats(dataDir, sessionId),
      },
      200,
    );
  });

  app.post("/session/:sid", async (c) => {
    const sessionId = sessionKeyOf(c.req.param("sid"));
    if (!sessionId) return unknownSession(c);
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

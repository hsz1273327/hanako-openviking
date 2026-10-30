// 状态路由：整页与右侧卡共用同一个数据面。
//
// 只读。不触发召回、不写回、不改配置——打开卡片这件事本身必须是零副作用，
// 否则"看一眼状态"就变成了"参与一轮记忆"。
//
// 挂载：/api/apps/hanako-openviking/routes/status

import fs from "node:fs";
import path from "node:path";
import { readConnection, readSwitches } from "../src/ov/settings.js";
import { describePeer } from "../src/ov/identity.js";
import { createClient } from "../src/ov/client.js";
import { transportFor } from "../src/ov/transport.js";
import { readSession, sessionKeyOf } from "../src/state/session.js";

const LOG_TAIL = 24;

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

function readTail(file, limit = LOG_TAIL) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line.slice(0, 200) };
      }
    });
  } catch {
    return [];
  }
}

function summarizeLog(lines) {
  const events = {};
  let last = null;
  for (const line of lines) {
    const name = line?.event || line?.kind || "unknown";
    events[name] = (events[name] || 0) + 1;
    if (line?.at) last = line.at;
  }
  return { events, last };
}

export default function registerStatusRoutes(app, ctx) {
  app.get("/status", async (c) => {
    const dir = dataDirOf(ctx);
    const sw = await readSwitches(ctx);
    const conn = await readConnection(ctx);
    const probeLines = readTail(path.join(dir, "probe.log"));
    const transport = transportFor(ctx);

    // 面板可以带上当前会话，就能说准这一段属于哪个助手。
    // 不带会话时，只有 mergeMemory 能单独给出身份；拿不到就给 null，
    // 不用“最近一个”或别的会话顶上——那会把 A 会话的身份显示到 B 会话头上。
    const sidRaw = typeof c.req?.query === "function" ? c.req.query("session") : "";
    // 会话 key 统一收口：路径取文件名里的 uuid，sess_… 形式的稳定 id 映射不到状态文件。
    // 映射不出来就当"没带会话"——不能拿它去 readSession，那会给这类 id 建一个空文件。
    const sid = sessionKeyOf(typeof sidRaw === "string" ? sidRaw : "");
    let described = describePeer(conn, "");
    if (sid) {
      // 不包 try/catch：readSession（src/state/session.js）是全函数，内部自己吞掉所有
      // 异常并恒定返回一份状态，永远不会抛。跨不过去的是“文件坏了”，不是“抛了”；
      // 那种情况在这里和“从没记过”看到的是同一种东西（空 agentDir），不需要异常分支。
      described = describePeer(conn, readSession(dir, sid).agentDir);
    }

    const report = {
      enabled: sw.enabled,
      readOnly: sw.readOnly,
      autoRecall: sw.autoRecall,
      autoCapture: sw.autoCapture,
      skillRouting: sw.skillRouting,
      probe: sw.probe,
      serverUrl: conn.serverUrl,
      apiKeySet: Boolean(conn.apiKey),
      timeoutMs: conn.timeoutMs,
      budgetTokens: conn.injectBudgetTokens,
      recallScope: conn.recallPeerScope,
      probeLog: summarizeLog(probeLines),
      // 当前出口：runtime（受管代理）/ direct（ctx.network）/ down（两条都不可用）。
      transport: transport.mode,
      // peer 是会话级的：这一段对话属于哪个助手，就用哪个门牌。
      // 没有身份时是 null：服务端会看到“未绑定”，界面也有话可说。
      peer: described.peer,
      peerSource: described.peerSource,
      // 合并记忆把“其实是哪个助手”盖住了；拿得到就单独带出去，拿不到就不出现这个键。
      ...(described.peerAgentDir ? { peerAgentDir: described.peerAgentDir } : {}),
    };

    if (!sw.enabled || !conn.serverUrl || !conn.apiKey) {
      return c.json({ ...report, reach: "idle", health: null, ready: null }, 200);
    }

    if (transport.mode === "down") {
      return c.json(
        { ...report, reach: "down", health: null, ready: null, error: "没有可用的网络出口" },
        200,
      );
    }

    const client = createClient({ ...conn, ...transport });

    try {
      report.health = await client.health();
      report.reach = "ok";
    } catch (error) {
      report.health = null;
      report.reach = "down";
      report.error = String(error?.message || error);
      return c.json(report, 200);
    }

    try {
      report.ready = await client.ready();
    } catch (error) {
      report.ready = null;
      report.readyError = String(error?.message || error);
    }

    return c.json(report, 200);
  });

  // 探针日志尾部，整页用。分页交给前端，这里只给最后几十条。
  app.get("/probe", async (c) => {
    const dir = dataDirOf(ctx);
    const file = path.join(dir, "probe.log");
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      return c.json({ lines: [], size: 0 }, 200);
    }
    return c.json({ lines: readTail(file, 60), size }, 200);
  });
}

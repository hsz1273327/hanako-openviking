// 状态路由：整页与右侧卡共用同一个数据面。
//
// 只读。不触发召回、不写回、不改配置——打开卡片这件事本身必须是零副作用，
// 否则"看一眼状态"就变成了"参与一轮记忆"。
//
// 挂载：/api/apps/hanako-openviking/routes/status

import fs from "node:fs";
import path from "node:path";
import { readConnection, readSwitches } from "../src/ov/settings.js";
import { resolvePeer } from "../src/ov/identity.js";
import { createClient } from "../src/ov/client.js";

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
      // peer 纯本地推导，不联网。未启用时也应该知道"我是谁"。
      peer: resolvePeer(conn, null),
    };

    if (!sw.enabled || !conn.serverUrl || !conn.apiKey) {
      return c.json({ ...report, reach: "idle", health: null, ready: null }, 200);
    }

    const client = createClient({
      ...conn,
      fetchImpl: ctx?.network?.fetch?.bind(ctx.network) ?? globalThis.fetch,
    });

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

    report.peer = resolvePeer(conn, null);
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

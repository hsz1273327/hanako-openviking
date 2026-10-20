// 入口。把接缝挂上：探针记录事实，记忆召回按轮注入，技能工具按需调用。
//
//   agent/before-start       每轮开始（探针 / 未来技能路由）
//   provider/before-request  每次发往 provider 的请求：探针在前，召回在后
//   agent/settled            轮次结束（探针 / 未来写回）
//
// 任何钩子失败都不得影响本轮对话：探针只写日志，召回失败返回 undefined。

import { defineApp } from "./sdk/app-contract/server-client.js";
import { readConnection, readSwitches } from "./src/ov/settings.js";
import { createClient } from "./src/ov/client.js";
import { resolvePeer } from "./src/ov/identity.js";
import { createRecallHandler } from "./src/memory/recall.js";
import { createProbe } from "./src/probe.js";
import { skillFindTool, skillLoadTool } from "./src/skills/tools.js";
import { markClosed, touchSession } from "./src/state/session.js";

export const name = "hanako-openviking";

export default defineApp(async (sdk) => {
  const probe = createProbe({ dataDir: sdk.dataDir, logger: sdk.logger });
  const probeOn = async () => (await sdk.config.get("probe")) === true;
  // 一个进程一份去重表：before-request 按模型步触发，同一用户文本只召回一次。
  const recall = createRecallHandler(sdk);

  await sdk.tools.register({
    name: "openviking_status",
    description:
      "Report the OpenViking hub: reachability, identity (peer name) and local switches. Read-only.",
    parameters: { type: "object", properties: {} },
    execute: async (args) => {
      const sw = await readSwitches(sdk);
      const conn = await readConnection(sdk);
      const peer = resolvePeer(conn, args?.context?.sessionPath ?? null);
      const report = {
        enabled: sw.enabled,
        peer,
        serverUrl: conn.serverUrl,
        apiKeySet: Boolean(conn.apiKey),
        timeoutMs: conn.timeoutMs,
      };

      if (sw.enabled && conn.serverUrl && conn.apiKey) {
        const client = createClient({
          ...conn,
          fetchImpl: sdk.network.fetch.bind(sdk.network),
        });
        report.health = await safe(() => client.health());
        report.ready = await safe(() => client.ready());
      } else {
        report.health = null;
        report.ready = null;
      }

      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    },
  });

  // ---- 技能工具：不依赖钩子语义，装上就能用 ----
  await sdk.tools.register(skillFindTool(sdk));
  await sdk.tools.register(skillLoadTool(sdk));

  // ---- 会话生命周期：开的时候建一份，关的时候打标记 ----
  // 宿主没有"会话已删"事件，物理删除交给 state/session.js 的过期清理。
  await sdk.hooks.on("agent/session-start", async (invocation) => {
    const sessionId = invocation?.session?.sessionId;
    if (!sessionId) return;
    try {
      touchSession(sdk.dataDir, sessionId);
    } catch (error) {
      sdk.logger.warn(`openviking session-start state failed: ${error?.message || error}`);
    }
  });

  await sdk.hooks.on("session.shutdown", async (invocation) => {
    const sessionId = invocation?.session?.sessionId;
    if (!sessionId) return;
    try {
      markClosed(sdk.dataDir, sessionId, invocation?.reason);
    } catch (error) {
      sdk.logger.warn(`openviking session-shutdown state failed: ${error?.message || error}`);
    }
  });

  // ---- 探针：三个接缝各记一行，返回值一律不改 ----

  await sdk.hooks.onDecision("agent/before-start", async (invocation) => {
    if (await probeOn()) await probe("agent/before-start", invocation);
    return undefined;
  });

  await sdk.hooks.onDecision("provider/before-request", async (invocation) => {
    // 探针在前：只读、只写日志，返回值恒为 undefined。
    if (await probeOn()) await probe("provider/before-request", invocation);
    // 召回在后：成功返回 { payload }，其余一律 undefined。两者互不干扰。
    try {
      return await recall(invocation);
    } catch (error) {
      sdk.logger.warn(`openviking recall failed: ${error?.message || error}`);
      return undefined;
    }
  });

  await sdk.hooks.on("agent/settled", async (invocation) => {
    if (await probeOn()) await probe("agent/settled", invocation);
  });

  const sw = await readSwitches(sdk);
  sdk.logger.info(
    `hanako-openviking loaded (enabled=${sw.enabled}, probe=${await probeOn()})`,
  );
});

async function safe(fn) {
  try {
    return await fn();
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

// 探针：只记事实，不做判断。
//
// 要拿回的四个问题：
//   1. agent/before-start 是每轮一次还是每会话一次
//   2. provider/before-request 在一轮里被调用几次，payload 长什么样
//   3. 子会话（分派出去的任务）会不会同样触发
//   4. agent/settled 里能不能拿到 sessionId / sessionPath
//
// 每条一行 JSON，追加进 <dataDir>/probe.log。同一 (event, sessionId) 记一个计数，
// 所以"一轮调用几次"直接看 count 就知道。

import fs from "node:fs";
import path from "node:path";

const MAX_TEXT = 120;

export function createProbe({ dataDir, logger } = {}) {
  const file = path.join(dataDir || ".", "probe.log");
  const counts = new Map();

  return async function probe(event, invocation) {
    try {
      const session = invocation?.session || {};
      const sessionId = session.sessionId ?? null;
      const sessionPath = session.sessionPath ?? null;
      const key = `${event}\u0000${sessionId || sessionPath || "none"}`;
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);

      const record = {
        at: new Date().toISOString(),
        event,
        count,
        sessionId,
        sessionPath: sessionPath ? shortPath(sessionPath) : null,
        shape: shapeOf(event, invocation),
      };

      fs.mkdirSync(dataDir, { recursive: true });
      fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
    } catch (error) {
      // 探针写不进去不能影响主流程
      try {
        logger?.warn?.(`openviking probe failed: ${error?.message || error}`);
      } catch {
        /* ignore */
      }
    }
  };
}

function shapeOf(event, invocation) {
  if (!invocation || typeof invocation !== "object") return typeof invocation;

  if (event === "agent/before-start") {
    return {
      promptChars: len(invocation.prompt),
      promptHead: head(invocation.prompt),
      systemPromptChars: len(invocation.systemPrompt),
      hasSignal: Boolean(invocation.signal),
      keys: Object.keys(invocation),
    };
  }

  if (event === "provider/before-request") {
    const payload = invocation.payload;
    return {
      payloadType: Array.isArray(payload) ? "array" : typeof payload,
      payloadKeys:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload)
          : null,
      messageCount: Array.isArray(payload?.messages) ? payload.messages.length : null,
      roles: Array.isArray(payload?.messages)
        ? payload.messages.map((m) => m?.role).filter(Boolean).slice(-6)
        : null,
      systemChars: len(
        typeof payload?.system === "string" ? payload.system : payload?.systemPrompt,
      ),
    };
  }

  // 事件类（agent/settled 等）：只记键名
  return { keys: Object.keys(invocation) };
}

function len(value) {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  return null;
}

function head(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function shortPath(p) {
  const parts = String(p).split("/");
  return parts.length <= 3 ? String(p) : `…/${parts.slice(-3).join("/")}`;
}

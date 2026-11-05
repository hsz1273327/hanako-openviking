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

  if (event === "recall/gate-skip") {
    return {
      queryChars: len(invocation.query),
      queryHead: head(invocation.query),
      reason: typeof invocation.reason === "string" ? invocation.reason : null,
    };
  }

  // 组装：回指表要真的落进 probe.log，否则「refs 只进探针与日志」等于什么都没记。
  // 一项只有 index / uri / peer / score，原样带过去；不猜别的字段。
  if (event === "recall/assemble") {
    const assemble =
      invocation.assemble && typeof invocation.assemble === "object" ? invocation.assemble : {};
    const refs = Array.isArray(assemble.refs) ? assemble.refs : [];
    return {
      mode: typeof assemble.mode === "string" ? assemble.mode : null,
      kept: Number.isFinite(Number(assemble.kept)) ? Number(assemble.kept) : null,
      segments: refs.length,
      // 凭据过滤的命中数：只记条数，不记命中内容。
      droppedCredential: countOf(assemble.droppedCredential),
      refs,
    };
  }

  // 每轮一条汇总：档位与计数，不带任何正文。
  // 少哪一段就给 null，不拿 0 或空串填坑——「没跑」与「跑了但是 0」必须分得开。
  // error 只记类别（timeout / network），不记地址也不记响应正文。
  if (event === "recall/result") {
    return {
      gate: textOf(invocation.gate),
      error: textOf(invocation.error),
      query: queryOf(invocation.query),
      recalled: countOf(invocation.recalled),
      rerank: rerankOf(invocation.rerank),
      assemble: assembleOf(invocation.assemble),
      injected: injectedOf(invocation.injected),
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

function textOf(value) {
  return typeof value === "string" && value ? value : null;
}

function countOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 查询那一段：只说用什么查、发了多少字，以及 context 档的拼接账。
 *
 * turns / truncated 与 mode / chars 同一个口径：都是数字与布尔，不碰正文。
 * 缺哪一项给 null（不是 0）：“没拼” 与 “拼了 0 条” 不是一回事。
 */
function queryOf(query) {
  if (!query || typeof query !== "object") return null;
  return {
    mode: textOf(query.mode),
    chars: countOf(query.chars),
    turns: countOf(query.turns),
    truncated: typeof query.truncated === "boolean" ? query.truncated : null,
  };
}

function rerankOf(rerank) {
  if (!rerank || typeof rerank !== "object") return null;
  return {
    mode: textOf(rerank.mode),
    lanes: countOf(rerank.lanes),
    kept: countOf(rerank.kept),
    fallback: textOf(rerank.fallback),
  };
}

function assembleOf(assemble) {
  if (!assemble || typeof assemble !== "object") return null;
  return {
    mode: textOf(assemble.mode),
    kept: countOf(assemble.kept),
    droppedCredential: countOf(assemble.droppedCredential),
  };
}

function injectedOf(injected) {
  if (!injected || typeof injected !== "object") return null;
  return { chars: countOf(injected.chars), tokens: countOf(injected.tokens) };
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

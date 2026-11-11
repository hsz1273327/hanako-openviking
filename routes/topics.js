// 话题表：只读全表、删一条、改标签。
//
// 三条路由都只碰本机的 <dataDir>/topics.json：不联网、不碰服务端、不动别的会话。
// 写一律走 withTopics（按 dataDir 串行化）；参数校验在写之前做全，不合法一个字节都不写。

import { readTopics, removeTopic, renameTopic, withTopics } from "../src/memory/topics.js";

/** label 的长度上限（按码点算，与题面 / 消息截断的口径一致）。 */
export const TOPIC_LABEL_MAX = 60;

function dataDirOf(ctx) {
  return ctx?.dataDir || ctx?.sdk?.dataDir || ".";
}

function hasTopic(dataDir, id) {
  return readTopics(dataDir).topics.some((topic) => topic && topic.id === id);
}

/** 1..TOPIC_LABEL_MAX 个字符（先 trim）；不合法返回给用户看的那句话。 */
function labelProblem(raw) {
  if (typeof raw !== "string") return "label 必须是字符串";
  const value = raw.trim();
  const length = Array.from(value).length;
  if (length < 1 || length > TOPIC_LABEL_MAX) {
    return `label 必须是 1..${TOPIC_LABEL_MAX} 个字符`;
  }
  return null;
}

export default function registerTopicsRoutes(app, ctx) {
  const dataDir = dataDirOf(ctx);

  app.get("/topics", async (c) => c.json(readTopics(dataDir), 200));

  app.delete("/topics/:id", async (c) => {
    const id = String(c.req?.param?.("id") ?? "");
    // 先只读确认：找不到就 404，不为了「没删到」写一次盘。
    if (!hasTopic(dataDir, id)) {
      return c.json({ ok: false, error: "没有这个话题" }, 404);
    }
    const removed = await withTopics(dataDir, (table) => removeTopic(table, id), {
      onWriteError: (message) => ctx?.logger?.warn?.(message),
    });
    if (!removed) return c.json({ ok: false, error: "没有这个话题" }, 404);
    return c.json({ ok: true, id }, 200);
  });

  app.patch("/topics/:id", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "body 必须是对象" }, 400);
    }

    // 校验在写之前：一个字段不合法就 400，文件一个字节都不动。
    const problem = labelProblem(body.label);
    if (problem) return c.json({ ok: false, error: problem }, 400);

    const id = String(c.req?.param?.("id") ?? "");
    if (!hasTopic(dataDir, id)) {
      return c.json({ ok: false, error: "没有这个话题" }, 404);
    }
    const topic = await withTopics(
      dataDir,
      (table) => renameTopic(table, id, body.label),
      { onWriteError: (message) => ctx?.logger?.warn?.(message) },
    );
    if (!topic) return c.json({ ok: false, error: "没有这个话题" }, 404);
    return c.json({ ok: true, topic }, 200);
  });
}

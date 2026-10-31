// 召回前两层（判断与查询）的读写口，主面板那一排下拉专用。
//
// 为什么不复用 /conn 或 /controls：/conn 只管“接到哪台机器”，且 GET 永不回显
// 密钥；/controls 是宿主整页控制台那组布尔开关与数值调参的写入口。这两个端点
// 各有自己的边界，往里塞字符串枚举会把“一次提交要么全成、要么全不写”的规则
// 摊薄到更多字段上。这里只认两个键，两条校验规则，别的一律不接。
//
// 写入前先整单校验：同一次提交里只要有一个值不合法，一个字段都不写。

import {
  QUERY_MODES,
  RECALL_GATES,
  normalizeQueryMode,
  normalizeRecallGate,
} from "../src/ov/settings.js";

const SPECS = Object.freeze({
  recallGate: RECALL_GATES,
  queryMode: QUERY_MODES,
});

async function current(ctx) {
  return {
    recallGate: normalizeRecallGate(await ctx.config.get("recallGate")),
    queryMode: normalizeQueryMode(await ctx.config.get("queryMode")),
  };
}

export default function registerRecallModeRoutes(app, ctx) {
  app.get("/recall-mode", async (c) => c.json(await current(ctx), 200));

  app.post("/recall-mode", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }

    const changes = [];
    for (const [key, allowed] of Object.entries(SPECS)) {
      if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
      const value = body[key];
      if (typeof value !== "string" || !allowed.includes(value)) {
        return c.json(
          { ok: false, error: `${key} 只能是 ${allowed.join(" / ")}` },
          400,
        );
      }
      changes.push([key, value]);
    }

    for (const [key, value] of changes) await ctx.config.set(key, value);

    return c.json(
      { ok: true, applied: changes.map(([key]) => key), ...(await current(ctx)) },
      200,
    );
  });
}

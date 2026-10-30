// 控制路由：整页控制台写开关与调参。
//
// 与 /conn 分工：/conn 只管"接到哪台机器"（serverUrl / apiKey / peerPrefix），
// 这里管"接上以后怎么动"（六个布尔开关 + 召回范围 + 超时 + 预算）。
//
// 每条都在写入前校验，不认识的字一律忽略而不是报错——前端一次提交一组时，
// 半新半旧的客户端不该因为多带一个键就整组失败。

const BOOLS = ["enabled", "autoRecall", "autoCapture", "readOnly", "skillRouting", "probe"];
const SCOPES = new Set(["all", "actor"]);

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function readBool(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export default function registerControlsRoutes(app, ctx) {
  app.get("/controls", async (c) => {
    const out = {};
    for (const key of BOOLS) out[key] = (await ctx.config.get(key)) === true;
    out.recallPeerScope = (await ctx.config.get("recallPeerScope")) || "all";
    out.requestTimeoutMs = clampInt((await ctx.config.get("requestTimeoutMs")) ?? 1500, 200, 30000);
    out.injectBudgetTokens = clampInt((await ctx.config.get("injectBudgetTokens")) ?? 2500, 200, 32000);
    return c.json(out, 200);
  });

  app.post("/controls", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }

    const applied = [];
    for (const key of BOOLS) {
      if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
      const value = readBool(body[key]);
      if (value === null) continue;
      await ctx.config.set(key, value);
      applied.push(key);
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, "recallPeerScope")) {
      const scope = String(body.recallPeerScope || "").trim();
      if (SCOPES.has(scope)) {
        await ctx.config.set("recallPeerScope", scope);
        applied.push("recallPeerScope");
      }
    }

    for (const [key, min, max] of [
      ["requestTimeoutMs", 200, 30000],
      ["injectBudgetTokens", 200, 32000],
    ]) {
      if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
      const value = clampInt(body[key], min, max);
      if (value === null) continue;
      await ctx.config.set(key, value);
      applied.push(key);
    }

    const out = { ok: true, applied };
    for (const key of BOOLS) out[key] = (await ctx.config.get(key)) === true;
    out.recallPeerScope = (await ctx.config.get("recallPeerScope")) || "all";
    out.requestTimeoutMs = clampInt((await ctx.config.get("requestTimeoutMs")) ?? 1500, 200, 30000);
    out.injectBudgetTokens = clampInt((await ctx.config.get("injectBudgetTokens")) ?? 2500, 200, 32000);
    return c.json(out, 200);
  });
}

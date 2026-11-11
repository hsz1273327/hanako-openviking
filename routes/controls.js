// 控制路由：整页控制台写开关与调参。
//
// 与 /conn 分工：/conn 只管"接到哪台机器"（serverUrl / apiKey / peerPrefix），
// 这里管"接上以后怎么动"（六个布尔开关 + 召回范围 + 超时 + 预算 + 查询上限）。
//
// 每条都在写入前校验，不认识的字一律忽略而不是报错——前端一次提交一组时，
// 半新半旧的客户端不该因为多带一个键就整组失败。

const BOOLS = ["enabled", "autoRecall", "autoCapture", "readOnly", "skillRouting", "probe", "recallEnabled"];
const SCOPES = new Set(["all", "actor"]);

/** 数值调参：键 / 下限 / 上限 / 缺项时的默认值。与面板上那几个数字格一一对应。 */
const NUMBERS = [
  ["requestTimeoutMs", 200, 30000, 1500],
  ["injectBudgetTokens", 200, 32000, 2500],
  // context 档拼查询的字数上限（码点）。低于 100 没有意义，高于 8000 服务端必然超时。
  ["queryChars", 100, 8000, 600],
  // 召回请求自己的超时：与 requestTimeoutMs 分开，别拿通用那一档把长查询掘死。
  ["recallTimeoutMs", 500, 30000, 5000],
];

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function readNumber(value, min, max, fallback) {
  return clampInt(value ?? fallback, min, max);
}

function readBool(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function readControls(ctx) {
  const out = {};
  for (const key of BOOLS) {
    if (key === "recallEnabled") {
      // 记忆搜索总开关：缺项时默认 true（与 DEFAULTS 一致）。
      out[key] = (await ctx.config.get(key)) !== false;
      continue;
    }
    out[key] = (await ctx.config.get(key)) === true;
  }
  out.recallPeerScope = (await ctx.config.get("recallPeerScope")) || "all";
  for (const [key, min, max, fallback] of NUMBERS) {
    out[key] = readNumber(await ctx.config.get(key), min, max, fallback);
  }
  return out;
}

export default function registerControlsRoutes(app, ctx) {
  app.get("/controls", async (c) => {
    return c.json(await readControls(ctx), 200);
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

    for (const [key, min, max] of NUMBERS) {
      if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
      const value = clampInt(body[key], min, max);
      if (value === null) continue;
      await ctx.config.set(key, value);
      applied.push(key);
    }

    const out = { ok: true, applied, ...(await readControls(ctx)) };
    return c.json(out, 200);
  });
}

// 召回前两层（判断与查询）及其模型配置的读写口，主面板那一排下拉专用。
//
// 为什么不复用 /conn 或 /controls：/conn 只管“接到哪台机器”，且 GET 永不回显
// 密钥；/controls 是宿主整页控制台那组布尔开关与数值调参的写入口。这两个端点
// 各有自己的边界，往里塞字符串枚举会把“一次提交要么全成、要么全不写”的规则
// 摊薄到更多字段上。这里只认召回这几项，别的一律不接。
//
// 写入前先整单校验：同一次提交里只要有一个值不合法，一个字段都不写。

import {
  GATE_PROMPT_MAX,
  QUERY_MODES,
  RECALL_GATES,
  normalizeGateModel,
  normalizeGatePrompt,
  normalizeQueryMode,
  normalizeRecallGate,
} from "../src/ov/settings.js";

const SPECS = Object.freeze({
  recallGate: RECALL_GATES,
  queryMode: QUERY_MODES,
});

/** provider/model 的边界与 APPS.md 的可调用模型标识一致：非空、无控制字符、≤128。 */
const MODEL_FIELD_MAX = 128;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * 判断模型：空串表示用宿主辅助模型，非空必须是 `provider/model`。
 * 形状不对整单拒绝，不剪字符去硬凑。
 */
function modelRefError(raw) {
  if (typeof raw !== "string") return "gateModel 必须是字符串";
  const value = raw.trim();
  if (!value) return null;
  const cut = value.indexOf("/");
  if (cut <= 0 || cut === value.length - 1) return "gateModel 必须形如 provider/model";
  const [provider, model] = [value.slice(0, cut), value.slice(cut + 1)];
  if (Array.from(provider).length > MODEL_FIELD_MAX || Array.from(model).length > MODEL_FIELD_MAX) {
    return `gateModel 不合法（provider 与 model 各自最长 ${MODEL_FIELD_MAX} 字符）`;
  }
  if (CONTROL_CHARS_RE.test(value)) return "gateModel 不能含控制字符";
  return null;
}

async function current(ctx) {
  return {
    recallGate: normalizeRecallGate(await ctx.config.get("recallGate")),
    queryMode: normalizeQueryMode(await ctx.config.get("queryMode")),
    gatePrompt: normalizeGatePrompt(await ctx.config.get("gatePrompt")),
    gateModel: normalizeGateModel(await ctx.config.get("gateModel")),
  };
}

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "body 必须是对象" }, 400);
    }

    const changes = [];

    for (const [key, allowed] of Object.entries(SPECS)) {
      if (!has(body, key)) continue;
      const value = body[key];
      if (typeof value !== "string" || !allowed.includes(value)) {
        return c.json(
          { ok: false, error: `${key} 只能是 ${allowed.join(" / ")}` },
          400,
        );
      }
      changes.push([key, value]);
    }

    if (has(body, "gatePrompt")) {
      if (typeof body.gatePrompt !== "string") {
        return c.json({ ok: false, error: "gatePrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.gatePrompt).length > GATE_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `gatePrompt 最多 ${GATE_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["gatePrompt", body.gatePrompt]);
    }

    if (has(body, "gateModel")) {
      const problem = modelRefError(body.gateModel);
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["gateModel", String(body.gateModel).trim()]);
    }

    for (const [key, value] of changes) await ctx.config.set(key, value);

    return c.json(
      { ok: true, applied: changes.map(([key]) => key), ...(await current(ctx)) },
      200,
    );
  });
}

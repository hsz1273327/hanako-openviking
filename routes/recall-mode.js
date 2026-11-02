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
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_URL_MAX,
  RERANK_MODES,
  RERANK_PROMPT_MAX,
  SERVICE_MODEL_MAX,
  normalizeGateModel,
  normalizeGatePrompt,
  normalizeQueryMode,
  normalizeRecallGate,
  normalizeRerank,
  normalizeRerankModel,
  normalizeRerankPrompt,
  normalizeServiceModel,
  normalizeServiceUrl,
  parseRerankChannel,
  parseRerankChannels,
  readSwitches,
} from "../src/ov/settings.js";
import { readRerankSample, runRerankChannels } from "../src/memory/recall.js";
import { sessionKeyOf } from "../src/state/session.js";

const SPECS = Object.freeze({
  recallGate: RECALL_GATES,
  queryMode: QUERY_MODES,
  rerank: RERANK_MODES,
});

/** 打分服务的四字段：两组（精排 / 决策）的地址与模型。 */
const SERVICE_MODEL_FIELDS = Object.freeze(["rerankServiceModel", "systemoneServiceModel"]);

/** provider/model 的边界与 APPS.md 的可调用模型标识一致：非空、无控制字符、≤128。 */
const MODEL_FIELD_MAX = 128;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * 判断模型：空串表示用宿主辅助模型，非空必须是 `provider/model`。
 * 形状不对整单拒绝，不剪字符去硬凑。
 */
function modelRefError(raw, field = "gateModel") {
  if (typeof raw !== "string") return `${field} 必须是字符串`;
  const value = raw.trim();
  if (!value) return null;
  const cut = value.indexOf("/");
  if (cut <= 0 || cut === value.length - 1) return `${field} 必须形如 provider/model`;
  const [provider, model] = [value.slice(0, cut), value.slice(cut + 1)];
  if (Array.from(provider).length > MODEL_FIELD_MAX || Array.from(model).length > MODEL_FIELD_MAX) {
    return `${field} 不合法（provider 与 model 各自最长 ${MODEL_FIELD_MAX} 字符）`;
  }
  if (CONTROL_CHARS_RE.test(value)) return `${field} 不能含控制字符`;
  return null;
}

/**
 * 打分服务地址：空串合法（= 未配置）；非空必须是 http / https。
 * 非法值直接拒，不在写入侧悄悄清空——悄悄清空等于用户以为配上了。
 */
function serviceUrlError(raw, field) {
  if (typeof raw !== "string") return `${field} 必须是字符串`;
  const value = raw.trim();
  if (!value) return null;
  if (Array.from(value).length > RERANK_CHANNEL_URL_MAX) {
    return `${field} 最长 ${RERANK_CHANNEL_URL_MAX} 字符`;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return `${field} 不是合法 URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${field} 只接受 http:// 或 https://`;
  }
  if (!parsed.hostname) return `${field} 缺少主机名`;
  return null;
}

/** 打分服务的模型名：可以为空（有的服务只有一个模型），非空最长 128 字符。 */
function serviceModelError(raw, field) {
  if (typeof raw !== "string") return `${field} 必须是字符串`;
  const value = raw.trim();
  if (Array.from(value).length > SERVICE_MODEL_MAX) {
    return `${field} 最长 ${SERVICE_MODEL_MAX} 个字符`;
  }
  if (CONTROL_CHARS_RE.test(value)) return `${field} 不能含控制字符`;
  return null;
}

async function current(ctx) {
  return {
    recallGate: normalizeRecallGate(await ctx.config.get("recallGate")),
    queryMode: normalizeQueryMode(await ctx.config.get("queryMode")),
    gatePrompt: normalizeGatePrompt(await ctx.config.get("gatePrompt")),
    gateModel: normalizeGateModel(await ctx.config.get("gateModel")),
    rerank: normalizeRerank(await ctx.config.get("rerank")),
    rerankPrompt: normalizeRerankPrompt(await ctx.config.get("rerankPrompt")),
    rerankModel: normalizeRerankModel(await ctx.config.get("rerankModel")),
    rerankChannels: parseRerankChannels(await ctx.config.get("rerankChannels"), (message) => {
      try {
        ctx?.logger?.warn?.(`openviking ${message}`);
      } catch {
        /* 日志不能影响读数 */
      }
    }),
    rerankServiceUrl: normalizeServiceUrl(await ctx.config.get("rerankServiceUrl")),
    rerankServiceModel: normalizeServiceModel(await ctx.config.get("rerankServiceModel")),
    systemoneServiceUrl: normalizeServiceUrl(await ctx.config.get("systemoneServiceUrl")),
    systemoneServiceModel: normalizeServiceModel(await ctx.config.get("systemoneServiceModel")),
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

    if (has(body, "rerankPrompt")) {
      if (typeof body.rerankPrompt !== "string") {
        return c.json({ ok: false, error: "rerankPrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.rerankPrompt).length > RERANK_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `rerankPrompt 最多 ${RERANK_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["rerankPrompt", body.rerankPrompt]);
    }

    if (has(body, "rerankModel")) {
      const problem = modelRefError(body.rerankModel, "rerankModel");
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["rerankModel", String(body.rerankModel).trim()]);
    }

    if (has(body, "rerankServiceUrl")) {
      const problem = serviceUrlError(body.rerankServiceUrl, "rerankServiceUrl");
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["rerankServiceUrl", normalizeServiceUrl(body.rerankServiceUrl)]);
    }

    if (has(body, "systemoneServiceUrl")) {
      const problem = serviceUrlError(body.systemoneServiceUrl, "systemoneServiceUrl");
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push(["systemoneServiceUrl", normalizeServiceUrl(body.systemoneServiceUrl)]);
    }

    for (const key of SERVICE_MODEL_FIELDS) {
      if (!has(body, key)) continue;
      const problem = serviceModelError(body[key], key);
      if (problem) return c.json({ ok: false, error: problem }, 400);
      changes.push([key, normalizeServiceModel(body[key])]);
    }

    if (has(body, "rerankChannels")) {
      if (typeof body.rerankChannels !== "string") {
        return c.json({ ok: false, error: "rerankChannels 必须是 JSON 字符串" }, 400);
      }
      const text = body.rerankChannels.trim();
      if (!text) {
        changes.push(["rerankChannels", ""]);
      } else {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          return c.json({ ok: false, error: "rerankChannels 不是合法 JSON" }, 400);
        }
        if (!Array.isArray(parsed)) {
          return c.json({ ok: false, error: "rerankChannels 必须是数组" }, 400);
        }
        if (parsed.length > RERANK_CHANNELS_MAX) {
          return c.json(
            { ok: false, error: `rerankChannels 最多 ${RERANK_CHANNELS_MAX} 路` },
            400,
          );
        }
        const channels = [];
        for (const [index, item] of parsed.entries()) {
          const channel = parseRerankChannel(item);
          if (!channel) {
            return c.json(
              { ok: false, error: `rerankChannels 第 ${index + 1} 项字段不完整` },
              400,
            );
          }
          channels.push(channel);
        }
        changes.push(["rerankChannels", JSON.stringify(channels)]);
      }
    }

    for (const [key, value] of changes) await ctx.config.set(key, value);

    return c.json(
      { ok: true, applied: changes.map(([key]) => key), ...(await current(ctx)) },
      200,
    );
  });

  // 面板「测试」按钮：拿这个会话最近一轮留存的真实候选复跑一次精排。
  // 只读样本与配置，不注入、不改会话状态。
  app.post("/recall-mode/test", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }
    const sessionId = sessionKeyOf(typeof body?.session === "string" ? body.session : "");
    if (!sessionId) return c.json({ ok: false, error: "unknown session key" }, 400);

    const sample = readRerankSample(ctx, sessionId);
    if (!sample) {
      return c.json({ ok: false, error: "这个会话还没有可复跑的召回候选" }, 200);
    }

    try {
      const switches = await readSwitches(ctx);
      const outcome = await runRerankChannels({
        sdk: ctx,
        switches,
        query: sample.query,
        items: sample.items,
      });
      return c.json(
        {
          ok: true,
          at: sample.at,
          query: sample.query,
          candidates: sample.items.length,
          items: sample.items.map((item) => item.text.slice(0, 120)),
          channels: outcome.channels,
          merged: outcome.merged,
          kept: outcome.indexes,
          fallback: outcome.fallback,
          elapsedMs: outcome.elapsedMs,
        },
        200,
      );
    } catch (error) {
      return c.json({ ok: false, error: String(error?.message || error) }, 200);
    }
  });
}

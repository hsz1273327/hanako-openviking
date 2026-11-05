// 召回前两层（判断与查询）及其模型配置的读写口，主面板那一排下拉专用。
//
// 为什么不复用 /conn 或 /controls：/conn 只管“接到哪台机器”，且 GET 永不回显
// 密钥；/controls 是宿主整页控制台那组布尔开关与数值调参的写入口。这两个端点
// 各有自己的边界，往里塞字符串枚举会把“一次提交要么全成、要么全不写”的规则
// 摊薄到更多字段上。这里只认召回这几项，别的一律不接。
//
// 写入前先整单校验：同一次提交里只要有一个值不合法，一个字段都不写。

import {
  ASSEMBLE_MODES,
  DEFAULT_GATE_CONTEXT_PROMPT,
  DEFAULT_GATE_DECISION_PROMPT,
  GATE_CONTEXT_MODES,
  GATE_PROMPT_MAX,
  QUERY_MODES,
  RECALL_GATE_FALLBACKS,
  RECALL_GATES,
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_URL_MAX,
  RERANK_LANE_SCHEMA,
  RERANK_MODES,
  RERANK_PROMPT_MAX,
  SERVICE_KINDS,
  SERVICE_MODEL_MAX,
  applyRerankLaneSchema,
  dedupeRerankChannels,
  projectRerankChannels,
  rerankLaneSchemaIsLegacy,
  serializeRerankLaneSchema,
  normalizeAssembleMode,
  normalizeGateContext,
  normalizeGateContextPrompt,
  normalizeGateContextTurns,
  normalizeGateDecisionPrompt,
  normalizeGateFallback,
  normalizeGateModel,
  normalizeGatePrompt,
  normalizeQueryMode,
  normalizeRerank,
  normalizeRerankModel,
  normalizeRerankPrompt,
  normalizeRerankSystemonePrompt,
  normalizeServiceKey,
  normalizeServiceModel,
  normalizeServiceTimeout,
  normalizeServiceUrl,
  parseRerankChannel,
  parseRerankChannels,
  readSwitches,
  resolveRecallGate,
  serializeGateContextTurns,
  serializeGateDecisionThreshold,
  serializeServiceTimeout,
  servicePairError,
  serviceTimeoutOrDefault,
} from "../src/ov/settings.js";
import { maskString } from "../src/ov/mask.js";
import {
  readRerankSample,
  runRerankChannels,
  testScoringService,
} from "../src/memory/recall.js";
import { sessionKeyOf } from "../src/state/session.js";

const SPECS = Object.freeze({
  recallGate: RECALL_GATES,
  gateFallback: RECALL_GATE_FALLBACKS,
  gateContext: GATE_CONTEXT_MODES,
  queryMode: QUERY_MODES,
  rerank: RERANK_MODES,
  assembleMode: ASSEMBLE_MODES,
});

/** 打分服务的四字段：两组（精排 / 决策）的地址与模型。 */
const SERVICE_MODEL_FIELDS = Object.freeze(["rerankServiceModel", "systemoneServiceModel"]);

/**
 * 地址与模型是一对：校验时按「这一单提交之后的生效值」看，不看单次提交里带了几个键。
 * 先存地址、再补模型的两步提交不会被拆成一次非法状态。
 */
const SERVICE_PAIRS = Object.freeze([
  ["rerankServiceUrl", "rerankServiceModel"],
  ["systemoneServiceUrl", "systemoneServiceModel"],
]);

/** 超时字段与它属于哪一类服务（两类的边界与默认值不同）。 */
const SERVICE_TIMEOUT_FIELDS = Object.freeze([
  ["rerankServiceTimeoutMs", "rerank"],
  ["systemoneServiceTimeoutMs", "systemone"],
]);

/**
 * 可选的服务密钥。留空合法（= 服务端没开鉴权），与地址 / 模型不同：它不成对，
 * 单独有没有都行。
 */
const SERVICE_KEY_FIELDS = Object.freeze(["rerankServiceKey", "systemoneServiceKey"]);

/** 密钥的 GET 形状：只回「填没填」与一枚掩码，永不回明文。 */
function keyShape(stored) {
  const key = normalizeServiceKey(stored);
  return { set: Boolean(key), masked: maskString(key) };
}

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
  const rerankKey = keyShape(await ctx.config.get("rerankServiceKey"));
  const systemoneKey = keyShape(await ctx.config.get("systemoneServiceKey"));
  // 决策服务先读：recallGate 的投影要用它当判据（选了 decision 但服务没配 → off），
  // 与 src/ov/settings.js 的 readSwitches、面板的 paintLayers 同一份规则。
  const systemoneServiceUrl = normalizeServiceUrl(await ctx.config.get("systemoneServiceUrl"));
  const systemoneServiceModel = normalizeServiceModel(await ctx.config.get("systemoneServiceModel"));
  // 兜底模型的存量值：只在拼通道表时用一次（补一条 model 通道），补完就不再用这个键。
  const rerankModel = normalizeRerankModel(await ctx.config.get("rerankModel"));
  // 通道表的语义版本：面板只回显，不要求它回传（保存时由 POST 自己写）。
  const rerankLaneSchema = await ctx.config.get("rerankLaneSchema");
  return {
    recallGate: resolveRecallGate(await ctx.config.get("recallGate"), {
      systemoneServiceUrl,
      systemoneServiceModel,
    }),
    // 判断失败时的兜底：脏值 / 缺项一律归一化回 recall。与档位无关地读出来，
    // 切到 off / rules 再切回来时用户填的那条还在。
    gateFallback: normalizeGateFallback(await ctx.config.get("gateFallback")),
    queryMode: normalizeQueryMode(await ctx.config.get("queryMode")),
    gatePrompt: normalizeGatePrompt(await ctx.config.get("gatePrompt")),
    // 这一项的默认值不是空串：没配过时投影出那句默认题面（读侧与 readSwitches 同口径）。
    // 用户明确清空（存了空串）仍然是空串——空就是「没有判据」，不拿默认去盖。
    gateDecisionPrompt: normalizeGateDecisionPrompt(
      (await ctx.config.get("gateDecisionPrompt")) ?? DEFAULT_GATE_DECISION_PROMPT,
    ),
    // 判断前文与带前文模式那份题面：缺项时投影默认值，用户明确清空仍是空串。
    gateContext: normalizeGateContext(await ctx.config.get("gateContext")),
    gateContextTurns: serializeGateContextTurns(await ctx.config.get("gateContextTurns")),
    gateContextPrompt: normalizeGateContextPrompt(
      (await ctx.config.get("gateContextPrompt")) ?? DEFAULT_GATE_CONTEXT_PROMPT,
    ),
    // 召回门槛：脏值 / 缺项一律画成 0.45（与 readSwitches 同口径）。只在 decision 档用它。
    // 投影字符串，与超时那一组同口径（读侧要数字，写侧存串）。
    gateDecisionThreshold: serializeGateDecisionThreshold(
      await ctx.config.get("gateDecisionThreshold"),
    ),
    gateModel: normalizeGateModel(await ctx.config.get("gateModel")),
    rerank: normalizeRerank(await ctx.config.get("rerank")),
    // 组装：脏值 / 缺项一律画成 rules（与 readSwitches 同口径）。
    assembleMode: normalizeAssembleMode(await ctx.config.get("assembleMode")),
    rerankPrompt: normalizeRerankPrompt(await ctx.config.get("rerankPrompt")),
    rerankSystemonePrompt: normalizeRerankSystemonePrompt(
      await ctx.config.get("rerankSystemonePrompt"),
    ),
    rerankModel,
    // 通道表的语义版本。读出来就是 "2"（老配置在内存里已经被当成新语义），
    // 面板拿它只为了回显 / 排查，不必自己回传。
    rerankLaneSchema: serializeRerankLaneSchema(rerankLaneSchema),
    // 存量迁移 + 补上兜底那一条：与 readSwitches 同一份投影，面板与运行时不会各看各的。
    // 老语义下 model 那一路的 enabled 是被硬写的，这里一并压回 false（迁移只碰这个位）。
    rerankChannels: applyRerankLaneSchema(
      projectRerankChannels(
        parseRerankChannels(await ctx.config.get("rerankChannels"), (message) => {
          try {
            ctx?.logger?.warn?.(`openviking ${message}`);
          } catch {
            /* 日志不能影响读数 */
          }
        }),
        rerankModel,
      ),
      rerankLaneSchemaIsLegacy(rerankLaneSchema),
    ),
    rerankServiceUrl: normalizeServiceUrl(await ctx.config.get("rerankServiceUrl")),
    rerankServiceModel: normalizeServiceModel(await ctx.config.get("rerankServiceModel")),
    // null = 没配（用默认值），数字 = 配的那个。面板的 placeholder 与运行时共用这个口径。
    rerankServiceTimeoutMs: normalizeServiceTimeout(
      await ctx.config.get("rerankServiceTimeoutMs"),
      "rerank",
    ),
    systemoneServiceUrl,
    systemoneServiceModel,
    systemoneServiceTimeoutMs: normalizeServiceTimeout(
      await ctx.config.get("systemoneServiceTimeoutMs"),
      "systemone",
    ),
    // 密钥永不回明文：只给「填没填」+ 掩码。掩码同时是「没改过」的判据——面板整单提交，
    // 没动过的那一格带回来的就是这串。
    rerankServiceKeySet: rerankKey.set,
    rerankServiceKeyMasked: rerankKey.masked,
    systemoneServiceKeySet: systemoneKey.set,
    systemoneServiceKeyMasked: systemoneKey.masked,
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

    if (has(body, "gateDecisionPrompt")) {
      if (typeof body.gateDecisionPrompt !== "string") {
        return c.json({ ok: false, error: "gateDecisionPrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.gateDecisionPrompt).length > GATE_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `gateDecisionPrompt 最多 ${GATE_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["gateDecisionPrompt", body.gateDecisionPrompt]);
    }

    if (has(body, "gateContextPrompt")) {
      if (typeof body.gateContextPrompt !== "string") {
        return c.json({ ok: false, error: "gateContextPrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.gateContextPrompt).length > GATE_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `gateContextPrompt 最多 ${GATE_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["gateContextPrompt", body.gateContextPrompt]);
    }

    if (has(body, "gateContextTurns")) {
      const raw = body.gateContextTurns;
      // 与门槛同一取舍：类型不对才拒；形状对但越界 / 不是整数的归一化回 4 再落库。
      if (raw !== null && typeof raw !== "string" && typeof raw !== "number") {
        return c.json(
          { ok: false, error: "gateContextTurns 必须是数字、字符串或 null" },
          400,
        );
      }
      changes.push(["gateContextTurns", serializeGateContextTurns(raw)]);
    }

    if (has(body, "gateDecisionThreshold")) {
      const raw = body.gateDecisionThreshold;
      // 类型不对才拒；形状对但越界 / 不是数字的归一化回 0.45 再落库，
      // 与超时那一组同一取舍：一个数字填错不该打断整单，也不该把 -1 留在配置里。
      if (raw !== null && typeof raw !== "string" && typeof raw !== "number") {
        return c.json(
          { ok: false, error: "gateDecisionThreshold 必须是数字、字符串或 null" },
          400,
        );
      }
      changes.push(["gateDecisionThreshold", serializeGateDecisionThreshold(raw)]);
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

    // 判别模型那份题面：与精排提示词同一个长度上限，分开校验、分开落库。
    if (has(body, "rerankSystemonePrompt")) {
      if (typeof body.rerankSystemonePrompt !== "string") {
        return c.json({ ok: false, error: "rerankSystemonePrompt 必须是字符串" }, 400);
      }
      if (Array.from(body.rerankSystemonePrompt).length > RERANK_PROMPT_MAX) {
        return c.json(
          { ok: false, error: `rerankSystemonePrompt 最多 ${RERANK_PROMPT_MAX} 个字符` },
          400,
        );
      }
      changes.push(["rerankSystemonePrompt", body.rerankSystemonePrompt]);
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

    // 超时：不合法不报错，回退到该类型的默认值（存空串），不留非法值在配置里。
    // null 是面板「清空这一格」的写法（界面归一后就是 null），当清空处理。
    for (const [key, kind] of SERVICE_TIMEOUT_FIELDS) {
      if (!has(body, key)) continue;
      const raw = body[key];
      if (raw !== null && typeof raw !== "string" && typeof raw !== "number") {
        return c.json({ ok: false, error: `${key} 必须是字符串、数字或 null` }, 400);
      }
      changes.push([key, serializeServiceTimeout(raw, kind)]);
    }

    // 密钥：不是一项校验而是一项取舍：非法值丢弃、保留原值，不报错、不打断整单。
    //
    //   缺省（没这个键） → 不动
    //   带换行           → 丢（拼进 Authorization 头会让 fetch 抛）
    //   空串 / 只有空白   → 清空（明确要删）
    //   等于当前掩码     → 不动（面板整单提交，没改过的格子带回来的就是掩码）
    //   其它             → 覆盖（去空白、截断到 SERVICE_KEY_MAX）
    //
    // 「等于掩码不动」与 conn.js 的 API Key 不同：那边由面板本地判「没改」，
    // 这边因为整单提交，判据必须落在服务端，否则面板一刷新就会把掩码存成真 key。
    for (const key of SERVICE_KEY_FIELDS) {
      if (!has(body, key)) continue;
      const raw = body[key];
      if (typeof raw !== "string") continue;
      if (/[\r\n]/.test(raw)) continue;
      const typed = raw.trim();
      const stored = normalizeServiceKey(await ctx.config.get(key));
      if (typed && typed === maskString(stored)) continue;
      changes.push([key, normalizeServiceKey(raw)]);
    }

    // 地址与模型成对：两边要么都有、要么都空，缺一边整单拒，一个字段不写。
    // 只校验这一单动到的那一对：存量里已经有半对的老配置时，改别的键不该被连坐——
    // 那一对的回退另由 resolveRerankChannel 整对处理。
    const pending = new Map(changes);
    for (const [urlField, modelField] of SERVICE_PAIRS) {
      if (!has(body, urlField) && !has(body, modelField)) continue;
      const url = pending.has(urlField) ? pending.get(urlField) : await ctx.config.get(urlField);
      const model = pending.has(modelField) ? pending.get(modelField) : await ctx.config.get(modelField);
      const problem = servicePairError(url, model, urlField, modelField);
      if (problem) return c.json({ ok: false, error: problem }, 400);
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
        const seenTypes = new Set();
        for (const [index, item] of parsed.entries()) {
          const channel = parseRerankChannel(item);
          if (!channel) {
            return c.json(
              { ok: false, error: `rerankChannels 第 ${index + 1} 项字段不完整` },
              400,
            );
          }
          // 三种类型各最多一条：同类型重复的只留第一条（与读取侧同一取舍，不 400）。
          if (seenTypes.has(channel.type)) continue;
          seenTypes.add(channel.type);
          channels.push(channel);
        }
        changes.push(["rerankChannels", JSON.stringify(dedupeRerankChannels(channels))]);
      }
      // 通道表一次整单落库时，语义版本跟它一起写：迁移过的值（model 不参与主路）与
      // 「按什么语义读它」必须同时到位。只写版本不写通道表是危险的：存量里那份
      // enabled: true 会被当成新语义下用户的选择，再也不会被迁移。
      if (!changes.some(([key]) => key === "rerankLaneSchema")) {
        changes.push(["rerankLaneSchema", String(RERANK_LANE_SCHEMA)]);
      }
    }

    // 收尾：这一单写完之后「档位与服务」必须自洽。同一单里既可能把档位写成 decision、
    // 也可能把决策服务清空，所以按「这一单之后的生效值」判：服务没配就把档位改回 off
    // 并记进 applied——不让「存的是 decision、界面显示 off」这种状态存在。
    const written = new Map(changes);
    const gateAfter = written.has("recallGate")
      ? written.get("recallGate")
      : await ctx.config.get("recallGate");
    if (gateAfter === "decision") {
      const serviceAfter = {
        systemoneServiceUrl: written.has("systemoneServiceUrl")
          ? written.get("systemoneServiceUrl")
          : await ctx.config.get("systemoneServiceUrl"),
        systemoneServiceModel: written.has("systemoneServiceModel")
          ? written.get("systemoneServiceModel")
          : await ctx.config.get("systemoneServiceModel"),
      };
      if (resolveRecallGate(gateAfter, serviceAfter) === "off") {
        const index = changes.findIndex(([key]) => key === "recallGate");
        if (index >= 0) changes[index] = ["recallGate", "off"];
        else changes.push(["recallGate", "off"]);
      }
    }

    for (const [key, value] of changes) await ctx.config.set(key, value);

    return c.json(
      { ok: true, applied: changes.map(([key]) => key), ...(await current(ctx)) },
      200,
    );
  });

  // 面板「测试」按钮：拿请求体里那一对（地址 + 模型）直接打一发打分服务。
  // 校验用请求体里的值，不读已存配置：填了还没保存也要能先试。零副作用。
  app.post("/recall-mode/service-test", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "body 必须是对象" }, 400);
    }

    const kind = body.kind;
    if (!SERVICE_KINDS.includes(kind)) {
      return c.json({ ok: false, error: `kind 只能是 ${SERVICE_KINDS.join(" / ")}` }, 400);
    }

    const url = normalizeServiceUrl(body.url);
    if (!url) return c.json({ ok: false, error: "url 必须是合法的 http(s) 地址" }, 400);

    const model = normalizeServiceModel(body.model);
    const problem = servicePairError(url, model, "url", "model");
    if (problem) return c.json({ ok: false, error: problem }, 400);

    // 超时按类型归一化：非数字 / 越界一律回该类型的默认值（800 / 3500）。
    const timeoutMs = serviceTimeoutOrDefault(body.timeoutMs, kind);
    // 密钥跟着这一单走：测试按钮发的是输入框此刻的值（包括尚未保存的 key）。
    // 带换行的非法值归一成空串——当「没填密钥」试一把，不回 400 打断。
    //
    // 输入框里坐的可能是掩码（没动过就是那串）。掩码不是密钥，发出去只会 401，
    // 所以碰上掩码就去取已存的值——这仍然只读，不改任何状态。
    const keyField = kind === "rerank" ? "rerankServiceKey" : "systemoneServiceKey";
    const typedKey = normalizeServiceKey(body.key);
    const storedKey = normalizeServiceKey(await ctx.config.get(keyField));
    const key = typedKey && typedKey === maskString(storedKey) ? storedKey : typedKey;
    const outcome = await testScoringService({ sdk: ctx, kind, url, model, timeoutMs, key });
    // 打不通不是请求错，是结果：一律 200 + ok:false，面板照原文显示错误。
    return c.json(outcome, 200);
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

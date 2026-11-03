// 连接路由：设置页专用，只碰三个字段。
//
// 名字刻意不叫 /config —— 宿主保留了 /config 与 /config-schema 两个路径，
// 且它们的 GET 会回显明文密钥。自己的端点必须换名，这条是 v1 时代踩出来的。
//
// 铁律：GET 永不回显 apiKey，只回“填没填”。

import { normalizePrefix } from "../src/ov/identity.js";
import { maskOf } from "../src/ov/mask.js";

const FIELDS = new Set(["serverUrl", "apiKey", "peerPrefix"]);

// 归一化后的合法形状：小写字母/数字开头，其余只能是字母、数字、连字符。
const PREFIX_RE = /^[a-z0-9][a-z0-9-]*$/;
const PREFIX_MAX = 32;
// 只收可见 ASCII。normalizePrefix 会把非 [a-z0-9] 折成连字符再剪掉两端，
// 所以「主力机2」会被归一成 "2"——一个用户从没填过的样子。存下去比报错更难排查。
const PREFIX_NON_ASCII_RE = /[^\x20-\x7E]/;

function normalizeServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function shape(serverUrl, peerPrefix, apiKey) {
  const { head, tail } = maskOf(apiKey);
  return {
    serverUrl,
    peerPrefix,
    // 存量值是否还能生效：界面据此看出"这个值是脏的、现在不生效"。
    peerPrefixValid: prefixIsValid(peerPrefix),
    apiKeySet: Boolean(apiKey),
    apiKeyHead: head,
    apiKeyTail: tail,
  };
}

/**
 * 存量前缀还能不能用。
 *
 * 空串算合法（"没填"是一种正当状态）。非空则要求归一化之后非空、形状合法、长度不超限。
 * 长度看归一化后的值：POST 校验的也是归一化后的值，两边不能各算一套。
 */
function prefixIsValid(raw) {
  const stored = String(raw || "");
  if (!stored) return true;
  const value = normalizePrefix(stored);
  return Boolean(value) && PREFIX_RE.test(value) && value.length <= PREFIX_MAX;
}

export default function registerConnRoutes(app, ctx) {
  app.get("/conn", async (c) => {
    const serverUrl = (await ctx.config.get("serverUrl")) || "";
    const peerPrefix = (await ctx.config.get("peerPrefix")) || "";
    const apiKey = (await ctx.config.get("apiKey")) || "";
    return c.json(shape(serverUrl, peerPrefix, apiKey), 200);
  });

  app.post("/conn", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }

    // 先校验再落库：同一次提交里只要前缀不合法，一个字段都不写，
    // 否则“改了三个字段、第三个被拒”会留下一个半截生效的配置。
    let prefix = null;
    let prefixUnchanged = false;
    if (Object.prototype.hasOwnProperty.call(body || {}, "peerPrefix")) {
      const stored = String((await ctx.config.get("peerPrefix")) || "");
      const typed = String(body.peerPrefix ?? "").trim();
      // “未变化且非法”的存量值放行。
      //
      // 为什么不靠面板只发改动字段：面板不是一个调用方，curl、未来的脚本、别的界面
      // 都会整单提交。把正确性押在“每个调用方都记得只发改动字段”上，是把契约摊薄到
      // N 个地方。网关该守的是“不许新的非法值进来”，不是“惩罚已经存在的脏数据”。
      // 所以这里不校验、不写、也不计入 applied：它是既成事实，重提交不该被拒，
      // 写回一个未归一化的旧值也没有意义。改脏值就是另一件事了，走下面的严格校验。
      if (typed === stored) {
        prefixUnchanged = true;
      } else {
        const value = normalizePrefix(typed);
        // 归一到空串但用户确实填了东西（比如纯中文），说明这个前缀不可能成为合法 slug——
        // 直接拒，不要静默存成“没填”。非 ASCII 一律拒：「主力机2」归一化后是 "2"，
        // 不拦就会静默存下一个碎片。
        if ((typed && !value) || PREFIX_NON_ASCII_RE.test(typed)) {
          return c.json({ ok: false, error: "门牌前缀只能用字母、数字和连字符" }, 400);
        }
        if (value && !PREFIX_RE.test(value)) {
          return c.json({ ok: false, error: "门牌前缀只能用字母、数字和连字符" }, 400);
        }
        if (value.length > PREFIX_MAX) {
          return c.json({ ok: false, error: `门牌前缀最长 ${PREFIX_MAX} 个字符` }, 400);
        }
        prefix = value;
      }
    }

    const applied = [];
    for (const [key, raw] of Object.entries(body || {})) {
      if (!FIELDS.has(key)) continue;
      if (key === "serverUrl") {
        const value = normalizeServerUrl(raw);
        await ctx.config.set("serverUrl", value);
        applied.push("serverUrl");
        continue;
      }
      if (key === "peerPrefix") {
        if (prefixUnchanged) continue;
        await ctx.config.set("peerPrefix", prefix ?? "");
        applied.push("peerPrefix");
        continue;
      }
      if (key === "apiKey") {
        const value = String(raw ?? "").trim();
        // 空字符串表示“清除”；非空直接覆盖（已 trim），行为与旧分支完全一致。
        await ctx.config.set("apiKey", value);
        applied.push("apiKey");
      }
    }

    const serverUrl = (await ctx.config.get("serverUrl")) || "";
    const peerPrefix = (await ctx.config.get("peerPrefix")) || "";
    const apiKey = (await ctx.config.get("apiKey")) || "";
    return c.json({ ok: true, applied, ...shape(serverUrl, peerPrefix, apiKey) }, 200);
  });
}

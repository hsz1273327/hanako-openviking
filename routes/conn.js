// 连接路由：设置页专用，只碰三个字段。
//
// 名字刻意不叫 /config —— 宿主保留了 /config 与 /config-schema 两个路径，
// 且它们的 GET 会回显明文密钥。自己的端点必须换名，这条是 v1 时代踩出来的。
//
// 铁律：GET 永不回显 apiKey，只回"填没填"。

const FIELDS = new Set(["serverUrl", "apiKey", "peerPrefix"]);

function normalizeServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function maskOf(raw) {
  const key = String(raw || "");
  if (!key) return { head: "", tail: "" };
  if (key.length < 12) return { head: "", tail: key.slice(-4) };
  return { head: key.slice(0, 4), tail: key.slice(-4) };
}

function shape(serverUrl, peerPrefix, apiKey) {
  const { head, tail } = maskOf(apiKey);
  return {
    serverUrl,
    peerPrefix,
    apiKeySet: Boolean(apiKey),
    apiKeyHead: head,
    apiKeyTail: tail,
  };
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
        await ctx.config.set("peerPrefix", String(raw ?? "").trim());
        applied.push("peerPrefix");
        continue;
      }
      if (key === "apiKey") {
        const value = String(raw ?? "").trim();
        // 空字符串表示"清除"，不写就把旧 key 留着。
        if (value === "") {
          await ctx.config.set("apiKey", "");
          applied.push("apiKey");
        } else if (/^[\s]*$/.test(value) === false) {
          await ctx.config.set("apiKey", value);
          applied.push("apiKey");
        }
      }
    }

    const serverUrl = (await ctx.config.get("serverUrl")) || "";
    const peerPrefix = (await ctx.config.get("peerPrefix")) || "";
    const apiKey = (await ctx.config.get("apiKey")) || "";
    return c.json({ ok: true, applied, ...shape(serverUrl, peerPrefix, apiKey) }, 200);
  });
}

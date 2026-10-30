// /ready 的归一化：一份实现，两个消费者。
//
// 路由（routes/status.js）与工具（index.js 的 openviking_status）读的是同一份
// 服务端响应，形状必须一样——否则同一次探测在面板里和模型眼里是两回事，
// 而且两边各养一份 `? :`，迟早只修一边。

/**
 * 把 /ready 的 checks 归一化成 [{ name, status, details? }]。
 *
 * 实测服务端同一份响应里混着两种形态：
 *   "vectordb": "ok"                    —— 纯字符串
 *   "agfs": { "status": "ok", ... }    —— 对象
 * 只读 .status 会把字符串那几条全判成坏（not_configured 也一起消失），
 * 所以这里把两种都读成 status。对象里还有嵌套 checks 的，递归归一化后
 * 放进 details，界面要展开时有东西可看。
 */
export function normalizeChecks(raw) {
  if (!raw || typeof raw !== "object") return [];

  const entries = Array.isArray(raw)
    ? raw
        .filter((item) => item && typeof item === "object")
        .map((item) => [String(item.name ?? ""), item])
    : Object.entries(raw);

  return entries.map(([name, value]) => {
    if (typeof value === "string") {
      return { name, status: value };
    }
    if (value && typeof value === "object") {
      const status =
        typeof value.status === "string"
          ? value.status
          : typeof value.state === "string"
            ? value.state
            : "unknown";
      const nested = value.checks ?? value.details;
      const details = nested ? normalizeChecks(nested) : null;
      return details ? { name, status, details } : { name, status };
    }
    return { name, status: "unknown" };
  });
}

/** /ready 的其余字段原样保留，只换掉 checks 的形状。 */
export function normalizeReady(ready) {
  if (!ready || typeof ready !== "object") return ready;
  return { ...ready, checks: normalizeChecks(ready.checks) };
}

// GET /conn 的响应 → 设置页字段：纯函数，不碰 DOM、不碰响应式。
//
// 抽出来是为了能被离线断言（dev/smoke.mjs）：拿到响应之后到底是哪个字段、
// 填成什么，一步就能测，不用起浏览器。
//
// 后端 GET /conn 回的是
//   { serverUrl, peerPrefix, peerPrefixValid, apiKeySet, apiKeyHead, apiKeyTail }
// ——**没有 ok 字段**（只有 POST 才有）。所以这里只认形状，不认成功标志；
// 成功与否由调用方按 HTTP 状态判断。

export const HINT_DEFAULT = "保存在本机 App 设置里，不会回显、不进日志。";
export const HINT_SET = "已保存在本机。要换 key 就在框里输入新的；留空保存不会清掉旧的。";

/**
 * API Key 的掩码：头四位 + 八个圆点 + 后四位。
 *
 * 后端对短 key（< 12 位）只给后四位，所以 head 可能是空串；tail 为空说明
 * 「没填」，整个掩码也就是空串。逐字对齐已删除的手写设置页（现为 SettingsApp.vue）。
 */
export function buildMask(head, tail) {
  if (!tail) return "";
  return `${head || ""}${"•".repeat(8)}${tail}`;
}

/**
 * 响应 → 表单字段。
 *
 * - serverUrl / peerPrefix 原样落地（非字符串一律当空，避免 undefined 显示成 "undefined"）；
 * - apiKey 放掩码，绝不放明文；
 * - 掩码同时作为「用户没改过」的判据，所以 mask 一起返回；
 * - 说明文字按 apiKeySet 二选一。
 */
export function connFields(data) {
  const conn = data && typeof data === "object" ? data : {};
  const mask = conn.apiKeySet ? buildMask(conn.apiKeyHead, conn.apiKeyTail) : "";
  return {
    serverUrl: typeof conn.serverUrl === "string" ? conn.serverUrl : "",
    peerPrefix: typeof conn.peerPrefix === "string" ? conn.peerPrefix : "",
    apiKey: mask,
    mask,
    keyHint: conn.apiKeySet ? HINT_SET : HINT_DEFAULT,
  };
}

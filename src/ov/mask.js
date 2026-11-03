// 密钥掩码：GET 永不回明文，只回「填没填」与一枚能认出是哪把 key 的掩码串。
//
// 规则：长 key（≥12 位）给前 4 + 后 4；短 key 只给后 4——短 key 的前 4 已经占了
// 小半，「前 4 + 后 4」等于把整把钥匙印在界面上。空 key 给空串。
//
// 掩码串 = 头 + 8 个圆点 + 尾。conn.js 的 API Key 回的是拆开的 Head / Tail，
// /recall-mode 的两组服务密钥回的是拼好的 Masked，两边拼法必须同源：
// 都在这里算，别在别处再写一套（第二套一定会和第一套差一个圆点）。

/** 掩码中间圆点的个数。改这个数等于改协议：面板拿它当「没改过」的判据。 */
export const MASK_DOTS = 8;

/** 拆开的两半：head 是前 4（短 key 为空），tail 是后 4（空 key 为空）。 */
export function maskOf(raw) {
  const key = String(raw || "");
  if (!key) return { head: "", tail: "" };
  if (key.length < 12) return { head: "", tail: key.slice(-4) };
  return { head: key.slice(0, 4), tail: key.slice(-4) };
}

/** 拼好的一串：没填就是空串（面板据此显示「未填写」而不是一串圆点）。 */
export function maskString(raw) {
  const { head, tail } = maskOf(raw);
  if (!tail) return "";
  return `${head}${"•".repeat(MASK_DOTS)}${tail}`;
}

// check 状态 -> 颜色档位。父项与 details 共用这一份，别再写第二份 ? :。
//
//   ok                              绿：正常
//   not_configured / not_supported   灰：没配 / 不支持 / 关着，都是"不算坏"
//   / disabled
//   其它（error / down / failed / unknown / 任何没见过的值）  红
//
// 未知值判红是有意的：认不出来的状态不该被当成好消息。
export const TONE_OK = "ok";
export const TONE_MUTED = "muted";
export const TONE_BAD = "bad";

const MUTED_STATUSES = new Set(["not_configured", "not_supported", "disabled"]);

export function statusTone(status) {
  const value = String(status ?? "").trim();
  if (value === "ok") return TONE_OK;
  if (MUTED_STATUSES.has(value)) return TONE_MUTED;
  return TONE_BAD;
}

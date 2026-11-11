// 相对时间：界面上的「3 小时前」只在这一处算。
//
// 不 import vue，也不读时钟：nowMs 由调用方给，冒烟可以直接钉一个时刻。
// 解析不出来一律给「—」，不拿「刚刚」冒充一个不知道是什么的值。

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** ISO 串 / 毫秒数 / 数字串 → 毫秒；认不出来给 null。 */
function parseMs(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  // 数字串按毫秒数认；ISO 串交给 Date.parse。
  if (/^-?\d+$/.test(text)) {
    const ms = Number(text);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 相对时间："—" / "刚刚" / "N 分钟前" / "N 小时前" / "N 天前"。
 *
 * 未来时间与 60 秒以内都算「刚刚」：时钟漂一点不该在界面上写成负数。
 */
export function relativeTime(value, nowMs) {
  const ms = parseMs(value);
  if (ms === null) return "—";
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const diff = now - ms;
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  return `${Math.floor(diff / DAY)} 天前`;
}

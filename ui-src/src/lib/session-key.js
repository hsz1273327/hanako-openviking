// 会话 key：把宿主给的会话定位器换成本 App 状态文件的 key。
//
// 为什么要换：`hana.sessions.getActive()` 返回
//   { sessionId: "sess_0mvgejpps_…", sessionPath: "…/2026-10-20T08-09-15-730Z_01a1585b-….jsonl", title, agentId }
// 其中 sessionId 是宿主的稳定 id，指不到任何文件；hook 里的 session.sessionId、
// 以及 <dataDir>/sessions/<key>.json 用的都是路径里的那个 uuid。
// 拿 sessionId 去查，卡片永远读到空记录，用户点开关也永远写不进去。
//
// 规则与后端 src/state/session.js 的 sessionKeyOf 同一条：取 basename、去扩展名、
// 去创建时间前缀、校验 uuid 形状；认不出来就给空串，让调用方退到"没有活动会话"，
// 而不是编一个 key。
// 两边规则不一致的后果是"页面查一份、卡片写另一份"，所以 dev/smoke.mjs 里成对断言。

// key 的形状：宿主会话文件里的 uuid 是小写，所以正则不带 i 标志。
const KEY_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}/;

// 文件名里最后一个 `_` 之后的段落；没有 `_` 时就是整个名字。
// 不去猜时间戳长什么样：宿主换成 +08-00 或不再带 Z，这里也不会剥不到。
function stripStamp(name) {
  return name.slice(name.lastIndexOf("_") + 1);
}

export function sessionKeyOf(active) {
  const raw = typeof active?.sessionPath === "string" ? active.sessionPath : "";
  return keyFromLocator(raw);
}

export function keyFromLocator(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // 两个方向的分隔符都认；已经是一个 key 时这里只是原样带回。
  const base = trimmed.split(/[/\\]/).filter(Boolean).pop() || "";
  const name = base.replace(/\.jsonl$/i, "").replace(/\.json$/i, "");
  if (!name || name === "." || name === "..") return "";
  if (name.startsWith("sess_")) return "";
  const key = stripStamp(name);
  if (!key || key.startsWith("sess_")) return "";
  if (!KEY_SHAPE.test(key)) return "";
  return key;
}

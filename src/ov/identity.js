// 身份解析：谁在说话。
//
// peer 有三种形态（v3），彼此不可混同：
//   绑定   <prefix>-openhanako-<agentDir>   这段会话记了 agentDir
//   合并   <prefix>-openhanako-merged       mergeMemory 明确打开
//   未绑定 null                             解析不出 agentDir
//
// 为什么"合并"和"不知道"必须分开：合并是用户主动选择"整台机器一个身份"，
// 不知道是解析失败。两者若都退化成 openhanako，服务端就没法区分，用户也无从察觉。
// 未绑定时宁可不发身份头（见 client.js），也不冒充一个像样的名字。
//
// 为什么中间要夹 openhanako：共享中枢不只接本机 Hana，也可能接别的客户端。
// 光看 `desktop-blueflower` 分不清它是 Hana 里的蓝花还是别的程序自报的名字，
// 带上产品名之后，中枢里一眼能按来源归类。
//
// <agentDir> 来自会话文件路径，两种形态：
//   主会话 .../agents/<dir>/sessions/<file>.jsonl
//   子会话 .../agents/<dir>/subagent-sessions/direct/<file>.jsonl
// 这是唯一能保证"不同助手的记忆不混"的标识（元 / 显示名都可能重复）。
// peer 是**会话级**的：同一个窗口从蓝花切到小花，下一轮就该换 peer。

export const PRODUCT_NAME = "openhanako";
export const MERGED_PEER_NAME = `${PRODUCT_NAME}-merged`;

// 两个方向的路径分隔符都认：宿主的会话路径可能在 Windows 上是反斜杠。
// 之所以按段处理而不是写一条更长的正则：会话根有两种取值（主会话 sessions、
// 子会话 subagent-sessions/direct/），`subagent-sessions` 里那个 `-` 不是分隔符，
// 拼进正则只会越写越像谜语；切成段之后，"锚点后面依次是什么"就是能读的代码。
// 切分保留空段（不用 `+` 折叠）：空段本身就是一个拒绝条件，折叠掉就再也看不见了。
const SESSION_ROOTS = new Set(["sessions", "subagent-sessions"]);

/**
 * 从会话文件路径里取 agentDir。
 *
 * 路径形态：.../agents/<dir>/sessions/<file>.jsonl（主会话）
 *       或 .../agents/<dir>/subagent-sessions/direct/<file>.jsonl（子会话）
 *
 * 解析不出、或解析出的东西不是"一个目录名"，一律返回空串——
 * 调用方据此判定"未绑定"，而不是拿一个可疑的片段去拼身份。
 * 拿不准就返回空串：`~/.hanako/agents/` 下一个助手一个目录、目录名就是唯一标识，
 * 猜错一个名字就等于把两个助手的记忆并到一起，这种错误事后无法从数据里看出来。
 */
export function agentDirFromSessionPath(sessionPath) {
  if (!sessionPath) return "";
  const parts = String(sessionPath).split(/[/\\]/);
  // 从右往左找最近的 `agents` 锚点。
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i] !== "agents") continue;
    // 锚点后面依次是：目录名、会话根、至少一段尾巴（文件名，或 direct 这类中间目录）。
    if (!SESSION_ROOTS.has(parts[i + 2])) continue;
    const dir = parts[i + 1];
    const tail = parts[i + 3];
    // 结构对但名字/尾巴不合法时当场拒绝，不往左再去外层蒙一个目录名。
    // 切分之后段里不可能再含分隔符，所以这里只需挡 `.` / `..` / 空段。
    if (!dir || dir === "." || dir === "..") return "";
    if (!tail || tail === "." || tail === "..") return "";
    return dir;
  }
  return "";
}

export function normalizeAgent(hint) {
  if (!hint) return "";
  return String(hint)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 门牌前缀归一化：与小写化后的 slug 同一套规则（小写、非 [a-z0-9] 折叠成 -、去首尾 -）。
 *
 * 非 ASCII 前缀（例如「主力机」）归一化后是空串，等于没有前缀——
 * 这样 Headers 永远不会因为非法头值抛 TypeError，也不会悄悄丢掉整个召回。
 */
export function normalizePrefix(raw) {
  return normalizeAgent(raw);
}

/**
 * 用已解析出的 agentDir 拼 peer。
 *
 * 返回 null 表示"这段会话没有身份"：不是产品名，也不是带前缀的产品名。
 * mergeMemory 时不看 agentDir——那是一个"整台机器一个身份"的选择，且带 -merged 后缀，
 * 保证它永远不会和"解析失败"撞成同一个字符串。
 */
export function composePeer(conn, agentDir) {
  const prefix = normalizePrefix(conn?.peerPrefix);
  if (conn?.mergeMemory) {
    return prefix ? `${prefix}-${MERGED_PEER_NAME}` : MERGED_PEER_NAME;
  }
  // agentDir 有内容但归一化后为空（比如纯中文目录名），同样算解析失败。
  const agent = normalizeAgent(agentDir);
  if (!agent) return null;
  return [prefix, PRODUCT_NAME, agent].filter(Boolean).join("-");
}

export function resolvePeer(conn, sessionPath) {
  return composePeer(conn, agentDirFromSessionPath(sessionPath));
}

/**
 * peer + 它从哪来，供接口一次说清。
 *
 * peerSource:
 *   "session"  会话记了可解析的 agentDir
 *   "merged"   mergeMemory 明确生效（此时 agentDir 不参与）
 *   "unbound"  拿不到身份，peer 为 null
 *
 * peerAgentDir: 归一化后的助手名。mergeMemory 会把"其实知道是哪个助手"这件事
 * 盖在 -merged 身份下面，这个字段把它单独拿出来，不改 peerSource 的语义。
 * 归一化后为空就**不给这个键**：一个恒为 undefined 的键会让人以为"字段存在但没值"，
 * 而事实是"根本不知道是哪个助手"。
 */
export function describePeer(conn, agentDir) {
  const peer = composePeer(conn, agentDir);
  const agent = normalizeAgent(agentDir);
  const described = { peer };
  if (agent) described.peerAgentDir = agent;
  if (conn?.mergeMemory) {
    described.peerSource = "merged";
    return described;
  }
  described.peerSource = peer ? "session" : "unbound";
  return described;
}

/**
 * 归一化入口：从会话路径解析身份，并在"确实有身份"时按会话记一笔。
 *
 * 只在这两种情况下写 active peer：解析出了 agentDir，或 mergeMemory 明确生效。
 * sessionPath 缺失时不写——那一轮说的话归属不到任何一段会话，记下来只会误导面板。
 */
export function peerForSession(conn, sessionId, sessionPath) {
  const described = describePeer(conn, agentDirFromSessionPath(sessionPath));
  if (sessionPath && described.peer) noteActivePeer(sessionId, described.peer);
  return described;
}

// ---- 最近一次真实用过的 peer（按会话）----
//
// 先把话说准：这里**不是**"权威的最近身份"，现在也没有任何读取方。
//   - 写入方只有一个：provider/before-request（经 peerForSession）。
//   - 没有任何读取方：/status 故意不读（否则会把 A 会话的身份显示到 B 头上），
//     panel.js 也不读。
//   - 真正的消费者是还没落地的 capture。
// 所以它现在不改变任何行为；别以为它在生效，也别顺手删掉。
//
// 面板打开时手上没有会话对象，但召回/钩子那边知道此刻是谁在说话。
// 让真正干活的那条路按 sessionId 记下来，读的时候也只能按 sessionId 读：
// 没有"全局最近一个"，否则换个窗口看一眼就串到别人的身份上。

const activePeers = new Map();
const ACTIVE_PEER_LIMIT = 64;

export function noteActivePeer(sessionId, peer) {
  const sid = String(sessionId || "").trim();
  const next = String(peer || "").trim();
  if (!sid || !next) return null;
  // 重新写入同一个会话时移到队尾，淘汰顺序按"最近使用"。
  if (activePeers.has(sid)) activePeers.delete(sid);
  activePeers.set(sid, next);
  while (activePeers.size > ACTIVE_PEER_LIMIT) {
    activePeers.delete(activePeers.keys().next().value);
  }
  return next;
}

export function readActivePeer(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  return activePeers.get(sid) || null;
}

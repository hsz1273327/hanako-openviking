// 身份解析：谁在说话。
//
// peer 命名规则：
//   peer = <prefix>-<agentDir>   有前缀时
//   peer = <agentDir>            无前缀时
//   mergeMemory 打开时统一为 <prefix>-openhanako 或 openhanako
//
// <agentDir> 来自会话文件路径 .../agents/<dir>/sessions/<file>.jsonl，
// 这是唯一能保证"不同助手的记忆不混"的标识（元 / 显示名都可能重复）。

export const MERGED_PEER_NAME = "openhanako";

export function agentDirFromSessionPath(sessionPath) {
  if (!sessionPath) return "";
  const m = String(sessionPath).match(/\/agents\/([^/]+)\/sessions\//);
  return m ? m[1] : "";
}

export function normalizeAgent(hint) {
  if (!hint) return "";
  return String(hint)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolvePeer(conn, sessionPath) {
  const prefix = String(conn?.peerPrefix || "").trim();

  if (conn?.mergeMemory) {
    return prefix ? `${prefix}-${MERGED_PEER_NAME}` : MERGED_PEER_NAME;
  }

  const name = normalizeAgent(agentDirFromSessionPath(sessionPath)) || MERGED_PEER_NAME;
  return prefix ? `${prefix}-${name}` : name;
}

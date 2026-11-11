// 记忆共享页的状态行：本会话写了几条、上次提交时间、还有几轮没提交。
// 后端写回还没做，所以现在只有空态；真值回来时只改这个函数的入参，组件不用动。

export const CAPTURE_STATUS_EMPTY = "暂无记录";

function formatTimestamp(value) {
  if (value == null) return "";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString("zh-CN");
  } catch {
    return "";
  }
}

function formatCount(value) {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.floor(n));
}

export function captureStatusView(data) {
  // data 形状（后端做出来之后）：{ written, lastCommitAt, pendingTurns }
  // 缺项 / 读不到 / 还没做，一律空态。
  const writtenCount = data && formatCount(data.written);
  const lastCommit = data && formatTimestamp(data.lastCommitAt);
  const pendingCount = data && formatCount(data.pendingTurns);
  return {
    written: writtenCount ? `${writtenCount} 条` : CAPTURE_STATUS_EMPTY,
    lastCommit: lastCommit || CAPTURE_STATUS_EMPTY,
    pending: pendingCount ? `${pendingCount} 轮` : CAPTURE_STATUS_EMPTY,
  };
}

// 写回游标与对账。纯函数，不联网、不读 sdk。
//
// 为什么用 entry id 而不是行号：
// 宿主的会话 JSONL 会滑动窗口、压缩、重写；行号会跟着错位，而每条 message 记录的
// `id` 是它自己的身份。游标记住「最后写进 OpenViking 的那条 id」，下次从它之后取，
// 文件被截断或重排也不会把已经写过的段落再发一遍。
//
// 对账的口径是「服务端是事实，本地是缓存」：本地坐标丢了 / 回执没收到 / 消息写丢了，
// 都用 GET /sessions/{id} 的状态推回来。唯一不能做的是把整段对话重发一遍。

export const CAPTURE_MESSAGE_ROLES = Object.freeze(["user", "assistant"]);

function nonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

/** 服务端字段可能是数字串或缺失：非有限数字一律当「不知道」。 */
function numberOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function emptyCursor() {
  return {
    lastEntryId: "",
    lastMessageCount: 0,
    lastCommitCount: 0,
    lastCommitAt: null,
    lastCommitMessageCount: 0,
    pendingTurns: 0,
    serverPolicy: null,
  };
}

function normalizeServerPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    enabled: value.enabled === true,
    idleSeconds:
      typeof value.idleSeconds === "number" && Number.isFinite(value.idleSeconds)
        ? Math.max(0, Math.floor(value.idleSeconds))
        : null,
  };
}

/** 脏值 / 缺字段一律补零值，数字收敛成非负整数，字符串收敛成串。 */
export function normalizeCursor(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    lastEntryId: typeof raw.lastEntryId === "string" ? raw.lastEntryId : "",
    lastMessageCount: nonNegativeInt(raw.lastMessageCount),
    lastCommitCount: nonNegativeInt(raw.lastCommitCount),
    lastCommitAt: typeof raw.lastCommitAt === "string" && raw.lastCommitAt ? raw.lastCommitAt : null,
    lastCommitMessageCount: nonNegativeInt(raw.lastCommitMessageCount),
    pendingTurns: nonNegativeInt(raw.pendingTurns),
    serverPolicy: normalizeServerPolicy(raw.serverPolicy),
  };
}

/**
 * 逐行解析 JSONL。
 *
 * 文件可能正在被追加，最后一行常常是半截；坏行与非对象（含数组）直接跳过，
 * 不抛。少读一条下一轮会补上，抛出去则会让整轮写回停摆。
 */
export function parseSessionLines(text) {
  if (typeof text !== "string" || !text) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out.push(parsed);
  }
  return out;
}

/**
 * 取一条记录正文里的可写文本。
 *
 * 电池消息的 content 可能是字符串，也可能是分段数组；数组里只有 type === "text"
 * 的段是正文，图片 / 工具结果等一律跳过。
 */
export function messageTextOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type !== "text") continue;
    if (typeof part.text === "string") parts.push(part.text);
  }
  return parts.join("");
}

export function isCaptureMessage(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (record.type !== "message") return false;
  const message = record.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  if (!CAPTURE_MESSAGE_ROLES.includes(message.role)) return false;
  return messageTextOf(message.content).length > 0;
}

/** 按文件顺序给出可写消息；custom / model_change 之类的记录不进这里。 */
export function captureMessages(records) {
  const list = Array.isArray(records) ? records : [];
  const out = [];
  for (const record of list) {
    if (!isCaptureMessage(record)) continue;
    out.push({
      id: typeof record.id === "string" ? record.id : "",
      role: record.message.role,
      content: messageTextOf(record.message.content),
      timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
    });
  }
  return out;
}

/**
 * 取游标之后的增量。
 *
 * 找不到 lastEntryId（文件被重建 / 压缩 / 游标来自别的文件）时退到按条数切片：
 * 跳过前 lastMessageCount 条再取。这是「不重」的最后一道——认出 entry id 时相信它，
 * 认不出来时宁可少写，也不把整段对话重发一遍。
 */
export function collectDelta(messages, cursor) {
  const list = Array.isArray(messages) ? messages : [];
  const state = normalizeCursor(cursor);
  let delta;
  if (!state.lastEntryId) {
    delta = list.slice();
  } else {
    const index = list.findIndex((message) => message?.id === state.lastEntryId);
    delta = index >= 0 ? list.slice(index + 1) : list.slice(state.lastMessageCount);
  }
  return {
    messages: delta,
    lastEntryId: delta.length ? delta[delta.length - 1].id : state.lastEntryId,
  };
}

/** 完整轮数：一条 user 后面至少有一条 assistant 才算一轮。 */
export function countTurns(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let turns = 0;
  let openUser = false;
  for (const message of list) {
    if (message?.role === "user") {
      openUser = true;
    } else if (message?.role === "assistant" && openUser) {
      turns += 1;
      openUser = false;
    }
  }
  return turns;
}

/**
 * 取末尾最近 n 个完整轮。只在完整轮的起点处切，不从半轮中间切：
 * 不足 n 轮时有多少取多少。
 *
 * 紧贴最后一条选中消息之后的悬空 user（user 写完、assistant 还没来）会作为「引子」
 * 追加在结果末尾：提交点可能正好落在半轮，没有它「现在」就成了半截对话。
 * 它本身不算一轮，countTurns 的轮数口径不受影响。
 */
export function tailTurns(messages, n) {
  const list = Array.isArray(messages) ? messages : [];
  const want = Math.floor(Number(n));
  if (!Number.isFinite(want) || want <= 0) return [];

  const spans = [];
  let start = -1;
  for (let index = 0; index < list.length; index += 1) {
    const role = list[index]?.role;
    if (role === "user") {
      if (start < 0) start = index;
    } else if (role === "assistant" && start >= 0) {
      spans.push([start, index]);
      start = -1;
    }
  }

  const chosen = spans.slice(-want);
  if (!chosen.length) return [];
  const end = chosen[chosen.length - 1][1];
  const out = list.slice(chosen[0][0], end + 1);
  // 引子按时间顺序追加在末尾，紧接「现在」，不重排到前面。
  if (list[end + 1]?.role === "user") out.push(list[end + 1]);
  return out;
}

/**
 * 对账：把服务端会话状态与本地游标对成「这一轮该做什么」。
 *
 * 判据顺序不能换。commit 已经前进时先认回执，否则会把同一段再提交一次；
 * 消息缺失先于欠账，否则会拿一份不完整的历史去 commit。
 */
export function reconcileCapture({ cursor, server } = {}) {
  const state = normalizeCursor(cursor);
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    return { state: "fresh", write: true, mayCommit: false, patch: null };
  }

  const commitCount = numberOrNull(server.commit_count);
  const messageCount = numberOrNull(server.message_count);
  const pendingTokens = numberOrNull(server.pending_tokens);

  // 上次 commit 成功了，只是回执没收到：只更新本地计数，绝不再提交一次。
  if (commitCount !== null && commitCount > state.lastCommitCount) {
    return {
      state: "committed",
      write: true,
      mayCommit: false,
      patch: {
        lastCommitCount: commitCount,
        lastCommitAt:
          typeof server.last_commit_at === "string" && server.last_commit_at
            ? server.last_commit_at
            : null,
      },
    };
  }

  // 服务端收到的消息比本地记的还少：有消息没写进去，先补写。
  if (messageCount !== null && messageCount < state.lastMessageCount) {
    return { state: "missing", write: true, mayCommit: false, patch: null };
  }

  // 正常欠账：服务端未提交的消息在，提交次数与本地一致。
  if (
    pendingTokens !== null &&
    pendingTokens > 0 &&
    commitCount !== null &&
    commitCount === state.lastCommitCount
  ) {
    return { state: "pending", write: true, mayCommit: true, patch: null };
  }

  return {
    state: "steady",
    write: true,
    mayCommit: pendingTokens !== null && pendingTokens > 0,
    patch: null,
  };
}

/** 会话卡三行的数据。 */
export function captureCounts(cursor) {
  const state = normalizeCursor(cursor);
  return {
    written: state.lastMessageCount,
    pendingTurns: state.pendingTurns,
    lastCommitAt: state.lastCommitAt,
  };
}

/**
 * 写成功之后的游标。
 *
 * delta 是「上次写完之后新增的那一段」。没有旧欠账时，这一段就是
 * lastCommitMessageCount 之后的那段，直接重算；已有欠账时保留旧轮数再累加。
 * 跨边界的半轮（上一条 user 在上一段、assistant 在这一段）没有角色可查，
 * 会留到下一轮，不影响「攒够完整轮才提交」这条规矩。
 */
export function advanceCursor(cursor, { messages, lastEntryId } = {}) {
  const next = normalizeCursor(cursor);
  const list = Array.isArray(messages) ? messages : [];
  const oldMessageCount = next.lastMessageCount;
  const addedTurns = countTurns(list);
  next.lastEntryId = typeof lastEntryId === "string" ? lastEntryId : next.lastEntryId;
  next.lastMessageCount = oldMessageCount + list.length;
  next.pendingTurns =
    next.lastCommitMessageCount >= oldMessageCount
      ? addedTurns
      : next.pendingTurns + addedTurns;
  return next;
}

/** 提交成功之后的游标。 */
export function markCommitted(cursor, { at, commitCount } = {}) {
  const next = normalizeCursor(cursor);
  next.lastCommitCount = nonNegativeInt(commitCount);
  next.lastCommitAt = typeof at === "string" && at ? at : null;
  next.lastCommitMessageCount = next.lastMessageCount;
  next.pendingTurns = 0;
  return next;
}

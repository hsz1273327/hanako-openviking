// peer 目录路由：这个中枢里都有谁，以及谁不参与召回。
//
// GET 只读，不触发召回、不写回。错误与 /status 同一套约定：HTTP 200，
// 成功失败都放在 body 里，面板才能照常把其余部分画出来。
//
// POST 是唯一写入口：只改 excludedPeers 这一个配置项。写完不读中枢——
// 写成功了就是成功了，不能因为同一刻 listPeers 不可达而把界面回滚成"没改成"。
//
// 未启用 / 缺地址 / 缺 key 时一律不联网：返回空列表并说明原因，
// 不要拿一次必然失败的请求去换一个"读不到"。

import {
  DEFAULTS,
  EXCLUDED_PEERS_MAX,
  readConnection,
  readExcludedPeers,
  readSwitches,
} from "../src/ov/settings.js";
import { normalizePrefix } from "../src/ov/identity.js";
import { createClient } from "../src/ov/client.js";
import { transportFor } from "../src/ov/transport.js";

const PEER_NAME_MAX = 64;
// POST 收的是"新值"：大小写原样保留。中枢目录名大小写敏感，折成小写会让
// 大写 peer 永远匹配不上排除名单，等于它无法被排除。
const PEER_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * 本机 peer 的开头。前缀先按身份规则归一化——
 * 存量脏前缀（比如「主力机」）归一化后是空串，实际身份也没有前缀，
 * 这里若拿原始值去比，本机 peer 就永远认不出来。
 */
function selfPrefix(conn) {
  const prefix = normalizePrefix(conn.peerPrefix);
  return prefix ? `${prefix}-openhanako-` : "openhanako-";
}

/**
 * 数一个 peer 的记忆条数，失败 / 超时都给 { count: null, countCapped: false }。
 *
 * 和列表本身用同一个超时（conn.timeoutMs），所有 peer 一起跑，因此整体
 * 耗时也就一档超时。超时用计时器竞速而不是只靠 AbortSignal：runtime 出口
 * 的 promise 不一定理会 signal，没人接的话会一直挂着。
 *
 * 失败与“0 条”必须能分开：读不到时给 null，界面才敢显示「—」而不是骗人的 0。
 * 单个 peer 读不到不影响其它 peer，也不把整单 ok 拖成 false。
 */
function countWithTimeout(client, name, timeoutMs) {
  const failed = { count: null, countCapped: false };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(failed), timeoutMs);
    Promise.resolve()
      .then(() => client.listPeerMemories(name))
      .then(
        // listPeerMemories 回 { count, capped }：capped 表示数到了 node_limit。
        (out) => finish({ count: out?.count ?? null, countCapped: out?.capped === true }),
        () => finish(failed),
      );
  });
}

/**
 * 校验 POST 里的 excluded 数组。非法项整单拒绝，不静默丢弃：
 * 界面按"提交什么就存什么"回滚，悄悄少存一个会让两边长期对不上。
 */
function validateExcluded(value) {
  if (!Array.isArray(value)) {
    return { error: "excluded 必须是字符串数组" };
  }
  if (value.length > EXCLUDED_PEERS_MAX) {
    return { error: `最多排除 ${EXCLUDED_PEERS_MAX} 个 peer` };
  }

  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") {
      return { error: "excluded 必须是字符串数组" };
    }
    const name = item.trim();
    if (!name) {
      return { error: "peer 名不能为空" };
    }
    if (name.length > PEER_NAME_MAX || !PEER_NAME_RE.test(name)) {
      return { error: `peer 名不合法：${name}` };
    }
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return { list: out };
}

/** GET / POST 共用的投影：开关、网络、peer 名 + 排除标记。 */
async function peerPayload(ctx) {
  const sw = await readSwitches(ctx);
  const conn = await readConnection(ctx);
  const excluded = new Set(await readExcludedPeers(ctx));

  if (!sw.enabled || !conn.serverUrl || !conn.apiKey) {
    return { ok: true, peers: [], reason: "disabled" };
  }

  const transport = transportFor(ctx);
  if (transport.mode === "down") {
    return { ok: false, error: "没有可用的网络出口" };
  }

  const client = createClient({ ...conn, ...transport });
  try {
    const names = await client.listPeers();
    const prefix = selfPrefix(conn);
    // 并行读每个 peer 的记忆条数（串行会让整体耗时随 peer 数线性增长），所有 peer 共用一档超时。
    const timeoutMs = Math.max(1, Number(conn.timeoutMs) || DEFAULTS.requestTimeoutMs);
    const counts = await Promise.all(
      names.map((name) => countWithTimeout(client, name, timeoutMs)),
    );
    return {
      ok: true,
      peers: names.map((name, index) => ({
        name,
        self: name.startsWith(prefix),
        excluded: excluded.has(name),
        count: counts[index].count,
        countCapped: counts[index].countCapped,
      })),
    };
  } catch (error) {
    // 超时 / DNS / 非 2xx 都是这一条：不抛，原文交给界面。
    return { ok: false, error: String(error?.message || error) };
  }
}

export default function registerPeersRoutes(app, ctx) {
  app.get("/peers", async (c) => {
    return c.json(await peerPayload(ctx), 200);
  });

  app.post("/peers", async (c) => {
    let body = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "body 不是 JSON" }, 400);
    }

    // 先校验再落库：整单拒绝，绝不留下"只存进去一半"的名单。
    const checked = validateExcluded(body?.excluded);
    if (checked.error) {
      return c.json({ ok: false, error: checked.error }, 400);
    }

    try {
      await ctx.config.set("excludedPeers", checked.list.join(","));
    } catch (error) {
      return c.json({ ok: false, error: `保存排除名单失败：${String(error?.message || error)}` }, 500);
    }

    // 只回写进去的那份名单，不回读中枢：读一次多一个失败点，
    // 而写已经落库了。前端按这份数组重算本地标记，下次 refresh 再读列表。
    return c.json({ ok: true, excluded: checked.list }, 200);
  });
}

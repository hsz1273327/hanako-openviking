// 宿主 SDK 的唯一入口：面板里所有网络与会话读取都从这里走。
//
// 为什么集中在一处：`./sdk.js` 是**外链**（vite.config.mjs 的 external），
// 构建产物里保留 `import "./sdk.js"`，由宿主随面板下发到 ui/assets/sdk.js。
// 这个路径在源码树里不存在，所以只有这个文件可以写它；组件与 composable
// 一律 import 这里的函数，别自己去猜相对路径。
//
// 请求语义与已删除的手写面板一致：不判 HTTP 状态，直接 json()。
// 业务失败由服务端放在 body 的 ok:false / error 里，调用方各自判断；
// 网络错自己抛。别在这里统一抛 HTTP 错：/status 一类的只读端点会用 200
// 携带失败原因，多一层判断反而会把两种失败混成一种。

import { hana } from "./sdk.js";
import { sessionKeyOf } from "./lib/session-key.js";

export async function jsonGet(path) {
  const res = await hana.api.fetch(path);
  return res.json();
}

export async function jsonPost(path, body) {
  const res = await hana.api.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** 告诉宿主：这一页已经挂好，可以开始渲染。每个页面入口调一次。 */
export function appReady() {
  hana.ready();
}

/**
 * 宿主的当前会话对象（title / agentId / sessionPath 都在里面）。
 * 未授权、或不在主聊天窗口时返回 null；调用方按「没有活动会话」处理。
 */
export async function currentSession() {
  try {
    return await hana.sessions.getActive();
  } catch {
    return null;
  }
}

/**
 * 当前会话的状态文件 key。
 *
 * 只吃 `sessionPath`：`sessionId` 是宿主的稳定 id，指不到任何文件
 * （规则与卡片、后端 src/state/session.js 同一条，见 lib/session-key.js）。
 * 拿不到会话（还没打开对话 / 宿主读失败）就给 null，调用方按“没带会话”处理，
 * 不编一个 key 出来。
 */
export async function currentSessionKey() {
  return sessionKeyOf(await currentSession()) || null;
}

/**
 * 订阅「活动会话变了」。老宿主没有这个能力时返回 null，调用方靠轮询兜底。
 */
export function onActiveSessionChanged(handler) {
  try {
    const off = hana.sessions.onActiveChanged(handler);
    return typeof off === "function" ? off : null;
  } catch {
    return null;
  }
}

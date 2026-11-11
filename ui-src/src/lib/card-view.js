// 边栏会话卡的数据投影。这里只放纯函数：输入是 /status 与 /session/:sid 的响应，
// 输出是卡片要显示的文字 / 类名，以及「改一项」「交回全局」要提交的 overrides。
//
// 为什么单独一层：卡片很小，但语义不轻——
//   * 两个开关与召回范围改的是本会话覆盖值；
//   * 「跟随全局」不是把值写成 false，而是提交 null 让后端 delete；
//   * 无活动会话时整块控件不可操作。
// 这些规则不依赖 Vue / DOM，dev/smoke.mjs 可以直接验，不用去 .vue 里正则捞字符串。

import { sessionKeyOf } from "./session-key.js";

export const BOOL_KEYS = Object.freeze(["autoRecall", "readOnly"]);
export const SCOPE_KEY = "recallPeerScope";
export const OVERRIDE_KEYS = Object.freeze([...BOOL_KEYS, SCOPE_KEY]);
export const SCOPE_VALUES = Object.freeze(["all", "self"]);

/** 这个键在本会话有没有覆盖值。null 视为「没有」——后端补丁会用 null 删键。 */
export function hasOverride(overrides, key) {
  return (
    Boolean(overrides) &&
    Object.prototype.hasOwnProperty.call(overrides, key) &&
    overrides[key] !== null
  );
}

/** 只要有一条覆盖，「这一页有本会话设置」就成立。 */
export function anyOverride(overrides) {
  return Object.keys(overrides || {}).some((key) => overrides[key] !== null);
}

/** 小字按钮的两态。已覆盖显示「本会话」，否则显示「跟随全局」。 */
export function noteView(overridden) {
  return overridden
    ? { text: "本会话", title: "点击交回全局" }
    : { text: "跟随全局", title: "当前跟随全局" };
}

/** 写一个覆盖值：只合并这一项，别把整份服务端状态抄回来。 */
export function withOverride(overrides, key, value) {
  return { ...(overrides || {}), [key]: value };
}

/**
 * 交回全局：值必须是 null。
 * 写成 false 是另一件事——那会把这一项覆盖成 false，而不是撤销覆盖。
 */
export function resetOverride(overrides, key) {
  return { ...(overrides || {}), [key]: null };
}

/** 顶部药丸：总闸的开 / 关。没读到全局状态时沿用旧卡的默认值「全局开」。 */
export function pillView(status) {
  const enabled = status ? Boolean(status.enabled) : true;
  return enabled
    ? { text: "全局开", tone: "on" }
    : { text: "全局关", tone: "off" };
}

/**
 * 状态点：总闸开着且至少一个自动开关生效时是 ok，否则 idle。
 *
 * autoCapture 是全局值（写回在面板「记忆共享」页里改，不能按会话覆盖），
 * 但 effective.autoCapture 仍参与状态点：它开着时这段对话仍会自动写回。
 */
export function dotTone(data, enabled) {
  const effective = data?.effective || {};
  return enabled && (effective.autoRecall || effective.autoCapture) ? "ok" : "idle";
}

/** 统计行：召回 / 写回轮数，有钩子时补钩子次数，有探针时间时补时间。 */
export function statsText(data) {
  const recall = data?.state?.recall || {};
  const capture = data?.state?.capture || {};
  const events = data?.probe?.events || {};
  const hooks = (events["provider/before-request"] || 0) + (events["agent/before-start"] || 0);

  const bits = [`召回 ${recall.turns || 0}`, `写回 ${capture.turns || 0}`];
  if (hooks) bits.push(`钩子 ${hooks}`);
  if (data?.probe?.lastAt) bits.push(new Date(data.probe.lastAt).toLocaleTimeString());
  return bits.join(" · ");
}

/**
 * peer 行：会话归属优先用 getActive() 给的 agentId（宿主断言的身份），
 * 拿不到才回退到后端按状态文件解析出的 peer。
 */
export function peerView(data, sessionOwner) {
  const owner = sessionOwner || data?.peer || "";
  if (!owner) {
    return {
      text: "未绑定助手",
      title:
        data?.peerSource === "merged"
          ? "合并记忆已开启，但这一段没拿到会话身份。"
          : "拿不到会话路径，无法确定这一段属于哪个助手。",
    };
  }
  if (sessionOwner) {
    return {
      text: sessionOwner,
      title: data?.peer
        ? `会话归属 ${sessionOwner}；对外门牌 ${data.peer}`
        : `会话归属 ${sessionOwner}`,
    };
  }
  return {
    text: owner,
    title:
      data?.peerSource === "merged"
        ? data?.peerAgentDir
          ? `${owner}（合并记忆已开启；本会话助手：${data.peerAgentDir}）`
          : `${owner}（合并记忆已开启，本机所有助手共用一个身份）`
        : owner,
  };
}

/** 提示行：总闸关 / 有本会话设置 / 无提示三档，文案与手写卡逐字一致。 */
export function hintView({ overrides, enabled, status } = {}) {
  const overridden = anyOverride(overrides);
  if (!enabled) {
    return { text: "全局总闸关着，这里的开关不会生效。", warn: true };
  }
  if (status && !status.probe) {
    return { text: overridden ? "有本会话设置；点小字交回全局。" : "", warn: false };
  }
  return { text: overridden ? "实心小字是本会话设置，点它交回全局。" : "", warn: false };
}

/**
 * getActive() → 标题 / 会话 key / 归属。
 * 没有会话路径就是「无活动会话」，不拿 sessionId 编一个查不到也写不进的 key。
 */
export function activeSessionView(active) {
  const sessionKey = sessionKeyOf(active) || null;
  const sessionOwner =
    typeof active?.agentId === "string" ? active.agentId.trim() : "";
  const title = active?.title || "";
  return {
    sessionKey,
    sessionOwner,
    title: title || (sessionKey ? sessionKey.slice(-8) : "无活动会话"),
    titleTitle: title || sessionKey || "",
  };
}

/** 会话覆盖清空后，控件应该立刻显示全局值（状态里有就用状态，没有就等刷新）。 */
export function optimisticResetEffective(effective, key, status) {
  const next = { ...(effective || {}) };
  if (key === SCOPE_KEY) {
    next[SCOPE_KEY] = status?.recallScope || "all";
  } else if (status && typeof status[key] === "boolean") {
    next[key] = status[key];
  } else {
    delete next[key];
  }
  return next;
}

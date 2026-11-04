// 面板状态的唯一实例：reactive + 状态机，不引 pinia（一个页面不需要 store 库）。
//
// 状态机在 ../lib/panel-store.js（不 import vue，冒烟能用假 fetch 直接验回滚）。
// 这里只做三件事：接上真实的网络 / 会话读取、套一层 reactive、把动作透出去。
// 其它 composable（useStatus / usePeers / useModels / useLogs）都从这里取同一个实例，
// 组件永远只看一份状态，不各自读一份再对齐。

import { computed, reactive } from "vue";
import { createPanelStore } from "../lib/panel-store.js";

let store = null;

/**
 * 建（或重建）状态机。只在入口/冒烟里调用；组件一律用 useConfig()。
 *
 * 网络 / 会话读取必须由调用方注入（入口接 ../api.js，冒烟接假 fetch）：
 * 这个文件刻意不 import ../api.js —— 那里静态 import 了外链的 ./sdk.js，
 * Node 里解析不到，冒烟就没法验回滚。
 */
export function createConfig(deps = {}) {
  if (typeof deps.get !== "function" || typeof deps.post !== "function") {
    throw new Error("createConfig: 需要注入 get / post（见 entries/panel.js）");
  }
  const panel = createPanelStore({
    get: deps.get,
    post: deps.post,
    sessionKey: deps.sessionKey || (async () => null),
    ...(deps.schedule ? { schedule: deps.schedule } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  // 状态机闭包里改的是它自己的 state 变量；把那个变量换成 reactive 代理，
  // 之后的每一次写入才会被 Vue 看见（直接改原始对象是静默的，不会重渲染）。
  panel.replaceState(reactive(panel.state));
  store = panel;
  return store;
}

export function useConfig() {
  if (!store) {
    throw new Error("useConfig: 面板状态还没接线（入口应先调 createConfig）");
  }
  const state = store.state;

  return {
    state,
    store,
    // 总闸：三页的能力块共用这一个判据（关着就一起变淡）。
    enabled: computed(() => store.enabled()),
    note: computed(() => state.note),
    controls: computed(() => state.controls),
    conn: computed(() => state.conn),
    layers: computed(() => state.layers),
    form: computed(() => state.form),
    prompts: computed(() => state.prompts),
    draft: computed(() => state.draft),
    serviceResults: computed(() => state.serviceResults),
    channels: computed(() => state.channels),
    channelTest: computed(() => state.channelTest),
    // 动作一律透传，不在组件里各写一遍乐观 / 回滚。
    refresh: (...args) => store.refresh(...args),
    flip: (...args) => store.flip(...args),
    setForm: (...args) => store.setForm(...args),
    setDecisionThreshold: (...args) => store.setDecisionThreshold(...args),
    setGateContextTurns: (...args) => store.setGateContextTurns(...args),
    setControlsNumber: (...args) => store.setControlsNumber(...args),
    saveConnection: (...args) => store.saveConnection(...args),
    saveLayers: (...args) => store.saveLayers(...args),
    setServiceField: (...args) => store.setServiceField(...args),
    setServiceKey: (...args) => store.setServiceKey(...args),
    testService: (...args) => store.testService(...args),
    testChannels: (...args) => store.testChannels(...args),
    addChannel: (...args) => store.addChannel(...args),
    updateChannel: (...args) => store.updateChannel(...args),
    removeChannel: (...args) => store.removeChannel(...args),
    setChannelWeight: (...args) => store.setChannelWeight(...args),
    setChannelTimeout: (...args) => store.setChannelTimeout(...args),
    channelView: (...args) => store.channelView(...args),
    channelTypeChoices: (...args) => store.channelTypeChoices(...args),
    setFocus: (...args) => store.setFocus(...args),
    setPrompt: (...args) => store.setPrompt(...args),
    touchPrompt: (...args) => store.touchPrompt(...args),
    resetPrompt: (...args) => store.resetPrompt(...args),
    gatePromptStatus: () => store.gatePromptStatusOf(),
    decisionPromptStatus: () => store.decisionPromptStatusOf(),
    contextPromptStatus: () => store.contextPromptStatusOf(),
    rerankPromptStatus: () => store.rerankPromptStatusOf(),
    applyControls: (...args) => store.applyControls(...args),
  };
}

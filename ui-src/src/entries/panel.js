// 面板入口：只做接线与挂载，不写业务逻辑。
//
// 构建时变成 ui/assets/panel.js。整页是一个 Vue 应用（App.vue）；
// 历史手写实现已删除，现在只有 ui-src/src。
//
// 顺序有意义：
//   1. createConfig 把「真实网络 + 会话读取」注入状态机（组件里的 useConfig()
//      拿到的是同一份；注入点只在这里，冒烟换成假 fetch 就能验回滚）；
//   2. 挂载；
//   3. App.vue 的 onMounted 里 hana.ready() + 首次 refresh()。
//
// ./sdk.js 是 vite 的 external（宿主随面板下发），产物里保留相对引用，
// 所以这行 import 的路径是按产物目录（ui/assets/）解析的，不要去改它。

import { createApp } from "vue";
import App from "../App.vue";
import { currentSessionKey, jsonGet, jsonPost } from "../api.js";
import { createConfig } from "../composables/useConfig.js";

createConfig({
  get: jsonGet,
  post: jsonPost,
  sessionKey: currentSessionKey,
});

createApp(App).mount("#panel-app");

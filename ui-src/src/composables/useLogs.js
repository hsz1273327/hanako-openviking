// 日志尾部：GET /probe（探针只记事实，见 src/probe.js）。
//
// 端点叫 /probe 而不是 /logs：后端就这一个名字，本轮约定不改后端。
// 行数上限在服务端（/probe 只回最后 60 条），面板不二次截断——
// 漏掉哪一条都不该由前端悄悄决定。
//
// 计数条与正文都是纯函数（lib/panel-view.js 的 logChips / logBodyText），
// 折叠状态放在 store 里，切页不丢。

import { computed } from "vue";
import { useConfig } from "./useConfig.js";

export function useLogs() {
  const { state, store } = useConfig();

  return {
    lines: computed(() => state.logs.lines),
    open: computed(() => state.logs.open),
    chips: computed(() => store.logChips()),
    body: computed(() => store.logBody()),
    toggle: () => store.toggleLogs(),
  };
}

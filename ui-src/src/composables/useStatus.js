// 状态投影：GET /status（带当前会话 key）+ 往返计时。
//
// 只读。打开面板这件事本身必须零副作用（/status 不触发召回、不写回），
// 所以这里除了 refresh 之外没有任何写入路径。
//
// 展示用的文案 / 圆点 / 药丸 / 副标题都由 lib/panel-view.js 的 statusView 决定，
// 组件不自己拼字符串。读取失败时不保留上一次的「已连接」：宁可说「读取失败」。

import { computed } from "vue";
import { useConfig } from "./useConfig.js";

export function useStatus() {
  const { state, refresh } = useConfig();

  return {
    status: computed(() => state.status),
    view: computed(() => state.status.view),
    checks: computed(() => state.status.view.checks),
    // 检查项摘要：一行文字 + 问题项（纯函数 summarizeChecks 的结果，已在 store 里算好）。
    checksSummary: computed(() => state.status.checksSummary),
    foot: computed(() => state.foot),
    readError: computed(() => state.status.readError),
    refresh,
    /** 「测试连接」：重读一次，成功后给一句提示（与手写面板同文案）。 */
    async testConnection() {
      await refresh({ note: "已重新探测" });
    },
  };
}

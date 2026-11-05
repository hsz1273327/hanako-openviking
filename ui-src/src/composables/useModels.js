// 宿主模型目录：GET /models。
//
// 它读不到只影响「判断模型」那个下拉的候选（精排的模型标识已并进 model 通道，不再有下拉）：
// 首项「默认（宿主辅助模型）」永远在，旁边留一行原因，不禁用整个区块。
// 目录读不到时把当前存量值补成一项，别让下拉变空（手写面板的 setOptions 行为）。
//
// 选项纯函数在 lib/recall-layers.js（modelOptions / DEFAULT_MODEL_OPTION），
// 补存量值在 lib/panel-view.js（withStoredOption）。

import { computed } from "vue";
import { useConfig } from "./useConfig.js";

export function useModels() {
  const { state, store } = useConfig();

  return {
    catalog: computed(() => state.models),
    /** 某个模型下拉的选项：默认项 + 目录 + （必要时）存量值。 */
    options: (current) => store.modelChoices(current),
    /** 目录不可用时那一行小字；正常时是空串（不占位）。 */
    hint: computed(() => store.modelHint()),
  };
}

<script setup>
// 组装卡：精排之后、把候选拼成一段上下文之前的那一步。
//
// 三张卡各管一段链路，语汇不混：
//   召回（RecallCard）—— 查不查、拿什么查
//   精排（RerankCard）—— 查回来之后怎么精排
//   组装（这一张）  —— 拼成哪一段、留多少
// 规则档做三件事：按来源去重、按分数精排、按预算裁剪。只有两档（开 / 关），
// 所以用 NSwitch 不用下拉：这里问的是「开不开」，不是「从几种做法里选一种」。
// 模型档（让模型合并重写这一段）还没做，界面上也不留一个选了不生效的档位。
//
// 注入预算（injectBudgetTokens）本来就是这一步的事：它决定拼好的那一段留多少。
// 早先挂在全局页的身份卡里（身份 = 门牌前缀 / 超时 / 预算），现在搬到这一页，
// 控件与文案照搬（NFormItem label="注入预算（token）"，id 仍是 budgetTokens），
// 提交口也没变：仍走 /controls 的 patchControls，与召回策略那一单互不相干。
//
// 两种提交口并存是有意的：
//   - 组装开关是召回策略的一部分（与精排同一单、同一套失败回滚），走 setForm；
//   - 预算属于宿主控制台那组数值调参，走 setControlsNumber。
// 组件里不出现任何 post / fetch。
//
// 标签分两种写法，按控件内部有没有真 <input> 决定（与 RecallCard 同一取舍）：
//   - NInputNumber 里有真 <input>，<label for=id> 有效，用 NFormItem 自带标签；
//   - NSwitch 渲染的是 button，label for 指不过去，用纯文本标签 + aria-label。
import { computed } from "vue";
import { NCard, NForm, NFormItem, NGrid, NGridItem, NInputNumber, NSwitch } from "naive-ui";
import { useConfig } from "../composables/useConfig.js";

const { state, enabled, setForm, setControlsNumber } = useConfig();

// 只有 rules 算「开」。
const assembleOn = computed(() => state.form.assembleMode === "rules");

/** 开关改了就整单提交（setForm → saveLayers，与精排那张卡同一套回滚）。 */
function onSwitch(value) {
  return setForm("assembleMode", value ? "rules" : "off");
}

/** 数字格：n-input-number 清空给 null，收成空串走 store 的「不提交」分支。 */
function onNumberChange(key, value) {
  setControlsNumber(key, value === null || value === undefined ? "" : value);
}
</script>

<template>
  <NCard
    class="assemble-card"
    size="small"
    title="组装"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <NGrid cols="1 700:2" responsive="screen" :x-gap="10" :y-gap="8" :class="{ dim: !enabled }">
      <NGridItem>
        <div class="field">
          <span class="field-label">规则档</span>
          <NSwitch
            size="small"
            aria-label="规则档"
            :input-props="{ id: 'assembleMode' }"
            :value="assembleOn"
            @update:value="onSwitch"
          />
          <span class="field-hint">
            规则档按来源去重、按分数精排、再按预算裁剪；模型档（合并重写）还没做。
          </span>
        </div>
      </NGridItem>

      <NGridItem>
        <NForm class="fields" label-placement="top" size="small" :show-feedback="false">
          <NFormItem label="注入预算（token）" :label-props="{ for: 'budgetTokens' }">
            <NInputNumber
              size="small"
              :show-button="false"
              :update-value-on-input="false"
              :min="200"
              :max="32000"
              :step="100"
              placeholder="默认 2500"
              :input-props="{ id: 'budgetTokens' }"
              :value="state.controls.injectBudgetTokens ?? null"
              @update:value="onNumberChange('injectBudgetTokens', $event)"
            />
          </NFormItem>
        </NForm>
      </NGridItem>
    </NGrid>
  </NCard>
</template>

<script setup>
// 中枢 + 身份两栏（NGrid 两列 > 两张 NCard）。
//
// 中枢：地址 / API Key / 往返·版本·出口 / 服务端检查项 / 错误行 / 提示位。
// 身份：门牌前缀 / 超时 / 注入预算。
//
// 行为约定：
//   - 三个连接字段改完就提交（change 或回车），没有保存按钮；
//   - key 永不回显，占位随 apiKeySet 变（已填写（留空表示不改）/ 未填写）；
//   - 检查项全绿时只有一行静态文字，有问题才平铺问题项（详见 lib/check-summary.js）；
//   - 输入到一半时刷新不回写该格（store 的 focus 判断）。
//
// 形态：没有一处是手写的结构。
//   - 字段 = NForm + NFormItem（label-placement="top"、size="small"、无反馈行）；
//     label for= 的关联用 NFormItem 的 label-props 交给它自己的 <label>；
//   - 事实行 = NDescriptions + NDescriptionsItem（值节点保留原来的 b#id）；
//   - 检查项 = NText（摘要一行）+ NList / NListItem（只有问题项）；
//   - 分隔线 = NDivider，说明小字 = NText。
// 栅格仍交给 n-grid：两栏 cols="1 700:2"，超时 / 预算两格 :cols="2"。
import { computed } from "vue";
import {
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NText,
} from "naive-ui";import { TONE_BAD, TONE_MUTED, TONE_OK, statusTone } from "../lib/check-tone.js";
import { useConfig } from "../composables/useConfig.js";
import { useStatus } from "../composables/useStatus.js";

const {
  state,
  saveConnection,
  setControlsNumber,
  setFocus,
} = useConfig();
const { view, checksSummary, checks } = useStatus();

// 档位 → naive-ui 的 NText 取值。档位只有三档（见 lib/check-tone.js），所以是一张
// 常量表，不在模板里写 ? :。
const TONE_TYPE = Object.freeze({ [TONE_OK]: "success", [TONE_BAD]: "error", [TONE_MUTED]: undefined });
const TONE_DEPTH = Object.freeze({ [TONE_OK]: undefined, [TONE_BAD]: undefined, [TONE_MUTED]: 3 });

// 事实行的标签沿用 10.5px（Descriptions 自带是 14px，放大等于破版）。
const FACT_LABEL_STYLE = Object.freeze({ fontSize: "10.5px", lineHeight: "1.3" });
// 值也不能跟着 dsscriptions 的 14px 走：旧版是 12.5px / 字重 560，
// 而且要用等宽数字 —— 往返毫秒数刷新时不会左右抖。
const FACT_VALUE_STYLE = Object.freeze({
  fontSize: "12.5px",
  fontWeight: "560",
  lineHeight: "1.3",
  fontVariantNumeric: "tabular-nums",
});

/** 连接三字段：每敲一个字写进 store；失焦 / 回车时提交（与手写面板一致，不是每个按键都发）。 */
function onConnInput(field, value) {
  state.conn[field] = value;
}

/** 失焦与回车都提交：值已经由 update:value 写进 store，这里只走保存流程。 */
function onConnChange() {
  saveConnection();
}

function onConnEnter() {
  saveConnection();
}

/** 数字两格：n-input-number 清空给 null，收成空串走 store 的「不提交」分支。 */
function onNumberChange(key, value) {
  setControlsNumber(key, value === null || value === undefined ? "" : value);
}

/**
 * 问题项的悬停说明：状态词 + 父项 details 里的每个子项。
 * agfs 这类父项带的子项只塞 title，不撑开一行。
 */
function detailTitle(problem) {
  const source = checks.value.find(
    (check) => String(check?.name ?? "").trim() === problem.name,
  );
  const details = Array.isArray(source?.details) ? source.details : [];
  return [problem.status, ...details.map((sub) => `${sub?.name || "?"}: ${sub?.status || "?"}`)]
    .filter(Boolean)
    .join(" · ");
}

const summaryType = computed(() => TONE_TYPE[checksSummary.value.tone]);
const summaryDepth = computed(() => TONE_DEPTH[checksSummary.value.tone]);
const noteType = computed(() => (state.note.bad ? "error" : "success"));
const noteDepth = computed(() => (state.note.bad ? undefined : 3));
</script>

<template>
  <NGrid class="cols" cols="1 700:2" responsive="screen" :x-gap="12" :y-gap="12">
    <NGridItem>
      <NCard size="small" title="中枢" :bordered="false" header-style="padding: 4px 16px" content-style="padding: 16px">
        <NForm class="fields" label-placement="top" size="small" :show-feedback="false">
          <NFormItem label="地址" :label-props="{ for: 'serverUrl' }">
            <NInput
              size="small"
              type="url"
              placeholder="http://127.0.0.1:8000"
              :input-props="{ id: 'serverUrl', spellcheck: 'false' }"
              :value="state.conn.serverUrl"
              @focus="setFocus('serverUrl')"
              @blur="setFocus('')"
              @update:value="onConnInput('serverUrl', $event)"
              @change="onConnChange"
              @keydown.enter.prevent="onConnEnter"
            />
          </NFormItem>
          <NFormItem label="API Key" :label-props="{ for: 'apiKey' }">
            <NInput
              size="small"
              type="text"
              :placeholder="view.apiKeyPlaceholder"
              :input-props="{ id: 'apiKey', autocomplete: 'off', spellcheck: 'false' }"
              :value="state.conn.apiKey"
              @update:value="onConnInput('apiKey', $event)"
              @change="onConnChange"
              @keydown.enter.prevent="onConnEnter"
            />
          </NFormItem>
        </NForm>

        <NDivider class="sep" />

        <!-- 事实行：三个短值，窄屏也放得下三列。
             label-placement="top" 是显式写的：naive 的默认值目前恰好也是 top，
             但“标签在上、值在下”是这块的排版契约，不能赌默认值不变。 -->
        <NDescriptions
          class="facts"
          size="small"
          :column="3"
          label-placement="top"
          :bordered="false"
          :label-style="FACT_LABEL_STYLE"
          :content-style="FACT_VALUE_STYLE"
        >
          <NDescriptionsItem label="往返"><b id="latency">{{ view.latency }}</b></NDescriptionsItem>
          <NDescriptionsItem label="版本"><b id="version">{{ view.version }}</b></NDescriptionsItem>
          <NDescriptionsItem label="出口"><b id="transport">{{ view.transport }}</b></NDescriptionsItem>
        </NDescriptions>

        <!-- 五个检查项平时不占地方：全绿时只有一行静态文字「服务端就绪 5/5」，
             有问题才在下面平铺列出不对的那几项。不可点、不折叠。 -->
        <div id="checksBlock" class="checks-block" :hidden="checksSummary.total === 0">
          <NText
            id="checksSummary"
            class="hint-line"
            :type="summaryType"
            :depth="summaryDepth"
          >{{ checksSummary.text }}</NText>
          <NList
            id="checks"
            class="checks"
            size="small"
            :show-divider="false"
            :hidden="checksSummary.problems.length === 0"
          >
            <NListItem
              v-for="problem in checksSummary.problems"
              :key="problem.name"
              :title="detailTitle(problem)"
            >
              <span class="check-name">{{ problem.name }}</span>
              <NText
                class="check-status"
                :type="TONE_TYPE[statusTone(problem.status)]"
                :depth="TONE_DEPTH[statusTone(problem.status)]"
              >· {{ problem.label }}</NText>
            </NListItem>
          </NList>
        </div>

        <NText id="reachError" class="hint-line err" type="error" :hidden="!view.error">{{ view.error }}</NText>
        <NText id="saveHint" class="hint-line save-hint" :type="noteType" :depth="noteDepth">{{ state.note.text }}</NText>
      </NCard>
    </NGridItem>

    <NGridItem>
      <NCard size="small" title="身份" :bordered="false" header-style="padding: 4px 16px" content-style="padding: 16px">
        <NForm class="fields" label-placement="top" size="small" :show-feedback="false">
          <NFormItem label="门牌前缀" :label-props="{ for: 'peerPrefix' }">
            <NInput
              size="small"
              type="text"
              placeholder="可留空"
              :title="state.conn.peerPrefixTitle"
              :input-props="{ id: 'peerPrefix', spellcheck: 'false' }"
              :value="state.conn.peerPrefix"
              @focus="setFocus('peerPrefix')"
              @blur="setFocus('')"
              @update:value="onConnInput('peerPrefix', $event)"
              @change="onConnChange"
              @keydown.enter.prevent="onConnEnter"
            />
          </NFormItem>
          <!-- 说明行用 NFormItem 的反馈位（show-feedback 关着，就自己写成一行），
               拖出 NForm 会把 8px 的字段节奏切断，拖进去就当一块说明用。 -->
          <NText class="hint-line" depth="3">这一段对话算谁的，看右侧卡里的 peer。</NText>

          <NGrid :cols="2" :x-gap="10" :y-gap="8">
            <NGridItem>
              <NFormItem label="超时（ms）" :label-props="{ for: 'timeoutMs' }">
                <NInputNumber
                  size="small"
                  :show-button="false"
                  :update-value-on-input="false"
                  :min="200"
                  :max="30000"
                  :step="100"
                  placeholder="默认 1500"
                  :input-props="{ id: 'timeoutMs' }"
                  :value="state.controls.requestTimeoutMs ?? null"
                  @update:value="onNumberChange('requestTimeoutMs', $event)"
                />
              </NFormItem>
            </NGridItem>
            <NGridItem>
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
            </NGridItem>
          </NGrid>
        </NForm>
      </NCard>
    </NGridItem>
  </NGrid>
</template>

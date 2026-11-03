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
// 栅格交给 n-grid：两栏用 cols="1 700:2"（700px 以下自动收成一列，跟旧 CSS 的
// 760px 断点对齐），超时 / 预算两格用 NGrid :cols="2" 承载 —— 所以 .field.pair
// 这条手写栅格规则可以彻底删掉。
import { computed } from "vue";
import { NCard, NGrid, NGridItem, NInput, NInputNumber } from "naive-ui";
import { statusTone } from "../lib/check-tone.js";
import { useConfig } from "../composables/useConfig.js";
import { useStatus } from "../composables/useStatus.js";

const {
  state,
  saveConnection,
  setControlsNumber,
  setFocus,
} = useConfig();
const { view, checksSummary, checks } = useStatus();

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

const noteClass = computed(() => ({ ok: !state.note.bad, bad: state.note.bad }));
</script>

<template>
  <NGrid class="cols" cols="1 700:2" responsive="screen" :x-gap="12" :y-gap="8">
    <NGridItem>
      <NCard size="small" title="中枢" content-style="padding: 8px 12px">
        <div class="field">
          <label for="serverUrl">地址</label>
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
        </div>
        <div class="field">
          <label for="apiKey">API Key</label>
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
        </div>
        <NGrid class="facts" cols="1 520:3" responsive="screen" :x-gap="8" :y-gap="8">
          <NGridItem>
            <div class="fact"><span>往返</span><b id="latency">{{ view.latency }}</b></div>
          </NGridItem>
          <NGridItem>
            <div class="fact"><span>版本</span><b id="version">{{ view.version }}</b></div>
          </NGridItem>
          <NGridItem>
            <div class="fact"><span>出口</span><b id="transport">{{ view.transport }}</b></div>
          </NGridItem>
        </NGrid>
        <!-- 五个检查项平时不占地方：全绿时只有一行静态文字「服务端就绪 5/5」，
             有问题才在下面平铺列出不对的那几项。不可点、不折叠。 -->
        <div id="checksBlock" class="checks-block" :hidden="checksSummary.total === 0">
          <div
            id="checksSummary"
            class="checks-summary"
            :class="checksSummary.tone"
          >{{ checksSummary.text }}</div>
          <ul id="checks" class="checks" :hidden="checksSummary.problems.length === 0">
            <li
              v-for="problem in checksSummary.problems"
              :key="problem.name"
              :class="statusTone(problem.status)"
              :title="detailTitle(problem)"
            >
              <span class="check-name">{{ problem.name }}</span>
              <span class="check-status">{{ problem.label }}</span>
            </li>
          </ul>
        </div>
        <p id="reachError" class="err" :hidden="!view.error">{{ view.error }}</p>
        <p id="saveHint" class="save-hint" :class="noteClass">{{ state.note.text }}</p>
      </NCard>
    </NGridItem>

    <NGridItem>
      <NCard size="small" title="身份" content-style="padding: 8px 12px">
        <div class="field">
          <label for="peerPrefix">门牌前缀</label>
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
          <span class="field-hint">这一段对话算谁的，看右侧卡里的 peer。</span>
        </div>
        <NGrid :cols="2" :x-gap="10" :y-gap="8">
          <NGridItem>
            <div class="field">
              <label for="timeoutMs">超时（ms）</label>
              <NInputNumber
                size="small"
                :show-button="false"
                :update-value-on-input="false"
                :min="200"
                :max="30000"
                :step="100"
                :input-props="{ id: 'timeoutMs' }"
                :value="state.controls.requestTimeoutMs ?? null"
                @update:value="onNumberChange('requestTimeoutMs', $event)"
              />
            </div>
          </NGridItem>
          <NGridItem>
            <div class="field">
              <label for="budgetTokens">注入预算（token）</label>
              <NInputNumber
                size="small"
                :show-button="false"
                :update-value-on-input="false"
                :min="200"
                :max="32000"
                :step="100"
                :input-props="{ id: 'budgetTokens' }"
                :value="state.controls.injectBudgetTokens ?? null"
                @update:value="onNumberChange('injectBudgetTokens', $event)"
              />
            </div>
          </NGridItem>
        </NGrid>
      </NCard>
    </NGridItem>
  </NGrid>
</template>

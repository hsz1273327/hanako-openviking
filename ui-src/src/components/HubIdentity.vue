<script setup>
// 中枢 + 身份两栏（.cols > 两张 .card）。
//
// 中枢：地址 / API Key / 往返·版本·出口 / 服务端检查项 / 错误行 / 提示位。
// 身份：门牌前缀 / 超时 / 注入预算。
//
// 行为约定：
//   - 三个连接字段改完就提交（change 或回车），没有保存按钮；
//   - key 永不回显，占位随 apiKeySet 变（已填写（留空表示不改）/ 未填写）；
//   - 检查项全绿时只有一行静态文字，有问题才平铺问题项（详见 lib/check-summary.js）；
//   - 输入到一半时刷新不回写该格（store 的 focus 判断）。
import { computed } from "vue";
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

/** 连接三字段：change / 回车时提交（与手写面板一致，不是每个按键都发）。 */
function onConnChange(field, event) {
  state.conn[field] = event.target.value;
  saveConnection();
}

/**
 * 回车比 change 先到：先把这一格的值写进状态，再提交。
 * 少了这一步，填完 key 直接回车会提交上一次的（空）值——手写版是当场读 DOM，不会踩到。
 */
function onConnEnter(field, event) {
  state.conn[field] = event.target.value;
  saveConnection();
}

/** 数字两格：非数字（清空过）不提交，保留服务端上次确认的值。 */
function onNumberChange(key, event) {
  setControlsNumber(key, event.target.value);
}

function onNumberEnter(event) {
  event.preventDefault();
  event.target.blur();
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
  <section class="cols">
    <article class="card">
      <h2 class="card-title">中枢</h2>
      <div class="field">
        <label for="serverUrl">地址</label>
        <input
          id="serverUrl"
          type="url"
          spellcheck="false"
          placeholder="http://127.0.0.1:8000"
          :value="state.conn.serverUrl"
          @focus="setFocus('serverUrl')"
          @blur="setFocus('')"
          @change="onConnChange('serverUrl', $event)"
          @keydown.enter.prevent="onConnEnter('serverUrl', $event)"
        />
      </div>
      <div class="field">
        <label for="apiKey">API Key</label>
        <input
          id="apiKey"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="view.apiKeyPlaceholder"
          :value="state.conn.apiKey"
          @change="onConnChange('apiKey', $event)"
          @keydown.enter.prevent="onConnEnter('apiKey', $event)"
        />
      </div>
      <div class="facts">
        <div class="fact"><span>往返</span><b id="latency">{{ view.latency }}</b></div>
        <div class="fact"><span>版本</span><b id="version">{{ view.version }}</b></div>
        <div class="fact"><span>出口</span><b id="transport">{{ view.transport }}</b></div>
      </div>
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
    </article>

    <article class="card">
      <h2 class="card-title">身份</h2>
      <div class="field">
        <label for="peerPrefix">门牌前缀</label>
        <input
          id="peerPrefix"
          type="text"
          spellcheck="false"
          placeholder="可留空"
          :title="state.conn.peerPrefixTitle"
          :value="state.conn.peerPrefix"
          @focus="setFocus('peerPrefix')"
          @blur="setFocus('')"
          @change="onConnChange('peerPrefix', $event)"
          @keydown.enter.prevent="onConnEnter('peerPrefix', $event)"
        />
        <span class="field-hint">这一段对话算谁的，看右侧卡里的 peer。</span>
      </div>
      <div class="field pair">
        <label for="timeoutMs">超时（ms）</label>
        <label for="budgetTokens">注入预算（token）</label>
        <input
          id="timeoutMs"
          type="number"
          min="200"
          max="30000"
          step="100"
          :value="state.controls.requestTimeoutMs ?? ''"
          @change="onNumberChange('requestTimeoutMs', $event)"
          @keydown.enter="onNumberEnter"
        />
        <input
          id="budgetTokens"
          type="number"
          min="200"
          max="32000"
          step="100"
          :value="state.controls.injectBudgetTokens ?? ''"
          @change="onNumberChange('injectBudgetTokens', $event)"
          @keydown.enter="onNumberEnter"
        />
      </div>
    </article>
  </section>
</template>

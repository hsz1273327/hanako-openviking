<script setup>
// 中枢 + 身份两块，上下各占整行（.hub-stack 纵向，间距 12px）。
//
// 中枢：地址 / API Key / 往返·版本·出口·检查摘要 / 检查项 / 错误行 / 提示位。
// 身份：门牌前缀 / 超时。
//
// 注入预算不在这里：它决定拼好的记忆段留多少，是组装那一步的事，已搬到记忆页的
// 组装子页签（AssembleCard.vue）。
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
//   - 信息行 = 一个 flex 行（.facts-row）：三个「标签 + b 值」+ 摘要，一条 18px 高；
//   - 检查项 = NText（摘要）+ NList / NListItem（只有问题项）；
//   - 说明小字 = NText。
// 字段与信息行之间**没有分隔线**：NDivider 自带 24px 上下外边距，
// 是那段 49px 空白的唯一来源，删掉节点比压外边距干净。
//
// 为什么改上下堆叠：并排时两栏高度由高的那栏决定（215px），短的那栏底下白放着，
// 而且每栏只有一半宽，字段只能竖排（标签一行、控件一行）。各占整行之后字段可以
// 横着并排，每块只剩「一行字段 + 一行信息」，总高反而更低。
// 栅格仍交给 n-grid：中枢 cols="1 700:2"（地址 : API Key = 1:1），
// 身份 cols="1 700:2"（门牌前缀 : 超时 = 1:1），700px 以下各自收成一列。
import { computed } from "vue";
import {
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NText,
} from "naive-ui";
import { TONE_BAD, TONE_MUTED, TONE_OK, statusTone } from "../lib/check-tone.js";
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

// 信息行的标签沿用 10.5px（面板正文是 12px，标签要低一档才读得出主次）。
const FACT_LABEL_STYLE = Object.freeze({ fontSize: "10.5px", lineHeight: "1.3" });
// 值也不能跟着正文的 12px 走：旧版是 12.5px / 字重 560，
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
  <!-- 上下两块各占整行。用普通 div + gap 而不是 NSpace vertical：
       NSpace 的间距落在每项的 margin 上，而这里只需要一条 gap；
       而且 #panel-global > .hub-stack 的 flex:0 0 auto 要落在单个根节点上。 -->
  <div class="hub-stack">
    <!-- 中枢：地址与 key 各占一半（1:1），事实与检查摘要合成一条信息行。
         两块都不补 height:100%：卡片按内容定高，行高不该被拉松。 -->
    <NCard size="small" title="中枢" :bordered="false" header-style="padding: 4px 16px" content-style="padding: 12px">
      <NForm class="fields" label-placement="top" size="small" :show-feedback="false">
        <!-- 整行宽度用上之后两个字段并排就够宽了；700px 以下 NGrid 自己收成一列。
             :y-gap="0" 是有意的：字段之间的竖向节奏由 .fields .n-form-item 的 8px 管。 -->
        <NGrid cols="1 700:2" responsive="screen" :x-gap="8" :y-gap="0">
          <NGridItem>
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
          </NGridItem>
          <NGridItem>
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
          </NGridItem>
        </NGrid>
      </NForm>

      <!-- 一条信息行：往返 / 版本 / 出口三个「标签 + 值」，末尾接检查摘要。
           以前事实是 NDescriptions（标签在上、值在下，两行 30px）加单独一行的摘要，
           现在并成一条 18px：标签与值成对、项间用 · 分隔，读得出来哪句属于哪个标签。
           紧跟在字段后面，不靠 margin-top:auto 把它推到底
           （那会重演被分隔线顶出去的那 49px 空白）。
           摘要仍裹在 #checksBlock 里，hidden 判据一个没动。 -->
      <div class="facts-row">
        <span class="fact">
          <NText class="fact-label" depth="3" :style="FACT_LABEL_STYLE">往返</NText>
          <b id="latency" :style="FACT_VALUE_STYLE">{{ view.latency }}</b>
        </span>
        <span class="fact">
          <NText class="fact-label" depth="3" :style="FACT_LABEL_STYLE">版本</NText>
          <b id="version" :style="FACT_VALUE_STYLE">{{ view.version }}</b>
        </span>
        <span class="fact">
          <NText class="fact-label" depth="3" :style="FACT_LABEL_STYLE">出口</NText>
          <b id="transport" :style="FACT_VALUE_STYLE">{{ view.transport }}</b>
        </span>
        <div id="checksBlock" class="checks-block" :hidden="checksSummary.total === 0">
          <NText
            id="checksSummary"
            class="hint-line"
            :type="summaryType"
            :depth="summaryDepth"
          >{{ checksSummary.text }}</NText>
        </div>
      </div>

      <!-- 五个检查项平时不占地方：全绿时信息行里只有一句「服务端就绪 5/5」，
           有问题才在下面平铺列出不对的那几项。不可点、不折叠。 -->
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

      <NText id="reachError" class="hint-line err" type="error" :hidden="!view.error">{{ view.error }}</NText>
      <NText id="saveHint" class="hint-line save-hint" :type="noteType" :depth="noteDepth">{{ state.note.text }}</NText>
    </NCard>

    <NCard size="small" title="身份" :bordered="false" header-style="padding: 4px 16px" content-style="padding: 12px">
      <NForm class="fields" label-placement="top" size="small" :show-feedback="false">
        <!-- 两栏等宽（门牌前缀 : 超时 = 1:1）；700px 以下收成一列。 -->
        <NGrid cols="1 700:2" responsive="screen" :x-gap="8" :y-gap="0">
          <NGridItem>
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
          </NGridItem>
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
        </NGrid>

        <!-- 说明行用 NFormItem 的反馈位（show-feedback 关着，就自己写成一行）。
             它在 NForm 的最后一格，所以 :last-child 那条把 8px 下边距收掉。
             peer 名单在页面右侧的边栏卡里（PeerList），不是本卡里的东西。 -->
        <NText class="hint-line" depth="3">这一段对话算谁的，看右侧栏里的 peer。</NText>
      </NForm>
    </NCard>
  </div>
</template>

<script setup>
// 前置：探针开关 + 打分服务表。
//
// 打分服务的一切（标题、几行、每行三格、按钮 id、结果行 id、列表下方那段总说明）
// 都来自 lib/recall-layers.js 的 scoringServiceLayout()：
// 加第三种服务只加一行描述，这里和 HTML 都不用改（行为第 5 条）。
//
// 行内约定：
//   - 地址与模型成对：清空任意一半时另一半也清掉（store.setServiceField）；
//   - 半对不发服务端，留在界面上继续编辑；
//   - 改过任何一格就收掉上一次的测试结果（结果行仍占位，整页不跳）；
//   - 「测试」发的是输入框此刻的值，不是已保存的配置。
//
// 排版交给 naive-ui：整块一张 n-card（title="前置"），探针行 + 打分服务块放
// NSpace vertical；一条服务一行 NGrid（服务名 / 地址 / 模型 / 超时 / 测试，
// 700px 以下自动收成一列），结果行紧跟在那一行 NGrid 之后 —— 常驻占位，
// 出现结果时不把整页顶一下。
import { NButton, NCard, NGrid, NGridItem, NInput, NInputNumber, NSpace, NSwitch } from "naive-ui";
import { scoringServiceLayout } from "../lib/recall-layers.js";
import { useConfig } from "../composables/useConfig.js";

const { state, flip, setServiceField, testService, setFocus, enabled } = useConfig();

// 描述表只算一次：它是冻结的常量表。
const layout = scoringServiceLayout();

function resultOf(kind) {
  return state.serviceResults[kind] || { tone: "", text: "", pending: false };
}

function onFieldInput(key, value) {
  state.draft[key] = value;
}

function onFieldChange(key, value) {
  setServiceField(key, value ?? "");
}

function onFieldEnter(event) {
  event.preventDefault();
  event.target.blur();
}

// 超时框是 n-input-number：store 里的草稿是字符串，这里只做一次双向换算。
function timeoutValue(key) {
  const text = String(state.draft[key] ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function onTimeoutChange(key, value) {
  // 清空 = 用该类型默认值（与手写版 change 时传空串一致），不是提交 0。
  setServiceField(key, value === null || value === undefined ? "" : String(value));
}

function onTest(kind) {
  testService(kind);
}
</script>

<template>
  <NCard
    id="prelude"
    class="prelude"
    size="small"
    title="前置"
    content-style="padding: 8px 12px"
  >
    <NSpace vertical size="small">
      <div class="toggle" data-key="probe" :class="{ dim: !enabled }">
        <div class="toggle-copy">
          <b>探针</b>
          <span>把钩子事实记进日志</span>
        </div>
        <NSwitch
          size="small"
          aria-label="探针"
          :value="state.controls.probe"
          @update:value="(next) => flip('probe', next)"
        />
      </div>

      <!-- 打分服务：精排 / 决策等类型的端点先在这里声明一次，下面的精排通道只选类型。
           这里只留容器；行由上面的描述表驱动。 -->
      <div id="scoringServices" class="services" :class="{ dim: !enabled }">
        <div class="services-title">{{ layout.title }}</div>
        <div class="service-list">
          <div
            v-for="row in layout.rows"
            :key="row.kind"
            class="service"
            :data-kind="row.kind"
          >
            <NGrid cols="1 700:5" responsive="screen" :x-gap="6" :y-gap="4">
              <NGridItem>
                <div class="service-name">{{ row.label }}</div>
              </NGridItem>

              <NGridItem>
                <div class="field">
                  <label :for="row.url.id">{{ row.url.label }}</label>
                  <NInput
                    size="small"
                    :type="row.url.type"
                    :placeholder="row.url.placeholder"
                    :input-props="{ id: row.url.id, spellcheck: 'false' }"
                    :value="state.draft[row.url.key]"
                    @focus="setFocus(row.url.key)"
                    @blur="setFocus('')"
                    @update:value="onFieldInput(row.url.key, $event)"
                    @change="onFieldChange(row.url.key, $event)"
                    @keydown.enter="onFieldEnter"
                  />
                </div>
              </NGridItem>

              <NGridItem>
                <div class="field">
                  <label :for="row.model.id">{{ row.model.label }}</label>
                  <NInput
                    size="small"
                    :type="row.model.type"
                    :placeholder="row.model.placeholder"
                    :input-props="{ id: row.model.id, spellcheck: 'false' }"
                    :value="state.draft[row.model.key]"
                    @focus="setFocus(row.model.key)"
                    @blur="setFocus('')"
                    @update:value="onFieldInput(row.model.key, $event)"
                    @change="onFieldChange(row.model.key, $event)"
                    @keydown.enter="onFieldEnter"
                  />
                </div>
              </NGridItem>

              <NGridItem>
                <div class="field">
                  <label :for="row.timeout.id">{{ row.timeout.label }}</label>
                  <NInputNumber
                    size="small"
                    :show-button="false"
                    :update-value-on-input="false"
                    :min="row.timeout.min"
                    :max="row.timeout.max"
                    :step="row.timeout.step"
                    :placeholder="row.timeout.placeholder"
                    :input-props="{ id: row.timeout.id }"
                    :value="timeoutValue(row.timeout.key)"
                    @focus="setFocus(row.timeout.key)"
                    @blur="setFocus('')"
                    @update:value="onTimeoutChange(row.timeout.key, $event)"
                  />
                </div>
              </NGridItem>

              <NGridItem>
                <div class="field service-test">
                  <NButton
                    :id="row.testId"
                    size="small"
                    quaternary
                    :disabled="resultOf(row.kind).pending"
                    @click="onTest(row.kind)"
                  >
                    {{ resultOf(row.kind).pending ? "测试中…" : "测试" }}
                  </NButton>
                </div>
              </NGridItem>
            </NGrid>

            <!-- 结果行常驻：空着也占一行高度，出现结果时不把整页顶一下。 -->
            <p
              :id="row.resultId"
              class="service-result"
              :class="resultOf(row.kind).tone"
            >{{ resultOf(row.kind).text }}</p>
          </div>
        </div>
        <p class="services-note">{{ layout.note }}</p>
      </div>
    </NSpace>
  </NCard>
</template>

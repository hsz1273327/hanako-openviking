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
import { NSwitch } from "naive-ui";
import { scoringServiceLayout } from "../lib/recall-layers.js";
import { useConfig } from "../composables/useConfig.js";

const { state, flip, setServiceField, testService, setFocus, enabled } = useConfig();

// 描述表只算一次：它是冻结的常量表。
const layout = scoringServiceLayout();

function resultOf(kind) {
  return state.serviceResults[kind] || { tone: "", text: "", pending: false };
}

function onFieldChange(key, event) {
  setServiceField(key, event.target.value);
}

function onFieldEnter(event) {
  event.preventDefault();
  event.target.blur();
}

function onTest(kind) {
  testService(kind);
}
</script>

<template>
  <section id="prelude" class="card prelude" aria-label="前置">
    <h2 class="card-title">前置</h2>

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
          class="service-row"
          :data-kind="row.kind"
        >
          <div class="service-name">{{ row.label }}</div>

          <div class="field">
            <label :for="row.url.id">{{ row.url.label }}</label>
            <input
              :id="row.url.id"
              :type="row.url.type"
              spellcheck="false"
              :placeholder="row.url.placeholder"
              :value="state.draft[row.url.key]"
              @focus="setFocus(row.url.key)"
              @blur="setFocus('')"
              @change="onFieldChange(row.url.key, $event)"
              @keydown.enter="onFieldEnter"
            />
          </div>

          <div class="field">
            <label :for="row.model.id">{{ row.model.label }}</label>
            <input
              :id="row.model.id"
              :type="row.model.type"
              spellcheck="false"
              :placeholder="row.model.placeholder"
              :value="state.draft[row.model.key]"
              @focus="setFocus(row.model.key)"
              @blur="setFocus('')"
              @change="onFieldChange(row.model.key, $event)"
              @keydown.enter="onFieldEnter"
            />
          </div>

          <div class="field narrow">
            <label :for="row.timeout.id">{{ row.timeout.label }}</label>
            <input
              :id="row.timeout.id"
              type="number"
              :min="row.timeout.min"
              :max="row.timeout.max"
              :step="row.timeout.step"
              :placeholder="row.timeout.placeholder"
              :value="state.draft[row.timeout.key]"
              @focus="setFocus(row.timeout.key)"
              @blur="setFocus('')"
              @change="onFieldChange(row.timeout.key, $event)"
              @keydown.enter="onFieldEnter"
            />
          </div>

          <div class="field service-test">
            <button
              :id="row.testId"
              class="btn ghost sm"
              type="button"
              :disabled="resultOf(row.kind).pending"
              @click="onTest(row.kind)"
            >
              {{ resultOf(row.kind).pending ? "测试中…" : "测试" }}
            </button>
          </div>

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
  </section>
</template>

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
// 形态：整块一张 n-card（title="前置"），探针行 = NSpace 一行（标题 / 说明 / 开关），
// 一条服务一行 NGrid（服务名 / 地址 / 模型 / 超时 / 测试，700px 以下收成一列），
// 三格字段 = NFormItem（label-placement="top"、size="small"、无反馈行），
// 说明与结果行 = NText。列宽表仍在 panel.css：服务名压成内容宽、地址列吃掉剩余，
// 因为 NGrid 把 grid-template-columns 写成行内样式，组件不给列宽属性。
//
// 结果行在同一张 NGrid 里、由 NGridItem 承载（span="1 700:4"）—— ≥700px 时从
// 第二列（地址列）起跨到最后一列，跟地址输入框左边缘对齐。**必须包一层 NGridItem**：
// naive-ui 的 Grid 在 responsive 模式下的 renderContent 会把非 NGridItem 的子节点
// 直接丢掉（node_modules/naive-ui/es/grid/src/Grid.mjs，`__GRID_ITEM__ !== true` 就 return），
// 裸节点放进去不是「少一层壳」，是整行结果不渲染。
// 常驻占位：空着也占一行高度，出现结果时不把整页顶一下。
import { NButton, NCard, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NSpace, NSwitch, NText } from "naive-ui";
import { scoringServiceLayout } from "../lib/recall-layers.js";
import { useConfig } from "../composables/useConfig.js";

const { state, flip, setServiceField, testService, setFocus, enabled } = useConfig();

// 描述表只算一次：它是冻结的常量表。
const layout = scoringServiceLayout();

function resultOf(kind) {
  return state.serviceResults[kind] || { tone: "", text: "", pending: false };
}

/** 结果行的档位（ok / bad / muted）→ NText 的取值。 */
function toneType(tone) {
  if (tone === "ok") return "success";
  if (tone === "bad") return "error";
  return undefined;
}

function toneDepth(tone) {
  return tone === "muted" ? 3 : undefined;
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
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <NSpace vertical size="small">
      <!-- 探针：一句标题 + 一句说明 + 右侧开关。
           不用 NThing：它的标题档是 16px，比面板正文（12px）大两档，
           而且空 header 还会白占 29px（见 MasterCard 的同类注释）。
           一行 NSpace + 两个 NText + NSwitch 就是这个语义的最小写法。 -->
      <NSpace
        class="toggle"
        data-key="probe"
        :class="{ dim: !enabled }"
        align="center"
        :size="8"
        :wrap="false"
        justify="space-between"
      >
        <NSpace align="baseline" :size="6" :wrap="false">
          <NText strong class="hint-body">探针</NText>
          <NText class="hint-line" depth="3">把钩子事实记进日志</NText>
        </NSpace>
        <NSwitch
          size="small"
          aria-label="探针"
          :value="state.controls.probe"
          @update:value="(next) => flip('probe', next)"
        />
      </NSpace>

      <!-- 打分服务：精排 / 决策等类型的端点先在这里声明一次，下面的精排通道只选类型。
           这里只留容器；行由上面的描述表驱动。 -->
      <div id="scoringServices" class="services" :class="{ dim: !enabled }">
        <NText class="hint-body" strong>{{ layout.title }}</NText>
        <NSpace vertical :size="4">
          <div
            v-for="row in layout.rows"
            :key="row.kind"
            class="service"
            :data-kind="row.kind"
          >
            <NGrid cols="1 700:5" responsive="screen" :x-gap="6" :y-gap="0">
              <NGridItem>
                <div class="service-name">{{ row.label }}</div>
              </NGridItem>

              <NGridItem>
                <NFormItem
                  size="small"
                  label-placement="top"
                  :show-feedback="false"
                  :label="row.url.label"
                  :label-props="{ for: row.url.id }"
                >
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
                </NFormItem>
              </NGridItem>

              <NGridItem>
                <NFormItem
                  size="small"
                  label-placement="top"
                  :show-feedback="false"
                  :label="row.model.label"
                  :label-props="{ for: row.model.id }"
                >
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
                </NFormItem>
              </NGridItem>

              <NGridItem>
                <NFormItem
                  size="small"
                  label-placement="top"
                  :show-feedback="false"
                  :label="row.timeout.label"
                  :label-props="{ for: row.timeout.id }"
                >
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
                </NFormItem>
              </NGridItem>

              <NGridItem>
                <NFormItem size="small" label-placement="top" :show-feedback="false" class="service-test">
                  <NButton
                    :id="row.testId"
                    size="small"
                    secondary
                    :disabled="resultOf(row.kind).pending"
                    @click="onTest(row.kind)"
                  >
                    {{ resultOf(row.kind).pending ? "测试中…" : "测试" }}
                  </NButton>
                </NFormItem>
              </NGridItem>

              <!-- 结果行常驻：空着也占一行高度，出现结果时不把整页顶一下。
                   span 的 1 是 700px 以下（那时 NGrid 只有一列），4 是 ≥700px 时
                   跨四列。但 span 只给宽度，没有给起点：自动排布会把它放到下一行
                   的第 1 列（服务名那列）。起点由 panel.css 的 .service-result-cell
                   用 grid-column: 2 / -1 指定，左边缘才和地址列对齐。 -->
              <NGridItem span="1 700:4" class="service-result-cell">
                <NText
                  :id="row.resultId"
                  class="service-result hint"
                  :type="toneType(resultOf(row.kind).tone)"
                  :depth="toneDepth(resultOf(row.kind).tone)"
                >{{ resultOf(row.kind).text }}</NText>
              </NGridItem>
            </NGrid>
          </div>
        </NSpace>
        <NText class="services-note hint" depth="3">{{ layout.note }}</NText>
      </div>
    </NSpace>
  </NCard>
</template>

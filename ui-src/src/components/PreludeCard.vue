<script setup>
// 前置：探针开关 + 打分服务卡片。
//
// 打分服务的一切（标题、几项、每项的字段 / 按钮 id / 结果行 id、列表下方那段总说明）
// 都来自 lib/recall-layers.js 的 scoringServiceLayout()：
// 加第三种服务只加一行描述，这里和 HTML 都不用改（行为第 5 条）。
//
// 行内约定：
//   - 地址与模型成对：清空任意一半时另一半也清掉（store.setServiceField）；
//   - 半对不发服务端，留在界面上继续编辑；
//   - 改过任何一格就收掉上一次的测试结果（结果行仍占位，整页不跳）；
//   - 「测试」发的是输入框此刻的值，不是已保存的配置。
//
// 形态：整块一张 n-card（title="前置"），探针行 = NSpace 一行（标题 / 说明 / 开关）。
// 打分服务每项一张 NCard（size="small"、:bordered="false"）：服务名在 #header，
// 测试按钮在 #header-extra；卡片内用 NForm（label-placement="top"）分四行排：
//   地址独占一行（URL 最长，给它整行）→
//   模型:超时 = 2:1（NGrid cols="1 640:3"，模型那格 span="1 640:2"；
//   640px 以下 NGrid 自己收成一列）→
//   密钥独占一行 → 结果行贴底常驻。
// 2:1 用 NGridItem 的 span 表达，列宽表（grid-template-columns）因此整块拆掉了：
// 不再需要 !important 去盖 NGrid 写进 style 的行内样式（见 ui/assets/panel.css）。
//
// 密钥那一格：服务端只回掩码（前四 + 圆点 + 后四），输入框里坐的就是它。
// 聚焦时清掉、失焦仍为空就填回来；空着不提交（清空不等于删 key，
// 否则点进去看一眼就把已存的密钥删了）。散手 / 回车提交带的是用户新打的明文。
//
// 结果行在同一张 NGrid 里、由 NGridItem 承载（span="1 700:5"）—— ≥700px 时从
// 第二列（地址列）起跨到最后一列，跟地址输入框左边缘对齐。**必须包一层 NGridItem**：
// naive-ui 的 Grid 在 responsive 模式下的 renderContent 会把非 NGridItem 的子节点
// 直接丢掉（node_modules/naive-ui/es/grid/src/Grid.mjs，`__GRID_ITEM__ !== true` 就 return），
// 裸节点放进去不是「少一层壳」，是整行结果不渲染。
// 常驻占位：空着也占一行高度，出现结果时不把整页顶一下。
import { NButton, NCard, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NSpace, NSwitch, NText } from "naive-ui";
import { scoringServiceLayout } from "../lib/recall-layers.js";
import { useConfig } from "../composables/useConfig.js";

const { state, flip, setServiceField, setServiceKey, testService, setFocus, enabled } = useConfig();

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

/** 已确认的掩码：服务端只回掩码，所以它同时是「没改过」的判据。 */
function keyMaskOf(key) {
  return String(state.layers[key] || "");
}

// 聚焦时清掉掩码（否则光标进去就得先删一串圆点），失焦仍为空就填回来。
function onKeyFocus(key) {
  if (state.draft[key] === keyMaskOf(key)) state.draft[key] = "";
  setFocus(key);
}

function onKeyBlur(key) {
  setFocus("");
  if (!String(state.draft[key] ?? "").trim()) state.draft[key] = keyMaskOf(key);
}

// 空着不提交：clear 不等于删 key。提交时带的若仍是掩码，服务端也按「没改」处理。
function onKeyChange(key, value) {
  return setServiceKey(key, value ?? "");
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
           容器只留 id / class；每项一张卡片，字段顺序由上面的描述表驱动。 -->
      <div id="scoringServices" class="services" :class="{ dim: !enabled }">
        <NText class="hint-body" strong>{{ layout.title }}</NText>
        <NCard
          v-for="row in layout.rows"
          :key="row.kind"
          class="service-card"
          :data-kind="row.kind"
          size="small"
          embedded
          :bordered="false"
          header-style="padding: 8px 16px 0"
          content-style="padding: 4px 16px 12px"
        >
          <!-- 服务名在卡片标题位，测试按钮在 header-extra（不占字段行）。
               embedded 是 naive 给「卡片嵌卡片」的现成形态：底色取
               --n-color-embedded（比父卡深一档），没有阴影。只写 bordered=false
               的话这两张子卡跟父卡同色，介面上看就是一片空白里浮着几个标签。 -->
          <template #header>
            <span class="service-name">{{ row.label }}</span>
          </template>
          <template #header-extra>
            <NButton
              :id="row.testId"
              size="small"
              secondary
              :disabled="resultOf(row.kind).pending"
              @click="onTest(row.kind)"
            >
              {{ resultOf(row.kind).pending ? "测试中…" : "测试" }}
            </NButton>
          </template>

          <!-- 卡片内四行：地址独占一行 → 模型:超时 = 2:1 → 密钥独占一行 → 结果行。
               label-placement="top" 与无反馈行交给 NForm 一次性声明，字段沿用。 -->
          <NForm
            class="service-form"
            size="small"
            label-placement="top"
            :show-feedback="false"
          >
            <!-- 地址独占一行：URL 最长，不跟任何字段挤同一格。 -->
            <NFormItem
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

            <!-- 模型:超时 = 2:1。cols="1 640:3" 让 naive-ui 生成三份等宽列，
                 模型那格 span="1 640:2" 占两份、超时占一份；640px 以下自动收成一列。
                 不写列宽表、不盖行内样式：比例完全由 span 表达。 -->
            <NGrid cols="1 640:3" responsive="screen" :x-gap="8" :y-gap="8">
              <NGridItem span="1 640:2">
                <NFormItem
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
            </NGrid>

            <!-- 密钥独占一行：掩码比地址还长，跟任何字段并排都会被截。 -->
            <NFormItem
              :label="row.key.label"
              :label-props="{ for: row.key.id }"
            >
              <NInput
                size="small"
                :type="row.key.type"
                show-password-on="click"
                :placeholder="row.key.placeholder"
                :input-props="{ id: row.key.id, spellcheck: 'false', autocomplete: 'off' }"
                :value="state.draft[row.key.key]"
                @focus="onKeyFocus(row.key.key)"
                @blur="onKeyBlur(row.key.key)"
                @update:value="onFieldInput(row.key.key, $event)"
                @change="onKeyChange(row.key.key, $event)"
                @keydown.enter="onFieldEnter"
              />
            </NFormItem>

            <!-- 结果行贴卡片底部常驻：空着也占一行高度，出现结果时不把卡片顶高。
                 它在 NGrid 之后，不靠 grid-column 定位，也不用任何 grid 属性。 -->
            <NText
              :id="row.resultId"
              class="service-result hint"
              tag="div"
              :type="toneType(resultOf(row.kind).tone)"
              :depth="toneDepth(resultOf(row.kind).tone)"
            >{{ resultOf(row.kind).text }}</NText>
          </NForm>
        </NCard>
        <NText class="services-note hint" depth="3">{{ layout.note }}</NText>
      </div>
    </NSpace>
  </NCard>
</template>

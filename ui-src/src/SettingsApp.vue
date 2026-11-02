<script setup>
// 设置页：只管把这台机器接到中枢上去（地址 / API Key / 门牌前缀）。
// 运行时开关与召回策略都在「OpenViking」页面，那里改完即时生效，这页不再碰。
//
// 行为与手写的 ui/assets/settings.js 逐条对齐：
// - 读取走 GET /conn，写入走 POST /conn，一个端点、一次提交。
// - key 永远不回显明文：输入框里放的是掩码（前四位 + 圆点 + 后四位）。
//   聚焦时清空掩码，失焦若仍为空就恢复；保存时“等于掩码”视为没改。
// - 保存中的按钮禁用、成功/失败的状态提示位置与文案不变。
// - 失败不静默：把服务端返回的 error 原样显示出来。
//
// 样式：SFC 里不写 <style>，这只管字段结构；字号/间距/脚注仍在
// ui/settings.html 的内联样式里，补几条给 Vue 生成的 DOM 用。
import { onMounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NConfigProvider,
  NForm,
  NFormItem,
  NInput,
  darkTheme,
} from "naive-ui";
import { hana } from "./sdk.js";
import { darkThemeOverrides } from "./theme.js";

const HINT_DEFAULT = "保存在本机 App 设置里，不会回显、不进日志。";
const HINT_SET = "已保存在本机。要换 key 就在框里输入新的；留空保存不会清掉旧的。";

const serverUrl = ref("");
const apiKey = ref("");
const peerPrefix = ref("");
const keyHint = ref(HINT_DEFAULT);
const statusText = ref("");
const statusTone = ref(""); // "" | "ok" | "bad"
const saving = ref(false);

let mask = "";

function setStatus(text, kind) {
  statusText.value = text;
  statusTone.value = kind || "";
}

function buildMask(head, tail) {
  if (!tail) return "";
  return `${head || ""}${"•".repeat(8)}${tail}`;
}

function paint(data) {
  serverUrl.value = data.serverUrl || "";
  peerPrefix.value = data.peerPrefix || "";

  mask = data.apiKeySet ? buildMask(data.apiKeyHead, data.apiKeyTail) : "";
  apiKey.value = mask;

  keyHint.value = data.apiKeySet ? HINT_SET : HINT_DEFAULT;
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function load() {
  try {
    const connRes = await hana.api.fetch("/conn");
    paint(await readJson(connRes));
    setStatus("");
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
  }
}

async function save() {
  const body = {
    serverUrl: serverUrl.value.trim(),
    peerPrefix: peerPrefix.value.trim(),
  };

  const typed = apiKey.value.trim();
  if (typed && typed !== mask) body.apiKey = typed;

  saving.value = true;
  setStatus("保存中…");
  try {
    const connRes = await hana.api.fetch("/conn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    paint(await readJson(connRes));
    setStatus("已保存", "ok");
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
  } finally {
    saving.value = false;
  }
}

function onKeyFocus() {
  if (apiKey.value === mask) apiKey.value = "";
}

function onKeyBlur() {
  if (apiKey.value.trim() === "" && mask) apiKey.value = mask;
}

onMounted(() => {
  hana.ready();
  load();
});
</script>

<template>
  <NConfigProvider abstract :theme="darkTheme" :theme-overrides="darkThemeOverrides">
    <NForm
      class="settings-form"
      label-placement="top"
      :show-feedback="false"
      @submit.prevent
    >
      <NFormItem label="服务地址">
        <div class="field-body">
          <NInput
            v-model:value="serverUrl"
            type="url"
            spellcheck="false"
            placeholder="http://127.0.0.1:8000"
          />
          <span class="hint">本机直连用默认值即可；接局域网或远端时填那台的地址。</span>
        </div>
      </NFormItem>

      <NFormItem label="API Key">
        <div class="field-body">
          <NInput
            v-model:value="apiKey"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="未填写"
            @focus="onKeyFocus"
            @blur="onKeyBlur"
            @keydown.enter="save"
          />
          <span class="hint">{{ keyHint }}</span>
        </div>
      </NFormItem>

      <NFormItem label="门牌前缀">
        <div class="field-body">
          <NInput
            v-model:value="peerPrefix"
            type="text"
            spellcheck="false"
            placeholder="如 mbp / desktop，可留空"
          />
          <span class="hint">同机不同助手各自一个门牌：前缀-openhanako-助手目录名。留空则只带 openhanako 和助手目录名。</span>
        </div>
      </NFormItem>

      <div class="actions">
        <NButton :disabled="saving" @click="save">保存</NButton>
        <NAlert
          v-if="statusTone === 'bad'"
          class="status-alert"
          type="error"
          :show-icon="false"
        >
          {{ statusText }}
        </NAlert>
        <span v-else class="status" :class="statusTone">{{ statusText }}</span>
      </div>
    </NForm>
  </NConfigProvider>
</template>

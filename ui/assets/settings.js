// 设置页：三个字段，一次填完。
// key 永远不回显明文：输入框里放的是掩码（前四位 + 圆点 + 后四位）。
// 聚焦时清空掩码，失焦若仍为空就恢复；保存时"等于掩码"视为没改。
import { hana } from "./sdk.js";

const el = {
  serverUrl: document.getElementById("serverUrl"),
  apiKey: document.getElementById("apiKey"),
  peerPrefix: document.getElementById("peerPrefix"),
  keyHint: document.getElementById("keyHint"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
};

let mask = "";

function setStatus(text, kind) {
  el.status.textContent = text;
  el.status.className = `status${kind ? ` ${kind}` : ""}`;
}

function buildMask(head, tail) {
  if (!tail) return "";
  return `${head || ""}${"•".repeat(8)}${tail}`;
}

function paint(data) {
  el.serverUrl.value = data.serverUrl || "";
  el.peerPrefix.value = data.peerPrefix || "";

  mask = data.apiKeySet ? buildMask(data.apiKeyHead, data.apiKeyTail) : "";
  el.apiKey.value = mask;
  el.apiKey.placeholder = "未填写";

  el.keyHint.textContent = data.apiKeySet
    ? "已保存在本机。要换 key 就在框里输入新的；留空保存不会清掉旧的。"
    : "保存在本机 App 设置里，不会回显、不进日志。";
}

async function load() {
  try {
    const res = await hana.api.fetch("/conn");
    const data = await res.json();
    paint(data);
    setStatus("");
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
  }
}

async function save() {
  const body = {
    serverUrl: el.serverUrl.value.trim(),
    peerPrefix: el.peerPrefix.value.trim(),
  };

  const typed = el.apiKey.value.trim();
  if (typed && typed !== mask) body.apiKey = typed;

  el.save.disabled = true;
  setStatus("保存中…");
  try {
    const res = await hana.api.fetch("/conn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    paint(data);
    setStatus("已保存", "ok");
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
  } finally {
    el.save.disabled = false;
  }
}

el.save.addEventListener("click", save);

el.apiKey.addEventListener("focus", () => {
  if (el.apiKey.value === mask) el.apiKey.value = "";
});

el.apiKey.addEventListener("blur", () => {
  if (el.apiKey.value.trim() === "" && mask) el.apiKey.value = mask;
});

el.apiKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") save();
});

hana.ready();
load();

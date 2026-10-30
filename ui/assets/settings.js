// 设置页：连接三字段 + 召回前两层的两个策略。
// key 永远不回显明文：输入框里放的是掩码（前四位 + 圆点 + 后四位）。
// 聚焦时清空掩码，失焦若仍为空就恢复；保存时“等于掩码”视为没改。
// 连接走 /conn，召回策略走 /recall-mode：两个端点各自整单校验，责任不混在一起。
import { hana } from "./sdk.js";

const el = {
  serverUrl: document.getElementById("serverUrl"),
  apiKey: document.getElementById("apiKey"),
  peerPrefix: document.getElementById("peerPrefix"),
  recallGate: document.getElementById("recallGate"),
  queryMode: document.getElementById("queryMode"),
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

// 服务端已经把非法值收敛成默认值；这里再兜一层，免得老宿主回半个形状时下拉变空。
function paintLayers(data) {
  el.recallGate.value = data?.recallGate === "rules" ? "rules" : "off";
  el.queryMode.value = data?.queryMode === "context" ? "context" : "last";
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
    return;
  }

  // 召回策略读不到不阻断连接字段的展示：新路由没挂上时，旧功能仍然可用。
  try {
    const layerRes = await hana.api.fetch("/recall-mode");
    paintLayers(await readJson(layerRes));
  } catch (error) {
    paintLayers({});
    setStatus(`召回策略读取失败：${String(error?.message || error)}`, "bad");
  }
}

async function save() {
  const body = {
    serverUrl: el.serverUrl.value.trim(),
    peerPrefix: el.peerPrefix.value.trim(),
  };

  const typed = el.apiKey.value.trim();
  if (typed && typed !== mask) body.apiKey = typed;

  const layers = {
    recallGate: el.recallGate.value,
    queryMode: el.queryMode.value,
  };

  el.save.disabled = true;
  setStatus("保存中…");
  try {
    const connRes = await hana.api.fetch("/conn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    paint(await readJson(connRes));
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
    el.save.disabled = false;
    return;
  }

  // 连接已经落库；召回策略失败要如实说“哪一半没成”，不要谎报整体失败。
  try {
    const layerRes = await hana.api.fetch("/recall-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layers),
    });
    paintLayers(await readJson(layerRes));
    setStatus("已保存", "ok");
  } catch (error) {
    setStatus(`连接已保存，召回策略未保存：${String(error?.message || error)}`, "bad");
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

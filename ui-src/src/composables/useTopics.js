// 话题列表的局部状态：一张本地表 + 改标签 / 删除两个动作。
//
// 为什么不进 panel-store.js：面板的整单提交口是写回设置那条链路，话题表是
// 另一份文件（topics.json），这里只做三件事：读一次、改一行、删一行。
//
// 打开这一块时（组件 onMounted）拉一次 GET /topics；折叠 / 展开不再重复拉。
// 改标签提交失败把错误留在提示位、输入框留在编辑态；删除成功只把那一行从
// 本地列表里去掉，不整表重拉。

import { reactive } from "vue";
import { jsonDelete, jsonGet, jsonPatch } from "../api.js";
import { normalizeTopicLabel } from "../lib/topics-view.js";

function errorText(error) {
  return String(error?.message || error || "操作失败");
}

export function useTopics() {
  const state = reactive({
    topics: [],
    loaded: false,
    loading: false,
    editingId: "",
    draft: "",
    saving: false,
    note: "",
    noteBad: false,
  });

  function setNote(text, bad) {
    state.note = text || "";
    state.noteBad = Boolean(bad);
  }

  /** 拉整张表。已经拉过就不再拉（折叠只切显隐，不该产生新请求）。 */
  async function load() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    try {
      const out = await jsonGet("/topics");
      if (!out || typeof out !== "object") throw new Error("话题表格式不对");
      state.topics = Array.isArray(out.topics) ? out.topics : [];
      state.loaded = true;
      setNote("", false);
    } catch (error) {
      setNote(errorText(error), true);
    } finally {
      state.loading = false;
    }
  }

  function beginEdit(topic) {
    state.editingId = typeof topic?.id === "string" ? topic.id : "";
    state.draft = typeof topic?.label === "string" ? topic.label : "";
    setNote("", false);
  }

  function cancelEdit() {
    state.editingId = "";
    state.draft = "";
  }

  function setDraft(value) {
    state.draft = value ?? "";
  }

  /**
   * 回车提交：PATCH /topics/<id> body { label }。
   * 失败（ok:false / 网络错）留在编辑态，错误进提示位。
   */
  async function submitLabel(id) {
    if (state.saving) return false;
    const label = normalizeTopicLabel(state.draft);
    if (!label) {
      setNote("标签要 1 到 60 个字符", true);
      return false;
    }
    state.saving = true;
    try {
      const out = await jsonPatch(`/topics/${encodeURIComponent(id)}`, { label });
      if (out?.ok === false) {
        setNote(typeof out.error === "string" ? out.error : "改标签失败", true);
        return false;
      }
      const index = state.topics.findIndex((topic) => topic?.id === id);
      if (index >= 0) {
        const updated = out?.topic && typeof out.topic === "object" ? out.topic : null;
        state.topics.splice(index, 1, updated || { ...state.topics[index], label });
      }
      setNote("", false);
      state.editingId = "";
      state.draft = "";
      return true;
    } catch (error) {
      setNote(errorText(error), true);
      return false;
    } finally {
      state.saving = false;
    }
  }

  /** 删除：只移除本地归组记录；成功后那一行从列表里去掉，不整表重拉。 */
  async function remove(id) {
    try {
      const out = await jsonDelete(`/topics/${encodeURIComponent(id)}`);
      if (out?.ok === false) {
        setNote(typeof out.error === "string" ? out.error : "删除失败", true);
        return false;
      }
      state.topics = state.topics.filter((topic) => topic?.id !== id);
      if (state.editingId === id) cancelEdit();
      setNote("", false);
      return true;
    } catch (error) {
      setNote(errorText(error), true);
      return false;
    }
  }

  return {
    state,
    load,
    beginEdit,
    cancelEdit,
    setDraft,
    submitLabel,
    remove,
  };
}

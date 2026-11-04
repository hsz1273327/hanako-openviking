// 面板的状态机：把已删除的手写面板里「读 / 写 / 回滚 / 提示」那一半搬过来，
// 只去掉 DOM（不再 setAttribute、不再 createElement）。组件是它的纯视图。
//
// 为什么单独一个文件、还不 import vue：
//
//   - dev/smoke.mjs 要能用假 fetch 验「提交失败回滚」。一旦这里 import "vue"，
//     Node 从仓库根解析不到 ui-src/node_modules，冒烟就跑不起来。
//   - 响应式由 composables/useConfig.js 在外面套一层 reactive() 提供，
//     这里只保证「怎么改状态」是确定的。
//
// 依赖（网络 / 会话 / 时钟）全部注入，默认值在 composables 里接真实现。
//
// 不变式（与已删除的手写面板逐条对齐，历史实现在 git 历史里）：
//   1. 写操作一律乐观：先改界面，再发请求；
//   2. 失败回滚到「上一次服务端确认的值」，错误走提示位；
//   3. /recall-mode 永远整单提交（commitLayers），失败整组回滚；
//   4. 提示词框里放的是 value 不是 placeholder，touched 之后刷新不再盖用户；
//   5. 打分服务按描述表渲染，地址与模型成对，半对留作草稿不发；
//   6. 通道类型只列已配服务 + 宿主模型，服务被清空时通道保留但标红；
//   7. peer 名单整单提交，写路径不回读列表，只按服务端存下的名单重算标记。

import {
  DEFAULT_GATE_DECISION_PROMPT,
  DEFAULT_GATE_PROMPT,
  DEFAULT_MODEL_OPTION,
  DEFAULT_RERANK_PROMPT,
  RERANK_CHANNELS_MAX,
  RERANK_CHANNEL_LABELS,
  RERANK_CHANNEL_TIMEOUT_DEFAULTS,
  SCORING_SERVICES,
  SYSTEMONE_TIMEOUT_MAX,
  channelPairNote,
  channelServiceMissing,
  channelTypeOptions,
  commitLayers,
  decisionPromptDraft,
  decisionPromptStatus,
  emptyRerankChannel,
  isCompleteRerankChannel,
  modelOptions,
  normalizeGateDecisionPrompt,
  normalizeGatePrompt,
  normalizeRerankChannels,
  normalizeRerankPrompt,
  normalizeServiceTimeout,
  paintRecallConfig,
  promptDraft,
  promptStatus,
  rerankChannelsText,
  rerankPromptDraft,
  rerankPromptStatus,
  scoringServiceOf,
  serviceTestBody,
  serviceTestReady,
  serviceTestView,
  serviceTimeoutInput,
} from "./recall-layers.js";
import { summarizeChecks } from "./check-summary.js";
import {
  PEER_EMPTY,
  PEER_UNREADABLE,
  PREFIX_TITLE,
  PREFIX_WARN,
  apiKeyPlaceholder,
  formatChannelTest,
  logBodyText,
  logChips,
  peerExcluded,
  peerMetaText,
  peerTappable,
  peerTitle,
  readFootText,
  statusView,
  withStoredOption,
} from "./panel-view.js";

// 提示位保留多久（与手写面板 2600ms 一致）。
export const NOTE_TIMEOUT_MS = 2600;

const MISSING = () => {
  throw new Error("panel store: 缺少注入的依赖");
};

/**
 * 三份提示词（语言模型判据 / 决策模型判据 / 重排模板）共用一套行为：
 * 值当草稿、touched 标记、恢复默认走正常提交。
 *
 * why 一张表：三份的规则完全一样，各写一遍只会在加第四份时再抄一遍，
 * 也容易让两份互相吃到对方的值（这才是真正要防的）。
 *   key     —— state.prompts 里的键（`${key}Touched` 是它有没有被动过）
 *   field   —— /recall-mode 里的配置键，也是输入框 id / state.focus 的值
 *   default —— 「恢复默认」填回去的那份文本
 *   draft   —— 配置为空时框里坐什么（默认全文，或动过之后的空）
 */
const PROMPTS = Object.freeze({
  gate: Object.freeze({
    key: "gate",
    field: "gatePrompt",
    default: DEFAULT_GATE_PROMPT,
    draft: promptDraft,
  }),
  decision: Object.freeze({
    key: "decision",
    field: "gateDecisionPrompt",
    default: DEFAULT_GATE_DECISION_PROMPT,
    draft: decisionPromptDraft,
  }),
  rerank: Object.freeze({
    key: "rerank",
    field: "rerankPrompt",
    default: DEFAULT_RERANK_PROMPT,
    draft: rerankPromptDraft,
  }),
});

/** 打分服务的字段 → 它属于哪一个 kind（超时边界不同）。 */
export function serviceKindOfField(id) {
  return SCORING_SERVICES.find(
    (service) =>
      service.urlKey === id ||
      service.modelKey === id ||
      service.timeoutKey === id ||
      service.keyKey === id,
  )?.kind || "rerank";
}

/** 输入框 id 的另一半；超时框与密钥框没有配对，返回空串。 */
export function servicePartnerOf(id) {
  for (const service of SCORING_SERVICES) {
    if (id === service.urlKey) return service.modelKey;
    if (id === service.modelKey) return service.urlKey;
  }
  return "";
}

export function createPanelStore(deps = {}) {
  const get = deps.get || MISSING;
  const post = deps.post || MISSING;
  const sessionKey = deps.sessionKey || (async () => null);
  const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms));
  const now = deps.now || (() => Date.now());

  /* ---------------- 状态 ---------------- */

  // 注意：这里是 let 不是 const。响应式外壳（composables/useConfig.js）会用
  // replaceState() 换成一个 reactive 代理；下面所有函数捕获的是这个变量，
  // 所以换完之后写入才会真正触发视图更新（直接改原始对象是静默的）。
  let state = {
    // 顶部身份条 + 中枢卡要的一切（纯视图投影见 lib/panel-view.js）
    status: {
      raw: null,
      latencyMs: null,
      view: statusView(null, null, ""),
      readError: "",
      checksSummary: summarizeChecks([]),
    },
    // GET /controls 的镜像。enabled 是三页置灰的唯一依据。
    controls: {
      enabled: false,
      probe: false,
      skillRouting: false,
      requestTimeoutMs: null,
      injectBudgetTokens: null,
    },
    // 连接三字段。apiKey 永远只是「这次要提交的新 key」，不回显旧值。
    conn: {
      serverUrl: "",
      apiKey: "",
      apiKeySet: false,
      peerPrefix: "",
      peerPrefixValid: true,
      peerPrefixTitle: "",
      apiKeyPlaceholder: apiKeyPlaceholder(false),
    },
    // 服务端确认过的召回投影（回滚目标）。
    layers: paintRecallConfig(null),
    // 控件此刻的值（下拉 / 提示词 / 打分服务草稿）。改了立刻提交。
    form: {
      recallGate: "off",
      queryMode: "last",
      rerank: "off",
      gateModel: "",
      rerankModel: "",
    },
    prompts: {
      gate: DEFAULT_GATE_PROMPT,
      decision: DEFAULT_GATE_DECISION_PROMPT,
      rerank: DEFAULT_RERANK_PROMPT,
      gateTouched: false,
      decisionTouched: false,
      rerankTouched: false,
    },
    // 打分服务的四个输入框（地址 / 模型 / 超时 / 密钥），键就是配置键（与手写面板的 DOM id 一致）。
    // 密钥那一格存的是掩码串（服务端只回掩码），空串 = 没配。
    draft: {},
    serviceResults: {},
    // 精排通道草稿（含没填完、不会被提交的行）。
    channels: [],
    channelTest: { pending: false, hidden: true, text: "" },
    // 宿主模型目录。
    models: { loaded: false, ok: false, models: [], error: "" },
    // peer 名单。
    peers: { list: [], loaded: false, error: "", pending: false },
    // 日志尾部。
    logs: { lines: [] },
    // 提示位。
    note: { text: "", bad: false },
    foot: "",
    // 正在编辑的那一格（刷新时不抢光标与内容）。
    focus: "",
  };

  // 首屏给空值，等 applyLayers 落地；初始化一次保证草稿键齐全。
  for (const service of SCORING_SERVICES) {
    for (const key of [service.urlKey, service.modelKey, service.timeoutKey, service.keyKey]) {
      state.draft[key] = "";
    }
    state.serviceResults[service.kind] = { tone: "", text: "", pending: false };
  }

  let noteTimer = null;
  function note(text, bad = false) {
    state.note.text = text || "";
    state.note.bad = Boolean(text) && Boolean(bad);
    if (noteTimer) clearTimeout(noteTimer);
    if (!text) return;
    noteTimer = schedule(() => {
      state.note.text = "";
      state.note.bad = false;
    }, NOTE_TIMEOUT_MS);
  }

  function setFocus(id) {
    state.focus = id || "";
  }

  /* ---------------- 读 ---------------- */

  function applyControls(out) {
    if (!out) return;
    if (typeof out.enabled === "boolean") state.controls.enabled = out.enabled;
    if (typeof out.probe === "boolean") state.controls.probe = out.probe;
    if (typeof out.skillRouting === "boolean") state.controls.skillRouting = out.skillRouting;
    if (out.requestTimeoutMs != null) state.controls.requestTimeoutMs = out.requestTimeoutMs;
    if (out.injectBudgetTokens != null) state.controls.injectBudgetTokens = out.injectBudgetTokens;
  }

  function applyConnection(conn) {
    if (!conn) return;
    if (state.focus !== "peerPrefix") state.conn.peerPrefix = conn.peerPrefix || "";
    if (conn.peerPrefixValid === false) warnDirtyPrefix(conn.peerPrefix);
    else state.conn.peerPrefixValid = true;
  }

  // 存量前缀是脏的（比如早先手填的「主力机」）：说清它不会生效，而不是默默留着。
  function warnDirtyPrefix(prefix, extra = "") {
    const shown = String(prefix || "");
    state.conn.peerPrefixValid = false;
    state.conn.peerPrefixTitle = PREFIX_TITLE(shown);
    note(PREFIX_WARN(shown, extra), true);
  }

  function renderStatus(data, latencyMs) {
    state.status.raw = data || null;
    state.status.latencyMs = latencyMs;
    state.status.readError = "";
    state.status.view = statusView(data, latencyMs, "");
    state.status.checksSummary = summarizeChecks(state.status.view.checks);
    // 连接信息以 /status 为准（它同时带 apiKeySet / serverUrl）。
    // 正在改地址时不回写，否则一次刷新会把输入到一半的字换掉。
    if (state.focus !== "serverUrl") state.conn.serverUrl = state.status.view.serverUrl;
    state.conn.apiKeySet = state.status.view.apiKeySet;
    state.conn.apiKeyPlaceholder = state.status.view.apiKeyPlaceholder;
  }

  function renderPeers(payload) {
    state.peers.loaded = true;
    // null（请求本身失败）和 ok:false（服务端读不到）都是同一种结果。
    if (!payload || payload.ok === false) {
      state.peers.list = [];
      state.peers.error = String(payload?.error || "读不到 peer 列表");
      return;
    }
    state.peers.list = Array.isArray(payload.peers) ? payload.peers : [];
    state.peers.error = "";
  }

  function renderProbe(payload) {
    state.logs.lines = Array.isArray(payload?.lines) ? payload.lines : [];
  }

  function renderModels(payload) {
    const ok = Boolean(payload && payload.ok !== false && Array.isArray(payload.models));
    state.models.loaded = true;
    state.models.ok = ok;
    state.models.models = ok ? payload.models : [];
    state.models.error = ok ? "" : String(payload?.error || "读不到模型目录");
  }

  const FORM_KEYS = ["recallGate", "queryMode", "rerank", "gateModel", "rerankModel"];

  /**
   * 服务端投影 → 控件值。
   *
   * 只回写、不重算：存下什么就显示什么（脏值已经在 paintRecallConfig 收敛）。
   * 三种格子跳过，别让一次服务端回包抹掉用户手上的草稿：
   *   - 正在编辑的那一格（state.focus）；
   *   - inline：这一单发出去时它就已经不在服务端回包里（飞行期间又改了），
   *     原样留着，下一单会把它带上——`inline` 就是发出时的快照；
   *   - 还没填完的服务对 / 通道行。
   */
  function applyLayers(next, inline = null) {
    const pending = state.channels.filter((channel) => !isCompleteRerankChannel(channel));
    const changedInFlight = (key, live) =>
      Boolean(inline) && live !== (inline[key] === undefined ? "" : inline[key]);

    state.layers = paintRecallConfig(next);

    for (const key of FORM_KEYS) {
      if (changedInFlight(key, state.form[key])) continue;
      state.form[key] = state.layers[key];
    }

    // 三份提示词各画各的：拼错的键不影响别人，刷新也不会把用户手上那份盖掉。
    for (const spec of Object.values(PROMPTS)) {
      if (state.focus === spec.field) continue;
      if (changedInFlight(spec.field, state.prompts[spec.key])) continue;
      state.prompts[spec.key] = spec.draft(
        state.layers[spec.field],
        state.prompts[`${spec.key}Touched`],
      );
    }

    for (const service of SCORING_SERVICES) {
      const half = servicePairHalfFilled(service);
      for (const key of [service.urlKey, service.modelKey, service.timeoutKey, service.keyKey]) {
        if (state.focus === key) continue;
        // 半对只管地址与模型；密钥、超时跟它们不成对，照常回写。
        if (key !== service.timeoutKey && key !== service.keyKey && half) continue;
        if (changedInFlight(key, draftOf(key))) continue;
        if (key === service.keyKey) {
          // 密钥框里坐的是掩码（服务端只回掩码）：这也正是「没改过」的判据。
          state.draft[key] = state.layers[key] || "";
          continue;
        }
        state.draft[key] =
          key === service.timeoutKey
            ? serviceTimeoutInput(state.layers[key], service.kind)
            : state.layers[key] || "";
      }
    }

    state.channels = [...state.layers.rerankChannels, ...pending];
  }

  /** 本地的这一对是不是半对（正在填的草稿）：半对不发服务端，等填齐再整对提交。 */
  function servicePairHalfFilled(service) {
    return Boolean(draftOf(service.urlKey).trim()) !== Boolean(draftOf(service.modelKey).trim());
  }

  function draftOf(key) {
    const value = state.draft[key];
    return typeof value === "string" ? value : String(value ?? "");
  }

  /**
   * 一个服务字段的 change 提交：清空一半时把另一半也清掉，结果行收掉，
   * 然后走整单提交（半对留在界面上继续编辑）。
   */
  function setServiceField(key, value) {
    state.draft[key] = value;
    const partner = servicePartnerOf(key);
    if (partner && !draftOf(key).trim()) state.draft[partner] = "";
    const kind = serviceKindOfField(key);
    state.serviceResults[kind] = { tone: "", text: "", pending: false };
    return saveLayers();
  }

  /**
   * 密钥框的提交：与其它三格不同，清空不提交。
   *
   * 聚焦时输入框里的掩码会被清掉（跟设置页的 API Key 同一套习惯），如果空字符串
   * 也当成一次提交，那么「点进去看一眼」就等于把已存的 key 删了。所以：空 → 把掩码
   * 填回去、什么也不发；非空 → 照常整单提交（等于掩码时服务端也不动）。
   */
  function setServiceKey(key, value) {
    if (!String(value ?? "").trim()) {
      state.draft[key] = String(state.layers[key] || "");
      return undefined;
    }
    return setServiceField(key, String(value).trim());
  }

  /**
   * 整单提交 /recall-mode。
   *
   * 一次只发一单：请求还在飞的时候又改了一格，就记一笔、等上一单收笔后再发，
   * 不把这次改动丢掉。
   */
  let layersPending = false;
  let layersDirty = false;

  function readLayers() {
    const scoring = {};
    for (const service of SCORING_SERVICES) {
      // 打分服务：原样发，合法性由服务端整单校验；被拒就整组回滚。
      // 半对停在本地草稿里，两边填齐后一次提交（服务端两个方向都要求成对）。
      Object.assign(scoring, readServicePair(service));
      // 超时收成数字或 null，与服务端投影同形：否则「没改」与「改了」比不出来。
      scoring[service.timeoutKey] = normalizeServiceTimeout(
        draftOf(service.timeoutKey),
        service.kind,
      );
      // 密钥：空着就发已确认的掩码（= 没改），绝不发空串——空串在服务端是「清空」。
      // 只有这样，"聚焦清空掩码 → 去改别的格" 才不会顺手把密钥删掉。
      scoring[service.keyKey] = draftOf(service.keyKey).trim() || state.layers[service.keyKey] || "";
    }
    return {
      recallGate: state.form.recallGate,
      queryMode: state.form.queryMode,
      // 两份判据分开存、分开提交：改一份不会动另一份，切档也不丢内容。
      gatePrompt: normalizeGatePrompt(state.prompts.gate),
      gateDecisionPrompt: normalizeGateDecisionPrompt(state.prompts.decision),
      gateModel: state.form.gateModel,
      rerank: state.form.rerank,
      rerankPrompt: normalizeRerankPrompt(state.prompts.rerank),
      rerankModel: state.form.rerankModel,
      // 没填完的行不提交；服务端只认完整通道，整单校验会直接 400。
      rerankChannels: state.channels.filter(isCompleteRerankChannel),
      ...scoring,
    };
  }

  /** 读一对服务字段：两边都有或两边都空才提交，半对留在界面上继续编辑。 */
  function readServicePair(service) {
    const url = draftOf(service.urlKey).trim();
    const model = draftOf(service.modelKey).trim();
    if (Boolean(url) !== Boolean(model)) return {};
    return { [service.urlKey]: url, [service.modelKey]: model };
  }

  async function saveLayers() {
    if (layersPending) {
      layersDirty = true;
      return;
    }
    layersPending = true;
    try {
      do {
        layersDirty = false;
        const next = readLayers();
        // 已经跟确认过的值一致：不用再发（失败回滚后就走到这里）。
        if (sameLayers(next, state.layers)) break;
        await commitLayers({
          before: state.layers,
          next,
          send: (body) => {
            const { rerankChannels, ...rest } = body;
            return post("/recall-mode", {
              ...rest,
              rerankChannels: rerankChannelsText(rerankChannels),
            });
          },
          // inline 是这一单发出去的值：回包落地时，凡是已经和它不一样的格子
          // 都是飞行期间新改的，必须留着等下一单，不能被回包盖掉。
          apply: (layers) => applyLayers(layers, next),
          flash: note,
          // llm 的提示词、判断模型与精排通道也在同一单里；失败时整组一起回滚。
          normalize: paintRecallConfig,
        });
      } while (layersDirty);
    } finally {
      layersPending = false;
      layersDirty = false;
    }
  }

  const LAYER_KEYS = [
    "recallGate",
    "queryMode",
    "gatePrompt",
    "gateDecisionPrompt",
    "gateModel",
    "rerank",
    "rerankPrompt",
    "rerankModel",
    "rerankChannels",
    ...SCORING_SERVICES.flatMap((service) => [
      service.urlKey,
      service.modelKey,
      service.timeoutKey,
      service.keyKey,
    ]),
  ];

  function sameLayers(a, b) {
    return LAYER_KEYS.every((key) =>
      key === "rerankChannels"
        ? rerankChannelsText(a?.[key]) === rerankChannelsText(b?.[key])
        : a?.[key] === b?.[key],
    );
  }

  async function saveConnection() {
    const body = {};
    const url = state.conn.serverUrl.trim();
    if (url) body.serverUrl = url;
    const key = state.conn.apiKey.trim();
    if (key) body.apiKey = key;
    body.peerPrefix = state.conn.peerPrefix.trim();
    if (!Object.keys(body).length) return;

    try {
      const out = await post("/conn", body);
      if (out?.ok === false) throw new Error(out.error || "保存失败");
      state.conn.apiKey = "";
      state.conn.apiKeySet = Boolean(out?.apiKeySet);
      state.conn.apiKeyPlaceholder = apiKeyPlaceholder(state.conn.apiKeySet);
      // 服务端回的是存后的真实状态：未变化且非法的存量值会被原样放行，这里得说出来。
      // 脏前缀被放行了，但别的事确实存下去了：一句话里两件都要说清。
      if (out?.peerPrefixValid === false) {
        warnDirtyPrefix(out.peerPrefix, "（其余设置已保存）");
      } else {
        state.conn.peerPrefixValid = true;
        state.conn.peerPrefixTitle = "";
        note("连接信息已保存");
      }
      await refresh();
    } catch (error) {
      note(String(error?.message || error), true);
    }
  }

  /** 下拉 / 模型选择：改了就整单提交（没有保存按钮）。 */
  function setForm(key, value) {
    state.form[key] = value;
    return saveLayers();
  }

  /**
   * 超时 / 预算：空着或不是数字都不提交，保留服务端上次确认的值。
   *
   * 手写版直接 Number("")，清空输入框会提交 0（服务端再夹到下限 200）。
   * 那不是任何一个行为清单里的语义，是取值的意外，这里按「还没填完」处理。
   */
  function setControlsNumber(key, raw) {
    const text = String(raw ?? "").trim();
    if (!text) return undefined;
    const value = Number(text);
    if (!Number.isFinite(value)) return undefined;
    return patchControls({ [key]: value });
  }

  async function patchControls(body) {
    try {
      const out = await post("/controls", body);
      if (out?.ok === false) throw new Error(out.error || "写入失败");
      applyControls(out);
      note("已保存");
    } catch (error) {
      note(String(error?.message || error), true);
    }
  }

  /**
   * 开关：乐观改，失败退回，成功以服务端回的整组为准。
   *
   * next 可以显式给（naive-ui 的 n-switch 回传新值）；不给就按当前状态取反
   * （原生 role="switch" 的按钮只报“被点了”）。
   */
  async function flip(key, next) {
    const before = state.controls[key] === true;
    const target = typeof next === "boolean" ? next : !before;
    if (target === before) return;
    state.controls[key] = target; // 乐观
    try {
      const out = await post("/controls", { [key]: target });
      if (out?.ok === false) throw new Error(out.error || "写入失败");
      applyControls(out);
      note("已保存");
      // 总闸决定整页状态（可达性 / 门牌 / 检查项），切完重新读一遍。
      if (key === "enabled") await refresh();
    } catch (error) {
      state.controls[key] = before;
      note(String(error?.message || error), true);
    }
  }

  // 面板打开时多读一次目录；它失败只影响模型下拉的候选，不阻断其它区块。
  let modelsLoading = false;
  async function loadModels() {
    if (modelsLoading) return;
    modelsLoading = true;
    try {
      renderModels(await get("/models"));
    } catch (error) {
      renderModels({ ok: false, error: String(error?.message || error) });
    } finally {
      modelsLoading = false;
    }
  }

  /**
   * 整页读一遍。各块独立降级：/probe、/conn、/peers、/recall-mode 读不到
   * 只影响各自那一块，不把整页状态拖下水。
   */
  async function refresh(opts = {}) {
    const started = now();
    try {
      const sid = await sessionKey();
      const statusPath = sid ? `/status?session=${encodeURIComponent(sid)}` : "/status";
      // 模型目录单独读、不 await：它慢或失败只影响「自选模型」，不拖住整页。
      loadModels();
      const [status, probe, ctrl, conn, peers, layerOut] = await Promise.all([
        get(statusPath),
        get("/probe").catch(() => ({ lines: [] })),
        get("/controls").catch(() => null),
        get("/conn").catch(() => null),
        get("/peers").catch(() => null),
        get("/recall-mode").catch(() => null),
      ]);
      renderStatus(status, Math.max(0, Math.round(now() - started)));
      renderPeers(peers);
      renderProbe(probe);
      if (ctrl) applyControls(ctrl);
      applyConnection(conn);
      // 读不到就留上一次的值，不把下拉刷成空。
      if (layerOut) applyLayers(layerOut);
      state.status.readError = "";
      state.foot = readFootText(new Date());
      if (opts.note) note(opts.note, false);
    } catch (error) {
      const message = String(error?.message || error);
      state.status.readError = message;
      state.status.view = statusView(state.status.raw, state.status.latencyMs, message);
      state.status.checksSummary = summarizeChecks([]);
      state.foot = message;
    }
  }

  /* ---------------- 打分服务的连通性测试 ---------------- */

  /**
   * 拿输入框里此刻的值真打一发打分服务。
   *
   * 不发已保存的配置：填了还没保存的组合也要能先试。服务端只读这个请求体，
   * 不碰任何状态，所以点多少次都不会把配置写成半截。
   */
  async function testService(kind) {
    const service = scoringServiceOf(kind);
    if (!service) return;
    const result = state.serviceResults[kind];
    if (!result || result.pending) return;

    const draft = {
      url: draftOf(service.urlKey),
      model: draftOf(service.modelKey),
      timeoutMs: draftOf(service.timeoutKey),
      key: draftOf(service.keyKey),
    };
    const body = serviceTestBody(kind, draft);

    // 没填全就没有可测的东西：直接显示「先填地址和模型」，不发请求。
    // 填了但不合法（比如漏了 http://）仍然发：服务端会回一句具体的拒绝理由。
    if (!serviceTestReady(draft)) {
      state.serviceResults[kind] = { ...serviceTestView(null), pending: false };
      return;
    }

    state.serviceResults[kind] = { tone: "muted", text: `正在请求 ${body.url}…`, pending: true };
    try {
      const out = await post("/recall-mode/service-test", body);
      if (!out || typeof out !== "object") throw new Error("服务端没有返回结果");
      state.serviceResults[kind] = { ...serviceTestView(out, body.model), pending: false };
    } catch (error) {
      state.serviceResults[kind] = {
        tone: "bad",
        text: `不可用 · ${String(error?.message || error)}`,
        pending: false,
      };
    }
  }

  async function testChannels() {
    if (state.channelTest.pending) return;
    state.channelTest = {
      pending: true,
      hidden: false,
      text: "正在用这个会话最近一轮的真实候选测试…",
    };
    try {
      const sid = await sessionKey();
      if (!sid) throw new Error("当前会话还没绑定，先打开一次对话再试");
      // 先落盘当前编辑，再用服务端刚存下的通道跑；失败会由 saveLayers 自己回滚。
      await saveLayers();
      const out = await post("/recall-mode/test", { session: sid });
      if (!out || out.ok === false) throw new Error(out?.error || "测试失败");
      state.channelTest = { pending: false, hidden: false, text: formatChannelTest(out) };
    } catch (error) {
      state.channelTest = {
        pending: false,
        hidden: false,
        text: `测试失败：${String(error?.message || error)}`,
      };
    }
  }

  /* ---------------- 精排通道 ---------------- */

  function channelTypeChoices() {
    return channelTypeOptions(state.layers);
  }

  function addChannel() {
    if (state.channels.length >= RERANK_CHANNELS_MAX) return;
    // 新行默认用当前可选的第一类；两个服务都没配时按钮已禁用。
    const firstType = channelTypeChoices()[0]?.value || "model";
    state.channels = [...state.channels, emptyRerankChannel(firstType)];
    return saveLayers();
  }

  function updateChannel(index, patch) {
    const current = state.channels[index];
    if (!current) return;
    state.channels[index] = { ...current, ...patch };
    return saveLayers();
  }

  function removeChannel(index) {
    if (!state.channels[index]) return;
    state.channels.splice(index, 1);
    state.channels = [...state.channels];
    return saveLayers();
  }

  /** 权重：非数字退回原值；数字收敛到 0.1 ~ 10。 */
  function setChannelWeight(index, raw) {
    const current = state.channels[index];
    if (!current) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(10, Math.max(0.1, parsed));
    return updateChannel(index, { weight: clamped });
  }

  /** 超时：留空 = 用该类型的默认值；非数字退回；数字收敛到 200 ~ 该类型上限。 */
  function setChannelTimeout(index, raw) {
    const ceiling = state.channels[index]?.type === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000;
    const current = state.channels[index];
    if (!current) return;
    const text = String(raw ?? "").trim();
    if (!text) {
      const next = { ...current };
      delete next.timeoutMs;
      state.channels[index] = next;
      return saveLayers();
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(ceiling, Math.max(200, Math.floor(parsed)));
    return updateChannel(index, { timeoutMs: clamped });
  }

  /** 一行通道此刻的展示数据：可选类型、是否不可用、配对说明、超时边界。 */
  function channelView(channel, index) {
    const choices = channelTypeChoices();
    const options = [...choices];
    // 存量通道的类型可能已不在可选范围内（服务被清空）：把当前值留住，别让下拉变空。
    if (!options.some((option) => option.value === channel?.type)) {
      options.push({
        value: channel?.type,
        label: `${RERANK_CHANNEL_LABELS[channel?.type] || channel?.type}（服务未配置）`,
      });
    }
    return {
      index,
      channel,
      options,
      unavailable: channelServiceMissing(channel, state.layers),
      title: `通道 ${index + 1}`,
      // 配对说明拿「服务端确认过的打分服务」当配置：草稿里填了一半时，
      // 运行时那一对其实还没生效。
      pairNote: channelPairNote(channel, state.layers),
      timeoutCeiling: channel?.type === "systemone" ? SYSTEMONE_TIMEOUT_MAX : 30000,
      timeoutPlaceholder: String(RERANK_CHANNEL_TIMEOUT_DEFAULTS[channel?.type] ?? 800),
    };
  }

  /* ---------------- peer 名单 ---------------- */

  async function togglePeer(name) {
    if (state.peers.pending) return;
    const before = state.peers.list;
    const current = before.find((peer) => peer?.name === name);
    if (!current || current.self) return;

    const next = before.map((peer) =>
      peer?.name === name ? { ...peer, excluded: !peer.excluded } : peer,
    );

    state.peers.pending = true;
    state.peers.list = next; // 乐观：先让那一行变成目标状态
    try {
      const out = await post("/peers", {
        excluded: next.filter((peer) => peerExcluded(peer)).map((peer) => peer.name),
      });
      if (!out || out.ok === false) throw new Error(out?.error || "写入失败");
      // 写路径不回读列表：按服务端实际存下的名单重算本地标记（大小写敏感），
      // 不重新渲染 peers 数组，下一次 refresh() 才去读 /peers。
      const saved = Array.isArray(out.excluded) ? out.excluded : [];
      state.peers.list = state.peers.list.map((peer) => ({
        ...peer,
        excluded: saved.includes(peer?.name),
      }));
      note("排除名单已更新");
    } catch (error) {
      state.peers.list = before; // 失败回滚到点击前
      note(String(error?.message || error), true);
    } finally {
      state.peers.pending = false;
    }
  }

  /* ---------------- 提示词 ---------------- */

  /** 提示词状态小字：默认 / 已修改 / 空（不拦截）。 */
  function gatePromptStatusOf() {
    return promptStatus(state.prompts.gate);
  }

  /** 决策判据的状态小字：与 gatePrompt 同一套三态，只是坐的是另一格。 */
  function decisionPromptStatusOf() {
    return decisionPromptStatus(state.prompts.decision);
  }

  function rerankPromptStatusOf() {
    return rerankPromptStatus(state.prompts.rerank);
  }

  /** 用户动过提示词之后，刷新不再拿默认文案去盖他（包括他故意清空的那次）。 */
  function touchPrompt(which, value) {
    const spec = PROMPTS[which];
    if (!spec) return;
    state.prompts[`${spec.key}Touched`] = true;
    state.prompts[spec.key] = value;
  }

  /**
   * 恢复默认：只把文字填回框里，然后走正常提交，不绕过校验也不偷写配置。
   * 三份各恢复各的默认值（语言模型 / 决策模型 / 重排），不会互相写。
   */
  function resetPrompt(which) {
    const spec = PROMPTS[which];
    if (!spec) return undefined;
    touchPrompt(spec.key, spec.default);
    return saveLayers();
  }

  function setPrompt(which, value) {
    const spec = PROMPTS[which];
    if (!spec) return undefined;
    state.prompts[spec.key] = value;
    return saveLayers();
  }

  /* ---------------- 组件的便捷投影 ---------------- */

  const enabled = () => state.controls.enabled !== false;

  function peerRows() {
    return state.peers.list.map((peer) => ({
      peer,
      name: peer?.name || "",
      meta: peerMetaText(peer),
      title: peerTitle(peer),
      self: Boolean(peer?.self),
      excluded: peerExcluded(peer),
      tappable: peerTappable(peer),
    }));
  }

  function modelChoices(current) {
    const base = state.models.ok
      ? [DEFAULT_MODEL_OPTION, ...modelOptions(state.models.models)]
      : [DEFAULT_MODEL_OPTION];
    return withStoredOption(base, current);
  }

  function modelHint() {
    if (!state.models.loaded) return "正在读取模型目录…";
    if (!state.models.ok) {
      return `模型目录不可用：${state.models.error || "读不到"}。现在只能用默认模型。`;
    }
    if (state.models.models.length === 0) return "宿主没有可用模型，只能用默认模型。";
    return "";
  }

  function peerCountText() {
    return state.peers.list.length ? `${state.peers.list.length} 个` : "";
  }

  function peerEmptyText() {
    if (!state.peers.loaded) return "正在读取";
    if (state.peers.error) return PEER_UNREADABLE;
    return PEER_EMPTY;
  }

  function peerHintVisible() {
    return state.peers.list.some((peer) => peer && !peer.self);
  }

  return {
    get state() {
      return state;
    },
    /** 只给响应式外壳用：把 state 换成 reactive 代理（见文件头注释）。 */
    replaceState(next) {
      state = next;
      return state;
    },
    note,
    setFocus,
    applyControls,
    applyLayers,
    refresh,
    flip,
    patchControls,
    setForm,
    setControlsNumber,
    saveConnection,
    saveLayers,
    setServiceField,
    setServiceKey,
    testService,
    testChannels,
    addChannel,
    updateChannel,
    removeChannel,
    setChannelWeight,
    setChannelTimeout,
    channelView,
    channelTypeChoices,
    togglePeer,
    touchPrompt,
    setPrompt,
    resetPrompt,
    gatePromptStatusOf,
    decisionPromptStatusOf,
    rerankPromptStatusOf,
    enabled,
    peerRows,
    peerCountText,
    peerEmptyText,
    peerHintVisible,
    modelChoices,
    modelHint,
    // 只读的小工具，组件里偶尔用得到
    logChips: () => logChips(state.logs.lines),
    logBody: () => logBodyText(state.logs.lines),
  };
}

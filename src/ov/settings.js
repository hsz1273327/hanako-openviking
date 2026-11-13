// 配置读取层。
//
// 铁律：所有开关在"使用的那一刻"从 sdk.config 现读，不在加载时缓存。
// 因此设置页里点一下关，下一轮立刻生效，不用重载 App。

import fs from "node:fs";
import path from "node:path";
import {
  CAPTURE_PROMPT_RETIRED_DEFAULTS,
  DEFAULT_CAPTURE_CONSISTENCY_PROMPT,
  DEFAULT_CAPTURE_FORMAT,
  DEFAULT_CAPTURE_TEMPLATE,
  CAPTURE_TOPIC_QUESTION,
  DEFAULT_GATE_PROMPT,
  DEFAULT_RERANK_PROMPT,
  DEFAULT_RECALL_PREAMBLE,
  DEFAULT_RERANK_SYSTEMONE_PROMPT,
  GATE_PROMPT_RETIRED_DEFAULTS,
} from "./prompt-defaults.js";

/**
 * 决策模型判断的默认题面（不是提示词模板）。
 *
 * 与 gatePrompt 的默认值不一样：那一条空串 = 用内置默认题面，这一条默认给一句完整问法，
 * 因为决策模型的题型固定是 choice + criteria（两条内置描述写在 src/memory/recall.js 的
 * DECISION_GATE_CRITERIA 里），用户能改的只是「题面」怎么问，不是判定标准。
 * 空串 = 用内置默认题面（与 gatePrompt / gateContextPrompt 同一规则）；要关掉判断请切
 * recallGate，不要靠清空这一格。
 *
 * 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 里存了逐字相同的一份，
 * 冒烟会比对两边。
 */
export const DEFAULT_GATE_DECISION_PROMPT =
  "只看这一句话、不看之前的对话，够不够回答它？";

/**
 * 带前文模式专用题面：模型能看到最近几轮对话，问的是「上面那几轮里有没有」。
 *
 * 空串 = 用内置默认题面（与 gatePrompt 同一规则）；要关掉判断请切 recallGate / gateContext，
 * 不要靠清空这一格。
 */
export const DEFAULT_GATE_CONTEXT_PROMPT =
  "这句话要的信息，上面的对话里有吗？还是要翻更早的记录？";

/**
 * 决策模型判断时看不看前文：none 只看最后一条，turns 带最近几轮对话。
 * 不带前文是默认，行为与加这个配置之前完全一致。
 */
export const GATE_CONTEXT_MODES = Object.freeze(["none", "turns"]);

/** 带前文时默认带几轮；边界与步长只用于面板，归一化不夹边界。 */
export const GATE_CONTEXT_TURNS_DEFAULT = 4;
export const GATE_CONTEXT_TURNS_MIN = 1;
export const GATE_CONTEXT_TURNS_MAX = 12;
export const GATE_CONTEXT_TURNS_STEP = 1;

/**
 * 决策模型判断的召回门槛：choice 是 need 且 confidence 不低于这个数才算「需要召回」。
 *
 * 0.45 是从 16 条样例上拟合出来的，不是某个客观常数：换一个决策模型、换一批对话风格，
 * 最优阈值就会变。而且两个方向的错代价不同——漏召回用户立刻觉得「你怎么不记得」，
 * 误召回只是多查一次，所以这个取舍交给用户，代码不再替他定。
 */
export const GATE_DECISION_THRESHOLD_DEFAULT = 0.45;

/** 门槛的边界与输入步长。步长只影响面板上的加减手感，不是归一化要圆整到的格点。 */
export const GATE_DECISION_THRESHOLD_MIN = 0;
export const GATE_DECISION_THRESHOLD_MAX = 1;
export const GATE_DECISION_THRESHOLD_STEP = 0.05;

/**
 * 召回查询的字数上限：context 档从最近一轮往回想拼，累计到这个字数就停手。
 *
 * 为什么要有：OpenViking 的 /api/v1/search/search 耗时随查询长度线性上升
 * （本机实测 9 字 76ms、1350 字 3274ms、4500 字 13320ms，约 2.3ms/字）。
 * 600 字约 1.4 秒，落在召回超时（默认 5000ms）之内还留足余量。
 * 旧实现在 300 字处按字符截断，会把最旧那一句切成半句；现在改成整轮边界。
 */
export const QUERY_CHARS_DEFAULT = 600;
export const QUERY_CHARS_MIN = 100;
export const QUERY_CHARS_MAX = 8000;

/**
 * 召回请求自己的超时。
 *
 * 与 requestTimeoutMs（通用默认 1500）分开：那一个是「连不上就短路」的安全阀，
 * 召回这一跳扛着查询文本去服务端做检索 + 组装，实测 2272 字要 5 秒。
 * 用通用超时去掐它，结果就是整轮 recalled:0，日志里还看不出是超时。
 * 精排那三个服务超时（SERVICE_TIMEOUT_LIMITS）是另一个东西，不受这一项影响。
 */
export const RECALL_TIMEOUT_DEFAULT = 5000;
export const RECALL_TIMEOUT_MIN = 500;
export const RECALL_TIMEOUT_MAX = 30000;

/**
 * 精排的保留条数上限：合并后按分降序，只留前 N 条。
 *
 * 0 是「不限」的写法，不是「一条都不留」：留空 / 0 / 非数字 / 越界一律落到 0，
 * 也就是保留加这一项之前的行为（只按分数取舍，不按条数截）。缺省（从没配过）给 5。
 *
 * 为什么不把越界值夹回边界：把 25 夹成 20 会让「填错了」静默变成一个具体的数；
 * 回落到不限更好查——探针里 kept 与 droppedByKeep 摆在一起，上限有没有生效一眼就看得出来。
 * 面板另存一份逐字相同的常量，见 ui-src/src/lib/recall-layers.js。
 */
export const RERANK_KEEP_DEFAULT = 5;
export const RERANK_KEEP_MIN = 1;
export const RERANK_KEEP_MAX = 20;
export const RERANK_KEEP_STEP = 1;

/**
 * 近重复的阈值：比对基准上字符 3-gram 的 Jaccard 相似度 ≥ 这个值就算同一段内容。
 *
 * 默认 0.6。范围夹在 0.5–1.0：低于 0.5 时两句只是碰巧用词相近的话就会合到一起，
 * 高于 1 没有意义（1 就是字面完全一样，那一档已经由精确去重做掉了）。
 * 越界不夹回边界，一律回默认值：夹成 0.5 会把「填错了」静默变成「最激进地合并」，
 * 反而比回默认更难查。
 *
 * 为什么不是 0.8：比的是每条记忆的 # Summary 段（没 Summary 就取前 300 字），不是全文。
 * 一两百字的概括之间，0.6 才分得开「同一件事提了两遍」与「两件事都跟这次提问相关」；
 * 全文口径下 0.8 实际只在逐字复制时才触发。取基准的规则见 src/memory/assemble.js 的 dedupeBasisOf。
 *
 * 已存的显式值不被这个默认值覆写：归一化只处理「读到的值」，读到的 0.8 仍然是 0.8。
 */
export const DEDUPE_THRESHOLD_DEFAULT = 0.6;
export const DEDUPE_THRESHOLD_MIN = 0.5;
export const DEDUPE_THRESHOLD_MAX = 1;
/** 步长只影响数字框的加减手感，不是归一化要圆整到的格点。 */
export const DEDUPE_THRESHOLD_STEP = 0.05;

/** 提前提交时的两种判断方式。 */
export const CAPTURE_EARLY_JUDGES = Object.freeze(["llm", "discriminator"]);

/** 候选池作用域：会话内只看本会话提到过的话题，全局看整张表。 */
export const CAPTURE_TOPIC_SCOPES = Object.freeze(["session", "global"]);

/** 候选池上限：默认 8，范围 1–20。 */
export const CAPTURE_TOPIC_CANDIDATES_DEFAULT = 8;
export const CAPTURE_TOPIC_CANDIDATES_MIN = 1;
export const CAPTURE_TOPIC_CANDIDATES_MAX = 20;
export const CAPTURE_TOPIC_CANDIDATES_STEP = 1;

/** 提交策略的语义版本。空串 = 从没写过（老配置）；保存成功后写 2。 */
export const CAPTURE_COMMIT_SCHEMA = 2;

/** 固定轮次档的默认值、边界与面板步长。 */
export const CAPTURE_COMMIT_TURNS_DEFAULT = 12;
export const CAPTURE_COMMIT_TURNS_MIN = 1;
export const CAPTURE_COMMIT_TURNS_MAX = 100;
export const CAPTURE_COMMIT_TURNS_STEP = 1;

/**
 * 提前提交打开时，判断回看的轮数与最少触发轮数。
 * captureCommitTurns 是「攒够就交」的强制线，与提前提交无关。
 */
export const CAPTURE_CONTEXT_TURNS_DEFAULT = 3;
export const CAPTURE_CONTEXT_TURNS_MIN = 1;
export const CAPTURE_CONTEXT_TURNS_MAX = 20;
export const CAPTURE_CONTEXT_TURNS_STEP = 1;
export const CAPTURE_MIN_TURNS_DEFAULT = 2;
export const CAPTURE_MIN_TURNS_MIN = 1;
export const CAPTURE_MIN_TURNS_MAX = 50;
export const CAPTURE_MIN_TURNS_STEP = 1;

/** 服务端兜底空闲秒数的默认值、边界与面板步长。 */
export const CAPTURE_IDLE_SECONDS_DEFAULT = 600;
export const CAPTURE_IDLE_SECONDS_MIN = 60;
export const CAPTURE_IDLE_SECONDS_MAX = 86400;

export const DEFAULTS = {
  enabled: false,
  serverUrl: "http://127.0.0.1:8000",
  apiKey: "",
  peerPrefix: "",
  mergeMemory: false,
  autoRecall: true,
  autoCapture: true,
  // 提交策略语义版本：空串 = 从没写过（老配置）；保存成功后写 2。
  captureCommitSchema: "",
  captureEarlyCommit: false,
  captureEarlyJudge: "llm",
  captureTopicScope: "session",
  captureTopicCandidates: CAPTURE_TOPIC_CANDIDATES_DEFAULT,
  captureCommitTurns: CAPTURE_COMMIT_TURNS_DEFAULT,
  captureContextTurns: CAPTURE_CONTEXT_TURNS_DEFAULT,
  captureMinTurns: CAPTURE_MIN_TURNS_DEFAULT,
  captureServerFallback: false,
  captureServerIdleSeconds: CAPTURE_IDLE_SECONDS_DEFAULT,
  captureModel: "",
  // 写回判断题面：空串 = 用内置那句默认问法（见 src/memory/capture.js）。
  capturePrompt: "",
  // 提前提交第一步（一致性判断）的题面：空串 = 内置默认。
  captureConsistencyPrompt: "",
  captureTemplate: "",
  // 记忆搜索总开关：只停读这一半，写回不受影响。
  recallEnabled: true,
  readOnly: false,
  recallPeerScope: "all",
  requestTimeoutMs: 1500,
  recallTimeoutMs: RECALL_TIMEOUT_DEFAULT,
  injectBudgetTokens: 2500,
  queryChars: QUERY_CHARS_DEFAULT,
  skillRouting: true,
  probe: true,
  excludedPeers: "",
  recallGate: "off",
  gateFallback: "recall",
  queryMode: "last",
  gatePrompt: "",
  gateDecisionPrompt: DEFAULT_GATE_DECISION_PROMPT,
  gateContext: "turns",
  gateContextTurns: GATE_CONTEXT_TURNS_DEFAULT,
  gateContextPrompt: DEFAULT_GATE_CONTEXT_PROMPT,
  gateDecisionThreshold: GATE_DECISION_THRESHOLD_DEFAULT,
  gateModel: "",
  // 近重复检测：纯算法（每条记忆的 # Summary 段上算字符 3-gram 的 Jaccard），不调模型。默认开着，
  // 关掉就只剩精确去重（uri 相同 / 去掉空白后字面相同）。
  dedupeNear: true,
  dedupeThreshold: DEDUPE_THRESHOLD_DEFAULT,
  rerank: "off",
  // 精排保留条数上限。缺省 5；存 0 / 空串 / 脏值都读成「不限」（见 normalizeRerankKeep）。
  rerankKeep: RERANK_KEEP_DEFAULT,
  assembleMode: "rules",
  recallWrapMode: "tag",
  // 召回注入块的前言：空串 = 内置默认。只在真的注入了记忆时出现。
  recallPreamble: "",
  rerankPrompt: "",
  // 判别模型（systemone）那一路的题面。空串 = 用内置那句默认问法。
  rerankSystemonePrompt: "",
  // 存量兜底模型的标识。界面不再显示、运行时不读，只在读取通道时用来补一条 model 通道。
  rerankModel: "",
  // 精排通道配置的语义版本。空串 = 从没写过（老配置）：模型那一路的 enabled 当年是
  // 读写两侧硬写成 true 的，不代表用户的选择。默认放空串而不是 "2"：read() 用它填缺失，
  // 填成 2 就再也看不出「这份配置没迁移过」。
  rerankLaneSchema: "",
  rerankChannels: "",
  rerankServiceUrl: "",
  rerankServiceModel: "",
  rerankServiceTimeoutMs: "",
  rerankServiceKey: "",
  systemoneServiceUrl: "",
  systemoneServiceModel: "",
  systemoneServiceTimeoutMs: "",
  systemoneServiceKey: "",
};

/** 提示词键：内置默认（含历史默认）。写时归一与启动迁移共用这一份。 */
const PROMPT_DEFAULT_VALUES = Object.freeze({
  capturePrompt: Object.freeze([CAPTURE_TOPIC_QUESTION, ...CAPTURE_PROMPT_RETIRED_DEFAULTS]),
  captureConsistencyPrompt: Object.freeze([DEFAULT_CAPTURE_CONSISTENCY_PROMPT]),
  captureTemplate: Object.freeze([DEFAULT_CAPTURE_TEMPLATE]),
  captureFormat: Object.freeze([DEFAULT_CAPTURE_FORMAT]),
  gatePrompt: Object.freeze([DEFAULT_GATE_PROMPT, ...GATE_PROMPT_RETIRED_DEFAULTS]),
  gateContextPrompt: Object.freeze([DEFAULT_GATE_CONTEXT_PROMPT]),
  rerankPrompt: Object.freeze([DEFAULT_RERANK_PROMPT]),
  gateDecisionPrompt: Object.freeze([DEFAULT_GATE_DECISION_PROMPT]),
  rerankSystemonePrompt: Object.freeze([DEFAULT_RERANK_SYSTEMONE_PROMPT]),
  recallPreamble: Object.freeze([DEFAULT_RECALL_PREAMBLE]),
});

/** 写入前归一：值等于内置默认就存空串，其余原样（不 trim、不截断、不做类型转换）。 */
export function promptForStorage(key, raw) {
  const defaults = PROMPT_DEFAULT_VALUES[key] || [];
  return typeof raw === "string" && defaults.includes(raw) ? "" : raw;
}

const LEGACY_PROMPT_MARKER_FILE = "prompt-defaults.json";

/**
 * 清掉旧版留下的标记文件。无状态检查不需要它，但跑过旧版的机器上可能还留着一份。
 * 删不掉只 warn：留着也不影响任何逻辑，下次装载再试。
 */
function removeLegacyPromptMarker(sdk) {
  const dataDir = typeof sdk?.dataDir === "string" ? sdk.dataDir.trim() : "";
  if (!dataDir) return;
  const file = path.join(dataDir, LEGACY_PROMPT_MARKER_FILE);
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    try {
      sdk.logger?.warn?.(`openviking prompt marker cleanup failed: ${error?.message || error}`);
    } catch {
      /* 日志不能影响调用方 */
    }
  }
}

/**
 * 无状态清理：盘上存着与内置默认（含历史默认）逐字相同的提示词值 → 写成空串。
 *
 * 每次调用都从头扫六个键，不写标记、不记版本、没有「只扫一次」的短路。
 * 只处理非空字符串；null / {} / 空串一律不动。单个键失败只 warn，不影响其它键。
 * 返回值是本次真正被改写的键；第二次跑同样的配置自然是空数组，幂等。
 *
 * 挂 agent/before-start 与 provider/before-request：设置贡献要等 apply 之后才登记，
 * 装载阶段读不到配置；这两个钩子都在那之后，且不是只读路由。
 */
export async function migratePromptDefaults(sdk) {
  removeLegacyPromptMarker(sdk);
  const changed = [];
  for (const [key, defaults] of Object.entries(PROMPT_DEFAULT_VALUES)) {
    try {
      const value = await sdk.config.get(key);
      if (typeof value !== "string" || !value) continue;
      if (!defaults.includes(value)) continue;
      await sdk.config.set(key, "");
      changed.push(key);
    } catch (error) {
      try {
        sdk.logger?.warn?.(
          `openviking prompt migration failed for ${key}: ${error?.message || error}`,
        );
      } catch {
        /* 日志不能影响配置迁移 */
      }
    }
  }
  return changed;
}

/** 钩子入口：自己吞错，只负责迁移与日志。 */
export async function runPromptMigration(sdk) {
  try {
    const migrated = await migratePromptDefaults(sdk);
    if (migrated.length) {
      sdk.logger?.info?.(`openviking prompts migrated to empty: ${migrated.join(", ")}`);
    }
  } catch (error) {
    sdk.logger?.warn?.(`openviking prompt migration failed: ${error?.message || error}`);
  }
}

/**
 * 召回判断（四档，界面文案见 ui-src/src/lib/recall-layers.js 的 RECALL_GATE_LABELS）：
 *   off      关闭，每轮都召回
 *   rules    规则判断，只跳过极短的纯操作指令
 *   llm      语言模型判断：让宿主的生成式模型回答「要不要查」
 *   decision 决策模型判断：让决策模型（/v1/systemone）在 need / standalone 之间选一个
 *
 * 后两者不是同一条路数：一个生成文本，一个只出概率。混用一个枚举名会把区别抹掉。
 * 第四档要有决策服务才有意义，所以归一化时按服务是否配好回退，见 resolveRecallGate。
 */
export const RECALL_GATES = Object.freeze(["off", "rules", "llm", "decision"]);

/**
 * 判断失败时的兜底（只对 llm / decision 两档有意义）：
 *   recall 照常召回（默认，保守；判断失败不能变成漏召回）
 *   rules  退到规则判断跑一遍，规则说跳过才跳过
 *
 * off / rules 自己就是判据，不依赖外部服务，没有失败路径，这一项对它们不生效。
 * 判据本身没有变（≤8 字、无问号、无疑问词、无指代词），变的只是「什么时候用它」。
 */
export const RECALL_GATE_FALLBACKS = Object.freeze(["recall", "rules"]);

/** 召回查询：last 只用最后一句，context 拼最近几条用户文本。 */
export const QUERY_MODES = Object.freeze(["last", "context"]);

/** 结果精排：off 原样注入，llm 按 rerankChannels 跑配置好的通道。 */
export const RERANK_MODES = Object.freeze(["off", "llm"]);

/**
 * 组装：精排之后、拼成一段上下文之前的那一步。
 *
 *   off    原样拼，与加这一层之前逐字一致
 *   rules  按来源去重、按分数精排，再交给 memoryBlock 按预算裁剪
 *
 * 只有两档。模型档（让模型合并重写这一段）还没做，所以不留空枚举值：
 * 一个选了不生效的档位，比看不到这一档更难查。
 * 认不出的值归一化回 rules：去重与精排不花时间，默认开着是纯收益。
 */
export const ASSEMBLE_MODES = Object.freeze(["off", "rules"]);

/**
 * 注入包装形态。默认 tag：与加这一项之前完全一致。
 *
 * system 不是文本包装，而是注入位置（system prompt），但放在同一个下拉里：
 * 用户选的是“这段记忆以什么身份出现”，不是两个独立开关。
 */
export const RECALL_WRAP_MODES = Object.freeze([
  "tag",
  "codeblock",
  "document",
  "json",
  "plain",
  "system",
]);

/**
 * 精排通道类型：语言模型（宿主模型）、判别模型（llama.cpp systemone）、rerank 模型（OpenAI 兼容 rerank）。
 *
 * 三种类型各最多一条。界面上是三条固定的路，顺序固定为 判别模型 → rerank 模型 → 语言模型，
 * 见 RERANK_LANE_ORDER；配置里的枚举顺序只是存量数据的写法，不代表执行顺序。
 */
export const RERANK_CHANNEL_TYPES = Object.freeze(["rerank", "systemone", "model"]);

/**
 * 靠打分服务的那两种路（判别模型 / rerank 模型）。
 *
 * 注意它不等于「主路」：运行时的主路是「当前启用的所有路」，语言模型拨开也算在里面。
 * 这个常量只用来拼展示顺序（两种服务路在前、兜底在后）与判断服务配置。
 */
export const RERANK_SERVICE_CHANNEL_TYPES = Object.freeze(["systemone", "rerank"]);

/** 兜底那一路：主路全部失败或全部弃权时必定被调一次。它不可关，永远排在最后。 */
export const RERANK_FALLBACK_CHANNEL_TYPE = "model";
/**
 * 三条路固定的展示顺序：判别模型 → rerank 模型 → 语言模型。
 *
 * 面板里另存一份逐字相同的常量（ui-src/src/lib/recall-layers.js），冒烟比对两边。
 */
export const RERANK_LANE_ORDER = Object.freeze([
  ...RERANK_SERVICE_CHANNEL_TYPES,
  RERANK_FALLBACK_CHANNEL_TYPE,
]);

/**
 * 这一轮兜底有没有被叫上来（探针里字段就叫 fallback）：
 *
 *   none   主路成功，没触发兜底
 *   model  主路垮了（全失败 / 全弃权 / 一条主路都没启用），走了兜底
 *
 * 只有两个值：兜底本身不可关，所以不存在「该兜底但没兜」这个状态。
 * 兜底跑了但自己也失败是另一回事（候选原样保留），由日志那一句与探针的 channels 说明。
 */
export const RERANK_FALLBACK_NONE = "none";
export const RERANK_FALLBACK_MODEL = "model";
export const RERANK_FALLBACK_VALUES = Object.freeze([
  RERANK_FALLBACK_NONE,
  RERANK_FALLBACK_MODEL,
]);

/**
 * 通道数组的存量上限。每种类型只留一条，所以真实能跑的永远不超过三条；
 * 这个数只用来挡住「一整串脏数据」这种写法，读取与写入两侧都按它截。
 */
export const RERANK_CHANNELS_MAX = 8;

/** 权重边界。合并时按 Σ(score×weight) / Σ(weight) 算，只统计成功的通道。 */
export const RERANK_WEIGHT_MIN = 0.1;
export const RERANK_WEIGHT_MAX = 10;

/** 通道字段的存留上限。名称只是显示用，URL / 模型标识按与其它配置同口径收敛。 */
export const RERANK_CHANNEL_NAME_MAX = 64;
export const RERANK_CHANNEL_URL_MAX = 512;

/** 打分服务的模型名上限。服务名与通道模型名同一口径。 */
export const SERVICE_MODEL_MAX = 128;

/**
 * 打分服务密钥的长度上限。留空合法（服务端没开鉴权）。
 *
 * 上限只防「把一整段配置粘进来」：Authorization 头的实际长度各家服务都远低于这个数，
 * 512 足够放下任何真实 key，又不至于让一单配置把日志 / 请求头撑爆。
 */
export const SERVICE_KEY_MAX = 512;

/**
 * 打分服务超时的边界。单位是毫秒，给的是「一次打分请求」的上限，不是整轮召回。
 *
 * fallback 是留空时的默认值：精排一份候选一次往返，800 够；决策服务一次问完全部
 * 候选、每问一次都是前向，所以给到 3500。越界的值不夹到边界上，而是回默认值——
 * 用户把 99999 填进来通常是想「别超时」，悄悄夹成 10000 会让原因更难查。
 */
export const SERVICE_TIMEOUT_LIMITS = Object.freeze({
  // rerank 的 fallback 从 800 抬到 2500：实测十条候选配一条长查询要 965ms，800 会让
  // 主路每轮都超时、一律落到兜底。800 只在候选很少且查询很短时才够。
  rerank: Object.freeze({ min: 100, max: 10000, fallback: 2500 }),
  // 运行时 systemoneTimeoutFor 的硬上限也是 8000：配置允许更大的值只会被压回去，
  // 所以写入侧直接对齐，不让两个数字打架。
  systemone: Object.freeze({ min: 100, max: 8000, fallback: 3500 }),
});

/** 两类打分服务的名字。路由与界面按它取边界，认不出来的一律按精排那组。 */
export const SERVICE_KINDS = Object.freeze(["rerank", "systemone"]);

function serviceLimits(kind) {
  return SERVICE_TIMEOUT_LIMITS[kind] || SERVICE_TIMEOUT_LIMITS.rerank;
}

/** 自定义提示词上限。超过这个长度的存量值在读取侧截断，POST 侧整单拒绝。 */
export const GATE_PROMPT_MAX = 2000;

/** 精排提示词上限，与判断提示词同一口径。 */
export const RERANK_PROMPT_MAX = 2000;

/**
 * 写回判断题面的上限：与召回那两段提示词同一口径（同一个数，不另编一套限制）。
 *
 * 声明必须放在 GATE_PROMPT_MAX 之后：这里直接引用它，提前会踩 TDZ。
 * 面板另存一份逐字相同的常量，见 ui-src/src/lib/capture-view.js。
 */
export const CAPTURE_PROMPT_MAX = GATE_PROMPT_MAX;

/** 题面骨架模板的字符上限：比题面宽一些，够写完整的五段式。 */
export const CAPTURE_TEMPLATE_MAX = 4000;

/** 答案格式的字符上限：同样宽一点，够写字段说明与示例。 */
export const CAPTURE_FORMAT_MAX = 4000;

/** 召回前言的长度上限：一段背景说明，不需要写成小作文。 */
export const RECALL_PREAMBLE_MAX = 1000;

/** 枚举值收敛：不认识的、缺省的、类型不对的一律回默认值。 */
function oneOf(raw, allowed, fallback) {
  return typeof raw === "string" && allowed.includes(raw) ? raw : fallback;
}

export function normalizeRecallGate(raw) {
  return oneOf(raw, RECALL_GATES, DEFAULTS.recallGate);
}

/** 非法值（含缺省、类型不对）一律归一化回 recall：宁可多召回，也不静默少召回。 */
export function normalizeGateFallback(raw) {
  return oneOf(raw, RECALL_GATE_FALLBACKS, DEFAULTS.gateFallback);
}

export function normalizeQueryMode(raw) {
  return oneOf(raw, QUERY_MODES, DEFAULTS.queryMode);
}

/**
 * 召回查询的字数上限归一化：100–8000 的整数，其余一律回默认 600。
 *
 * 越界不夹边界，理由与 normalizeGateContextTurns 相同：夹成 100 会把「填错了」
 * 静默变成「永远只拼一小段」，比回默认更难查。数字串接受，读出来是数字。
 */
export function normalizeQueryChars(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return QUERY_CHARS_DEFAULT;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return QUERY_CHARS_DEFAULT;
  if (value < QUERY_CHARS_MIN || value > QUERY_CHARS_MAX) return QUERY_CHARS_DEFAULT;
  return value;
}

/**
 * 写回判断题面：空串 = 用内置那句默认问法，非空按字符截断到 CAPTURE_PROMPT_MAX。
 *
 * 与 normalizeGatePrompt 同一口径，只是上限常量换成写回那一份；不 trim——
 * 用户那句原样留着，判空是运行时（buildClassifier）的事。
 */
export function normalizeCaptureTemplate(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, CAPTURE_TEMPLATE_MAX).join("");
}

export function normalizeCaptureFormat(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, CAPTURE_FORMAT_MAX).join("");
}

export function normalizeCapturePrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, CAPTURE_PROMPT_MAX).join("");
}

/** 提前提交开关：只认布尔 true，其余一律关。 */
export function normalizeCaptureEarlyCommit(raw) {
  return raw === true;
}

/** 提前提交的判断方式：只认两种，脏值回语言模型。 */
export function normalizeCaptureEarlyJudge(raw) {
  return oneOf(raw, CAPTURE_EARLY_JUDGES, "llm");
}

/** 话题作用域：只认会话内 / 全局，脏值回会话内（候选少，判断更稳）。 */
export function normalizeCaptureTopicScope(raw) {
  return oneOf(raw, CAPTURE_TOPIC_SCOPES, "session");
}

/** 候选池上限：数字或数字串 → 1–20 的整数（四舍五入后夹边界）。 */
export function normalizeCaptureTopicCandidates(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return CAPTURE_TOPIC_CANDIDATES_DEFAULT;
  if (!Number.isFinite(value)) return CAPTURE_TOPIC_CANDIDATES_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(
    CAPTURE_TOPIC_CANDIDATES_MAX,
    Math.max(CAPTURE_TOPIC_CANDIDATES_MIN, rounded),
  );
}

/** 写进配置的形状：数字串。 */
export function serializeCaptureTopicCandidates(raw) {
  return String(normalizeCaptureTopicCandidates(raw));
}

/** 这份提交策略是不是老语义（三档、没有提前提交开关）？ */
export function captureCommitSchemaIsLegacy(raw) {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value)) return true;
  return value < CAPTURE_COMMIT_SCHEMA;
}

/** 读出来的版本号：老语义一律当 2 用（迁移已经在读侧做完）。 */
export function normalizeCaptureCommitSchema(raw) {
  if (captureCommitSchemaIsLegacy(raw)) return CAPTURE_COMMIT_SCHEMA;
  return Math.trunc(Number(raw));
}

/** 写回配置的形状：一律存数字串。 */
export function serializeCaptureCommitSchema(raw) {
  return String(normalizeCaptureCommitSchema(raw));
}

/**
 * 固定轮次归一化：数字或数字串 → 1–100 的整数（四舍五入后夹边界）。
 *
 * 这一档与别处的「越界回默认」不同：这里存的是一个「多少轮算够」的阈值，
 * 夹边界至少仍是用户想表达的「更早 / 更晚提交」；留空 / 非数字才回默认 12。
 */
export function normalizeCaptureCommitTurns(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return CAPTURE_COMMIT_TURNS_DEFAULT;
  if (!Number.isFinite(value)) return CAPTURE_COMMIT_TURNS_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(CAPTURE_COMMIT_TURNS_MAX, Math.max(CAPTURE_COMMIT_TURNS_MIN, rounded));
}

/** 写进配置的形状：数字串（与门槛 / 保留条数同一口径）。 */
export function serializeCaptureCommitTurns(raw) {
  return String(normalizeCaptureCommitTurns(raw));
}

/** 判据回看的轮数：数字或数字串 → 1–20 的整数（四舍五入后夹边界）。 */
export function normalizeCaptureContextTurns(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return CAPTURE_CONTEXT_TURNS_DEFAULT;
  if (!Number.isFinite(value)) return CAPTURE_CONTEXT_TURNS_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(CAPTURE_CONTEXT_TURNS_MAX, Math.max(CAPTURE_CONTEXT_TURNS_MIN, rounded));
}

/** 写进配置的形状：数字串。 */
export function serializeCaptureContextTurns(raw) {
  return String(normalizeCaptureContextTurns(raw));
}

/** 两档判断的最少触发轮数：数字或数字串 → 1–50 的整数（四舍五入后夹边界）。 */
export function normalizeCaptureMinTurns(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return CAPTURE_MIN_TURNS_DEFAULT;
  if (!Number.isFinite(value)) return CAPTURE_MIN_TURNS_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(CAPTURE_MIN_TURNS_MAX, Math.max(CAPTURE_MIN_TURNS_MIN, rounded));
}

/** 写进配置的形状：数字串。 */
export function serializeCaptureMinTurns(raw) {
  return String(normalizeCaptureMinTurns(raw));
}

/** 兜底空闲秒数归一化：数字或数字串 → 60–86400 的整数（四舍五入后夹边界）。 */
export function normalizeCaptureIdleSeconds(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return CAPTURE_IDLE_SECONDS_DEFAULT;
  if (!Number.isFinite(value)) return CAPTURE_IDLE_SECONDS_DEFAULT;
  const rounded = Math.round(value);
  return Math.min(CAPTURE_IDLE_SECONDS_MAX, Math.max(CAPTURE_IDLE_SECONDS_MIN, rounded));
}

/** 写进配置的形状：数字串。 */
export function serializeCaptureIdleSeconds(raw) {
  return String(normalizeCaptureIdleSeconds(raw));
}

/**
 * 这个判断方式现在缺什么配置。返回空数组表示不缺。
 *
 * llm 永远不缺：宿主辅助模型（utility）就是这个判断方式的默认实现，captureModel
 * 留空走的就是它。把它算成「缺配置」会让默认状态永远打不开提前提交，而提交时刻的
 * 补归类同一条路又照常走 utility，自相矛盾。
 *
 * discriminator 必须显式配好：服务地址与模型都沿用精排页「决策服务」那一组
 * 「决策服务」配置：/v1/systemone 是这个仓库里唯一接判别模型的地方。
 * 传 "fixed" 是给老调用方留的口子：提前提交关着时没有判断方式，当然不缺。
 */
export function captureModeMissing(switches, judge) {
  if (judge === "fixed") return [];
  const value = normalizeCaptureEarlyJudge(judge);
  if (value === "llm") return [];
  const missing = [];
  if (!String(switches?.systemoneServiceUrl ?? "").trim()) missing.push("systemoneServiceUrl");
  if (!String(switches?.systemoneServiceModel ?? "").trim()) {
    missing.push("systemoneServiceModel");
  }
  return missing;
}

/** 召回超时归一化：500–30000 的整数毫秒，其余一律回默认 5000。 */
export function normalizeRecallTimeoutMs(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return RECALL_TIMEOUT_DEFAULT;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return RECALL_TIMEOUT_DEFAULT;
  if (value < RECALL_TIMEOUT_MIN || value > RECALL_TIMEOUT_MAX) return RECALL_TIMEOUT_DEFAULT;
  return value;
}

/** 判断前文：只认 none / turns，其余（缺项、类型不对、脏值）一律回 none。 */
export function normalizeGateContext(raw) {
  return oneOf(raw, GATE_CONTEXT_MODES, DEFAULTS.gateContext);
}

export function normalizeRerank(raw) {
  return oneOf(raw, RERANK_MODES, DEFAULTS.rerank);
}

export function normalizeAssembleMode(raw) {
  return oneOf(raw, ASSEMBLE_MODES, DEFAULTS.assembleMode);
}

/** 包装形态：认不出的值一律回 tag，不改变现有行为。 */
export function normalizeRecallWrapMode(raw) {
  return oneOf(raw, RECALL_WRAP_MODES, DEFAULTS.recallWrapMode);
}

/** 前言读侧归一：非字符串 / 空 → 空串（= 用内置默认），否则按字符截断。 */
export function normalizeRecallPreamble(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, RECALL_PREAMBLE_MAX).join("");
}

/** 运行时用哪一段前言：trim 后为空就用内置默认；自定义文案保留内部换行。 */
export function resolveRecallPreamble(raw) {
  const value = normalizeRecallPreamble(raw).trim();
  return value || DEFAULT_RECALL_PREAMBLE;
}

/**
 * 近重复开关的归一化：只认布尔（以及存成字串的 "true" / "false"），其余回默认开。
 *
 * 认不出的值回「开」而不是回「关」：这一层不花时间、不联网，漏掉重复的代价是
 * 白占精排名额，比多合一条的代价更难发现。
 */
export function normalizeDedupeNear(raw) {
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return DEFAULTS.dedupeNear;
}

/**
 * 近重复阈值的归一化：0.5–1.0 之间（含两端）给数字，其余一律回默认值。
 *
 * 数字串接受（与门槛 / 超时同一口径），读出来是数字。
 * 已存的显式值（比如早先手填的 0.8）原样返回，不被默认值覆写；
 * 只有空串 / 非数字 / 越界才落到 DEDUPE_THRESHOLD_DEFAULT。
 * 越界不夹边界，理由见 DEDUPE_THRESHOLD_DEFAULT 那段注释。
 */
export function normalizeDedupeThreshold(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return DEDUPE_THRESHOLD_DEFAULT;
  if (!Number.isFinite(value)) return DEDUPE_THRESHOLD_DEFAULT;
  if (value < DEDUPE_THRESHOLD_MIN || value > DEDUPE_THRESHOLD_MAX) {
    return DEDUPE_THRESHOLD_DEFAULT;
  }
  return value;
}

/** 写回配置的形状：一律存归一化后的数字串（与门槛 / 保留条数同一口径）。 */
export function serializeDedupeThreshold(raw) {
  return String(normalizeDedupeThreshold(raw));
}

/**
 * 保留条数归一化：1–20 的整数给数字，0 表示不限。
 *
 * 缺省（undefined = 从没配过）回默认 5；其余非法的（空串 / 0 / 小数 / 负数 / 越界 /
 * 类型不对）一律回 0 = 不限。这两种「不生效」要分开：没配过是没意见，填错了是填错了，
 * 而两者都不该变成「一条都不留」。
 */
export function normalizeRerankKeep(raw) {
  if (raw === undefined) return RERANK_KEEP_DEFAULT;
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return 0;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return 0;
  if (value < RERANK_KEEP_MIN || value > RERANK_KEEP_MAX) return 0;
  return value;
}

/** 写回配置的形状：一律存数字串（与门槛 / 超时同一口径，0 = 不限）。 */
export function serializeRerankKeep(raw) {
  return String(normalizeRerankKeep(raw));
}

/** 提示词按字符截断，不把代理对切成两半。空串表示“没有提示词，不拦截”。 */
export function normalizeGatePrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
}

/** 决策模型的判据与 gatePrompt 同口径：同一份长度上限，空串在运行时 = 用内置默认题面。 */
export function normalizeGateDecisionPrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
}

/** 带前文模式那套题面与 gatePrompt 同一份长度上限；空串在运行时 = 用内置默认题面。 */
export function normalizeGateContextPrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, GATE_PROMPT_MAX).join("");
}

/**
 * 带前文的轮数：1–12 的整数，其余（空串 / 非数字 / 小数 / 越界 / null）一律回 4。
 *
 * 越界不夹边界，理由与 normalizeGateDecisionThreshold 相同：夹边界会把「填错了」
 * 静默变成「永远带 1 轮 / 12 轮」，比直接回默认更难查。数字串接受，读出来是数字。
 */
export function normalizeGateContextTurns(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return GATE_CONTEXT_TURNS_DEFAULT;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return GATE_CONTEXT_TURNS_DEFAULT;
  if (value < GATE_CONTEXT_TURNS_MIN || value > GATE_CONTEXT_TURNS_MAX) {
    return GATE_CONTEXT_TURNS_DEFAULT;
  }
  return value;
}

/** 写回配置的形状：一律存归一化后的数字串（与门槛 / 超时同一口径）。 */
export function serializeGateContextTurns(raw) {
  return String(normalizeGateContextTurns(raw));
}

/**
 * 召回门槛的归一化：0–1 之间（含两端）给数字，其余一律回 0.45。
 *
 * 越界的值不夹到边界上：夹成 0 或 1 会让「我填错了」静默变成「永远查 / 永远不查」
 * 两个极端之一，比直接回默认更难查。空串也回默认——Number("") 是 0，那不是用户的意思。
 * 数字串接受（配置里可能被人手写成 "0.6"），读出来统一是数字。
 */
export function normalizeGateDecisionThreshold(raw) {
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && raw.trim()) value = Number(raw.trim());
  else return GATE_DECISION_THRESHOLD_DEFAULT;
  if (!Number.isFinite(value)) return GATE_DECISION_THRESHOLD_DEFAULT;
  if (value < GATE_DECISION_THRESHOLD_MIN || value > GATE_DECISION_THRESHOLD_MAX) {
    return GATE_DECISION_THRESHOLD_DEFAULT;
  }
  return value;
}

/** 写回配置的形状：一律存归一化后的数字串（与 serviceTimeout 同一口径，非法值存 "0.45"，不留脏值）。 */
export function serializeGateDecisionThreshold(raw) {
  return String(normalizeGateDecisionThreshold(raw));
}

/** 精排提示词与判断提示词同口径：空串表示“用内置默认模板”。 */
export function normalizeRerankPrompt(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return Array.from(raw).slice(0, RERANK_PROMPT_MAX).join("");
}

/** 判别模型的题面与精排提示词同一口径（同一个长度上限，空串 = 用内置那句默认问法）。 */
export const normalizeRerankSystemonePrompt = normalizeRerankPrompt;

/** 模型标识的单项上限。与 APPS.md 里可调用模型标识的边界一致。 */
export const MODEL_REF_PART_MAX = 128;

/**
 * 判断模型的标识：`provider/model`，空串表示用宿主辅助模型。
 *
 * 形状不对的存量值一律当空（回到 default 通道），不剪字符去硬凑：
 * 把一个写错的标识改成一个看着像真的的标识，比直接忽略更难排查。
 */
export function normalizeGateModel(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  const cut = value.indexOf("/");
  if (cut <= 0) return "";
  const provider = value.slice(0, cut);
  const model = value.slice(cut + 1);
  if (!provider || !model) return "";
  if (Array.from(provider).length > MODEL_REF_PART_MAX) return "";
  if (Array.from(model).length > MODEL_REF_PART_MAX) return "";
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return "";
  return `${provider}/${model}`;
}

/** 精排模型与 gateModel 同形：复用同一份解析。 */
export const normalizeRerankModel = normalizeGateModel;

/** 通道 URL 只认 http / https；末尾斜杠在这里统一去掉，拼接端点时不会再出现双斜杠。 */
export function normalizeChannelUrl(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value || Array.from(value).length > RERANK_CHANNEL_URL_MAX) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";
  return value.replace(/\/+$/, "");
}

/**
 * 打分服务地址：与通道 URL 同口径（只认 http / https、去尾斜杠），非法值在读取侧
 * 收敛成空串（= 该服务未配置）。写入侧另有整单校验，非法值直接 400，不悄悄清空。
 */
export function normalizeServiceUrl(raw) {
  return normalizeChannelUrl(raw);
}

/** 打分服务的模型名：去空白后按字符截断。空串合法（有的服务只有一个模型）。 */
export function normalizeServiceModel(raw) {
  if (typeof raw !== "string") return "";
  return Array.from(raw.trim()).slice(0, SERVICE_MODEL_MAX).join("");
}

/**
 * 打分服务密钥：留空合法（= 该服务没开鉴权），非法值当没配。
 *
 * 换行（\n / \r）一律丢：拼进 Authorization 头会让底层 fetch 直接抛，
 * 而那个异常发生在「召回时」，用户看到的是一轮静默弃权而不是「密钥填错了」。
 * 这是读取侧的收敛，写入侧另有规则（非法值丢弃、保留原值，不打断整单）。
 */
export function normalizeServiceKey(raw) {
  if (typeof raw !== "string") return "";
  if (/[\r\n]/.test(raw)) return "";
  return Array.from(raw.trim()).slice(0, SERVICE_KEY_MAX).join("");
}

/**
 * 打分服务超时的归一化：合法值给数字，空串 / 非数字 / 越界给 null（= 用默认值）。
 *
 * 返回 null 而不是默认值，是为了让「没配」和「配了正好等于默认值」能区分开：
 * systemone 那一路在没配时要按候选数自适应，配了就不再自适应。
 */
export function normalizeServiceTimeout(raw, kind = "rerank") {
  const limits = serviceLimits(kind);
  const text =
    typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const ms = Math.floor(parsed);
  if (ms < limits.min || ms > limits.max) return null;
  return ms;
}

/** 读数：归一化拿不到数字时用该类型的默认值（精排 800 / 决策 3500）。 */
export function serviceTimeoutOrDefault(raw, kind = "rerank") {
  const value = normalizeServiceTimeout(raw, kind);
  return value === null ? serviceLimits(kind).fallback : value;
}

/** 写回配置的形状：合法值存数字串，非法值存空串（= 回默认值，不留非法值）。 */
export function serializeServiceTimeout(raw, kind = "rerank") {
  const value = normalizeServiceTimeout(raw, kind);
  return value === null ? "" : String(value);
}

/**
 * 地址与模型成对：两边要么都有，要么都空。
 *
 * 只看最终生效的那一对（请求体里的值叠在已存值上），所以一次提交里给全两个字段
 * 不会被拆成中间状态。只给模型不给地址同样拒绝：地址为空等于该服务未配置，
 * 孤立的模型名运行时会被整对回退静默忽略，不如在写入侧直接说清楚。
 *
 * 返回错误文案，null 表示这一对没问题。
 */
export function servicePairError(url, model, urlField, modelField) {
  const hasUrl = Boolean(normalizeServiceUrl(url));
  const hasModel = Boolean(normalizeServiceModel(model));
  if (hasUrl && !hasModel) {
    return `${urlField} 配了地址就要填模型名（${modelField}）`;
  }
  if (hasModel && !hasUrl) {
    return `${urlField} 配了模型名就要填地址`;
  }
  return null;
}

/**
 * 单项通道解析。返回 null 表示整项丢弃——字段出现了但形状不对就整项不要。
 *
 * 默认值只有两处，而且是任务书明确写下的：weight 缺省 1，enabled 缺省 true。
 * type 必须是三种之一。rerank / systemone 的 url 与 model 现在可以缺省：端点与模型
 * 由「打分服务」那组配置提供，通道自带的 url / model 仍然接受并优先使用（存量配置
 * 不失效）。model 类型的模型标识可以留空（空 = 宿主辅助模型），非空则必须形如
 * provider/model。
 */
export function parseRerankChannel(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const type = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!RERANK_CHANNEL_TYPES.includes(type)) return null;

  // name 可以缺省；一旦出现就必须是字符串，避免把数字 / 对象当显示名。
  if (raw.name !== undefined && typeof raw.name !== "string") return null;
  const name = typeof raw.name === "string"
    ? Array.from(raw.name.trim()).slice(0, RERANK_CHANNEL_NAME_MAX).join("")
    : "";

  if (raw.model !== undefined && typeof raw.model !== "string") return null;
  const model = typeof raw.model === "string" ? raw.model.trim() : "";

  let url = "";
  if (type === "model") {
    // 模型通道填 provider/model 或空；空走宿主辅助模型。
    if (model && !normalizeGateModel(model)) return null;
  } else {
    // url 缺省 = 用对应打分服务的地址；一旦出现就必须是合法的 http(s)。
    if (raw.url !== undefined && typeof raw.url !== "string") return null;
    const givenUrl = typeof raw.url === "string" ? raw.url.trim() : "";
    if (givenUrl) {
      url = normalizeChannelUrl(givenUrl);
      if (!url) return null;
    }
    if (model) {
      if (Array.from(model).length > MODEL_REF_PART_MAX) return null;
      if (/[\u0000-\u001f\u007f\s]/.test(model)) return null;
    }
  }

  let weight = 1;
  if (raw.weight !== undefined) {
    const parsed = Number(raw.weight);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < RERANK_WEIGHT_MIN || parsed > RERANK_WEIGHT_MAX) return null;
    weight = parsed;
  }

  // 可选：这一路自己的超时。缺省由调用方按类型给（rerank / systemone 800，model 1500）。
  let timeoutMs;
  if (raw.timeoutMs !== undefined) {
    const parsed = Number(raw.timeoutMs);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 30000) return null;
    timeoutMs = Math.floor(parsed);
  }

  let enabled = true;
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") return null;
    enabled = raw.enabled;
  }

  return {
    type,
    name,
    url,
    model: type === "model" ? (model ? normalizeGateModel(model) : "") : model,
    weight,
    // 语言模型那一路的 enabled 只管「要不要额外参与主路合并」，不决定兜底：
    // 它就是兜底，不参与主路也会在主路垮了之后被调一次。
    enabled,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

/**
 * 每种类型最多一条：同类型的重复项只留第一条，其余丢掉。
 *
 * 三条路是固定的（判别模型 → rerank 模型 → 语言模型），数组形态只为存量兼容保留。
 * 收敛在读与写两侧都做，不让「同一个类型两条」这种状态在配置里活下来。
 */
export function dedupeRerankChannels(list) {
  const out = [];
  const seen = new Set();
  for (const channel of Array.isArray(list) ? list : []) {
    if (!channel || typeof channel !== "object") continue;
    if (seen.has(channel.type)) continue;
    seen.add(channel.type);
    out.push(channel);
  }
  return out;
}

/** 精排通道配置的语义版本常量。见 rerankLaneSchemaIsLegacy。 */
export const RERANK_LANE_SCHEMA = 2;

/**
 * 这份精排通道配置是不是老语义（model 通道恒启用）？
 *
 *   ""（从没写过）/ 小于 2 / 认不出的值  老语义
 *   >= 2                              新语义（model 可开关，默认不进主路）
 *
 * 当年那一格是置灰的：用户在界面上没得选，所以配置里躺着的 enabled: true 不是他的意思。
 * 版本号是这件事的唯一凭据，不能用「enabled 是不是 true」推——用户迁移后主动拨开也是 true。
 */
export function rerankLaneSchemaIsLegacy(raw) {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value)) return true;
  return value < RERANK_LANE_SCHEMA;
}

/** 读出来的版本号：老语义一律当 2 用（迁移在内存里已经做完了，不往后拖）。 */
export function normalizeRerankLaneSchema(raw) {
  if (rerankLaneSchemaIsLegacy(raw)) return RERANK_LANE_SCHEMA;
  return Math.trunc(Number(raw));
}

/** 写回配置的形状：一律存数字串（与门槛 / 轮数 / 超时同一口径）。 */
export function serializeRerankLaneSchema(raw) {
  return String(normalizeRerankLaneSchema(raw));
}

/**
 * 老语义的通道表 -> 新语义：把 model 那一路的 enabled 压成 false。
 *
 * 只改 enabled，名字 / 地址 / 模型 / 权重点都不动：迁移只负责把一个「用户没选过的开关」
 * 归到它的默认位置，不替用户做别的决定。已经是新版本的配置原样返回。
 * 这不是「关掉兜底」：兜底跟这个开关无关，它永远在（见 runRerankChannels）。
 */
export function applyRerankLaneSchema(channels, legacy) {
  const list = Array.isArray(channels) ? channels : [];
  if (!legacy) return list;
  return list.map((channel) =>
    channel && channel.type === RERANK_FALLBACK_CHANNEL_TYPE ? { ...channel, enabled: false } : channel,
  );
}

/**
 * 存量迁移：老配置里的 rerankModel（兜底模型）并进通道表。
 *
 * 判据是「rerankModel 有值且没有 model 通道」——已经有 model 通道时那一路说了算，
 * 不再拿 rerankModel 去覆盖。补出来的通道与界面新建的一模一样（权重 1、不参与主路），
 * 所以补完之后运行时的行为与当年那一路兜底等价（当年那一路也从没参与过主路）。
 * rerankModel 这个键本身不删（用户配置里那份还在），只是读完这一次就不再被引用。
 */
export function migrateRerankChannels(channels, rerankModel) {
  const list = Array.isArray(channels) ? channels : [];
  const ref = normalizeRerankModel(rerankModel);
  if (!ref) return list;
  if (list.some((channel) => channel && channel.type === "model")) return list;
  return [...list, { ...defaultModelChannel(), model: ref }];
}

/**
 * 兜底那一条的默认形态：不需要任何服务配置，权重 1，不参与主路。
 *
 * 「不参与主路」是默认，因为主路能跑通时那一次 LLM 调用就是白花的；
 * 它作为兜底永远在，开关关着也会在主路垮了之后被调。
 */
export function defaultModelChannel() {
  return { type: "model", name: "", url: "", model: "", weight: 1, enabled: false };
}

/**
 * 语言模型那一路是精排的兜底，不可关：配置里没有 model 通道时补一条出来
 * （默认不参与主路）。
 *
 * 补在读取侧：存库的那份不动。用户把那一格的开关拨开之后，落库的是 `enabled: true`，
 * 于是「配置里没有 model 通道」只表示「从没拨过」，而不是「用户不要兜底」。
 * 这一条与 migrateRerankChannels 分开写：一个是存量兼容，一个是三条路的默认形态。
 */
export function ensureModelChannel(channels) {
  const list = Array.isArray(channels) ? channels : [];
  if (list.some((channel) => channel && channel.type === "model")) return list;
  return [...list, defaultModelChannel()];
}

/**
 * 配置里那份通道表 -> 这一轮真正要看的通道表：存量迁移 + 补上兜底那一条。
 *
 * readSwitches 与 /recall-mode 的投影共用这一份，面板与运行时就不会各看各的。
 */
export function projectRerankChannels(channels, rerankModel) {
  return ensureModelChannel(migrateRerankChannels(channels, rerankModel));
}

/**
 * rerankChannels 的读取侧解析：JSON 串 -> 通道数组。
 *
 * 非法 JSON / 不是数组：回空数组并记一条 warn。单项不完整：丢掉那一项。
 * 超过 8 路：只留前 8 路。warn 是可选的函数参数，测试与路由都能自己接。
 */
export function parseRerankChannels(raw, warn) {
  const report = typeof warn === "function" ? warn : () => {};
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    report("rerankChannels 不是合法 JSON，按空通道处理");
    return [];
  }
  if (!Array.isArray(parsed)) {
    report("rerankChannels 不是数组，按空通道处理");
    return [];
  }

  const out = [];
  const seen = new Set();
  for (const item of parsed) {
    const channel = parseRerankChannel(item);
    if (!channel) {
      report("rerankChannels 有一项字段不全，整项丢弃");
      continue;
    }
    if (seen.has(channel.type)) {
      report(`rerankChannels 有一项与前面的 ${channel.type} 通道重复，只留第一条`);
      continue;
    }
    seen.add(channel.type);
    out.push(channel);
    if (out.length >= RERANK_CHANNELS_MAX) {
      if (parsed.length > RERANK_CHANNELS_MAX) {
        report(`rerankChannels 超过 ${RERANK_CHANNELS_MAX} 路，只保留前 ${RERANK_CHANNELS_MAX} 路`);
      }
      break;
    }
  }
  return out;
}

/** 通道数组 -> 配置里那份 JSON 串。路由写入前用它把校验过的形状落库。 */
export function serializeRerankChannels(list) {
  const channels = Array.isArray(list) ? list : [];
  const normalized = dedupeRerankChannels(
    channels.map((item) => parseRerankChannel(item)).filter(Boolean),
  ).slice(0, RERANK_CHANNELS_MAX);
  return JSON.stringify(normalized);
}

/** 排除名单的单项形状：字母（大小写都认）、数字、点、下划线、连字符。 */
const EXCLUDED_PEER_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** 配置里最多记多少个 peer。与 POST /peers 的上限保持一致。 */
export const EXCLUDED_PEERS_MAX = 50;

/**
 * 把配置里的逗号串解析成 peer 名数组。
 *
 * 按逗号切、trim、去空、按大小写精确去重；形状不对的条目整条丢掉（不剪字符，
 * 否则 `../etc` 会被悄悄变成 `etc`，比忽略更难排查）。顺序按首次出现保留。
 *
 * 不折大小写：中枢目录名大小写敏感，折成小写会让 `Hermes` 这种 peer 读侧匹配不上。
 */
export function parseExcludedPeers(raw) {
  const text = typeof raw === "string" ? raw : "";
  const out = [];
  const seen = new Set();
  for (const part of text.split(",")) {
    const name = part.trim();
    if (!name || !EXCLUDED_PEER_RE.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= EXCLUDED_PEERS_MAX) break;
  }
  return out;
}

async function read(sdk, key) {
  try {
    const value = await sdk.config.get(key);
    return value === undefined || value === null ? DEFAULTS[key] : value;
  } catch {
    return DEFAULTS[key];
  }
}

export async function readSwitches(sdk) {
  // 决策服务的地址与模型先读出来：recallGate 的归一化要用它们当判据
  // （选了 decision 但服务没配 → off），与路由 GET / 面板投影同一份规则。
  const systemoneServiceUrl = normalizeServiceUrl(await read(sdk, "systemoneServiceUrl"));
  const systemoneServiceModel = normalizeServiceModel(await read(sdk, "systemoneServiceModel"));
  // 兜底模型的存量值先读出来：通道表要用它补那一条 model 通道，补完就不再用这个键。
  const rerankModel = normalizeRerankModel(await read(sdk, "rerankModel"));
  // 通道表的语义版本：老配置里 model 那一路的 enabled 是被硬写成 true 的，不是用户的选择。
  // 迁移只在这一层做（内存里），落库等下一次整单保存，见 routes/recall-mode.js。
  const rerankLaneSchemaRaw = await read(sdk, "rerankLaneSchema");
  const legacyLanes = rerankLaneSchemaIsLegacy(rerankLaneSchemaRaw);
  const captureModel = String((await read(sdk, "captureModel")) ?? "").trim();
  const captureChoice = { captureModel, systemoneServiceUrl, systemoneServiceModel };
  const captureCommitSchemaRaw = await read(sdk, "captureCommitSchema");
  const storedEarlyCommit = normalizeCaptureEarlyCommit(await read(sdk, "captureEarlyCommit"));
  const storedEarlyJudge = normalizeCaptureEarlyJudge(await read(sdk, "captureEarlyJudge"));
  // 旧键已删除：读不到就是没有，只按这两个键取默认值。
  // 判别服务没了就把「提前提交」读成关：存着的 discriminator 不再生效，界面必须看到关闭，
  // 不能静默退回 llm（那会换一种判断方式继续跑，用户以为还是判别模型）。
  const earlyJudge = storedEarlyJudge;
  const earlyCommit = {
    early: resolveCaptureEarlyCommit(storedEarlyCommit, earlyJudge, captureChoice),
    judge: earlyJudge,
  };
  const captureEarlyMissing = captureModeMissing(
    { ...captureChoice, captureEarlyCommit: earlyCommit.early, captureEarlyJudge: earlyCommit.judge },
    earlyCommit.judge,
  );
  // 最少触发轮数不能高于强制提交线：高于时提前提交永远轮不到（先被 min 挡住，
  // 到 forced 又直接走强制提交），留下一个「填了但永远不触发」的死角。
  // 读取侧取两者较小值：存量配置与只改一个键的半截提交都因此安全，不改盘上的原值；
  // 下一次整单保存会把投影里的安全值自然写回去。
  const captureCommitTurns = normalizeCaptureCommitTurns(await read(sdk, "captureCommitTurns"));
  const captureMinTurns = Math.min(
    normalizeCaptureMinTurns(await read(sdk, "captureMinTurns")),
    captureCommitTurns,
  );

  return {
    enabled: await read(sdk, "enabled"),
    autoRecall: await read(sdk, "autoRecall"),
    autoCapture: await read(sdk, "autoCapture"),
    // 写回：运行时只看提前提交与判断方式。
    captureCommitSchema: normalizeCaptureCommitSchema(captureCommitSchemaRaw),
    captureEarlyCommit: earlyCommit.early,
    captureEffectiveEarly: earlyCommit.early && captureEarlyMissing.length === 0,
    captureEarlyJudge: earlyCommit.judge,
    captureEarlyMissing,
    captureTopicScope: normalizeCaptureTopicScope(await read(sdk, "captureTopicScope")),
    captureTopicCandidates: normalizeCaptureTopicCandidates(
      await read(sdk, "captureTopicCandidates"),
    ),
    captureCommitTurns,
    captureContextTurns: normalizeCaptureContextTurns(await read(sdk, "captureContextTurns")),
    captureMinTurns,
    captureServerFallback: (await read(sdk, "captureServerFallback")) === true,
    captureServerIdleSeconds: normalizeCaptureIdleSeconds(
      await read(sdk, "captureServerIdleSeconds"),
    ),
    captureModel,
    // 写回判断题面：提前提交时共用这一句，空串 = 运行时不变量那句默认问法。
    // 读取路径不做转换：盘上是什么就读什么；默认值不落库由写入端与启动迁移负责。
    capturePrompt: normalizeCapturePrompt(await read(sdk, "capturePrompt")),
    // 一致性判断（提前提交第一步）的题面：与题面同一套读取口径，空串 = 内置默认。
    captureConsistencyPrompt: normalizeCapturePrompt(
      await read(sdk, "captureConsistencyPrompt"),
    ),
    // 题面骨架：空串 = 内置默认模板；少了 {{current}} 由运行时判无效并回退。
    captureTemplate: normalizeCaptureTemplate(await read(sdk, "captureTemplate")),
    // 答案格式：空串 = 内置默认；与题面 / 骨架同一套读取口径。
    captureFormat: normalizeCaptureFormat(await read(sdk, "captureFormat")),
    // 记忆搜索总开关：缺项时默认 true，与 DEFAULTS 一致。
    recallEnabled: (await read(sdk, "recallEnabled")) !== false,
    readOnly: await read(sdk, "readOnly"),
    skillRouting: await read(sdk, "skillRouting"),
    probe: await read(sdk, "probe"),
    recallGate: resolveRecallGate(await read(sdk, "recallGate"), {
      systemoneServiceUrl,
      systemoneServiceModel,
    }),
    gateFallback: normalizeGateFallback(await read(sdk, "gateFallback")),
    queryMode: normalizeQueryMode(await read(sdk, "queryMode")),
    gatePrompt: normalizeGatePrompt(await read(sdk, "gatePrompt")),
    gateDecisionPrompt: normalizeGateDecisionPrompt(await read(sdk, "gateDecisionPrompt")),
    gateContext: normalizeGateContext(await read(sdk, "gateContext")),
    gateContextTurns: normalizeGateContextTurns(await read(sdk, "gateContextTurns")),
    gateContextPrompt: normalizeGateContextPrompt(await read(sdk, "gateContextPrompt")),
    // 只在 decision 档生效；别的档读到了也不用（见 src/memory/recall.js 的调用处）。
    gateDecisionThreshold: normalizeGateDecisionThreshold(await read(sdk, "gateDecisionThreshold")),
    gateModel: normalizeGateModel(await read(sdk, "gateModel")),
    // 近重复：开关与阈值。阈值在精排之前用它判重，关掉就只剩精确去重。
    dedupeNear: normalizeDedupeNear(await read(sdk, "dedupeNear")),
    dedupeThreshold: normalizeDedupeThreshold(await read(sdk, "dedupeThreshold")),
    rerank: normalizeRerank(await read(sdk, "rerank")),
    // 0 = 不限。read() 把缺失项换成默认 5，所以「从没配过」与「填了空串」在这里分得开。
    rerankKeep: normalizeRerankKeep(await read(sdk, "rerankKeep")),
    assembleMode: normalizeAssembleMode(await read(sdk, "assembleMode")),
    recallWrapMode: normalizeRecallWrapMode(await read(sdk, "recallWrapMode")),
    // 注入前言：空串 = 内置默认；运行时用 resolveRecallPreamble 取实际文案。
    recallPreamble: normalizeRecallPreamble(await read(sdk, "recallPreamble")),
    rerankPrompt: normalizeRerankPrompt(await read(sdk, "rerankPrompt")),
    rerankSystemonePrompt: normalizeRerankSystemonePrompt(
      await read(sdk, "rerankSystemonePrompt"),
    ),
    rerankModel,
    // 读出来就是 2：迁移在内存里已经做完了，运行时与面板看到的都是新语义。
    rerankLaneSchema: normalizeRerankLaneSchema(rerankLaneSchemaRaw),
    // 迁移（老语义的 model 通道恒启用 -> 不参与主路）放在投影之后：rerankModel
    // 补出来的那一条同样要落到位，否则「当年那一路兜底」会凭空变成参与主路。
    rerankChannels: applyRerankLaneSchema(
      projectRerankChannels(
        parseRerankChannels(await read(sdk, "rerankChannels"), (message) => {
          try {
            sdk?.logger?.warn?.(`openviking ${message}`);
          } catch {
            /* 日志不能影响配置读取 */
          }
        }),
        rerankModel,
      ),
      legacyLanes,
    ),
    rerankServiceUrl: normalizeServiceUrl(await read(sdk, "rerankServiceUrl")),
    rerankServiceModel: normalizeServiceModel(await read(sdk, "rerankServiceModel")),
    // null = 没配（用默认值）；数字 = 用户配的那个。运行时靠这个区分「没配」与「配了默认值」。
    rerankServiceTimeoutMs: normalizeServiceTimeout(
      await read(sdk, "rerankServiceTimeoutMs"),
      "rerank",
    ),
    rerankServiceKey: normalizeServiceKey(await read(sdk, "rerankServiceKey")),
    systemoneServiceUrl,
    systemoneServiceModel,
    systemoneServiceTimeoutMs: normalizeServiceTimeout(
      await read(sdk, "systemoneServiceTimeoutMs"),
      "systemone",
    ),
    systemoneServiceKey: normalizeServiceKey(await read(sdk, "systemoneServiceKey")),
  };
}

/**
 * 决策服务配好了吗：地址与模型都在才算（与 resolveRerankChannel 的成对规则一致）。
 *
 * 只填一半按没配算：地址为空等于该服务未配置，孤立的模型名运行时会被整对忽略。
 * 这是「第四档能不能选」与「已选的第四档还算不算数」的唯一判据，运行时 / 路由 / 面板共用。
 */
export function decisionServiceConfigured(switches) {
  return Boolean(
    normalizeServiceUrl(switches?.systemoneServiceUrl) &&
      normalizeServiceModel(switches?.systemoneServiceModel),
  );
}

/**
 * 归一化写回的提前提交：判别模型但决策服务没配 → 提前提交关。
 *
 * 与 resolveRecallGate 同一条判据、同一个理由：存着的 discriminator 已经没有意义了，
 * 界面与运行时都必须看到「关闭」，而不是悄悄换成语义不同的 llm 继续跑。
 * 大语言模型不依赖外部服务，不参与这条判断。
 */
export function resolveCaptureEarlyCommit(early, judge, switches) {
  if (early !== true) return false;
  return captureModeMissing(switches, judge).length === 0;
}

/**
 * 归一化召回判断：decision 但服务没配 → 回退 off。
 *
 * 除了「认不认这个枚举值」，还有一条「此刻算不算数」：决策服务被清掉之后，
 * 存着的 decision 已经没有意义了，界面与运行时都必须看到 off，不能显示一个
 * 实际不生效的档位。只在 decision 这一档上判，别的档与服务无关。
 */
export function resolveRecallGate(gate, switches) {
  const value = normalizeRecallGate(gate);
  if (value === "decision" && !decisionServiceConfigured(switches)) return "off";
  return value;
}

export async function readExcludedPeers(sdk) {
  return parseExcludedPeers(await read(sdk, "excludedPeers"));
}

export async function readConnection(sdk) {
  return {
    serverUrl: String(await read(sdk, "serverUrl") || "").replace(/\/+$/, ""),
    apiKey: await read(sdk, "apiKey"),
    peerPrefix: await read(sdk, "peerPrefix"),
    mergeMemory: await read(sdk, "mergeMemory"),
    recallPeerScope: await read(sdk, "recallPeerScope"),
    timeoutMs: Number(await read(sdk, "requestTimeoutMs")) || DEFAULTS.requestTimeoutMs,
    // 召回请求单独一档超时：通用那一档只够约 600 字的查询，context 档拼满就会超。
    recallTimeoutMs: normalizeRecallTimeoutMs(await read(sdk, "recallTimeoutMs")),
    injectBudgetTokens:
      Number(await read(sdk, "injectBudgetTokens")) || DEFAULTS.injectBudgetTokens,
    // context 档拼查询的字数上限（按码点算），从最近一轮往回整轮拼。
    queryChars: normalizeQueryChars(await read(sdk, "queryChars")),
  };
}

// 身份是否填全。缺值时应直接短路，不去联网。
export async function hasIdentity(sdk) {
  const conn = await readConnection(sdk);
  return Boolean(conn.serverUrl && conn.apiKey);
}

// 总闸 + 身份双重判定：任何一项不满足，链路钩子都必须零成本返回。
export async function isActive(sdk) {
  const sw = await readSwitches(sdk);
  if (!sw.enabled) return false;
  return hasIdentity(sdk);
}

// 路由与面板投影共用这一份默认文案。
export { DEFAULT_RECALL_PREAMBLE };

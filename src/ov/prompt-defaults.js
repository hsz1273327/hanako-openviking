// 提示词的内置默认值。
//
// 为什么单独放一个叶子模块：这些字面量 settings.js（写时归一与启动迁移）
// 与 memory/recall.js、memory/capture.js（运行时兜底）都要用。放进任何一边都会让
// settings ↔ memory 互相 import，绕成环；这里不 import 任何东西，谁都可以是叶子。
//
// 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 与 capture-view.js
// 里各存了逐字相同的一份，冒烟会比对两边。

/**
 * llm 判断的默认提示词模板。导出给测试与面板文案对照。
 * 面板里的 textarea 以它作为草稿（配置为空时直接填进去让人改），两边必须是同一段文字。
 */
export const DEFAULT_GATE_PROMPT = `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。

用户消息：{{message}}`;

/**
 * 判断提示词用过的历史默认。98fb9ef 那一版还没有结尾的「用户消息：{{message}}」，
 * 面板把它当草稿落过库。写时归一与启动时的一次性迁移都要认这一段，判等是逐字比较。
 */
export const GATE_PROMPT_RETIRED_DEFAULTS = Object.freeze([
  `下面是一条用户消息。判断回答它需不需要先查历史记忆。

需要查的情况：问过去做过什么、提到「上次」「之前」「那个」「继续」，或者要参考已经定过的决定。

不需要查的情况：纯操作指令，例如运行命令、删除文件、重启服务，并且不指向任何历史内容。

只回一个词：需要，或不需要。`,
]);

/**
 * 判别模型的默认题面。导出给测试与面板文案对照。
 * 面板加载不了 App 的 Node 模块，ui-src/src/lib/recall-layers.js 里存了逐字相同的一份，
 * 冒烟会比对两边；rerankSystemonePrompt 为空时就用这段。
 */
export const DEFAULT_RERANK_SYSTEMONE_PROMPT = "第 {{n}} 条候选能帮助回答用户的问题吗";

/**
 * llm 精排的默认提示词模板。导出给测试与面板文案对照。
 * 配置里的 rerankPrompt 为空时就用这段。
 */
export const DEFAULT_RERANK_PROMPT = `用户在问：{{message}}

下面是从记忆库里查到的候选，每条一行，前面是编号：

{{candidates}}

挑出真正能帮助回答这个问题的候选。只回编号，用逗号分隔，例如 1,3。
如果一条都用不上，只回两个字：无。
不要解释。`;

/** 内置默认题面（面板里可编辑的那一格）；答案格式由代码固定追加，见 CAPTURE_TOPIC_FORMAT。 */
export const CAPTURE_TOPIC_QUESTION =
  "下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。";

/**
 * 写回判断题面用过的历史默认。c1cbb72 之前内置的是这句二元题面，面板把它当草稿填进
 * textarea，于是任何一次保存都会把它落库。
 *
 * 只和「当前默认」比会漏掉这批存量值，所以写时归一与启动迁移都连历史默认一起认：
 * 逐字相同就存成 / 改写成空串，等于用当前内置默认。用户自己写的原文照存。
 */
export const CAPTURE_PROMPT_RETIRED_DEFAULTS = Object.freeze([
  "只看下面这两段，它们是不是在讲同一件事？只回 yes 或 no。",
]);

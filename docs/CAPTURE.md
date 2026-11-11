# 写回（Capture）：把本地会话送进 OpenViking

## 一、现状

召回链路已经跑通，写回一行都没做。`src/ov/client.js` 里三个接口早就封装好了
（`createSession` / `addMessages` / `commit`），`autoCapture` 配置项也在，但没人调用；
`src/memory/capture.js` 这个文件不存在。

结果是：共享库里 4400 条记忆全是 hermes 的，我们一条都没写。

## 二、目标

把本地的对话增量写进 OpenViking，产出可被召回的长期记忆，并且满足四条：

1. 关机、断网、进程被杀之后能接着写，不重不漏
2. 切分点落在语义边界，不把一件事劈成两半
3. 每条记忆带来源坐标，能顺着查回原始对话
4. 写在自己的 peer 下，不污染共享层

## 三、机制前提（已实测）

**上传不触发提取，只有 commit 触发。** `messages/batch` 只是把消息存进 session，一条都不处理；
`commit` 那一刻才归档并抽取记忆。

**提取产出的类型分布严重失衡。** 全库实测 `events 4018 / entities 237 / preferences 72`，
events 占 91%。同一件事被提取成 events 的概率远高于 entities，这是提取器按内容分流的
天然倾向，改不了，只能在召回端用类型权重压。

**同一个 session 可以反复追加。** 实测先写 1 条、隔三秒再写 2 条，`message_count` 累加到 3，
`pending_tokens` 累加到 34。每次 `messages/batch` 都是独立请求，前一次的状态不影响后一次。

**写入可撤回。** `DELETE /api/v1/fs?uri=<encoded>&recursive=true&wait=true` 能删文件和索引，
`semantic_status` 会走到 `complete`。写错了能修。

## 四、链路

```
agent/settled
   ↓
读 JSONL 里 lastWrittenEntryId 之后的 message 记录
   ↓
补本地 session 状态（message_count / commit_count 对账）
   ↓
追加进 OpenViking session（messages/batch）
   ↓
判断要不要 commit（按主题 / 按阈值 / 按空闲）
   ↓
commit（带 session=<id> 标签）+ 更新本地坐标
```

### 4.1 坐标

本地为每个会话存两份坐标：

```
lastWrittenEntryId   最后写进 OpenViking 的那条 JSONL 记录的 id
lastCommitCount      上次提交后服务端的 commit_count
```

entry id 来自 JSONL 每条记录的 `id` 字段（8 位十六进制，配 `parentId` 成链）。不用行号，
窗口滑动和压缩都会让行号错位。

### 4.2 对账

开机或每轮开始时，用服务端状态核对本地坐标。服务端是事实，本地是缓存：

| 服务端状态 | 含义 | 动作 |
|---|---|---|
| `pending_tokens > 0` 且 `commit_count` 与本地一致 | 正常欠账 | 按策略判断要不要补 commit |
| `commit_count` 大于本地记录 | 上次 commit 成功了，只是回执没收到 | 只更新本地坐标，不再提交 |
| `message_count` 小于本地记录 | 有消息没写进去 | 从 `lastWrittenEntryId` 之后补写 |

本地坐标丢了也不怕：直接读服务端状态就能重建，坐标只是省一次查询。

### 4.3 写什么

只写 `message` 类型的记录，`role` 和 `content` 原样发：

```json
{ "role": "user", "content": "...", "created_at": "<记录 timestamp>", "peer_id": "<自己的 peer>" }
```

跳过 `custom`、`model_change`、`thinking_level_change` 这些非对话记录。

`created_at` 用记录自带的 `timestamp`，时间就跟着消息走，不靠提交时刻。

## 五、commit 策略

三档，按优先级：

**按主题**（默认）。每轮结束后用一个二值判断问小模型：「这一轮跟上一段是不是同一个话题」。
否就 commit 上一段、开新段。本地模型即可，一次几十毫秒。
判据走 `lastCommitEntryId` 到当前轮的范围。

那句题面可改（配置项 `capturePrompt`），默认用内置那句「只看下面这两段，它们是不是在讲同一件事？只回 yes 或 no。」。
判别模型的 yes/no 两条判定描述是内置的，用户能改的只是题面怎么问。

**按阈值兜底**。同一主题连续 N 轮（默认 12）还没切，强制 commit，防止一段无限长。

**按空闲兜底**。`idle_timeout_seconds`（默认 600）没有新消息就提交。这一档不依赖钩子，
靠每轮 settled 时比对时间戳实现，所以断电也不怕漏。

**不依赖 `session.shutdown` 钩子。** 硬断电时它不一定跑得完。欠账由下次启动的对账补上。

## 六、两条写入通道

**对话流水 → session + commit → events（自动）。**
量大、会过期，走服务端提取器。

**事实与偏好 → content/write → entities / preferences（人工归纳）。**
量小、长期有效。什么时候写、写什么，由我们自己判断，不走提取器。

第二条不是第一版必须做的。第一版只做第一条，看提取出来的东西像不像话，再谈第二条。

## 七、标签

commit 时带 `extraction_metadata.event.tags = ["session=<sessionId>"]`。

召回时默认排除本会话标签，这样「刚说过的话不会被当成记忆再喂回来」。
gate 那层留着当兜底：只在召回为空（或全被滤掉）时补一次判断。

## 八、写入规范

uri 结构、正文结构、类型判定，见 `docs/MEMORY-FORMAT.md`（待定稿）。

第一版走 session + commit，格式由提取器决定，不受这套约束。等第二条通道开工时再落。

## 九、面板

全局配置加一栏：

- 写回开关（`autoCapture`，已有配置项），放在面板的「记忆共享」页
- commit 阈值：轮数上限、空闲秒数
- 手动补录入口：把当前会话从某个时间点开始补齐
- 状态显示：本会话已写 N 条、上次提交时间、待提交轮数

## 十、风险

**提取质量不可控。** 91% 是 events 意味着写进去的东西大部分是流水账。第一版只写不清理，
先看真实产出，别急着上第二条通道。

**session 可能过期。** 消息攒在未提交的 session 里，如果服务端有回收策略，pending 会被一起清掉。
未查证，需要在实施前确认。

**双写冲突。** 如果 hermes 和我们同时服务同一个用户，同一条对话可能被写两遍。靠 `session=<id>`
标签区分来源，召回时按 peer 过滤。

## 十一、实施顺序

1. 游标与对账（纯本地逻辑，可单测，不碰网络）
2. 写消息（`messages/batch`，不 commit）
3. commit 与标签
4. 三档策略（先做阈值和空闲，主题判断最后加）
5. 面板

前四步每步都能独立验收，不要一次做完。

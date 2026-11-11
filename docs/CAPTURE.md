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

**`commit` 必须带 `enable_working_memory: true`。** 不带时服务端照样返回 accepted，
但 `memories_extracted` 是 0，一条记忆都抽不出来。请求体里这个键不是可选项。

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
归类：拿待提交这一段去候选话题池里比，认出已有话题或新建
   ↓
判断要不要 commit（强制轮数 / 提前提交 / 按空闲）
   ↓
commit（enable_working_memory + 话题三件套标签）+ 更新本地坐标与话题表
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

### 4.4 话题表

话题存在 `<appDataDir>/topics.json`，一张全局表：

```json
{
  "version": 1,
  "topics": [
    {
      "id": "t_<uuid>",
      "label": "3D 打印参数调试",
      "summary": "龙门架的层高与温度参数反复调整",
      "sessionIds": ["sess_xxx"],
      "firstSeenAt": "2026-11-11T14:20:00Z",
      "lastSeenAt": "2026-11-11T16:05:00Z",
      "segments": 4,
      "status": "active"
    }
  ]
}
```

字段：

- `id` 是 `t_` + UUID，全局唯一，新建后不再复用
- `sessionIds` 记哪些会话提到过它
- `segments` 是同一话题被提交过多少段，每次认到它就加一
- `status` 只认 `active` / `dormant`。沉睡的仍可按 id 查到，但不进候选池；
  当前没有「按天数自动沉睡」的策略，`dormant` 只能由外部写入或以后的策略产生
- `firstSeenAt` / `lastSeenAt` 用提交时刻的 ISO 字符串

候选池按 `lastSeenAt` 倒序取最多 `captureTopicCandidates`（默认 8，范围 1–20）条。
作用域由 `captureTopicScope` 决定：

- `session`（默认）：只收 `sessionIds` 里有当前会话的话题。候选少、判断准，但同一件事
  在另一个会话里出现时连不起来
- `global`：在整张表里取。能跨会话连起来，但候选多，判断器更容易并错

读表能扛住损坏：文件不存在、坏 JSON、顶层形状不对、单项缺字段，都收敛成空表或丢掉
坏项，不会把整轮写回打回去。写表用 tmp + rename；进程内按 `dataDir` 排队做读-改-写，
两个会话同时结束后不会互相覆盖 `segments`。

## 五、提交策略

每次提交前都会先做归类，但「要不要因为换话题提前提交」由 `captureEarlyCommit` 决定。
`captureCommitMode` 已删除，读不到就是没有；提交策略只看 `captureEarlyCommit` / `captureEarlyJudge`。

### 5.1 提交判断顺序

顺序就是优先级，不能调换：

| 条件 | 结果 |
|---|---|
| 待提交轮数 ≤ 0 | 不提交（`empty`） |
| 待提交轮数 ≥ 强制提交轮数（`captureCommitTurns`） | 提交（`turns`），不归类、不问模型 |
| 提前提交关着 | 不提交（`below-limit`） |
| 待提交轮数 < 最少触发轮数（`captureMinTurns`） | 不提交（`too-few-turns`） |
| 「之前」为空（全新建会话 / 从没提交过） | 提交（`baseline`），立一次基线 |
| 归类抛错或认不出 | 不提交（`classify-failed`），本轮不切段 |
| 认到新话题 | 提交（`topic`） |
| 认到的话题就是当前话题 | 不提交（`same-topic`） |
| 认到别的话题 | 提交（`topic`） |

强制线在所有情况下共用：攒够了就交，不看提前提交开关，也不吃最少轮数。

### 5.2 归类

拿待提交这一段去候选池里比。题面先让判断器「判断这段在讲什么」，再决定归属；列已有话题
的 `label` 与 `summary`，最后固定追加一段答案格式（`CAPTURE_TOPIC_FORMAT`）：

```
下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。

已有话题：
[1] 发布窗口 —— 周四上线
[2] 上线检查 —— 清单

之前（供参考）：
[用户] ...

对话：
[用户] ...

按这个格式回答：
主题：<一句话概括这段在讲什么>
归属：<编号> 或 new
只输出这两行。
```

「之前」取上次提交之前最近 `captureContextTurns` 轮（默认 3，范围 1–20），悬空 user
作引子；每条消息截到 1200 字。候选池为空时不调模型，直接按新话题处理：没有候选就没有
选项，空题面只会白花一次调用（题面里「已有话题：」下写「（无）」）。

面板里能改的只有开头那句 `capturePrompt`；答案格式块由代码无条件追加，用户自定义的
题面也照加——解析契约归代码，题面只决定怎么问。

两种判断方式：

- `llm`：宿主模型按格式回两行。`captureModel` 留空就用宿主辅助模型（utility），不算缺配置
- `discriminator`：`/v1/systemone` 的 `choice` 题，选项 `t1..tN` 对应候选，`new` 对应
  「不属于上面任何一个话题」。要 `captureServiceUrl` 与决策服务模型，缺一个都算没配好

答案解析（`parseTopicAnswer`）刻意宽容，先看「归属：」那一行，认不出再扫全文：

- `归属：N`、`归属: N`、整行裸数字（多行里某一整行就是数字）、`new` / `NEW` / `新话题` /
  `都不是` / 行首 `新` 都认
- 行首空格与 markdown 装饰（`**归属：1**`、`> - 归属: 1`）不管；全角半角冒号都认
- 全文兜底还会按候选 `label` 原文匹配，长 label 优先，避免短 label 命中长 label 的子串
- 认不出就是 `null`，不猜；调用方按判断失败处理

宽容比题面更要紧。三组样本各跑一遍：基础 10 条、难样本 9 条、高度重叠 10 条。旧题面
（只要求回编号或 new）是 8/10、9/9、10/10；现在（题面先判「这段在讲什么」+ 解析器认编号
也认 label 原文）是 10/10、9/9、10/10。旧题面输得不只是命中率：归错时从回答里看不出它
以为这段在讲什么，只看到一个编号；现在「主题」那行会跟着落进新话题的 `label`，归错也能
直接看出它把这段当成了什么。

新话题的 `label` / `summary` 就地派生，不额外调模型：`label` 优先用判断器写的那行
「主题」，没解析到才退回本段第一条 user 消息压成一行后前 24 字（没有 user 就用第一条
消息）；`summary` 始终取本段第一条消息压成一行后前 80 字。

这是有意的取舍：判断失败时也必须能建话题，而那条路上没有模型可用，所以本地派生是无论如何
都要有的那条路；让模型顺手写一行主题，只是给成功路径少一处解析脆点。代价是主题可能偏：
提交的是一整段（上次提交之后的全部消息），中途被“同话题”拖住没切的那几轮会带进下一段，
模型只看到这一段全文，概括未必等于人想要的标题。所以「主题」只是首选，抽不到就退回第一句，
标签不会因为模型少写一行而变空。

**判断失败有两种后果，别混：**

- 探路时失败（提前提交那条路）：本轮不提交、不切段，等下一轮或强制轮数再来
- 提交时刻失败（强制轮数 / 基线这条路补归类时）：按新话题落表，commit 照发。
  判断失败不能变成漏写

### 5.3 基线与半轮

基线是纯 `POST /commit`：全新建会话时先立一段，之后才有「之前」可比。基线本身不调
判断器；如果提交时刻要做归类，归类失败也按新话题落。

提交点若正好落在 user 写完、assistant 还没来的半轮上，那条悬空 user 会作为引子追加在
「之前」的末尾，紧接「对话」；它不算一轮，也不影响 `captureMinTurns` 的口径。

### 5.4 服务端空闲兜底

`idle_timeout_seconds`（默认 600）没有新消息就提交。这一档不依赖钩子，靠每轮 settled
时比对时间戳实现，所以断电也不怕漏。

**不依赖 `session.shutdown` 钩子。** 硬断电时它不一定跑完。欠账由下次启动的对账补上。

## 六、两条写入通道

**对话流水 → session + commit → events（自动）。**
量大、会过期，走服务端提取器。

**事实与偏好 → content/write → entities / preferences（人工归纳）。**
量小、长期有效。什么时候写、写什么，由我们自己判断，不走提取器。

第二条不是第一版必须做的。第一版只做第一条，看提取出来的东西像不像话，再谈第二条。

## 七、标签

每次 commit 的请求体：

```json
{
  "enable_working_memory": true,
  "extraction_metadata": {
    "event": {
      "tags": [
        "topic-id=t_<uuid>",
        "topic-seq=<第几段>",
        "topic-label=<话题短标签>"
      ]
    }
  }
}
```

标签是严格的 `key=value`，值里不出现 `=`。`topic-label` 里的空白与 `=` 统一换成 `-`，
中文保留；标签为空时兜底 `topic`。`topic-seq` 从 1 起，等于该话题更新后的 `segments`。

这三个标签会落到记忆的 `attrs.tags` 上，`search` / `find` 支持按 tag 过滤：同一个话题的
多段记忆可以顺着 `topic-id` 找回来。旧文里的 `session=<id>` 标签不再写；召回链路当前也没有
按 tag 排除本会话，去重仍靠 uri / 正文那一层。

## 八、写入规范

uri 结构、正文结构、类型判定，见 `docs/MEMORY-FORMAT.md`（待定稿）。

第一版走 session + commit，格式由提取器决定，不受这套约束。等第二条通道开工时再落。

## 九、面板

「记忆共享」页有三块内容（写回设置 / 存量会话 / 话题），竖排一页太长，拆成三个子页签。
栏与「记忆搜索」页同一套（`NTabs` line + small，样式是 `panel.css` 的 `.sub-tabs`）：

| 子页签 | 挂什么 |
| --- | --- |
| 写回（默认停在第一个） | 写回开关与下面这串提交策略 |
| 存量会话 | 补交清单（见十二），`BackfillBlock` |
| 话题 | 话题表（见十三），`TopicBlock` |

三块**始终挂载**，切页签只切 `hidden`：补交进度、话题的编辑态与两块的提示位
切走再切回来都还在。子页签是本页视图状态（`ui-src/src/lib/capture-tabs.js`），
不进 store、不落 localStorage；页签的 `data-capture-tab` 与 `id` 前缀 `capture-`
和记忆页的 `memory-` 分得开。

写回页签下：

- 写回开关（`autoCapture`）
- 强制提交轮数（`captureCommitTurns`，默认 12，范围 1–100）：所有情况共用
- 提前提交开关（`captureEarlyCommit`）。打开后才出现下面这些子项：
  - 判断方式（`captureEarlyJudge`）：语言模型 / 判别模型
  - 话题作用域（`captureTopicScope`）：会话内 / 全局，并写明两种的代价
  - 上下文轮数（`captureContextTurns`，默认 3，范围 1–20）
  - 最少触发轮数（`captureMinTurns`，默认 2，范围 1–50）
  - 判断题面（`capturePrompt`，留空 = 内置那句默认问法）
  - 判断模型（`captureModel`，仅语言模型）或判别服务地址（`captureServiceUrl`，仅判别模型）
- 服务端兜底：开关与空闲秒数

默认值不落库（`capturePrompt` / `gatePrompt` / `gateContextPrompt` / `rerankPrompt` /
`gateDecisionPrompt` / `rerankSystemonePrompt` 六个键同一规则）：写入时，值等于内置默认
（含历史默认）就存空串，读取路径不做任何转换；盘上已有的旧值由 App 在 `agent/before-start`
与 `provider/before-request` 两处无状态扫描，命中的改写成空串。没有标记文件、没有版本号：
同一份配置重复跑是幂等的，第二次零写入；值不是非空字符串时一律不动，单个键失败只记日志，
下次再试。旧版留下的 `<dataDir>/prompt-defaults.json` 会被顺手删掉。空串在运行时表示用内置默认；
`gateDecisionPrompt` 也一样（空 = 用默认，不再是「没有判据」），要关掉判断请切 `recallGate`，
不要靠清空提示词。

老配置里存着的 `captureCommitMode` 不再参与读取，读不到就是没有；提前提交一律只看上面两个键。

侧边栏会话卡显示四行：本会话已写、上次提交、待提交轮数、本会话话题数（含 dormant）。
打开卡片只读：`/capture-status` 不建状态文件、不写话题表、不联网。

## 十、风险

**提取质量不可控。** 91% 是 events 意味着写进去的东西大部分是流水账。第一版只写不清理，
先看真实产出，别急着上第二条通道。

**session 可能过期。** 消息攒在未提交的 session 里，如果服务端有回收策略，pending 会被一起清掉。
未查证，需要在实施前确认。

**双写冲突。** 如果 hermes 和我们同时服务同一个用户，同一条对话可能被写两遍。靠 peer 区分来源；
话题标签（`topic-id` / `topic-seq` / `topic-label`）只负责把同一件事的段串起来，不承担来源过滤。

## 十一、实施顺序

1. 游标与对账（纯本地逻辑，可单测，不碰网络）
2. 写消息（`messages/batch`，不 commit）
3. commit 与标签
4. 话题表与归类，再接提前提交（先做阈值和空闲，归类最后加）
5. 面板

前四步每步都能独立验收，不要一次做完。

## 十二、存量补交

实时写回只管装上之后新发生的对话。更早的会话文件里还躺着没写进 OpenViking 的历史，
「存量补交」负责把它们补上。补出来的数据与实时链路同构：每段都走同一份
`commitSegment`（归类 → 落话题表 → 带三件套标签 commit → 推进游标），不是每段新开一个话题。

### 12.1 分段口径

第一趟 `scanSessionFile` 只数数，不保留正文。`messages` 的口径与游标表里的
`isCaptureMessage` 完全一致（`type: "message"`、role 是 user / assistant、正文非空）；
`turnsAt` 记每个**完整轮**结束处的消息下标（end-exclusive，升序），末尾悬空的 user
既不算一轮，也不进 `turnsAt`。

`planSegments(turnsAt, { from, perSegment })` 把 `turnsAt` 切成段：

- `perSegment` 取 `captureCommitTurns`（默认 12），每段最多这么多完整轮
- 只在完整轮边界切；最后不足一段也单独成段
- `from` 是「已经提交到的消息下标」，只取 `end > from` 的轮；第一段的 `start = from`
- 段与段首尾相接（上一段 `end` = 下一段 `start`），不重不漏

例：12137 条消息（user / assistant 交替、末尾悬空 user）有 6068 个完整轮，按 12 轮切是
506 段，最后一段 8 轮。

### 12.2 流式读

78MB、一万多条也不许整份读进内存：

- 第一趟 `scanSessionFile`：默认 `fs.createReadStream` + 按行切分，只累加计数
- 第二趟 `readSessionMessages`：同一份扫描逻辑，逐行喂回调；回调返回 `false` 立即停
- 补交按段取正文，峰值内存只装「当前这一段 + 判据需要的上下文轮」

坏行、非对象、非 `message` 记录、空正文一律跳过，与 `parseSessionLines` +
`captureMessages` 同口径。`deps.openLines` 是测试接缝，默认实现不提供任何一次性读入口。

### 12.3 会话清单

`listBackfillSessions` 扫 `<agentsRoot>/<agent>/sessions/*.jsonl`：

- 只认 `.jsonl` 结尾；`.files.json` / `.repair.json` 不算；`sessionKeyOf` 认不出的文件名跳过
- 只列 `messages > 0` 的会话
- `written` = 状态文件里 `capture.cursor.lastMessageCount`；没有状态文件就是 0
- `pendingTurns` = 从 `written` 之后起算的完整轮数；
  `pendingSegments = ceil(pendingTurns / captureCommitTurns)`
- `lastActivityAt` = 最后一条可写消息的 `timestamp`，没有就用文件 mtime

`agentsRoot` 依次尝试：调用方显式给的 `agentsRoot` → 状态文件里记过的 `agentDir` 的父目录
→ `<dataDir>/../../agents`；第一个「存在且含 agent/sessions 子目录」的胜出，都没有就返回空串。

扫描结果按 `(path, size, mtimeMs)` 缓存，并且同一个文件 **30 秒内不重复扫**。面板每秒轮询
`/backfill-status`、会话卡每 8 秒轮询一次，不能每次都把 25MB 重读一遍。

### 12.4 一段怎么跑

每个会话：

1. `scanSessionFile` 拿 `messages / turnsAt`；`messages === 0` 跳过
2. `GET /sessions/{id}`；404 就 `createSession`
3. `planBaseline` 定基线（见 12.5）
4. `planSegments(turnsAt, { from: baseline.lastCommitMessageCount, perSegment })`
5. 逐段：取消检查（只在段边界）→ 再 `GET` 一次对账 → 第二趟取这一段 →
   只发服务端还缺的消息（`messages/batch`）→ `commitSegment` →
   `patchSession` 推进游标 → `done += 1` → `await sleep(200)`

判断器恒取 `captureEarlyJudge`，与实时链路一致；不因为 `captureEarlyCommit` 关着就退化成
`fixed`（`fixed` 会让归类恒回空，补出来的每段都新开一个话题）。

段失败不拖累下一段：写入或提交抛错只记一条 `warn`，`status.error` 记最后一条，继续下一段。

### 12.5 游标、断点与幂等

基线 `planBaseline`：

- 本地有游标（`lastMessageCount > 0`）：以本地为准，只把 `lastCommitCount` 提到服务端的
  `commit_count`（服务端交过更多 = 上次回执丢了）
- 本地空、服务端有：`lastMessageCount = min(message_count, 会话消息总数)`，
  `lastCommitCount = commit_count`，`lastCommitMessageCount = commit_count > 0 ? lastMessageCount : 0`
  （交过就认为已写的部分都交过；没交过就从头补）
- 服务端 404 / 字段缺失：本地游标原样用

基线算完先落盘，再按 `baseline.lastCommitMessageCount` 排段。尤其是「本地状态空、服务端
已有 `message_count` / `commit_count`」这一档：不落盘的话，第一段进段内对账会把服务端
已有的提交误当成「上一段已交」而整段跳过。本地已有游标时不在这一步落盘——那条基线只抬
`lastCommitCount`，要让段内对账看见旧值才能认出「回执丢了」。

每段开始的这次 `GET` 之后，对账顺序不能换：

1. `server.commit_count > cursor.lastCommitCount`：上一段的提交其实成功了，只是本地没落。
   只更新 `lastCommitCount` 与 `lastCommitMessageCount = 段.start`，不重复提交，直接进下一段
2. `server.message_count < 段.start`：服务端少了消息，按 `server.message_count` 起写这一段
3. 否则只写 `[max(段.start, server.message_count), 段.end)`：已经写过的消息不再写

这两条守住段级幂等：同一段重跑，`messages/batch` 不会发第二次，`commit` 也不会发第二次
（服务端 `commit_count` 已经涨了）。

断点由每段结束的 `patchSession` 落盘：`lastMessageCount` 停在这一段末尾，
`lastCommitMessageCount` 在提交成功后跟到同一处。进程中断后重建 controller，下一次
从状态文件里的游标继续，不会重发前面的段。

写入失败：游标一步都不动，下次重试这一段。
提交失败：只把 `lastMessageCount` 推到段尾（消息已经在服务端），`lastCommitMessageCount` 不动，
下一段成功提交时会把这段一起带上。

### 12.6 护栏与取消

- **单任务**：一个 App 只有一份 controller。`start` 用同步的 `running` 标记挡并发，
  第二个请求得到 `已有补交在进行`，不会出现两个 run 同时活着
- **200 段**：计划阶段累计，到 200 就停；被截断时记一条
  `还有 N 段没补，下次再来`。下一次 `start` 从新的游标继续算剩余段数
- **200ms**：段与段之间真的等（`deps.sleep` 可注入，测试不真等），给服务端留一口气
- **取消**：只在段边界生效，正在跑的这一段不切断。`cancel()` 之后不再发下一段的请求，
  `running` 在 run 收尾时变 false；取消本身不写 `status.error`

`start` 的检查顺序：已有任务在跑 → 总开关关着 → 没有连接 → 出站通道不可用 →
（`scope: "session"` 时）找不到这个会话 → 没有要补的段。被拒一律回 `{ ok: false, error }`，
不抛 500。

### 12.7 哪些设置管不到这件事

- `autoCapture` **不拦**手工补交：它是实时写回的开关，补交是用户明确点的动作
- 会话级 `readOnly` 也**不拦**手工补交：只读限制的是自动链路
- 但总开关 `enabled` 必须开、连接（`serverUrl` / `apiKey`）必须通、出站通道不能是 down；
  任何一条不满足都直接拒绝，一个请求都不发

**已知前提：同一会话假定单写者。** 补交靠状态文件里的游标对账；如果宿主和补交同时写同一个
会话，或两台机器共用一个状态目录，游标会互相覆盖。这条前提与实时写回相同，没有跨进程锁。

### 12.8 话题表的删与改

`GET /topics` 回整张表；`DELETE /topics/:id` 删一条；`PATCH /topics/:id` 改 `label`
（body `{ label }`，1..60 字符，先 trim）。三条路由都只碰本机 `topics.json`，零联网：

- 写一律走 `withTopics`（按 `dataDir` 串行化）
- 参数校验在写之前做全，不合法一个字节都不写
- 删除只删本地归组记录，不碰服务端，也不动 `sessionIds` 里别的会话或表里别的项

## 十三、话题列表

记忆共享页「话题」子页签读的是本机 `<dataDir>/topics.json`，与 OpenViking 服务端无关。
实时写回每提交一段、存量补交每补一段，都会在这张表上记一段；两条链路共用同一张表，
所以补交不会给同一件事另开话题。折叠默认收起，展开只切显隐，不会重复读文件。

一行显示七个字段：

| 字段 | 含义 |
| --- | --- |
| 短码 | `id` 去掉 `t_` 前缀后的前 8 位，只用于辨认 |
| 标签 | 人可读的名字；空标签显示 `未命名`，可以原地改 |
| 摘要 | 这一段在讲什么；压成一行，超过 60 字截断并加 `…` |
| 段数 | `segments`，这个话题累计被提交过多少段 |
| 最近活动 | `lastSeenAt` 的相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前） |
| 会话数 | `sessionIds` 的长度，即这个话题在多少个会话里出现过 |
| 状态 | `status`：`active` 显示「活跃」，`dormant` 显示「沉睡」 |

`segments` 是话题的权重：没有段数的话题没有可用于归类的历史，读侧会直接丢掉。
`sessionIds` 是出现过这个话题的会话 key 列表（去重后），删话题不会动这些会话的文件，
也不会动服务端已经写出去的记忆。

搜索框按 `label` 与 `summary` 做不区分大小写的子串过滤，纯本地筛选，不发请求。
`改标签` 把标签那一格换成输入框，预填当前值；回车提交，`Esc` 取消，失焦不提交。
提交失败把错误留在这一块的提示位，输入框留在编辑态。`删除` 需要二次确认，
成功后只把那一行从本地列表里去掉，不整表重拉。

后端三个端点都只碰本机 `topics.json`，零联网：

- `GET /topics` → `{ version: 1, topics: [...] }`（坏 JSON / 文件不存在给空表，不抛）
- `PATCH /topics/:id`，body `{ label }`，label 先 trim 后必须 1..60 个字符
  → 200 `{ ok: true, topic }`；label 不合法 → 400 `{ ok: false, error }`；
  找不到 → 404 `{ ok: false, error: "没有这个话题" }`
- `DELETE /topics/:id` → 200 `{ ok: true, id }`；找不到 → 404 `{ ok: false, error }`

参数校验在写之前做全：一次不合法请求一个字节都不写。写盘走 `withTopics` 按 `dataDir`
串行化，`GET` 与两个写端点看到的是同一份表。

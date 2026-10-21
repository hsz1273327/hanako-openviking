# hanako-openviking · 设计草案

> 状态：草案 v2（技能改成"检索优先"）。目标不是"再写一个记忆插件"，而是把 Hana 接入已有的
> OpenViking 中枢，让不同机器上的 OpenHanako、以及家里自托管的其它 agent（Hermes），
> 共用同一份记忆与技能。

---

## 一、问题与目标

### 现状

- 家门口的 OpenViking server 已经在跑（`http://<your-openviking-host>:8000`，v0.4.16，`auth_mode=api_key`），
  测试机的真实地址不入库；仓库里的默认值是 `http://127.0.0.1:8000`，安装者填自己的地址。
  Hermes 已经接在里面。
- 主力机上的 OpenHanako 与会话所在的 MBP 各自拥有一份"只属于自己"的记忆和技能。
- 已有的 v1 插件 `openviking-memory`（源目录 `~/WORKSPACE/Hanako/openviking-memory-plugin`）
  已把"MVP 级记忆共享"跑通：每轮召回注入 + 轮次结束写回 + 手动补录 + 配置页。
  它只覆盖记忆，且是 v1 形态、`trust: full-access`，不适合对外分发。

### 目标（一句话）

让任意一台机器上的任意一个 Hana 助手，在任意一轮对话里，都能用上"所有机器、所有 agent 共同
积累的记忆与技能"；写入是增量的，读取零成本（连不上就相当于没装），且**常驻开销与资源库规模无关**。

### 成功标准（可判定）

1. **跨机召回**：在 MBP 新开一个会话，问一件只有别的 peer（Hermes 或主力机）才知道的事，
   回答里出现该事实；同时该轮 `capture.log` 有 `ok` 记录。
2. **跨机写回**：写回后，在 OpenViking 侧能查到来自 `mbp-*` peer 的记录；换到主力机侧能召回它。
3. **零成本降级**：断网或关总闸后，会话首字延迟增加 < 100ms，日志只有短路记录，没有报错。
4. **技能可达**：本机新写一个 skill 推到 OpenViking 后，在另一个 agent 侧能检索到并按需读到正文。
5. **规模与轮次都无关**：把远端技能灌到 1000+ 后，常驻注入 token 不随库规模增长；
   连续 20 轮对话里，技能检索调用只有任务边界那几次，不是每轮一次。

### 明确不做（第一版）

- 不改写、不接管 Hana 本地记忆（`facts.db` / `memory.md` / `week.md`）。共享层是**叠加**的。
- 不做点对点同步、不做多副本冲突合并（中枢模型下不需要）。
- 不删改用户已有的 skill；不实现"第二个技能定制存储"。
- 不做技能市场 / 浏览式 UI，只做设置页 + 状态。

---

## 二、既有事实（已核实，不再重查）

### OpenViking 侧

| 事项 | 事实 | 出处 |
|---|---|---|
| 认证 | `X-API-Key`（或 `Authorization: Bearer`） | docs `api/01-overview` |
| 身份头 | `X-OpenViking-Account` / `-User` / `-Actor-Peer` | 同上 |
| 响应封装 | 成功 `{status:"ok",result}`；失败 `{status:"error",error:{code,message}}` | 同上 |
| 召回 | `POST /api/v1/search/search`，`mode="context"` 返回已按 token 预算组装好的上下文 | docs `api/06-retrieval` |
| 会话写回 | `POST /api/v1/sessions` → `.../messages/batch` → `.../commit`（commit 触发记忆抽取） | docs `api/05-sessions` |
| 技能列表 | `GET /api/v1/skills`，**每个 root 硬上限 1000 条且不分页**——这个端点本来就不是给规模用的 | docs `api/04-skills` |
| 技能检索 | `POST /api/v1/skills/find {query, limit, level, score_threshold, target_uri}`，按包分组返回，含 `name/description/tags/allowed_tools/root_uri/skill_md_uri` | 同上 |
| 技能读取 | `GET /api/v1/skills/{name}?level=0\|1\|2&include_content&include_files&include_integrity` | 同上 |
| 技能写入 | `POST /api/v1/skills`（inline / SKILL.md / 目录 ZIP via `temp_upload` / Git URL）；`PUT` 整包替换；`DELETE` 删除 | 同上 |
| 技能分层 | 包内 `.abstract.md`(L0) / `.overview.md`(L1) / `SKILL.md`(L2) + 附件；`revision` + 每文件 `sha256` 可校验 | 同上 |
| 技能作用域 | 私有根 `viking://user/{uid}/skills/`、账号共享根 `viking://agent/skills/`；**不支持 peer 作用域**（peer 过滤只作用于记忆/资源） | 同上 |
| 官方定位 | 技能只存与检索，**不执行脚本、不在 agent 沙箱里装文件**；激活与工具策略交给 Harness | 同上 |
| 健康检查 | `GET /health`、`GET /ready`，免认证 | 同上 |
| 暂不使用 | watches / snapshots / OVPack / WebDAV / MCP endpoint | docs 目录 |

### Hana 侧（v2 App 契约）

| 事项 | 事实 |
|---|---|
| 形态 | `manifestVersion: 2`，装在 `<HANA_HOME>/apps/<id>/`，`id` 必须等于目录名 |
| 召回钩子 | 决策词 `provider/before-request`（可改写发往 provider 的 payload），能力词 `app/hooks.provider-before-request` |
| 轮次结束 | 观察事件 `agent/settled`（需 `app/hooks.observe`，default-deny）；另有 `provider/after-response` |
| 其它决策词 | `session/input`、`messages/post-assistant`、`messages/post-message`、`session.beforeCompact`、`tools/pre-execute` |
| 取会话正文 | `sdk.sessions.entries({sessionId})` → `{entries, leafId}`（durable 全量），优于 v1 时代被截断的 `session:history` |
| 工具 | `sdk.tools.register` + `app/tools.expose-to-model` |
| 配置 | `contributes.settings.schema` + `sdk.config.get/set`（读取要现读，不缓存） |
| 网络 | `sdk.network.fetch` + manifest `network`（`allowedHosts`/`methods`/`allowLocalhost`/超时） |
| 文件 | `sdk.resources`（ref 支持 `local-file`/`skill`/`recipe`/`session-file`…）；写 dataDir 之外需 `app/resources.write`，受保护数据根永远拒绝 |
| 自带技能 | app 目录下可带 `skills/`，宿主注册为 `app:<appId>`，默认不进用户技能列表。**静态**，不能做动态同步 |
| 加载 | `activation` 只有 `on-demand` 一种可选值；**省略 = 启动即加载**（召回钩子需要这个） |
| 版本 | 本机 Hana `1.1.7-beta`；脚手架自带 SDK 为 `1.1.24-beta`（`minAppVersion` 需下调或先升级宿主） |

### 上一轮踩过的坑（写回路径）

- `session:history` 只返回一段旧窗口（实测恒定 39 条，不含最新）→ 直读会话正文，v1 已改。
- 增量游标不能用"长度"，窗口滑动时长度不变内容会变 → 用**内容指纹**当锚点。
- 宿主保留路径 `/config`、`/config-schema` 的 GET 会**回显明文密钥** → 自己的配置端点必须换名。

---

## 三、架构

中枢模型：**共享靠 user，区分靠 peer（记忆）；技能不分区，全 user 共享。**

```
        ┌─────────────── OpenViking server（家里 / 可远程） ───────────────┐
        │  记忆：user 域 + peer 标记      技能：viking://user/{uid}/skills │
        └───────▲──────────────▲──────────────▲──────────────▲────────────┘
                │              │              │              │
          MBP · 小明      MBP · 小花     主力机 OpenHanako    Hermes
                └──── hanako-openviking（本仓库，唯一新增件）────┘
```

每台机器只装同一个 App。App 的本质是：**把 OpenViking 检索到的上下文按需注入 provider payload**。
记忆和技能只是两种被检索的资源类型，走同一个接缝。

### A. 记忆链路

- **召回**：`provider/before-request` → 取本轮最后一条 user 文本 → `search(mode="context", peer_scope="all")`
  → 把服务端裁好的记忆块注入 payload。阈值与预算交服务端，插件只定上限与超时。
- **写回**：`agent/settled` → `sdk.sessions.entries` 取正文 → 指纹游标取增量
  → `createSession`（按 peer+sessionId 幂等）→ `messages/batch` → `commit`。
- **身份**：`peer = <prefix>-<agentDir>`（小明 `mbp-agent-muewpt9i`、小花 `mbp-hanako`）；
  可选 `mergeMemory` 把所有 agent 折成一个 peer。

### B. 技能链路（检索优先，任务级路由，按会话角色分工）

技能库可以很大，而且**技能是按任务用的，不是按轮用的**。
而 Hana 里已经有一个天然的任务边界：**子会话**。所以路由不必靠猜，直接挂在分派上。

| 会话角色 | 记忆召回（每轮） | 技能工作集 | 能力指针 |
|---|---|---|---|
| 主会话（人在说话） | ✓ | ✗ | ✓ |
| 子会话（被分派的任务） | ✓ | ✓ 开头一次 | ✓ |

- 主会话负责理解意图、分派、综合，技能正文对它没用——给它工作集是纯占地方。
- 子会话的分派提示就是它天然的路由 query，而且比分派者的口语更明确（"用 X 做 Y"）。
- **接缝按频率分**：技能路由走 `agent/before-start`（每个 agent 生命周期一次）；
  记忆召回走 `provider/before-request` / `agent/pre-step`（按步）；写回走 `agent/settled`。
  频率由接缝本身保证，上一版那个"按轮去重"的技巧不再需要。（三个接缝的实际语义待实测）

| 触发面 | 何时 | 做什么 | 关键路径成本 |
|---|---|---|---|
| 能力指针 | 恒定（两种会话都有） | 一句话：远端技能库可检索 + `openviking_skill_find` 用法 | ~40 token |
| 任务路由 | 子会话开始 / 主会话每 N 轮 / 压缩之后 / 话题转移 | `skills/find` → 工作集（≤5 条） | 一次调用 |
| 主动检索 | 模型随时 | `openviking_skill_find` / `openviking_skill_load` | 0 |

- **工作集注入粒度是 L0，不是 L1**：只给"名字 + 何时用 + 怎么加载"，5 条也就两三百 token。
  正文（L2）只在真正动手时用 `openviking_skill_load` 取。
- **工作集是粘的**：一旦路由出结果就常驻到下次路由，不再重新检索。
  每轮重搜会让技能集抖动，模型行为跟着抖；粘住同时保护前缀缓存。
- **轮级零网络**：每轮只做本地判断（本轮注过没有、超没超预算），不发请求。
- **失败即退化**：路由失败或超时，保留上一份工作集，不做任何重试。
- **上行**：读本机 `<HANA_HOME>/skills/**`（`sdk.resources`，ref 用 `skill`）→ `POST /api/v1/skills` 整包上传。
- **落盘安装（可选，非默认）**：App 只提供包内容，由有文件权限的 agent 或用户确认后落地。
- **上行**：读本机 `<HANA_HOME>/skills/**`（`sdk.resources`，ref 用 `skill`）→ `POST /api/v1/skills` 整包上传。
- **落盘安装（可选，非默认）**：App 只提供包内容，由有文件权限的 agent 或用户确认后落地。

### C. 注入策略与预算

**记忆按轮，技能按任务**——这是两条链路唯一但根本的不对称：记忆回答"这一刻需要知道什么"，
每轮的提问都会改变答案；技能回答"这件事该怎么做"，答案在整段任务里是稳定的。

| 项 | 频率 | 决策者 | 默认 | 上限 |
|---|---|---|---|---|
| 记忆块 | 每轮 | 服务端检索（阈值 + 预算） | 阈值 0.35 | 2000 token |
| 技能工作集 | 任务边界 | 插件路由一次 | 阈值 0.45、limit 5 | 400 token |
| 技能指针 | 恒定 | — | 一句话 | 40 token |
| 技能正文 L2 | 按需 | 模型主动调工具 | — | 单次 6000 token |
| **合计硬闸** | — | 插件 | 超了先砍技能再砍记忆 | **2500 token**（不含模型自己 load 的） |

三条实现纪律，比参数重要：

1. **按轮去重**：`provider/before-request` 按模型步触发，一个用户轮可能走十几次。
   检索必须按 `sessionId + 最后一条用户消息指纹` 去重，否则白烧调用。（待实测）
2. **注入位置决定缓存**：稳定的（指针/热集）放载荷前部系统区，逐字节不变；
   每轮变的（记忆块、命中的 L1）放最后一条用户消息附近。放反了前缀缓存全失效。
3. **日志**：每轮记命中分数、注入了谁、占多少 token、跳过原因。没有这份日志，参数永远调不动。

### D. 会话技能面板（人工补丁）

自动路由只能覆盖"分派出去的任务"。主会话自己做着做着发现技能不够用，这个判断应该由**人**做，
所以给一个手动的入口：功能面板（`contributes.cards[].functionPanel` / `sdk.surfaces.open({slot:"function-panel"})`），
搜索框 + 结果列表 + 两个动作。

- **只写状态，不改上下文**。面板把"本会话激活了哪些技能"写进 App 存储（按 sessionId），
  真正的注入仍由 `provider/before-request` 统一做。载荷只能有一处笔迹，否则缓存永远稳不住。
- **两个动作是两种语义，不是轻重**：
  - *加入会话列表*：只加 L0 条目（名字 + 何时用 + 怎么取全文）进系统区。模型从此"知道有它"。
  - *直接加载*：全文进变动区。模型现在就照着做。
- **搜索用自然语言**（`skills/find` 是向量检索），结果里标注"本机已有"与"本会话已激活"，避免重复。
- **会话绑定**：面板要知道自己在对哪个会话下手（`sdk.sessions.getActive`），会话结束/归档时清理状态。

#### 代价提示（必须做，不是可选项）

每次激活都有真实代价：当前前缀会被重建（缓存命中清零，首字变慢）。面板要把这个代价**摆出来让人决定**，
而不是默默执行。

| 报什么 | 来源 | 性质 |
|---|---|---|
| 前缀重建的 token 数 | `sdk.sessions.context` 的 contextUsage | 实测值 |
| 本会话缓存命中率 | 账本 `cache.hitRatio` | 实测值 |
| 首字延迟变化 | 激活前后各一次 | 实测值 |
| "下次回复会变慢" | 推断 | 标成推断 |

- 行内提示 + 一次确认，不用模态框（连续操作不该被挡）。
- 量级不同，文案不同：*加入列表* 报一次性重建 + 每条 L0 的常驻占用（~40–60 token）；
  *直接加载* 报全文 token 数 + "占用到压缩为止"。
- **会话越长代价越大**：长会话里提示要升级，短会话里一句带过。
- 事后可回看：状态卡留一条"上次激活：重建 12.4k，首字 +0.7s，命中率 87%→0→91%"。
  提醒不是一次性弹窗，是一个能校准的仪表。
- 诚实边界：各家 provider 的缓存计价规则不同（自动命中 / 写入计费 / TTL），
  所以只报"重建了多少 token"这个能测的事实，不假装算得出钱。

---

## 四、关键取舍

**1. 重写成 v2 App，不搬 v1 代码。** v1 对外分发意味着用户要交 `full-access` 全部权限；
v2 是逐项能力词 + 审批账本，而 `provider/before-request` + `agent/settled` 正好覆盖 v1 用到的两个接缝。
v1 插件在 v2 验收通过前继续跑，**但两者绝不能同时开着**（两个写回者 = 重复记忆）。

**2. 记忆走"注入 + 写回"，不去读写 Hana 本地记忆库。** 本地记忆是宿主私有格式（SQLite + 若干 md），
跟着版本走，直接改会碎。注入式召回不碰宿主状态，且对 Hermes 这种异构 agent 同样成立。

**3. 技能"检索优先 + 任务级路由"，不做全量索引、也不每轮检索。**
技能库没有上限，清单式索引的成本随库线性增长——万级就撑爆；
`GET /api/v1/skills` 每个 root 硬上限 1000 且不分页，本身就是"这个端点不适合规模"的旁证。
但另一个方向的错是每轮搜一次：技能挂在长线任务上，逐条消息去搜既贵又抖。
所以常驻只留一句能力指针 + 一份**任务级工作集**（L0 粒度、粘住不抖），正文按需 load。
要解决的不是"注入什么"，而是"模型怎么知道该去搜"：路由兜底（它不用有意识）、
一句指针（它自己搜）、工作集（用过的不再搜）。落盘安装留一条干净通路：App 给内容，由 agent 或用户落地。

**4. 只做中枢，不做点对点。** 两台机器都指向同一个 OpenViking；离网靠短超时降级。
"在外也要能用"是网络问题（Tailscale/VPN），不是插件问题。

**5. 人工补丁有代价，代价必须可见。**
激活技能会重建前缀，这不是可以"优化掉"的损耗，是语义本身要求的：
要把一个技能变成会话级权威，就必须出现在模型每次都能看到的位置。
能做的是把位置放得靠后（少作废一段）、把代价算给人看（token 数与命中率）、并提供更便宜的一档
（直接加载只损失尾部）。三者合起来，这个操作就从"悄悄变慢"变成"我知道我在买什么"。

---

## 五、目录结构（拟）

```
hanako-openviking/
├── manifest.json          # manifestVersion 2：能力词 / network / settings
├── index.js               # defineApp：装配 hooks / tools / routes / settings
├── src/
│   ├── ov/client.js       # OpenViking HTTP 客户端（沿用 v1 已核实的端点）
│   ├── ov/identity.js     # peer / user / sourceLabel 解析
│   ├── ov/settings.js     # 运行时现读配置（不缓存，关闸立刻生效）
│   ├── memory/recall.js   # provider/before-request：记忆召回
│   ├── memory/capture.js  # agent/settled：增量写回
│   ├── memory/cursor.js   # 指纹游标（抗窗口滑动）
│   ├── skills/route.js    # 每轮自动检索（skills/find）+ L1 注入
│   ├── skills/tools.js    # skill_find / skill_load / skill_push
│   ├── inject/plan.js     # 注入计划：位置、预算、去重（按轮）
│   └── state.js
├── ui/                    # 功能面板（搜索 / 激活 / 代价提示）+ 设置页 + 状态卡
├── dev/smoke.mjs          # 离线冒烟：mock fetch + mock sdk，断言不进网
├── sdk/                   # 脚手架自带的宿主 SDK（随包分发）
└── docs/DESIGN.md
```

---

## 六、里程碑

| # | 内容 | 完成判据 |
|---|---|---|
| 1 | 脚手架 + manifest（能力词 / network / settings）+ 清掉 demo 残留 + 离线冒烟骨架 | `validate_app` 无 ERROR；`node dev/smoke.mjs` 全绿 |
| 2 | OV 客户端 + 身份 + `viking_status` 工具 | 工具能报出连接状态与 peer 名 |
| 3 | 记忆召回（含按轮去重、注入位置） | 成功标准 1 |
| 4 | 记忆写回（指纹游标） | 成功标准 2 |
| 5 | 技能检索链路：指针 + 任务级路由 + `find`/`load` 工具 + 工作集 | 成功标准 4、5 |
| 6 | 技能上行 push | 本机 skill 出现在 OpenViking |
| 7 | 设置页 + 状态卡 + 注入日志 | 页面上改开关立即生效 |
| 8 | 端到端验收 + README + 迁移（停用 v1 插件） | 成功标准 3；无重复写入 |

---

## 七、待现场验证（不猜，装上去看）

1. `provider/before-request` 是按**用户轮**还是**模型步**触发；payload 结构与安全注入位点。
2. 省略 `activation` 是否真的启动即加载、全轮生效。
3. `app/hooks.observe` 的 `agent/settled` 回调里能否拿到 `sessionId` / `agentId` / `sessionPath`。
4. `sdk.resources` 读 `~/.hanako/skills` 是否需要 `app/resources.read`，`skill` ref 的实际行为。
5. `minAppVersion` 在本机 1.1.7-beta 上的实际下限（脚手架给的是 1.1.24-beta，会拒载）。
6. `messages/batch` 条目的确切结构（v1 时代仍是推测：`[{role, parts:[{type:"text",text}]}]`）。
7. 三个钩子（`agent/before-start` / `agent/pre-step` / `provider/before-request`）的真实载荷与调用频率；
   **子会话是否同样触发**。
8. 子会话的写回策略：全写会把共享记忆灌满碎渣，候选是只写主会话 / 子会话只写摘要 / 按开关。
9. 路由的一次 HTTP 往返（预计 20–100ms）放在子会话开头是否可接受。
10. 话题转移的判定方式：轮数阈值 / 与上次路由 query 的相似度 / 压缩事件，先用最土的那个。

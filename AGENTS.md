# 仓库约定

## 谁写代码

默认委托给 `pi` 实现，助手只负责需求、验收，以及必须用眼睛判断的部分。

不委托就要说明理由，并且理由必须是"这件事无法被测试断言"，不是"我来更快"。

### 可以直接动手的（例外清单，仅限这些）

- `manifest.json` 里纯声明字段的调整（title、description、route、cardForm 之类的取值）
- `ui/**` 的 HTML 结构、CSS、文案
- 一次性的配置修正（不涉及代码逻辑）
- 用户当轮明确要求"你自己改"
- `pi` 不可用或卡住时的降级，且必须在回复里说清降级原因

### 必须委托的

- `src/**` 与 `routes/**` 下的任何逻辑、状态机、数据形状
- 新增功能模块、重构、测试
- 任何需要写进 `dev/smoke.mjs` 断言的东西

判断依据是**能不能被测试断言**，不是代码量大小。三行的状态机也算逻辑，要委托。

## 交接格式

给 `pi` 的任务说明至少包含四段：

1. 目标：做完之后什么现象算对
2. 约束：已经验证过的事实（见下节），不要重新试
3. 边界：哪些文件可以改，哪些不许碰
4. 验收：跑什么命令、看什么断言

## 已核实的事实（别重踩）

- 卡片 `pageIcon` 的相对根是 **`ui/`**，不是包根。写 `assets/icon.svg` 会找不到，且宿主只记一条 warning，然后把整份 page 声明当未声明，静默降级。
- 卡片 `face.image` 同样相对 `ui/`。
- App 的 iframe 里**没有** `--text`、`--accent` 这类宿主主题变量。`color-mix(in srgb, var(--text) ...)` 会整条声明作废，且不报错。样式一律用中性 `rgba()` 与 `currentColor`。
- App 加工具后，**当前会话看不到新工具**，工具目录按会话快照。`reload` 和 `disable/enable` 都刷不动，开新会话才可见。验证注册是否成功要看 `tool_help` 的目录，不要用 `searchTools`。
- 宿主的 `/config`、`/config-schema` 这两个 GET 会回显明文密钥。自己的配置端点必须换名（本仓库用 `/conn`）。
- `tools.pre-execute` 一类的决策钩子里，返回 `undefined` 表示不干预。探针只写日志，不许改返回值。
- 打开卡片必须零副作用：`/status`、`/session/:sid` 全是只读路由，不触发召回、不写回。

## 本地开发循环

```bash
rsync -a --delete --exclude .git ./ /home/hsz/.hanako/apps/hanako-openviking/
# 然后在宿主里 reload 这个 App
node dev/smoke.mjs     # 必须全绿
```

没有热重载。改完不同步、不 reload，看到的永远是旧字节。

## 身份与状态

- 记忆与开关按**会话**绑定，状态落在 `<appDataDir>/sessions/<sessionId>.json`，一会话一文件。
- 全局配置与 `preferences.json` 的 `settings_contributions.v2-hanako-openviking` 对应。
- 总闸（`enabled`）**不可**被会话覆盖。会话只能改 `autoRecall` / `autoCapture` / `readOnly` / `skillRouting` / `probe` / `recallPeerScope`。

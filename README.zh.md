# LLM Harness

[English](README.md) | 中文

LLM Harness（`dsh`）是基于 [DeepSeek AI](https://deepseek.com) 以及 Deepseek Harness 开发的开源 agent harness（智能体框架）。它提供了一个可组合的、插件驱动的运行时，其中**每项能力均可替换**——从模型适配器、工具执行到会话持久化和 agent 生命周期管理。

由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 工程创新点

### 1. 能力接缝：Definition / Provider / Consumer

每个可替换的能力都遵循三角色结构——而非随意的插件钩子：

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Service Definition │     │  Service Provider   │     │     Consumer        │
│  abstract class     │◄────│  implements         │────►│  integrates into    │
│  claims ctx.<key>   │     │  concrete backend   │     │  agent loop / tools │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

仅有一个角色的接缝是不完整的。一次提供方替换即可改变整个产品——将 `ctx.fs` 和 `ctx.shell` 指向远程沙箱，Bash、PTY、文件系统和 LSP 全部随之迁移，零分支化提供方。当前接缝：

| Seam | Definition | Providers | 覆盖范围 |
|---|---|---|---|
| `ctx.llm` | LLM 适配器注册表 | DeepSeek, Pi AI, replay | 模型流式传输、凭据路由 |
| `ctx.memory` | MemoryStore | file (JSON), agent lifecycle | 跨会话认知记忆 |
| `ctx.fs` | 文件系统能力 | local, sandbox-mounted | 带策略的文件读/写/编辑 |
| `ctx.shell` | Shell 执行 | local (bash/pwsh) | 通过 `ctx.subprocess` 的命令执行 |
| `ctx.sandbox` | 进程限制 | bwrap, Landlock, Seatbelt | 跨平台沙箱 |
| `ctx.compaction` | 上下文压缩 | basic (summarization) | 上下文窗口管理 |
| `ctx.subagent` | 子 agent 委派 | in-process, workflow | Spawn/fork 子 agent |
| `ctx.tools` | 工具注册表 | core + 30+ tool plugins | 所有面向模型的工具 |

### 2. 模型可见 ⟺ 已记录：单一事实来源

任何到达模型请求的内容都**必须**可从追加式会话日志中重建——由运行时不变式强制保证，而非约定。

```
session/event（追加式日志）
  ├── deriveMessages()     ──► 模型上下文
  ├── session-persistence  ──► 磁盘（JSONL / SQLite）
  ├── compaction           ──► 摘要检查点
  ├── session-projection   ──► UI 渲染
  ├── fork / resume        ──► 派生会话
  └── telemetry            ──► 可观测性
```

不存在旁路通道。新的模型可见输入需要新的 `SessionEventMap` 条目——不变式会断言这一点。这就是为什么会话标题、压缩、记忆召回和 UI 卡片都能从同一事件流中保真重放。

### 3. 瀑布驱动的 agent 生命周期

Agent 循环不是硬编码的——它是一个**类型化事件序列**。每个阶段都是一个瀑布，插件可拦截、重写或短路：

```
turn/start
  └─► agent/pre-step（瀑布）      ← 记忆注入、压缩、钩子、上下文
       └─► agent/request（瀑布）  ← 请求重写
            └─► llm/stream（瀑布）   ← 重试、检查点、标题生成
                 └─► assistant/message
                      └─► tools/pre-execute（瀑布）  ← 钩子、权限、沙箱
                           └─► 单调守卫              ← deny/abstain，身份受保护
                                └─► tools/execute（瀑布） ← 超时、重试、指标
                                     └─► tools/post-execute（瀑布） ← 接受、阻止、替换
                                          └─► tools/result（通知） ← 冻结的权威结果
  └─► agent/turn-stopping（串行） ← 钩子观察最终决策
turn/end
```

新行为挂载到已记录的扩展点。修改循环本身则需更新架构图。

### 4. Profile → Bundle → Patch：可组合的分发

运行中的 `dsh` 是在启动时从有序层组合而成的插件树——没有特权核心：

```
Profile（web / headless / custom）
  ├── Bundle: dsh-base        ── 模型、工具、持久化、沙箱、凭据
  ├── Bundle: dsh-web-app     ── 浏览器应用
  │                              （或 dsh-headless 用于一次性运行器）
  ├── user cordis.patch.yml   ── 按 id 覆盖任何配置行
  └── --patch overlay          ── CLI 级覆盖
```

`dsh --dump-config` 打印你的机器实际启动的完整树。任何一行都可被补丁替换。

### 5. 可逆副作用系统

每次注册都通过 `ctx.effect()` 或 `ctx.on()` 并带有处置器：

- 提示词段落、工具 schema、适配器、事件监听器——全部是副作用
- 插件卸载按**逆序**撤销注册
- 热重载、沙箱拆卸和上下文作用域变得可组合，而非手工管理

### 6. 通过扩展点集成的认知记忆

跨会话持久化记忆，**无需修改 agent 循环**：

| 阶段 | 扩展点 | 行为 |
|---|---|---|
| 捕获 | `agent/turn-stopping`（串行） | 观察者从已完成的轮次中提取决策、纠正和结果 |
| 召回 | `agent/pre-step`（瀑布，prepend） | 关键词重叠 + 时间衰减 + 重要性评分；top-5 作为 `<memories>` 上下文注入 |
| 整合 | `agent/status` 空闲转换 | 合并相关记忆，裁剪过时条目，在空闲期间运行 |

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Profiles & Bundles                                             │
│  dsh-base ──► dsh-web-app / dsh-headless ──► user patch         │
├─────────────────────────────────────────────────────────────────┤
│  Agent Loop                                                     │
│  pre-step waterfall ──► model request ──► tool pipeline         │
│       ▲                      │                   │              │
│       │                      ▼                   ▼              │
│  memory-agent           llm/* events       tools/* events       │
│  time-context           (provider)         (execute)            │
├─────────────────────────────────────────────────────────────────┤
│  Capability Seams (Definition / Provider / Consumer)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ ctx.llm  │ │ctx.memory│ │  ctx.fs  │ │ctx.tools │          │
│  │ ctx.comp │ │ctx.skill │ │ctx.shell │ │ctx.jobs  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│  Session Log (append-only, replay-faithful)                     │
│  deriveMessages() ──► model context ──► UI rendering            │
└─────────────────────────────────────────────────────────────────┘
```

完整设计文档请参见 [Architecture](docs/architecture.zh.md)。

## 快速开始

### 通过 `npm`

```sh
npx @deepseek-ai/dsh web
```

在 `http://127.0.0.1:3080` 启动 Web UI。传入 `--no-open` 跳过浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

### 从源码

```sh
git clone https://github.com/fuboyang-user/llm-harness
cd llm-harness
pnpm install
pnpm run build
pnpm dsh web
```

### 无头模式

```sh
dsh --profile headless "your task here"
```

## 仓库结构

```
llm-harness/
├── apps/
│   ├── cli/              # `dsh` 产品启动器
│   └── web/              # Web 前端应用
├── packages/
│   ├── core/             # 产品 API 主干（session、agent、tools、prompts）
│   ├── llm/              # LLM 能力族（适配器、流式传输）
│   ├── memory/           # 认知记忆系统（定义、文件提供方、agent 消费方）
│   ├── compaction/       # 上下文压缩（定义、基础提供方、工具结果裁剪器）
│   ├── fs/               # 文件系统能力（接缝、工具、发现）
│   ├── shell/            # Shell 执行（Bash/PowerShell 接缝 + 工具）
│   ├── subagent/         # 子 agent 委派（spawn、fork、workflow）
│   ├── skill/            # 技能目录和加载器
│   ├── sandbox/          # 进程限制（bwrap、Landlock、Seatbelt）
│   ├── session/          # 会话持久化（JSONL、SQLite、投影）
│   ├── context/          # 面向模型的请求上下文（时间、工作区）
│   ├── interaction/      # 人工审批、命令、ask-user
│   ├── bundle/           # 可安装的 profile patch 层（base、web-app、headless）
│   ├── client/           # Web GUI 浏览器端（shell、UI 插件、wire）
│   ├── host/             # Web GUI 宿主端（API 网关、HTTP 服务器）
│   └── ...               # 30+ 更多能力包
├── vendor/               # Vendor 依赖（cordis、schemastery）
└── docs/                 # 架构、开发指南、cookbook
```

完整包索引：[packages/README.md](packages/README.md)。

## 扩展

| 目标 | 机制 |
|---|---|
| 添加模型提供商 | 在 `ctx.llm` 上注册适配器 |
| 添加面向模型的能力 | 在 `ctx.tools` 上注册；其 schema 加入提示词组装 |
| 添加持久化记忆 | 实现 `MemoryStore`；注册为 `ctx.memory` 提供方 |
| 添加 Shell 执行 | 注册 `ctx.shell` 后端 |
| 添加文件系统访问 | 注册 `ctx.fs` 提供方或监听 `fs/*` 事件 |
| 添加人工命令 | 在 `ctx.commands` 上注册；无需模型轮次即可调度 |
| 添加后台工作 | 在 `ctx.jobs` 上注册；`job_*` 工具进行控制 |
| 拦截轮次 | 使用 `agent/turn-stopping` 或 `agent/pre-step` 瀑布 |
| 添加 UI 集成 | 驱动 `ctx.agents` 并从 `session/event` 渲染 |

分步指南请参见 [Extension cookbook](docs/cookbook/extension-cookbook.md)。

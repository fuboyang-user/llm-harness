# LLM Harness

[English](README.md) | 中文

LLM Harness（`dsh`）是基于 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。它提供了一个可组合的、插件驱动的运行时，其中**每项能力均可替换**——从模型适配器、工具执行到会话持久化和 agent 生命周期管理。

由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

LLM Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 核心能力

| 能力 | 描述 | Seam |
|---|---|---|
| **认知记忆** | 跨会话持久化学习——agent 自动捕获经验、在每步之前召回相关知识，并随时间整合记忆 | `ctx.memory` |
| **多模型提供商** | DeepSeek 和 Pi AI 适配器，支持热加载凭据解析和按请求路由 | `ctx.llm` |
| **工具生态** | 文件系统、Bash、PowerShell、Web 搜索、LSP、技能、工作流、子 agent——全部位于可替换的提供方之后 | `ctx.tools` |
| **会话压缩** | 自动上下文窗口管理，具备重放保真的摘要和检查点持久性 | `ctx.compaction` |
| **沙箱与审批** | 进程限制（bwrap/Landlock/Seatbelt）、权限预设和人机协同审批 | `ctx.sandbox` |
| **子 agent 委派** | Spawn、fork 和工作流子 agent，支持可延续的后台执行和一次性报告 | `ctx.subagent` |
| **技能系统** | 可发现的、带徽章的 agent 技能，具备文件系统支持的目录和面向模型的加载器 | `ctx.skill` |
| **Web GUI** | 全功能浏览器应用，支持实时对话、模型选择、工作区管理和插件清单 | `ctx.webServer` |

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

一切皆插件。没有特权核心——你只需将插件挂载到其他插件旁边即可扩展 dsh，注册是随插件卸载而撤销的副作用。**能力接缝**模式（Definition / Provider / Consumer）确保一次提供方替换即可改变整个产品。

完整设计文档请参见 [Architecture](docs/architecture.zh.md)。

## 运行

### 通过 `npm` 运行

安装 `Node.js`（22.19+），然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI 并在默认浏览器中打开。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

### 从源码运行

```sh
git clone https://github.com/fuboyang-user/llm-harness
cd llm-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

### 无头模式

无需服务器即可运行一次性会话：

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

新行为挂载到已记录的扩展点：

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

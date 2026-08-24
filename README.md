# LLM Harness

English | [中文](README.zh.md)

LLM Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com). It provides a composable, plugin-driven runtime where **every capability is replaceable** — from model adapters and tool execution to session persistence and agent lifecycle management.

Powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

LLM Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Key capabilities

| Capability | Description | Seam |
|---|---|---|
| **Cognitive Memory** | Persistent cross-session learning — the agent automatically captures experiences, recalls relevant knowledge before each step, and consolidates memories over time | `ctx.memory` |
| **Multi-Provider LLM** | DeepSeek and Pi AI adapters with hot-reloadable credential resolution and per-request routing | `ctx.llm` |
| **Tool Ecosystem** | Filesystem, Bash, PowerShell, web search, LSP, skills, workflow, subagents — all behind swappable providers | `ctx.tools` |
| **Session Compaction** | Automatic context-window management with replay-faithful summarization and checkpoint durability | `ctx.compaction` |
| **Sandbox & Approval** | Process confinement (bwrap/Landlock/Seatbelt), permission presets, and human-in-the-loop approval | `ctx.sandbox` |
| **Subagent Delegation** | Spawn, fork, and workflow children with continuable background execution and one-shot reporting | `ctx.subagent` |
| **Skill System** | Discoverable, badge-bearing agent skills with filesystem-backed catalog and model-facing loader | `ctx.skill` |
| **Web GUI** | Full-featured browser application with real-time conversation, model selection, workspace management, and plugin inventory | `ctx.webServer` |

## Architecture

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

Everything is a plugin. There is no privileged core — you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads. The **capability seam** pattern (Definition / Provider / Consumer) ensures one provider swap changes the whole product.

See [Architecture](docs/architecture.md) for the full design document.

## Run

### Run from `npm`

Install `Node.js` (22.19+), then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

```sh
git clone https://github.com/fuboyang-user/llm-harness
cd llm-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Headless mode

Run one-shot sessions without a server:

```sh
dsh --profile headless "your task here"
```

## Repository structure

```
llm-harness/
├── apps/
│   ├── cli/              # The `dsh` product launcher
│   └── web/              # Web frontend application
├── packages/
│   ├── core/             # Product API spine (session, agent, tools, prompts)
│   ├── llm/              # LLM capability family (adapters, streaming)
│   ├── memory/           # Cognitive memory system (definition, file provider, agent consumer)
│   ├── compaction/       # Context compaction (definition, basic provider, tool-result pruner)
│   ├── fs/               # Filesystem capability (seam, tools, discovery)
│   ├── shell/            # Shell execution (Bash/PowerShell seam + tools)
│   ├── subagent/         # Subagent delegation (spawn, fork, workflow)
│   ├── skill/            # Skill catalog and loader
│   ├── sandbox/          # Process confinement (bwrap, Landlock, Seatbelt)
│   ├── session/          # Session persistence (JSONL, SQLite, projection)
│   ├── context/          # Model-visible request context (time, workspace)
│   ├── interaction/      # Human approval, commands, ask-user
│   ├── bundle/           # Installable profile patch layers (base, web-app, headless)
│   ├── client/           # Web GUI browser half (shell, UI plugins, wire)
│   ├── host/             # Web GUI host half (API gateway, HTTP server)
│   └── ...               # 30+ more capability packages
├── vendor/               # Vendored dependencies (cordis, schemastery)
└── docs/                 # Architecture, development guides, cookbook
```

Full package index: [packages/README.md](packages/README.md).

## Extending

New behavior attaches to a documented extension point:

| Goal | Mechanism |
|---|---|
| Add a model provider | Register adapter on `ctx.llm` |
| Add a model-facing capability | Register on `ctx.tools`; its schema joins prompt assembly |
| Add persistent memory | Implement `MemoryStore`; register as `ctx.memory` provider |
| Add shell execution | Register a `ctx.shell` backend |
| Add filesystem access | Register a `ctx.fs` provider or listen to `fs/*` events |
| Add a human command | Register on `ctx.commands`; dispatches without a model turn |
| Add background work | Register on `ctx.jobs`; `job_*` tools control it |
| Intercept a turn | Use `agent/turn-stopping` or `agent/pre-step` waterfall |
| Add UI integration | Drive `ctx.agents` and render from `session/event` |

See the [Extension cookbook](docs/cookbook/extension-cookbook.md) for step-by-step guides.

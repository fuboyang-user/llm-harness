# LLM Harness

English | [中文](README.zh.md)

LLM Harness (`llmh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com) and DeepSeek Harness. It provides a composable, plugin-driven runtime where **every capability is replaceable** — from model adapters and tool execution to session persistence and agent lifecycle management.

Powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Engineering innovations

### 1. Capability seam: Definition / Provider / Consumer

Every swappable capability follows a three-role structure — not ad-hoc plugin hooks:

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Service Definition │     │  Service Provider   │     │     Consumer        │
│  abstract class     │◄────│  implements         │────►│  integrates into    │
│  claims ctx.<key>   │     │  concrete backend   │     │  agent loop / tools │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

A seam with only one role is incomplete. One provider swap changes the whole product — point `ctx.fs` and `ctx.shell` at a remote sandbox and Bash, PTY, filesystem, and LSP all move together with zero provider forks. Current seams:

| Seam | Definition | Providers | What it covers |
|---|---|---|---|
| `ctx.llm` | LLM adapter registry | DeepSeek, Pi AI, replay | Model streaming, credential routing |
| `ctx.memory` | MemoryStore | file (JSON), agent lifecycle | Cross-session cognitive memory |
| `ctx.fs` | Filesystem capability | local, sandbox-mounted | File read/write/edit with policy |
| `ctx.shell` | Shell execution | local (bash/pwsh) | Command execution through `ctx.subprocess` |
| `ctx.sandbox` | Process confinement | bwrap, Landlock, Seatbelt | Cross-platform sandboxing |
| `ctx.compaction` | Context compaction | basic (summarization) | Context-window management |
| `ctx.subagent` | Subagent delegation | in-process, workflow | Spawn/fork child agents |
| `ctx.tools` | Tool registry | core + 30+ tool plugins | Every model-facing tool |

### 2. Model-visible ⟺ logged: single source of truth

Anything that reaches a model request **must** be reconstructable from the append-only session log — enforced by a runtime invariant, not convention.

```
session/event (append-only log)
  ├── deriveMessages()     ──► model context
  ├── session-persistence  ──► disk (JSONL / SQLite)
  ├── compaction           ──► summarization checkpoints
  ├── session-projection   ──► UI rendering
  ├── fork / resume        ──► derived sessions
  └── telemetry            ──► observability
```

There is no side channel. A new model-visible input requires a new `SessionEventMap` entry — the invariant asserts it. This is why session titles, compaction, memory recall, and UI cards all replay faithfully from the same event stream.

### 3. Waterfall-driven agent lifecycle

The agent loop is not hard-coded — it is a **typed event sequence**. Each phase is a waterfall that plugins intercept, rewrite, or short-circuit:

```
turn/start
  └─► agent/pre-step (waterfall)     ← memory injection, compaction, hooks, context
       └─► agent/request (waterfall) ← request rewriting
            └─► llm/stream (waterfall)  ← retry, checkpoint, title generation
                 └─► assistant/message
                      └─► tools/pre-execute  (waterfall) ← hooks, permission, sandbox
                           └─► monotonic guards           ← deny/abstain, identity protected
                                └─► tools/execute (waterfall) ← timeout, retry, metrics
                                     └─► tools/post-execute (waterfall) ← accept, block, replace
                                          └─► tools/result (notification) ← frozen outcome
  └─► agent/turn-stopping (serial)   ← hooks observe final decision
turn/end
```

New behavior attaches to a documented extension point. Changing the loop itself updates the architecture map.

### 4. Profile → Bundle → Patch: composable distribution

A running `llmh` is a plugin tree composed at boot from ordered layers — no privileged core:

```
Profile (web / headless / custom)
  ├── Bundle: dsh-base        ── model, tools, persistence, sandbox, credentials
  ├── Bundle: dsh-web-app     ── browser application
  │                              (or dsh-headless for one-shot runner)
  ├── user cordis.patch.yml   ── override any row by id
  └── --patch overlay          ── CLI-level override
```

`llmh --dump-config` prints the full tree your machine actually boots. Any row can be replaced by a patch.

### 5. Reversible effect system

Every registration goes through `ctx.effect()` or `ctx.on()` with a disposer:

- Prompt sections, tool schemas, adapters, event listeners — all are effects
- Plugin unload unwinds registrations in **reverse order**
- Hot-reload, sandbox teardown, and context scoping become composable, not hand-managed

### 6. Cognitive memory via extension points

Cross-session persistent memory integrated **without modifying the agent loop**:

| Phase | Extension point | What happens |
|---|---|---|
| Capture | `agent/turn-stopping` (serial) | Observer extracts decisions, corrections, and outcomes from completed turns |
| Recall | `agent/pre-step` (waterfall, prepend) | Keyword overlap + recency + importance scoring; top-5 injected as `<memories>` context |
| Consolidate | `agent/status` idle transition | Merges related memories, prunes outdated entries, runs during idle |

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

See [Architecture](docs/architecture.md) for the full design document.

## Quick start

### From `npm`

```sh
npx @deepseek-ai/dsh web
```

Starts the Web UI at `http://127.0.0.1:3080`. Pass `--no-open` to skip the browser. See [Web UI guide](docs/user/guide/index.md).

### From source

```sh
git clone https://github.com/fuboyang-user/llm-harness
cd llm-harness
pnpm install
pnpm run build
pnpm llmh web
```

### Headless mode

```sh
llmh --profile headless "your task here"
```

## Repository structure

```
llm-harness/
├── apps/
│   ├── cli/              # The `llmh` product launcher
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

# Sisyphus Repository Summary

**Package**: `sisyphi` (npm) · **Commands**: `sisyphus` (CLI), `sisyphusd` (daemon) · **Version**: 1.1.7 · **Runtime**: Node 22, ESM

Sisyphus is a tmux-integrated orchestration daemon for Claude Code multi-agent workflows. A background daemon manages sessions where an orchestrator Claude instance breaks tasks into subtasks, spawns agent Claude instances in tmux panes, and coordinates their lifecycle through cycles. The orchestrator is stateless — killed after yielding, respawned fresh each cycle with full session state — so it never runs out of context.

---

## Architecture

Four layers communicate over a Unix socket (`~/.sisyphus/daemon.sock`) with a JSON line-delimited protocol (22 request types):

```
CLI  ──→ socket ──→  Daemon
TUI  ──→ socket ──→  Daemon
              ↑
        Shared (types, protocol, paths, config)
```

## Source Code (`src/`)

### `src/cli/` — CLI Layer (25 files)
**Entry**: `src/cli/index.ts` → `dist/cli.js` → `sisyphus` command

Commander.js program with 22 subcommands (`start`, `spawn`, `submit`, `yield`, `complete`, `status`, `list`, `resume`, `kill`, `dashboard`, etc.). Each command sends a JSON request to the daemon over the Unix socket. Includes daemon auto-install via launchd, onboarding flow, and tmux keybind setup.

### `src/daemon/` — Daemon Layer (14 files)
**Entry**: `src/daemon/index.ts` → `dist/daemon.js` → `sisyphusd` command

Background service that manages everything:
- **`server.ts`** — Unix socket server, routes requests, maintains session registry
- **`session-manager.ts`** — Session lifecycle: create, resume, kill, agent spawning, orchestrator respawn, pruning (keeps 10 / 7 days)
- **`orchestrator.ts`** — Spawns orchestrator Claude in tmux, writes prompt files
- **`agent.ts`** — Spawns agent Claude instances, auto-increments IDs, resolves agent types
- **`state.ts`** — Atomic persistence (temp file + rename) with session-level mutex and snapshots
- **`pane-monitor.ts`** — Background poller (5s) detecting pane exits, triggers cleanup/respawn
- **`tmux.ts`** — tmux CLI wrapper for session/window/pane CRUD and layout

### `src/tui/` — Terminal UI Layer (16 files)
**Entry**: `src/tui/index.ts` → `dist/tui.js` (launched via `sisyphus dashboard`)

Raw ANSI cursor-addressed rendering with frame-buffer diffing (no React/Ink). Three panels: tree (session/agent hierarchy), detail (selected item info), and bottom (status/input). Supports keyboard/mouse input, leader key menus, clipboard integration. Communicates with daemon over the same socket protocol.

### `src/shared/` — Shared Layer (8 files)
Pure shared contract — no imports from other layers. Provides:
- Domain types (`Session`, `Agent`, `OrchestratorCycle`)
- Protocol types (`Request`/`Response` unions — 22 variants)
- Path helpers (global `~/.sisyphus/`, project `.sisyphus/`, session subdirs)
- Layered config resolution (defaults → global → project)
- Environment/exec utilities for child processes

### `src/__tests__/` — Tests (3 files)
Node.js native test runner. Covers state persistence, session lifecycle logic, and YAML frontmatter parsing.

---

## Templates (`templates/`)

System prompt templates rendered at runtime:
- **Orchestrator**: `orchestrator-base.md` + phase-specific overlays (`-planning`, `-strategy`, `-impl`, `-validation`) selected by `--mode` flag
- **Agents**: `agent-suffix.md` with `{{SESSION_ID}}`/`{{INSTRUCTION}}` placeholders
- **TUI companion**: `dashboard-claude.md` with `{{CWD}}`/`{{SESSIONS_CONTEXT}}`

**Plugin subdirectories** (for crouton-kit companion plugin):
- `agent-plugin/` — Specialized agent types: debug, explore, operator, plan, review, design, problem, requirements, test-spec. Includes hooks and per-type prompts.
- `orchestrator-plugin/` — Orchestrator overrides: hooks, skills (orchestration patterns), slash commands
- `companion-plugin/` — Companion workflow hooks

---

## Infrastructure & Config

### `launchd/` — macOS Service
`com.sisyphus.daemon.plist` — Runs daemon via launchd with `RunAtLoad: true`, keeps alive on non-zero exit, logs to `~/.sisyphus/daemon.log`.

### `.github/` — CI/CD
Single workflow: push to `main` → auto-bump patch version → tag → publish to npm with provenance (Node 22, trusted publishing).

### `.claude/` — Claude Code Project Config
Rules for prompt template editing, a custom agent definition, `/restart` command, and a multi-repo-support spec.

### Build System
- **`tsup.config.ts`** — Bundles 3 entry points (cli, daemon, tui) as ESM, Node 22 target, code splitting, shebangs added, templates copied to `dist/templates/` on success
- **`tsconfig.json`** — Strict TypeScript, ES2022, NodeNext resolution

### Root Documents
- **`CLAUDE.md`** — Primary onboarding doc: architecture, lifecycle, conventions, common patterns
- **`IDEAS.md`** — Future ideas (reactive orchestrator inbox model, agent self-tasking)
- **`README.md`** — Project overview with ASCII art banner

---

## Session Lifecycle

1. `sisyphus start "task"` → daemon creates session, spawns orchestrator Claude in tmux
2. Orchestrator updates `roadmap.md`, spawns agents via `sisyphus spawn`, then calls `sisyphus yield`
3. Daemon kills orchestrator pane, monitors agent panes via polling
4. Agents work in parallel, each calls `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator with updated state (next cycle)
6. Orchestrator reviews reports, spawns more agents or calls `sisyphus complete`

### Session Storage (project-relative)
```
.sisyphus/sessions/{sessionId}/
  state.json        # Atomic JSON (managed by daemon)
  strategy.md       # Problem-solving map
  goal.md           # Refined goal statement
  roadmap.md        # Working memory (orchestrator-managed)
  logs.md           # Session log
  prompts/          # Generated prompt files
  reports/          # Agent reports
  context/          # Persistent artifacts
```

### Key Conventions
- Session IDs: UUIDs · Agent IDs: `agent-001`, `agent-002` (zero-padded)
- Orchestrator pane: always yellow · Agent panes: rotate through 6 colors
- All tmux panes use `split-window -h` with `even-horizontal` layout
- State mutations always via `state.ts` (atomic temp+rename)

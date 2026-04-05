# Source Code Layers — Exploration Summary

## 1. `src/cli/` — CLI Layer

**Entry point**: `src/cli/index.ts` → built to `dist/cli.js` → becomes `sisyphus` command

**Files** (25 total):
- `index.ts` — Commander.js program setup, registers 25 commands, version from package.json, first-run welcome
- `client.ts` — Socket client with retry logic (5 attempts, auto-installs daemon via launchd on macOS)
- `install.ts` — Daemon launchd installation/uninstallation
- `stdin.ts` — Stdin reading utilities
- `tmux.ts` — CLI-side tmux helpers
- `tmux-setup.ts` — Tmux keybind setup
- `onboard.ts` — Onboarding flow logic
- `commands/` (22 files): `start`, `spawn`, `submit`, `report`, `yield`, `complete`, `continue`, `status`, `list`, `resume`, `kill`, `uninstall`, `notify`, `message`, `update-task`, `dashboard`, `rollback`, `restart-agent`, `setup-keybind`, `doctor`, `companion-context`, `getting-started`, `init`, `setup`

**Key pattern**: Each command module exports `register{Command}(program)` which sets up a Commander.js subcommand. Commands send JSON requests to the daemon via `client.ts` → Unix socket.

**Connections**: Imports from `src/shared/` (paths, protocol, config). Communicates with daemon over `~/.sisyphus/daemon.sock`.

---

## 2. `src/daemon/` — Daemon Layer

**Entry point**: `src/daemon/index.ts` → built to `dist/daemon.js` → becomes `sisyphusd` command

**Files** (14 total):
- `index.ts` — Daemon startup (PID lock, server start, session recovery, shutdown), supports `start|stop|restart` subcommands
- `server.ts` — Unix socket server on `~/.sisyphus/daemon.sock`, JSON line-delimited protocol, routes requests to session-manager, maintains in-memory session tracking map, persists registry to disk
- `session-manager.ts` — Core session lifecycle: create, resume, kill, rollback, spawn agents, handle submit/yield/complete, orchestrator respawn logic, session pruning (keeps 10 / 7 days)
- `orchestrator.ts` — Spawns orchestrator Claude in tmux pane, writes system/user prompts to `prompts/` dir
- `agent.ts` — Spawns agent Claude instances, auto-increments agent IDs, resolves agent type frontmatter
- `state.ts` — Atomic state persistence (temp file + rename), session-level mutex, snapshot create/restore
- `pane-monitor.ts` — Background poller (5s) detecting pane exits, triggers cleanup/respawn
- `pane-registry.ts` — Maps paneId → {sessionId, role, agentId}
- `tmux.ts` — tmux CLI wrapper (session/window/pane CRUD, layout, pane styling)
- `colors.ts` — Color cycling (orchestrator=yellow, agents rotate through 6 colors)
- `spawn-helpers.ts` — Agent spawning utilities
- `frontmatter.ts` — YAML frontmatter parser for agent type definitions
- `notify.ts` — Terminal notifications
- `summarize.ts` — Haiku-based session naming and report summarization
- `updater.ts` — Auto-update logic

**Connections**: Imports from `src/shared/` (types, protocol, paths, config). Receives requests from CLI and TUI over socket.

---

## 3. `src/tui/` — TUI Layer

**Entry point**: `src/tui/index.ts` → built to `dist/tui.js`

**Files** (16 total):
- `index.ts` — Entry point: parses `--cwd` arg, sets up terminal, creates app state, starts app
- `app.ts` — Main controller: socket polling, state management, input handling, render loop
- `state.ts` — Local UI state (focus, scroll, cursor, notifications)
- `input.ts` — Keyboard/mouse event handlers
- `render.ts` — Frame-buffer creation, diffing, flushing to terminal
- `terminal.ts` — Raw terminal setup (alternate screen, mouse protocol, keypress listener)
- `panels/tree.ts` — Tree panel (session/agent hierarchy)
- `panels/detail.ts` — Detail panel (selected item info, logs)
- `panels/bottom.ts` — Status line, notification row, input bar
- `panels/overlays.ts` — Leader key menu, copy menu, help overlay
- `lib/client.ts` — Socket client for daemon communication
- `lib/tree.ts` — Tree data structure builder
- `lib/tree-render.ts` — Tree rendering to frame buffer
- `lib/reports.ts` — Report resolution utilities
- `lib/format.ts` — TUI-specific formatting
- `lib/tmux.ts` — TUI-side tmux operations (open popups, switch sessions)
- `lib/clipboard.ts` — Clipboard integration
- `lib/context.ts` — Session context builder
- `types/tree.ts` — Tree node type definitions

**Key pattern**: Raw ANSI rendering with frame-buffer diffing. No React/Ink. Communicates with daemon over same Unix socket protocol as CLI.

**Connections**: Imports from `src/shared/` (paths, config, protocol). Same socket protocol as CLI.

---

## 4. `src/shared/` — Shared Types and Utilities

**Files** (8 total):
- `types.ts` — Core domain types: `Session`, `Agent`, `OrchestratorCycle`, `Message`, `AgentStatus`, `SessionStatus`, `Provider`
- `protocol.ts` — `Request` (22 variants) and `Response` union types — the CLI↔Daemon contract
- `paths.ts` — All path computation: global (`~/.sisyphus/`), project (`.sisyphus/`), session dirs, reports, prompts, context, snapshots, logs
- `config.ts` — Layered config: defaults → global → project. `Config` interface with model, pollIntervalMs, effort levels, etc.
- `client.ts` — Low-level `rawSend()` socket function (10s timeout, JSON line protocol)
- `env.ts` — `augmentedPath()` prepends Homebrew/MacPorts/nix bin dirs to PATH; `execEnv()` for child processes
- `exec.ts` — `exec()` and `execSafe()` wrappers around `execSync` with augmented PATH
- `shell.ts` — `shellQuote()` utility
- `format.ts` — `formatDuration()` and `statusColor()` helpers
- `utils.ts` — `computeActiveTimeMs()` — returns session's tracked active time

**Key constraint**: No imports from cli/, daemon/, or tui/. Pure shared contract.

---

## 5. `src/__tests__/` — Test Files

**Files** (3 total):
- `state.test.ts` — Tests for state.ts atomic persistence
- `session-logic.test.ts` — Tests for session lifecycle logic
- `frontmatter.test.ts` — Tests for YAML frontmatter parsing

Uses Node.js native test runner (`node --import tsx --test`).

---

## Entry Point Summary

| Binary | Source Entry | Build Output | Command |
|--------|-------------|-------------|---------|
| CLI | `src/cli/index.ts` | `dist/cli.js` | `sisyphus` |
| Daemon | `src/daemon/index.ts` | `dist/daemon.js` | `sisyphusd` |
| TUI | `src/tui/index.ts` | `dist/tui.js` | (launched via `sisyphus dashboard`) |

## Inter-Layer Communication

All three user-facing layers (CLI, TUI, Daemon) communicate over a Unix socket at `~/.sisyphus/daemon.sock` using JSON line-delimited protocol defined in `src/shared/protocol.ts`. The shared layer provides types, paths, and config used by all other layers but imports from none of them.

```
CLI ──→ socket ──→ Daemon
TUI ──→ socket ──→ Daemon
         ↑
      Shared (types, protocol, paths, config)
```

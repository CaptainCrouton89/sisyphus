# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run build          # Build with tsup → dist/
npm run dev            # Build in watch mode (CLI only)
npm run dev:daemon     # Watch + auto-restart daemon on each rebuild
```

The CLI binary is at `dist/cli.js`, the daemon at `dist/daemon.js`. Both get a shebang via tsup banner config.

**The daemon must be restarted after rebuilding** — it runs the built `dist/daemon.js` in-process, so code changes aren't picked up until restart. Use `npm run dev:daemon` during development to handle this automatically.

## What Sisyphus Is

A tmux-integrated orchestration daemon for Claude Code multi-agent workflows. A background daemon manages sessions where an **orchestrator** Claude instance breaks tasks into subtasks, spawns **agent** Claude instances in tmux panes, and coordinates their lifecycle through cycles.

## Architecture

**Three layers** communicating over a Unix socket (`~/.sisyphus/daemon.sock`) with JSON line-delimited protocol:

```
CLI (src/cli/)  ←→  Daemon (src/daemon/)  ←→  Shared (src/shared/)
```

### Daemon (`src/daemon/`)

- **server.ts** — Unix socket server, routes requests to SessionManager
- **session-manager.ts** — Session lifecycle: start, resume, spawn, submit, yield, complete
- **orchestrator.ts** — Spawns orchestrator Claude with prompt template + session state JSON. Respawned fresh each cycle
- **agent.ts** — Spawns agent Claude instances. Tracks per-session agent counter (`agent-001`, `agent-002`, etc.)
- **pane-monitor.ts** — Polls tmux panes at interval to detect killed agents/orchestrator
- **state.ts** — Atomic JSON state persistence (temp file + rename)
- **tmux.ts** — tmux CLI wrapper (create panes, kill panes, send keys, set styles)

### CLI (`src/cli/`)

- **client.ts** — Connects to daemon Unix socket
- **commands/** — `start`, `spawn`, `submit`, `yield`, `complete`, `status`, `tasks`, `list`, `resume`

### Shared (`src/shared/`)

- **types.ts** — Session, Agent, Task, OrchestratorCycle types
- **protocol.ts** — Request/response message types for the socket protocol
- **paths.ts** — File paths: `~/.sisyphus/` (global), `.sisyphus/` (project), `.sisyphus/sessions/{id}/state.json`
- **config.ts** — Layered config: defaults → global → project

## Session Lifecycle

1. `sisyphus start "task"` → daemon creates session, spawns orchestrator Claude in tmux pane
2. Orchestrator adds tasks (`sisyphus tasks add`), spawns agents (`sisyphus spawn`), then yields (`sisyphus yield`)
3. Daemon kills orchestrator pane, monitors agent panes via polling
4. Agents work in parallel, each calls `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator with updated state (next cycle)
6. Orchestrator reviews reports, spawns more agents or calls `sisyphus complete`

Orchestrator and agents receive `SISYPHUS_SESSION_ID` and `SISYPHUS_AGENT_ID` environment variables.

## Templates

- `templates/orchestrator.md` — Orchestrator prompt (instructions + CLI reference)
- `templates/agent-suffix.md` — Appended to agent instructions, uses `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders

## Key Conventions

- **IDs**: Sessions are UUIDs, agents are `agent-NNN` (zero-padded), tasks are `t1`, `t2`, etc.
- **Colors**: Orchestrator is always yellow. Agents rotate through `[blue, green, magenta, cyan, red, white]`
- **State files**: `.sisyphus/sessions/{sessionId}/state.json` — atomically written JSON
- **Config**: `~/.sisyphus/config.json` (global) and `.sisyphus/config.json` (project) with options: `model`, `orchestratorPrompt`, `pollIntervalMs`
- **Daemon**: Intended to run via launchd (`launchd/com.sisyphus.daemon.plist`), logs to `~/.sisyphus/daemon.log`
- **TypeScript**: Strict mode, ESM (`"type": "module"`), Node 22 target

# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager
- **session-manager.ts** — Entry point for all session operations: lifecycle methods delegate to orchestrator/agent/monitor modules
- **orchestrator.ts** — Spawns fresh orchestrator Claude each cycle; receives session state JSON and prompt template
- **agent.ts** — Spawns agent Claude instances; auto-increments agent counter (`agent-001`, `agent-002`, …) per session
- **pane-monitor.ts** — Background poller detects killed tmux panes; triggers cleanup on orchestrator or agent death
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash
- **tmux.ts** — tmux CLI wrapper (create/kill panes, send keys, apply styles)

## Key Patterns

**State flow**: Immutable session state (`.sisyphus/sessions/{id}/state.json`) is read, modified, and atomically rewritten after each operation. Session manager owns all mutations.

**Pane lifecycle**: Orchestrator pane is created at session start and respawned at each cycle boundary. Agent panes are created on-demand via `spawn`, killed on `submit`. Monitor polls tmux to detect unexpected pane kills.

**Agent naming**: Counter starts at 1 per session, increments on each spawn. Format: `agent-NNN` (zero-padded to 3 digits).

**Colors**: Orchestrator always yellow; agents cycle `[blue, green, magenta, cyan, red, white]` deterministically per counter mod 6.

## Constraints

- Do not write state directly to `.sisyphus/sessions/{id}/state.json` — use `state.ts` atomic write
- Pane monitor is best-effort polling; fast kills may not be caught — rely on socket timeout or CLI retry
- Environment variables (`SISYPHUS_SESSION_ID`, `SISYPHUS_AGENT_ID`) must be set before spawning Claude
- tmux errors (pane not found, session closed) are fatal — propagate via rejection, don't swallow

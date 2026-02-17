# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps and persists registry to disk for recovery.
- **session-manager.ts** — Entry point for all session operations: lifecycle methods delegate to orchestrator/agent/monitor modules
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle with formatted session state. Caches window/pane IDs in memory.
- **agent.ts** — Spawns agent Claude instances; auto-increments per-session counter (`agent-001`, `agent-002`, …). Renders agent system prompts from template.
- **pane-monitor.ts** — Background poller detects killed tmux panes; triggers cleanup on orchestrator or agent death
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash
- **tmux.ts** — tmux CLI wrapper (create/kill panes, send keys, apply styles)

## Key Patterns

**Session tracking**: Server maintains three in-memory maps (`sessionCwdMap`, `sessionTmuxMap`, `sessionWindowMap`) to route requests. Maps are synced to disk registry (`~/.sisyphus/session-registry.json`) after mutations. On daemon restart, registry is loaded to recover active sessions.

**State flow**: Immutable session state (`.sisyphus/sessions/{id}/state.json`) is read, modified, and atomically rewritten after each operation. Session manager owns all mutations.

**Pane lifecycle**: Orchestrator pane is created at session start and respawned at each cycle boundary. Agent panes are created on-demand via `spawn`, killed on `submit`. Monitor polls tmux to detect unexpected pane kills.

**Agent naming**: Per-session counter starts at 1, increments on each spawn. Format: `agent-NNN` (zero-padded to 3 digits).

**Orchestrator prompt**: System prompt is loaded from project override (`.sisyphus/orchestrator.md`) or bundled template, appended with `<state>` block (formatted task/agent/cycle summary), written to temp file, then passed to Claude via `--append-system-prompt`.

**Colors**: Orchestrator always yellow; agents cycle `[blue, green, magenta, cyan, red, white]` deterministically per counter mod 6.

## Constraints

- Do not write state directly to `.sisyphus/sessions/{id}/state.json` — use `state.ts` atomic write
- Session maps must be persisted after mutations; use `registerSessionCwd()` to keep registry in sync
- Pane monitor is best-effort polling; fast kills may not be caught — rely on socket timeout or CLI retry
- Environment variables (`SISYPHUS_SESSION_ID`, `SISYPHUS_AGENT_ID`) must be set before spawning Claude
- tmux errors (pane not found, session closed) are fatal — propagate via rejection, don't swallow

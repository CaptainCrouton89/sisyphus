# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock to prevent duplicate instances, starts server + monitor, recovers active/paused sessions from registry on startup, handles graceful shutdown (SIGTERM/SIGINT)
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps and persists registry to disk for recovery.
- **session-manager.ts** — Entry point for all session operations: delegates to orchestrator/agent/monitor, coordinates cleanup (agent counter reset, pane untracking)
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle with formatted session state. Caches window/pane IDs. Writes system + user prompts separately to disk.
- **agent.ts** — Spawns agent Claude instances; auto-increments per-session counter (`agent-001`, `agent-002`, …). Renders agent system prompts from template.
- **pane-monitor.ts** — Background poller detects killed tmux panes; triggers cleanup. Explicitly tracks sessions with `trackSession/updateTrackedWindow/untrackSession` lifecycle
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash
- **tmux.ts** — tmux CLI wrapper (create/kill panes, send keys, apply styles via per-pane user variables)

## Key Patterns

**Session tracking**: Server maintains in-memory maps to route requests; synced to disk registry after mutations. Pane monitor tracks sessions separately via `trackSession/updateTrackedWindow/untrackSession` to detect user-closes. On daemon restart, registry loads and `active`/`paused` sessions recover.

**State formatting**: `formatStateForOrchestrator()` builds human-readable `<state>` block with task, status, agent summaries (with report counts/timestamps), plan/logs file references, context files list, and cycle history. Avoids raw JSON.

**Prompts**: System prompt (template only) and user prompt (state block + contextual instruction) written to separate files. Both passed via Claude flags to avoid tmux send-keys quoting issues.

**Pane lifecycle**: Orchestrator pane created at session start, respawned after all agents complete (2s delay via monitor callback). Agent panes created on-demand, killed on submit. Monitor polls to detect unexpected kills.

**Agent naming**: Per-session counter starts at 1, zero-padded to 3 digits. Counter resets on new sessions; on resume, reset from existing agents to preserve ID sequence.

**Colors**: Orchestrator always yellow; agents cycle deterministically per counter mod 6 via shared color map. Tmux user variables per-pane.

**Daemon lifecycle**: PID lock prevents duplicate daemons. Registry recovery on startup. Graceful shutdown (SIGTERM/SIGINT) stops server + monitor, releases lock.

## Constraints

- Do not write state directly — use `state.ts` atomic writes
- Always untrack sessions from pane monitor when killing/completing
- Reset agent counters on new sessions; preserve + reset-from-state on resume
- Prompt files must be on disk; avoid shell quoting via tmux send-keys
- tmux errors are fatal — propagate, don't swallow
- Pane monitor is best-effort polling; fast kills may miss

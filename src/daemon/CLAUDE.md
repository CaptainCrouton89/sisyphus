# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock to prevent duplicate instances, starts server + monitor, recovers active/paused sessions from registry on startup with **stuck-session detection**, handles graceful shutdown (SIGTERM/SIGINT), exposes stop/restart CLI commands
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps and persists registry to disk for recovery.
- **session-manager.ts** — Entry point for all session operations: delegates to orchestrator/agent/monitor, coordinates cleanup (agent counter reset, pane untracking, worktree merging). Handles worktree merge callbacks before respawning orchestrator.
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle with formatted session state. Caches window/pane IDs. Writes system + user prompts to `prompts/` subdir. Includes worktree status and merge conflict hints in state block.
- **agent.ts** — Spawns agent Claude instances; auto-increments per-session counter (`agent-001`, `agent-002`, …). Supports worktree isolation: creates isolated git worktrees, renders agent system prompts with worktree context + port offset. Exports `SISYPHUS_PORT_OFFSET` env var.
- **pane-monitor.ts** — Background poller detects killed tmux panes; triggers cleanup. Explicitly tracks sessions with `trackSession/updateTrackedWindow/untrackSession` lifecycle
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash
- **tmux.ts** — tmux CLI wrapper (create/kill panes, send keys, apply styles via per-pane user variables)
- **worktree.ts** — Git worktree management: create isolated worktrees per agent (when `--worktree` flag set), track branch names, merge back to main branch, detect/report conflicts. Called by agent spawn + session cleanup.
- **colors.ts** — Color cycling for panes: orchestrator always yellow, agents rotate through 6 colors deterministically.

## Key Patterns

**Session recovery on startup**: On daemon restart, registry loads and `active`/`paused` sessions recover. Reconnects to live tmux panes, restores orchestrator pane ID from last incomplete cycle, and **detects stuck sessions** (all agents done but no live orchestrator) — if found, immediately triggers orchestrator respawn.

**Stuck session detection**: Pane monitor continuously checks if all agents are non-running and orchestrator pane is gone. If both true, triggers `onAllAgentsDone()`. Also detected during startup recovery.

**Session tracking**: Server maintains in-memory maps to route requests; synced to disk registry after mutations. Pane monitor tracks sessions separately via `trackSession/updateTrackedWindow/untrackSession` to detect user-closes and stuck states.

**State formatting**: `formatStateForOrchestrator()` builds human-readable `<state>` block with task, status, agent summaries (report counts/timestamps), plan/logs/context references, cycle history, and **worktree status** (only if agents have worktrees). Includes git worktree hints (config active vs. disabled).

**Prompts**: System prompt (template only) and user prompt (state block + instruction) written to `prompts/` subdir (not session root). Both passed via Claude flags to avoid tmux send-keys quoting issues.

**Worktree merging**: Before orchestrator respawn, `onAllAgentsDone()` merges any pending worktrees back to main branch, capturing conflict status in agent state (`mergeStatus`, `mergeDetails`). Conflicts are reported to orchestrator in next cycle's state block.

**Worktrees**: When `spawnAgent()` called with `opts.worktree=true`, creates isolated git worktree via `createWorktree()`. Agent receives `SISYPHUS_PORT_OFFSET` (computed from existing worktree count) and worktree context in system prompt. On session kill, `cleanupWorktree()` removes worktrees.

**Pane lifecycle**: Orchestrator pane created at session start, respawned after all agents complete (2s delay via monitor callback). Agent panes created on-demand, killed on submit. Monitor polls to detect unexpected kills.

**Agent naming**: Per-session counter starts at 1, zero-padded to 3 digits. Counter resets on new sessions; on resume, reset from existing agents to preserve ID sequence.

**Colors**: Orchestrator always yellow; agents cycle deterministically per counter mod 6. Tmux user variables per-pane.

**Session tracking lifecycle**: `trackSession()` registers session (windowId nullable initially), `updateTrackedWindow()` sets windowId after orchestrator spawn, `untrackSession()` removes on kill/completion.

**Daemon lifecycle**: PID lock prevents duplicate daemons. Registry recovery on startup with stuck-session detection. Graceful shutdown (SIGTERM/SIGINT) stops server + monitor, releases lock. CLI commands: `sisyphusd start|stop|restart`.

## Constraints

- Do not write state directly — use `state.ts` atomic writes
- Always untrack sessions from pane monitor when killing/completing
- Always clean up worktrees in `handleKill()` — don't leave dangling branches
- Reset agent counters on new sessions; preserve + reset-from-state on resume
- Prompt files must be on disk in `prompts/` subdir; avoid shell quoting via tmux send-keys
- tmux errors are fatal — propagate, don't swallow
- Pane monitor is best-effort polling; fast kills may miss
- Worktree isolation is opt-in via `--worktree` flag; config file controls availability
- Session recovery must detect and recover stuck sessions immediately on startup

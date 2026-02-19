# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock to prevent duplicate instances, starts server + monitor, recovers active/paused sessions from registry on startup with **stuck-session detection**, handles graceful shutdown (SIGTERM/SIGINT), exposes stop/restart CLI commands
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps and persists registry to disk for recovery.
- **session-manager.ts** — Entry point for all session operations: delegates to orchestrator/agent/monitor, coordinates cleanup (agent counter reset, pane untracking, worktree merging). Handles worktree merge callbacks before respawning orchestrator.
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle with formatted session state. Caches window/pane IDs. Writes system + user prompts to `prompts/` subdir. Includes worktree status and merge conflict hints in state block.
- **agent.ts** — Spawns agent Claude instances; auto-increments per-session counter (`agent-001`, `agent-002`, …). Supports worktree isolation: creates isolated git worktrees, renders agent system prompts with worktree context + port offset. Exports `SISYPHUS_PORT_OFFSET` env var.
- **pane-monitor.ts** — Background poller (5s interval) detects unexpected pane kills; triggers cleanup via `handlePaneExited()`. Tracks sessions with `trackSession/untrackSession` lifecycle.
- **pane-registry.ts** — Central registry mapping paneId → {sessionId, role, agentId}. Enables fast pane lookup and exit notification routing. Unregistered when pane exits.
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash
- **tmux.ts** — tmux CLI wrapper (new-window, send-keys, split-window, etc.)
- **worktree.ts** — Git worktree management: create isolated worktrees per agent, track branches, merge back to main, detect conflicts.
- **colors.ts** — Color cycling for panes: orchestrator always yellow, agents rotate deterministically.

## Key Patterns

**Pane lifecycle tracking**: Panes registered in `pane-registry` on spawn (orchestrator.ts, agent.ts). Pane monitor polls (5s interval) and detects exits; calls `handlePaneExited()` with paneId. Registry lookup maps paneId → {sessionId, role, agentId}. Unregistered on exit.

**Respawn on all-agents-done**: When pane monitor detects all agents finished or pane exits unexpectedly, triggers `onAllAgentsDone()` via `setImmediate` (no delay). Merges any pending worktrees, then respawns orchestrator immediately.

**Session recovery on startup**: Registry loads; `active`/`paused` sessions recover. Detects stuck sessions (all agents done, orchestrator pane gone) and immediately triggers respawn.

**State formatting**: `formatStateForOrchestrator()` builds human-readable `<state>` block with task, status, agent summaries (report counts/timestamps), plan/logs/context references, cycle history, and **worktree status** (only if agents have worktrees). Includes git worktree hints (config active vs. disabled).

**Prompts**: System prompt (template only) and user prompt (state block + instruction) written to `prompts/` subdir (not session root). Both passed via Claude flags to avoid tmux send-keys quoting issues.

**Worktree merging**: Before orchestrator respawn, `onAllAgentsDone()` merges any pending worktrees back to main branch, capturing conflict status in agent state (`mergeStatus`, `mergeDetails`). Conflicts are reported to orchestrator in next cycle's state block.

**Worktrees**: When `spawnAgent()` called with `opts.worktree=true`, creates isolated git worktree via `createWorktree()`. Agent receives `SISYPHUS_PORT_OFFSET` (computed from existing worktree count) and worktree context in system prompt. On session kill, `cleanupWorktree()` removes worktrees.

**Agent naming**: Per-session counter starts at 1, zero-padded to 3 digits. Reset on new sessions; on resume, reset from existing agents to preserve ID sequence.

**State formatting**: `formatStateForOrchestrator()` builds human-readable state block with task, status, agent summaries, plan/logs/context references, cycle history, and worktree status.

**Worktree merging**: Before orchestrator respawn, merges pending worktrees back to main, capturing conflict status. Conflicts reported in next cycle's state block.

## Constraints

- Do not write state directly — use `state.ts` atomic writes
- Always unregister panes from pane-registry and pane-monitor when killing/completing
- Always clean up worktrees in `handleKill()` — don't leave dangling branches
- Prompt files must be on disk in `prompts/` subdir; avoid shell quoting via tmux send-keys
- tmux errors are fatal — propagate, don't swallow
- Session recovery must detect and recover stuck sessions immediately on startup

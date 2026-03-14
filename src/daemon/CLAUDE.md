# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock to prevent duplicate instances, starts server + monitor, recovers active/paused sessions from registry on startup with **stuck-session detection**, handles graceful shutdown (SIGTERM/SIGINT), exposes stop/restart CLI commands
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps and persists registry to disk for recovery.
- **session-manager.ts** — Entry point for all session operations: delegates to orchestrator/agent/monitor, coordinates cleanup (agent counter reset, pane untracking, worktree merging). Handles worktree merge callbacks before respawning orchestrator. **Manages cycle snapshots** (create at cycle boundaries, list available, restore/rollback to prior cycles, delete post-rollback snapshots).
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle. Loads mode-specific system prompts (base + planning/implementation suffix). Caches window/pane IDs. Writes prompts to `prompts/` subdir. Includes worktree status and merge conflict hints in state block.
- **agent.ts** — Spawns agent Claude instances; auto-increments per-session counter. Resolves agent type configs via frontmatter (model, color, skills). Supports worktree isolation with context-specific system prompts. Exports `SISYPHUS_PORT_OFFSET` env var.
- **frontmatter.ts** — Parses YAML frontmatter from agent type definitions. Extracts metadata (name, model, color, skills, permissionMode). Detects provider (Anthropic vs. OpenAI) from model. Resolves agent type paths from bundled/plugin/project/user directories.
- **pane-monitor.ts** — Background poller (5s interval) detects unexpected pane kills; triggers cleanup via `handlePaneExited()`. Tracks sessions with `trackSession/untrackSession` lifecycle.
- **pane-registry.ts** — Central registry mapping paneId → {sessionId, role, agentId}. Enables fast pane lookup and exit notification routing. Unregistered when pane exits.
- **state.ts** — Atomic JSON writes: temp file → rename pattern to prevent corruption on crash. **Manages cycle snapshots**: capture state at cycle boundaries, restore from snapshots, track available snapshots per session.
- **tmux.ts** — tmux CLI wrapper (new-window, send-keys, split-window, etc.)
- **worktree.ts** — Git worktree management: create isolated worktrees per agent, track branches, merge back to main, detect conflicts.
- **colors.ts** — Color cycling for panes: orchestrator always yellow, agents rotate deterministically.

## Key Patterns

**Agent type resolution**: `resolveAgentTypePath()` searches bundled agents, installed plugins (via registry), project-local, and user-global directories. Frontmatter extracted and used to customize spawning. Provider (Anthropic/OpenAI) detected from model string.

**Orchestrator mode-based prompts**: `loadOrchestratorPrompt()` composes base template + mode suffix (planning/implementation). Supports project override at `.sisyphus/orchestrator.md`.

**Pane lifecycle tracking**: Panes registered in `pane-registry` on spawn. Pane monitor polls (5s interval) and detects exits; calls `handlePaneExited()` with paneId. Registry lookup maps paneId → {sessionId, role, agentId}. Unregistered on exit.

**Respawn on all-agents-done**: When pane monitor detects all agents finished or pane exits unexpectedly, triggers `onAllAgentsDone()` via `setImmediate` (no delay). **Creates snapshot of current cycle state before respawning orchestrator.** Merges any pending worktrees, then respawns orchestrator immediately.

**Session recovery on startup**: Registry loads; `active`/`paused` sessions recover. Detects stuck sessions (all agents done, orchestrator pane gone) and immediately triggers respawn.

**Cycle snapshots**: At each cycle boundary (before orchestrator respawn), `state.createSnapshot()` captures full session state. `handleRollback()` restores to a prior snapshot, killing running agents, cleaning worktrees, and removing post-rollback snapshots.

**State formatting**: `formatStateForOrchestrator()` builds human-readable state block with task, status, agent summaries, cycle history, and worktree status (if applicable).

**Prompts**: System + user prompts written to `prompts/` subdir. Passed via Claude flags to avoid tmux quoting issues.

**Worktree merging**: Before orchestrator respawn, merges pending worktrees back to main, capturing conflict status in agent state.

## Constraints

- Do not write state directly — use `state.ts` atomic writes
- Always unregister panes from pane-registry and pane-monitor when killing/completing
- Always clean up worktrees in `handleKill()` — don't leave dangling branches
- Prompt files must be on disk in `prompts/` subdir; avoid shell quoting via tmux send-keys
- tmux errors are fatal — propagate, don't swallow
- Session recovery must detect and recover stuck sessions immediately on startup
- Agent type frontmatter must be valid YAML; gracefully fall back if missing or malformed
- Snapshots are created at cycle boundaries, before orchestrator respawn; rollback validates snapshot existence

# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock, starts server + monitor, recovers active/paused sessions on startup with **stuck-session detection**, handles graceful shutdown (SIGTERM/SIGINT), exposes stop/restart CLI commands
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps (cwd, tmux, window), persists registry to disk for recovery. Tracks message counters per session for `message` protocol requests.
- **session-manager.ts** — Entry point for all session operations: delegates to orchestrator/agent/monitor, coordinates cleanup (agent counter reset, pane untracking, worktree merging). Creates/reuses tmux sessions internally with deterministic naming (`sisyphus-{name}` or `sisyphus-{sessionId[:8]}`). Validates custom session names (alphanumeric, hyphens, underscores only). **Manages cycle snapshots** (create at cycle boundaries, list available, restore/rollback to prior cycles). **Session completion**: `switchToHomeSession()` moves attached clients to home session (if available in same cwd) before destroying sisyphus session.
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle. Loads mode-specific system prompts (base + planning/implementation suffix). Caches window/pane IDs. Writes prompts to `prompts/` subdir. Formats session state: goal, context, cycle history (agent summaries + reports), roadmap.md reference, worktree status.
- **agent.ts** — Spawns agent Claude instances (Anthropic Claude or OpenAI Codex per provider); auto-increments per-session counter. Resolves agent type configs via frontmatter (model, color, skills), creates Claude plugins with hooks per agent type. Supports worktree isolation. Handles agent restart, report submission, and async report summarization. Exports `SISYPHUS_PORT_OFFSET` env var.
- **frontmatter.ts** — Parses YAML frontmatter from agent type definitions. Extracts metadata (name, model, color, skills, permissionMode). Detects provider (Anthropic vs. OpenAI) from model.
- **pane-monitor.ts** — Background poller (5s interval) detects unexpected pane kills; triggers cleanup via `handlePaneExited()`. Tracks sessions with `trackSession/untrackSession` lifecycle.
- **pane-registry.ts** — Central registry mapping paneId → {sessionId, role, agentId}. Enables fast pane lookup and exit notification routing.
- **state.ts** — Atomic JSON writes via temp file + rename to prevent corruption. **Manages cycle snapshots**: capture at cycle boundaries, restore from snapshots, track available snapshots.
- **tmux.ts** — tmux CLI wrapper: session/window/pane creation and lifecycle. **Home session support**: `findHomeSession()` locates non-sisyphus sessions in same cwd; `switchAttachedClients()` moves attached clients to home session before destroying sisyphus session. **Pane styling**: `setPaneStyle()` sets color + title with git branch display; `setSessionOption()` configures window-level tmux options (pane borders, auto-rename, hooks). `listPanes()` returns pane info (ID and PID) for recovery and layout management.
- **worktree.ts** — Git worktree management: create isolated worktrees per agent, track branches, merge back to main, detect conflicts.
- **colors.ts** — Color cycling for panes: orchestrator always yellow, agents rotate deterministically.

## Key Patterns

**Session completion & client switching**: When completing or killing a session via `handleComplete()`/`handleKill()`, `switchToHomeSession()` moves any attached tmux clients to a home session (if available in same cwd) before destroying the sisyphus session. Prevents users from being left in a killed session.

**Session creation**: Creates tmux session internally with deterministic naming (`sisyphus-{name}` if provided, else `sisyphus-{sessionId[:8]}`). Validates custom names against alphanumeric/hyphen/underscore pattern. Kills initial pane spawned by `tmux new-session` after orchestrator spawns its own.

**Agent spawning**: Increments counter, resolves agent type frontmatter (model, color, skills), detects provider (Anthropic Claude or OpenAI Codex), creates Claude plugin with hooks, spawns pane, defers worktree bootstrap if configured.

**Session resumption**: Reuses existing tmux session if available, else creates fresh one. Uses `listPanes()` to detect live agent panes and mark lost agents. Reuses windowId from state if tmux session still exists. Kills initial pane after orchestrator spawns.

**Window reopening**: `reopenWindow()` recreates tmux window/session if killed (e.g., after orchestrator yields with no running agents), reuses existing IDs if available.

**Respawn on all-agents-done**: When pane monitor detects all agents finished, `onAllAgentsDone()` creates snapshot of current cycle state, merges pending worktrees, ensures tmux session/window exist (recreates if necessary), then respawns orchestrator immediately via `setImmediate`.

**Session recovery on startup**: Registry loads; `active`/`paused` sessions recover. Detects stuck sessions (all agents done, orchestrator pane gone) and immediately triggers respawn.

**Cycle snapshots**: At cycle boundaries, `state.createSnapshot()` captures full session state. `handleRollback()` restores to prior snapshot, killing running agents, cleaning worktrees, removing post-rollback snapshots.

**Prompts**: System + user prompts written to `prompts/` subdir. Passed via Claude flags to avoid tmux quoting issues.

**Worktree merging**: Before orchestrator respawn, merges pending worktrees back to main, capturing conflict status in agent state.

## Constraints

- Never write state directly — use `state.ts` atomic writes
- Always unregister panes from pane-registry and pane-monitor when killing/completing
- Always clean up worktrees in `handleKill()` — don't leave dangling branches
- Prompt files must be on disk in `prompts/` subdir
- tmux errors are fatal — propagate, don't swallow
- Session recovery must detect and recover stuck sessions immediately on startup
- Agent type frontmatter must be valid YAML; gracefully fall back if missing or malformed
- Snapshots created at cycle boundaries; rollback validates snapshot existence
- Kill initial pane after orchestrator spawns (tmux creates it but orchestrator needs its own)
- Custom session names must be alphanumeric, hyphens, underscores only

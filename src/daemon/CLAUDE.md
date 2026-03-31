# src/daemon/

Unix socket server layer managing session lifecycle, tmux panes, and Claude orchestrator/agent spawning.

## Module Responsibilities

- **index.ts** — Daemon entry point: acquires PID lock, starts server + monitor, recovers active/paused sessions on startup with **stuck-session detection**, handles graceful shutdown (SIGTERM/SIGINT), exposes stop/restart CLI commands
- **server.ts** — Listens on `~/.sisyphus/daemon.sock`, parses JSON line-delimited requests, routes to SessionManager. Maintains in-memory session tracking maps (cwd, tmux, window), persists registry to disk for recovery. Tracks message counters per session for `message` protocol requests.
- **session-manager.ts** — Entry point for all session operations. **Lifecycle**: `startSession()` (create + spawn orchestrator, fire-and-forget Haiku naming with pane label updates), `resumeSession()` (reuse or recreate tmux, mark lost agents), `reopenWindow()` (recreates if killed), `pruneOldSessions()` (keeps 10 recent or 7-day sessions). **Handlers**: `handleSpawn()`, `handleSubmit()`/`handleReport()`, `handleYield()` (guards against pane monitor races), `handleComplete()` (flushes timers + switches to home session), `handleKill()` (atomic cleanup), `handleRestartAgent()`/`handleKillAgent()`, `handleRollback()` (validates cycle, kills running agents, restores snapshot, cleanup), `handlePaneExited()` (unexpected exits → respawn or notifications). **Respawn coordination**: `onAllAgentsDone()` uses `pendingRespawns` + `orchestratorDone` guards to prevent concurrent respawns; creates cycle snapshot, ensures window exists, respawns orchestrator via `setImmediate`.
- **orchestrator.ts** — Spawns/respawns orchestrator Claude each cycle with mode-specific system prompts (base + strategy/implementation/validation/completion suffixes; strategy default). Injects available agent types, caches window/pane IDs, writes prompts to `prompts/` subdir. Formats session state: goal, context, messages, cycle history (agent reports + status), repositories (branches, dirty flags, agent assignments). `detectRepos()` scans for git repos and filters by config.repos if present.
- **agent.ts** — Spawns agent Claude instances (Anthropic Claude or OpenAI Codex per provider); auto-increments per-session counter. Resolves agent type configs via frontmatter (model, color, effort, interactive). Creates Claude plugins with conditional hooks: `Stop` hook required for non-interactive agents; agent-type-specific `UserPromptSubmit` hooks for (plan, review, review-plan, debug, operator, test-spec, explore). Supports sub-agent definitions: copies subdirectories alongside agent type files. Handles agent restart and report submission.
- **summarize.ts** — Optional async utilities via Haiku SDK: `generateSessionName()` creates kebab-case session names from task descriptions (called by session-manager on creation). `summarizeReport()` condenses agent reports to one-sentence summaries. Both fire-and-forget with 5-minute cooldown on auth failures.
- **frontmatter.ts** — Parses YAML frontmatter from agent type definitions. Extracts metadata (name, model, color, skills, permissionMode, effort, interactive, description). Detects provider (Anthropic vs. OpenAI) from model. Resolves agent type paths (project → user → bundled → installed plugins) via `resolveAgentTypePath()`. Discovers available agent types via `discoverAgentTypes()`.
- **pane-monitor.ts** — Background poller (5s interval, sleep-aware elapsed time calculation). **Pane liveness**: detects unexpected pane kills, stuck sessions (all agents done + no orchestrator), marks running agents as lost; invokes respawn callback via `onAllAgentsDone()`. **Active time tracking**: maintains in-memory timers (`activeTimers` map) for sessions/agents/cycles; `initTimers()` at session start, `pollSession()` accumulates milliseconds, `flushTimers()` persists deltas to state. Tracks sessions with `trackSession/untrackSession` lifecycle.
- **pane-registry.ts** — Central registry mapping paneId → {sessionId, role, agentId}. Enables fast pane lookup and exit notification routing.
- **respawn-guard.ts** — Tracks sessions in yield→respawn transition via `respawningSessions` set to prevent pane monitor from pausing the session while orchestrator is being respawned.
- **notify.ts** — Sends desktop/terminal notifications when agents or orchestrator exit unexpectedly.
- **state.ts** — Session creation, mutation, and persistence. Uses **session-level mutex** (`withSessionLock`) to prevent read-modify-write races during concurrent updates. Atomically writes state via temp file + rename. **Manages cycle snapshots**: `createSnapshot()` (at cycle boundaries), `restoreSnapshot()` (restore to prior state), `listSnapshots()` (available snapshots), `deleteSnapshotsAfter()` (cleanup post-rollback).
- **tmux.ts** — tmux CLI wrapper: session/window/pane creation and lifecycle. **Home session support**: `findHomeSession()` locates non-sisyphus sessions in same cwd; `switchAttachedClients()` moves attached clients to home session before destroying sisyphus session. **Pane styling**: `setPaneStyle()` sets color + title with git branch display; `setSessionOption()` configures window-level tmux options (pane borders, auto-rename, hooks). `listPanes()` returns pane info (ID and PID) for recovery and layout management.
- **colors.ts** — Color cycling for panes: orchestrator always yellow, agents rotate deterministically.

## Key Patterns

**Respawn guard race prevention**: `respawningSessions` tracks sessions in yield→respawn transition. Pane monitor skips empty-window detection for guarded sessions (window may be temporarily empty between killing orchestrator and spawning new one). Guard added on yield/respawn entry, cleared on completion or error.

**Active time accumulation**: Pane monitor maintains in-memory timers for each session (session, agents, cycles). On each poll, increments timers by elapsed time if panes are alive (using sleep-aware calculation). `flushTimers()` persists deltas to state file. Called before session completion/kill/rollback.

**Session completion & client switching**: When completing or killing a session via `handleComplete()`/`handleKill()`, `switchToHomeSession()` moves any attached tmux clients to a home session (if available in same cwd) before destroying the sisyphus session. Prevents users from being left in a killed session.

**Session creation**: Creates tmux session internally with deterministic naming (`sisyphus-{name}` if provided, else `sisyphus-{sessionId[:8]}`). Validates custom names against alphanumeric/hyphen/underscore pattern. Auto-generates human-readable session names from task via Haiku (fire-and-forget, failures are silent). Kills initial pane spawned by `tmux new-session` after orchestrator spawns its own.

**Agent spawning**: Increments counter, resolves agent type frontmatter (model, color, effort, interactive), detects provider (Anthropic Claude or OpenAI Codex), creates Claude plugin with conditional hooks per agent type, spawns pane.

**Session resumption**: Reuses existing tmux session if available, else creates fresh one. Uses `listPanes()` to detect live agent panes and mark lost agents. Reuses windowId from state if tmux session still exists. Kills initial pane after orchestrator spawns.

**Window reopening**: `reopenWindow()` recreates tmux window/session if killed (e.g., after orchestrator yields with no running agents), reuses existing IDs if available.

**Respawn on all-agents-done**: When all agents finish, `onAllAgentsDone()` adds session to `pendingRespawns`, creates snapshot of current cycle state, ensures tmux session/window exist (recreates if necessary), then respawns orchestrator via `setImmediate`. Uses `pendingRespawns` + `orchestratorDone` guards to prevent concurrent respawns. `respawningSessions` guard (via respawn-guard.ts) prevents pane monitor from pausing during yield→respawn window.

**Session recovery on startup**: Registry loads; `active`/`paused` sessions recover. Detects stuck sessions (all agents done, orchestrator pane gone) and immediately triggers respawn.

**Cycle snapshots**: At cycle boundaries, `state.createSnapshot()` captures full session state. `handleRollback()` restores to prior snapshot, killing running agents, removing post-rollback snapshots.

**Prompts**: System + user prompts written to `prompts/` subdir. Passed via Claude flags to avoid tmux quoting issues.

## Constraints

- Never write state directly — use `state.ts` atomic writes
- Always unregister panes from pane-registry and pane-monitor when killing/completing
- Prompt files must be on disk in `prompts/` subdir
- tmux errors are fatal — propagate, don't swallow
- Session recovery must detect and recover stuck sessions immediately on startup
- Agent type frontmatter must be valid YAML; gracefully fall back if missing or malformed
- Snapshots created at cycle boundaries; rollback validates snapshot existence
- Kill initial pane after orchestrator spawns (tmux creates it but orchestrator needs its own)
- Custom session names must be alphanumeric, hyphens, underscores only
- Interactive agents (interactive: true) skip the Stop hook requirement; all others require submit hook
- Haiku-based naming/summarization is optional (fire-and-forget); auth failures silence feature temporarily with 5-minute cooldown
- Active time must be flushed to state before session completion/kill/rollback (prevents loss of accumulated time data)
- Respawn guard must be cleared on respawn completion or error (otherwise pane monitor stays stuck)

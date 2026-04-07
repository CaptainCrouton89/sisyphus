# src/daemon/

## State & Persistence

- Always mutate through `state.ts` — atomic temp-file + rename, never write state JSON directly.
- `persistSessionRegistry()` only writes `cwd` — tmux/window metadata is in-memory only.
- Companion writes use own `loadCompanion()`/`saveCompanion()`, not `state.ts` — concurrent writes possible. Async commentary callbacks must reload fresh immediately before saving; never close over a captured companion reference across an `await`.
- `commentaryHistory` ring buffer (max 30): `recordCommentary()` maintains both `lastCommentary` and buffer simultaneously. `saveCompanion()` directly bypasses the buffer — `lastCommentary` and `commentaryHistory` diverge silently.
- Messages >200 chars are written to `messages/` and stored by reference; ≤200 chars are inlined in state JSON. Message IDs (`msg-001`, …) are sequential per session in-memory and reset on daemon restart.
- `companionCredited{Cycles,ActiveMs,Strength,Wisdom}` are written to session state on `handleComplete()` — `onSessionComplete()` reads these to skip already-credited work if the session is continued and completed again. Omitting the write causes double-counting.

## Respawn & Lifecycle

- `pendingRespawns` has no TTL — if `setImmediate` callback throws after `.add()` but before `.delete()`, session permanently blocked. Recovery: kill + restart.
- `onAllAgentsDone()` has two early-return paths: (1) `orchestratorDone` not set → guard stays, correct; (2) `session.status !== 'active'` inside the `setImmediate` → clears `respawningSessions` but skips respawn → session stuck. Recovery: kill + restart.
- `orchestratorDone` is checked both in-memory AND from `lastCycle.completedAt` in persisted state — handles daemon restart between yield and agents finishing.
- `respawningSessions` guard in `handleYield()`: added before killing the orchestrator pane, cleared inside `onAllAgentsDone`'s `setImmediate` (or immediately if agents are still running). Without it, the pane monitor sees 0 live panes and pauses the session mid-transition.
- Always unregister panes from pane-registry and pane-monitor when killing/completing. `pane-exited` IPC notifications are silently dropped if the pane has no registry entry — orchestrator never learns the agent died.
- `handleSpawn()` called on a completed session reverts `status` to `'active'` — completion was not terminal. `companionCredited*` fields retain pre-completion values; `onSessionComplete()` skips re-crediting correctly when it completes again.
- Interactive agents (`interactive: true`) skip the Stop hook requirement; all others require submit hook.
- `reconnectSession()` does NOT call `resetAgentCounterFromState()` — agent ID collision risk post-reconnect.
- Orchestrator `pane-exited` without yield (crash) branches on agent state: (1) no agents → pause session; (2) agents running → clear `respawningSessions` guard and let them reach `onAllAgentsDone` naturally; (3) agents present but none running → trigger respawn immediately. The yield path always waits for agents regardless.
- `allAgentsDone()` counts ALL agents in the session, including those spawned by other agents via `sisyphus spawn`. Orchestrator won't respawn until every descendant agent finishes.
- Last completing agent's pane is NOT killed in `handleAgentSubmit()` — deferred to `onAllAgentsDone()` so the tmux window survives until the orchestrator has a new pane. All other agents are killed immediately on submit.
- `resumeSession()` marks running agents as `lost` only if their pane is gone — live panes stay `running`. `restartAgent()` auto-transitions a `running` agent with a dead pane to `lost` before restarting (not an error).

## `reconnect` vs `resume` vs `reopen-window`

- `reconnect`: re-attaches to an *existing* tmux session by name; updates in-memory IDs; does **not** spawn an orchestrator. Use when the daemon lost track of a running session.
- `resume`: spawns a fresh orchestrator; creates a new tmux session if the old one is dead. Marks abandoned running agents as `lost`.
- `reopen-window`: creates a tmux session shell only — no orchestrator spawn, no agent state changes. Use when you just want a window back.

## Session ID Resolution (`server.ts`)

- `resolvePartialSessionId()` does prefix matching across: (1) in-memory `sessionTrackingMap`, (2) persisted registry, (3) on-disk scan of already-known cwds. Novel cwds are not discovered — sessions from projects not yet started in this daemon process require an explicit full ID or `cwd` hint.
- Ambiguous prefix → error response listing all matches.
- `status` request overlays live in-memory timer values over the persisted session before returning — callers get real-time ms without waiting for a flush cycle.
- `delete` physically removes the session directory from disk; `kill` only terminates processes and removes tracking. Run `delete` to free disk space; `kill` leaves state recoverable.
- `validateSessionId()` and `validateRepoName()` are called on every IPC request as path-traversal guards — not just format validation.

## Agent Plugin System (`agent.ts`)

- `createAgentPlugin()` writes a per-agent plugin dir under `prompts/` at spawn time. The path is deterministic (`{agentId}-plugin`) so it survives `restartAgent()` rebuilding it at the same location. `resumeArgs` includes `--plugin-dir` pointing to this path, along with `--effort`, `--model`, and permission flags.
- If an agent type has a same-named subdirectory adjacent to its `.md` file, those `.md` files (excluding `CLAUDE.md`) are copied into the plugin as sub-agent definitions. `$SISYPHUS_SESSION_DIR` and `$SISYPHUS_SESSION_ID` in agent type templates are substituted at plugin-creation time, not at runtime.
- `--agent` flag does not resolve from `--plugin-dir`; typed agent body is delivered via `--append-system-prompt` (or `--system-prompt` when `frontmatter.systemPrompt === 'replace'`).
- `permissionMode` frontmatter overrides `--dangerously-skip-permissions`; when set, uses `--permission-mode <value>` instead.
- `restartAgent()` updates `spawnedAt` to current time but preserves `originalSpawnedAt` (set on first spawn only). Code filtering agents by spawn time must use `originalSpawnedAt ?? spawnedAt` — bare `spawnedAt` misidentifies restarted agents as newly spawned.
- `detectProvider(model)` routes OpenAI model names to the `codex` CLI instead of `claude`; `claudeSessionId` is only injected for non-OpenAI agents — Codex spawns have no session continuity.
- `UserPromptSubmit` hook is injected only for these agent types: `problem`, `plan`, `requirements`, `review`, `review-plan`, `debug`, `operator`, `test-spec`, `explore`. Worker and unrecognized types get no `UserPromptSubmit` hook.

## Status Dots (`status-dots.ts`)

- Orchestrator pane for phase detection is derived from `lastCycle.paneId` where `!lastCycle.completedAt` — read from persisted state, not in-memory maps. Phase detection survives daemon restarts.
- Claude hook state (idle/processing/stopped) is read from `/tmp/claude-tmux-state/{numericPaneId}`. `readClaudeState` strips the `%` prefix from tmux pane IDs before constructing the path.
- `orchestrator:idle` fires a terminal notification on the *entering* edge only (prev phase ≠ idle). Skipped if `config.notifications.enabled === false`.
- Completed sessions remain in dots for 5 minutes via TTL-based `completedSessions` map. Call `markSessionCompleted()` at completion or the dot disappears immediately.
- Dashboard window ID is cached 30s per cwd. Call `invalidateDashboardCache(cwd)` if the dashboard window changes (e.g. after TUI restart).

## Pane Monitor (`pane-monitor.ts`)

- `hasRecentSessionActivity()` ignores `agent.status` — uses `spawnedAt`/`completedAt` timestamps within a 2-hour window instead. Prevents zombie sessions (status `'active'`, no recent events) from inflating mood signals and boulder sizes.
- State is re-read from disk after `handleAgentKilled()` before checking `allAgentsDone` — the kill mutates `session.agents` in persisted state, making the pre-kill in-memory reference stale.

## Tmux

- tmux errors are fatal — propagate, don't swallow.
- `ssyph_` prefix is load-bearing for pane-monitor detection. Session names containing tmux format characters (`#`, `{`, `}`) break status bar compositor silently — no escaping is applied.

## Timing

- `flushAgentTimer(sessionId, agentId)` is read-only — returns accumulated ms but does NOT persist. Return value must be explicitly passed into `updateAgent()` as `activeMs` or it is permanently lost.
- `flushTimers(sessionId)` persists to state directly (different from above).
- Active time must be flushed before session completion/kill/rollback.
- `handleRollback()` strict ordering: (1) flush timers, (2) capture `rollbackCount`, (3) `restoreSnapshot()` overwrites all state, (4) write `rollbackCount` back. Anything written to state before step 3 is lost.
- `pollAllSessions` is sleep-aware: when elapsed since last poll exceeds 3× poll interval (e.g. after laptop sleep), timer increment is capped at `pollIntervalMs` — prevents hour-long inflation from a single wake event.

## Session Housekeeping

- `pruneOldSessions()` runs on every `startSession` / `cloneSession`: keeps the 10 most-recent completed sessions **plus** any completed within the last 7 days. Active/paused sessions are never pruned.
- `fireHaikuNaming()` retries up to 5 times with a `-N` suffix if the desired tmux session name is taken. On success it bulk-updates all pane titles in the session. Uses `tmuxSessionId` as rename target when available; falls back to session name string.
- `switchToHomeSession()` is called before `tmux.killSession()` in both `handleComplete()` and `handleKill()` — reversing this order detaches clients before they can switch.
- `cloneSession()` can only clone non-completed sessions; it seeds the clone's agent counter from source state via `resetAgentCounterFromState()`.

## Companion

- `comeback-kid` achievement checks `session.parentSessionId` but nothing writes this field — achievement is currently unearnable.
- `lastLateNightCommentary` resets on daemon restart (memory-only 30-min cooldown) — first post-2am poll after restart fires unconditionally.
- `early-bird` fires at session creation; `night-owl` additionally requires `status === 'completed'`.
- Call `recomputeDots()` after any handler that changes session phase — omitting leaves dashboard stale until next poll.
- `onSessionComplete()` return value (new achievement IDs) must be inspected — achievement commentary only fires if the array is non-empty.
- `cloneSession()` fires the `session-start` companion hook (not a clone-specific event) — companion stat gains are identical to a new session.
- `fireCompletionCommentary()` generates all completion commentary events in parallel and shows them as a multi-page popup (Enter advances pages); individual `fireCommentary()` calls show no popup unless `flash = true`.

## Prompts

- System + user prompts written to `prompts/` subdir, passed via CLI flags to avoid tmux quoting issues.
- Agent suffix uses `--system-prompt` when `frontmatter.systemPrompt === 'replace'`; `--append-system-prompt` otherwise.

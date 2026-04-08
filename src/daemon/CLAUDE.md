# src/daemon/

## Sessions Manifest (`sessions-manifest.ts`)

- Fires inside `dotsCallback` on every poll cycle — never called from request handlers. Best-effort; errors swallowed. Never rely on it having been called on any given mutation.
- Two types: `S` (phase from `getSisyphusPhases()`), `H` (non-`ssyph_` tmux sessions with `@sisyphus_cwd` set, phase always `null`). Home sessions queried by name not `$N` — `$` in numeric IDs shell-expands in `execSync`.
- `trackedCwds` is populated during S-entry enumeration but never consulted in the H loop — a non-`ssyph_` session whose `@sisyphus_cwd` matches a tracked project appears as both S and H. No deduplication.
- TSV `#ts:` header is Unix seconds; JSON `updatedAt` is milliseconds — inconsistent across formats. Consumer of JSON: `sisyphus tmux-sessions` (`src/cli/commands/tmux-sessions.ts`).

## State & Persistence

- Always mutate through `state.ts` — atomic temp-file + rename, never write state JSON directly.
- `persistSessionRegistry()` only writes `cwd` — tmux/window metadata is in-memory only.
- Companion writes use own `loadCompanion()`/`saveCompanion()`, not `state.ts` — concurrent writes possible. Async commentary callbacks must reload fresh immediately before saving; never close over a captured companion reference across an `await`.
- `commentaryHistory` ring buffer (max 30): `recordCommentary()` maintains both `lastCommentary` and buffer simultaneously. `saveCompanion()` directly bypasses the buffer — `lastCommentary` and `commentaryHistory` diverge silently.
- Messages >200 chars are written to `messages/` and stored by reference; ≤200 chars are inlined in state JSON. Message IDs (`msg-001`, …) are sequential per session in-memory and reset on daemon restart.
- `companionCredited{Cycles,ActiveMs,Strength,Wisdom}` are written to session state on `handleComplete()` — `onSessionComplete()` reads these to skip already-credited work if the session is continued and completed again. Omitting the write causes double-counting.

## Respawn & Lifecycle

- `pendingRespawns` has no TTL — if `setImmediate` callback throws after `.add()` but before `.delete()`, session permanently blocked. Recovery: kill + restart.
- `onAllAgentsDone()` early-return paths: (1) `orchestratorDone` not set → guard stays, correct; (2) `session.status !== 'active'` (non-paused) outside `setImmediate` → clears `respawningSessions`, skips respawn → session stuck, recovery: kill + restart. Inside `setImmediate`, `status === 'paused' && respawningSessions.has(sessionId)` re-activates the session (pane monitor raced); other non-active statuses still clear and return.
- `onAllAgentsDone()` creates a cycle snapshot before spawning — rollback targets correspond to cycle boundaries. Its `setImmediate` also recreates the tmux window/session if destroyed (e.g., yield killed the last pane), registering new tmux IDs before spawning.
- `orchestratorDone` is checked both in-memory AND from `lastCycle.completedAt` in persisted state — handles daemon restart between yield and agents finishing.
- `respawningSessions` guard in `handleYield()`: added before killing the orchestrator pane, cleared inside `onAllAgentsDone`'s `setImmediate` (or immediately if agents are still running). Without it, the pane monitor sees 0 live panes and pauses the session mid-transition.
- `handleYield()` re-activates `paused` sessions before proceeding. If no windowId is resolvable after yield (neither in-memory `sessionWindowMap` nor `session.tmuxWindowId`), the respawn guard is cleared without spawning — session stays `active` but no orchestrator runs. Recovery: `sisyphus resume`.
- Always unregister panes from pane-registry and pane-monitor when killing/completing. `pane-exited` IPC notifications are silently dropped if the pane has no registry entry — orchestrator never learns the agent died.
- `handleSpawn()` called on a completed session reverts `status` to `'active'` — completion was not terminal. `companionCredited*` fields retain pre-completion values; `onSessionComplete()` skips re-crediting correctly when it completes again.
- `handleSpawn()` resolves windowId via `orchestrator.getWindowId(sessionId)` (in-memory only) — no persisted fallback. Fails after daemon restart if the session hasn't been re-registered. Contrast `handleRestartAgent()`, which falls back to `session.tmuxWindowId`.
- Orchestrator `pane-exited` without yield (crash) branches on agent state: (1) no agents → pause session; (2) agents running → clear `respawningSessions` guard and let them reach `onAllAgentsDone` naturally; (3) agents present but none running → trigger respawn immediately.
- `allAgentsDone()` counts ALL agents in the session, including those spawned by other agents via `sisyphus spawn`. Also returns false when `session.agents.length === 0` — a session where the orchestrator never spawned any agents never triggers `onAllAgentsDone`.
- Last completing agent's pane is NOT killed in `handleAgentSubmit()` — deferred to `onAllAgentsDone()` so the tmux window survives until the orchestrator has a new pane. All other agents are killed immediately on submit.
- `resumeSession()` marks running agents as `lost` only if their pane is gone — live panes stay `running`. `restartAgent()` auto-transitions a `running` agent with a dead pane to `lost` before restarting (not an error).
- `reconnectSession()` does NOT call `resetAgentCounterFromState()` — agent ID collision risk post-reconnect. `resume` and `clone` do call it; `reconnect` does not.

## Session ID Resolution (`server.ts`)

- `resolvePartialSessionId()` prefix-matches across: (1) in-memory `sessionTrackingMap`, (2) persisted registry, (3) on-disk scan of known cwds. Novel cwds are not discovered — `list --all` likewise only enumerates in-memory cwds. Sessions from projects not yet started require an explicit full ID or `cwd` hint.
- `resolvePartialSessionId()` hydrates `sessionTrackingMap` as a side-effect — sessions resolved from registry/disk get inserted with `messageCounter: 0`, restarting their `msg-NNN` sequence from `msg-001` even mid-daemon-lifetime.
- `resume`, `rollback`, `reconnect`, and `reopen-window` auto-register sessions from disk using the caller-provided `cwd` when the session ID isn't in memory — this is the post-restart recovery path. Other request types return `unknownSessionError`.
- `registerSessionCwd()` must be called before `registerSessionTmux()` — `registerSessionTmux` creates tracking with `cwd: ''` if absent; a subsequent `registerSessionCwd` call creates a fresh object, silently discarding any tmux metadata already set.
- `delete` physically removes the session directory from disk; `kill` only terminates processes and removes tracking.
- `validateSessionId()` and `validateRepoName()` guard every IPC request against path traversal — not just format validation.

## Agent Plugin System (`agent.ts`, `frontmatter.ts`, `plugins.ts`)

- `createAgentPlugin()` writes a per-agent plugin dir under `prompts/` at spawn time. Path is deterministic (`{agentId}-plugin`) so `restartAgent()` rebuilds it at the same location — but the dir is recreated from source each time. Any files agents wrote into the plugin dir at runtime are lost on restart.
- Same-named subdirectory adjacent to an agent's `.md` file: its `.md` files (excluding `CLAUDE.md`) become sub-agent definitions in the plugin. `$SISYPHUS_SESSION_DIR`/`$SISYPHUS_SESSION_ID` substituted at plugin-creation time, not at runtime.
- `--agent` flag does not resolve from `--plugin-dir`; typed agent body is delivered via `--append-system-prompt` (or `--system-prompt` when `frontmatter.systemPrompt === 'replace'`).
- `permissionMode` frontmatter overrides `--dangerously-skip-permissions`; when set, uses `--permission-mode <value>` instead.
- `restartAgent()` updates `spawnedAt` but preserves `originalSpawnedAt` (set only when absent); `restartCount` increments each call. Use `originalSpawnedAt ?? spawnedAt` for spawn-time filtering. Does NOT persist new `resumeArgs` — `agent.resumeArgs` in state permanently reflects the original spawn's flags.
- `detectProvider(model)` routes OpenAI model names to the `codex` CLI; `claudeSessionId` only injected for non-OpenAI agents — Codex spawns have no session continuity.
- Codex agents skip plugin/hooks entirely — no plugin dir, no Stop hook, no UserPromptSubmit. Prompt written to `{agentId}-codex-prompt.md`; model defaults to `codex-mini`. Codex agents can stop without submitting.
- `UserPromptSubmit` hook injected only for: `problem`, `plan`, `spec`, `review`, `review-plan`, `debug`, `operator`, `test-spec`, `explore`. Worker and unrecognized types get none. Interactive agents of recognized types still receive it — only Stop is skipped.
- `fallbackModel` frontmatter: if primary CLI is absent from PATH, `agentConfig.frontmatter.model` is mutated in-place — agent state records the fallback as the model actually used. No log entry beyond the agent state field.
- Non-namespaced agent types resolve project → user-global → bundled only. Installed Claude Code plugins not searched. Use `namespace:name` for installed plugin agents (orchestrator sees bundled types only).
- `plugins` frontmatter field and `config.requiredPlugins` use `name@marketplace` format. `ensurePluginInstalled()` is **blocking at spawn time** (60s timeout). Install failure logs a warning; agent spawns without the plugin — no error thrown.
- `parseAgentFrontmatter` is regex-based, not YAML — quoted strings, multi-line values, nested structures silently ignored; only `skills`/`plugins` support list syntax.
- Agent report `summary` in state is initially `content.slice(0, 200)`; asynchronously replaced by Haiku summarization. State read immediately after `handleAgentSubmit` may contain truncated text.
- `agent.repo` field: `'.'` means agent pane cwd = session cwd; any other value → `join(cwd, repo)`. Stored in agent state; `restartAgent()` uses it to recreate the pane in the original directory.

## Session Naming (`session-manager.ts`)

- `fireHaikuNaming()` is fire-and-forget at session/clone start; skipped when explicit `--name` provided. Null result → UUID name kept silently. 5-attempt collision loop (`-1`–`-5`); all taken → abandoned.
- On success: renames the live tmux session, updates persisted state AND in-memory tracking (`trackSession`, `registerSessionTmux`), AND updates pane titles for ALL existing live panes via `updatePaneMeta` + `setPaneTitle`.

## History (`history.ts`)

- `emitHistoryEvent` is fire-and-forget (all exceptions swallowed) — appends JSONL to `~/.sisyphus/history/{sessionId}/events.jsonl`. History dir is global, not project-scoped.
- `pruneHistory()` keeps 200 sessions AND up to 90 days — entries beyond position 200 are only deleted if also older than 90 days (both conditions required).

## Status Dots (`status-dots.ts`)

- Orchestrator pane for phase detection is derived from `lastCycle.paneId` where `!lastCycle.completedAt` — read from persisted state, not in-memory maps. Phase detection survives daemon restarts.
- Claude hook state (idle/processing/stopped) is read from `/tmp/claude-tmux-state/{numericPaneId}`. `readClaudeState` strips the `%` prefix from tmux pane IDs before constructing the path.
- Completed sessions remain in dots for 5 minutes via TTL-based `completedSessions` map. Call `markSessionCompleted()` at completion or the dot disappears immediately.

## Pane Monitor (`pane-monitor.ts`)

- `hasRecentSessionActivity()` ignores `agent.status` — uses `spawnedAt`/`completedAt` timestamps within a 2-hour window instead. Prevents zombie sessions from inflating mood signals.
- State is re-read from disk after `handleAgentKilled()` before checking `allAgentsDone` — the kill mutates `session.agents` in persisted state, making the pre-kill in-memory reference stale.

## Tmux

- `ssyph_` prefix is load-bearing for pane-monitor detection. Session names containing tmux format characters (`#`, `{`, `}`) break status bar compositor silently — no escaping is applied.

## Timing

- `flushAgentTimer(sessionId, agentId)` is read-only — returns accumulated ms but does NOT persist. Pass the return into `updateAgent()` as `activeMs` or it is lost. `flushTimers()` persists to state directly.
- `handleRollback()` strict ordering: (1) flush timers, (2) capture `rollbackCount`, (3) `restoreSnapshot()` overwrites all state, (4) write `rollbackCount` back. Anything written before step 3 is lost.
- `pollAllSessions` is sleep-aware: elapsed > 3× poll interval caps timer increment at `pollIntervalMs` — prevents hour-long inflation from a single wake event.

## Session Housekeeping

- `pruneOldSessions()` runs on every `startSession` / `cloneSession`: keeps the 10 most-recent completed sessions **plus** any completed within the last 7 days. Active/paused sessions never pruned.
- `switchToHomeSession()` is called before `tmux.killSession()` in both `handleComplete()` and `handleKill()` — reversing this order detaches clients before they can switch.
- `cloneSession()` can only clone non-completed sessions; seeds clone's agent counter from source state via `resetAgentCounterFromState()`. Always forces `'strategy'` mode on the clone's first cycle.

## Companion

- `lastLateNightCommentary` resets on daemon restart (memory-only 30-min cooldown) — first post-2am poll after restart fires unconditionally.
- Call `recomputeDots()` after any handler that changes session phase — omitting leaves dashboard stale until next poll.
- `onSessionComplete()` return value (new achievement IDs) must be inspected — achievement commentary only fires if the array is non-empty.

## Orchestrator Prompt Assembly (`orchestrator.ts`)

- Mode resolution: `forceMode` → last *completed* cycle's `mode` → `'strategy'`. The `.reverse().find(c => c.completedAt)` scan skips any in-progress cycle, so an orchestrator that crashed mid-cycle doesn't influence mode.
- `.sisyphus/orchestrator.md` (project override) replaces the entire system prompt — `orchestrator-base.md` and mode body are not appended. `{{AGENT_TYPES}}`, `{{ORCHESTRATOR_MODES}}`, and `$SISYPHUS_*` substitutions still apply if placeholders exist.
- Only `bundled` (`sisyphus:*`) agent types are injected into the orchestrator system prompt — project/user/plugin-discovered types are deliberately hidden.
- Context section switches on cycle number: cycle 1 inlines `session.context` text; cycles 2+ reference the `context/` directory by `@path`. Files written there by agents during cycle 1 only become visible to the orchestrator at cycle 2.
- `drainMessages` is called inside `spawnOrchestrator` before the tmux pane is created — messages are consumed even if pane spawn subsequently fails. No retry path.
- Goal source: `goal.md` file → `session.task`. Writing `goal.md` mid-session changes the orchestrator's goal; mutating `session.task` in state does not.
- `handleOrchestratorComplete` does not kill the orchestrator pane — only `handleOrchestratorYield` does. The complete path assumes the pane already exited before the IPC hook fires.
- `resolveOrchestratorPane`: in-memory `sessionOrchestratorPane` → `lastCycle.paneId` from persisted state. `sessionWindowMap` (window ID) has no persisted fallback — layout adjustment in `handleYield` is silently skipped after a daemon restart.
- `cleanupSessionMaps` must be called on every kill/complete — omitting leaks entries in `sessionWindowMap`, `sessionOrchestratorPane`, and the pane registry.
- `claudeSessionId` is a fresh UUID each orchestrator spawn — no Claude session continuity across cycles.

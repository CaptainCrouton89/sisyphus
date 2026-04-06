# src/daemon/

## State & Persistence

- Always mutate through `state.ts` — atomic temp-file + rename, never write state JSON directly.
- `persistSessionRegistry()` only writes `cwd` — tmux/window metadata is in-memory only.
- Companion writes use own `loadCompanion()`/`saveCompanion()`, not `state.ts` — concurrent writes possible. Async commentary callbacks must reload fresh immediately before saving; never close over a captured companion reference across an `await`.
- `commentaryHistory` ring buffer (max 30): `recordCommentary()` maintains both `lastCommentary` and buffer simultaneously. `saveCompanion()` directly bypasses the buffer — `lastCommentary` and `commentaryHistory` diverge silently.

## Respawn & Lifecycle

- `pendingRespawns` has no TTL — if `setImmediate` callback throws after `.add()` but before `.delete()`, session permanently blocked. Recovery: kill + restart.
- `onAllAgentsDone()` has two early-return paths: (1) `orchestratorDone` not set → guard stays, correct; (2) `session.status !== 'active'` → clears guard but skips respawn → session stuck. Recovery: kill + restart.
- `orchestratorDone` is checked both in-memory AND from `lastCycle.completedAt` in persisted state — handles daemon restart between yield and agents finishing.
- Respawn guard: pane monitor skips empty-window detection for guarded sessions. Must be cleared on respawn completion or error.
- Always unregister panes from pane-registry and pane-monitor when killing/completing.
- Interactive agents (`interactive: true`) skip the Stop hook requirement; all others require submit hook.
- `reconnectSession()` does NOT call `resetAgentCounterFromState()` — agent ID collision risk post-reconnect.

## Tmux

- tmux errors are fatal — propagate, don't swallow.
- `ssyph_` prefix is load-bearing for pane-monitor detection. Session names containing tmux format characters (`#`, `{`, `}`) break status bar compositor silently — no escaping is applied.

## Timing

- `flushAgentTimer(sessionId, agentId)` is read-only — returns accumulated ms but does NOT persist. Return value must be explicitly passed into `updateAgent()` as `activeMs` or it is permanently lost.
- `flushTimers(sessionId)` persists to state directly (different from above).
- Active time must be flushed before session completion/kill/rollback.
- `handleRollback()` strict ordering: (1) flush timers, (2) capture `rollbackCount`, (3) `restoreSnapshot()` overwrites all state, (4) write `rollbackCount` back. Anything written to state before step 3 is lost.

## Companion

- `comeback-kid` achievement checks `session.parentSessionId` but nothing writes this field — achievement is currently unearnable.
- `lastLateNightCommentary` resets on daemon restart (memory-only 30-min cooldown) — first post-2am poll after restart fires unconditionally.
- `early-bird` fires at session creation; `night-owl` additionally requires `status === 'completed'`.
- Call `recomputeDots()` after any handler that changes session phase — omitting leaves dashboard stale until next poll.
- `onSessionComplete()` return value (new achievement IDs) must be inspected — achievement commentary only fires if the array is non-empty.

## Prompts

- System + user prompts written to `prompts/` subdir, passed via CLI flags to avoid tmux quoting issues.
- Agent suffix uses `--system-prompt` when `frontmatter.systemPrompt === 'replace'`; `--append-system-prompt` otherwise.

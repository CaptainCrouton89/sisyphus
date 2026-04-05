# Metrics/Analytics Architecture Audit

## Architecture Overview

Metrics flow through five parallel channels that are never reconciled:

1. **History events** (`~/.sisyphus/history/{sessionId}/events.ndjson`) — append-only NDJSON log, written by `emitHistoryEvent()` in `history.ts`. Consumed exclusively by the `sisyphus history` CLI. Fire-and-forget, swallows all errors.

2. **Session state** (`.sisyphus/sessions/{id}/state.json`) — live mutable JSON, authoritative for `activeMs` on session/agent/cycle. Written via `state.ts` atomic writes. `pane-monitor.ts` accumulates in-memory timers and flushes deltas via `incrementActiveTime()` every poll cycle.

3. **Session summary** (`~/.sisyphus/history/{sessionId}/session.json`) — denormalized snapshot written at completion/kill by `writeSessionSummary()`. Consumed by `sisyphus history` and `getRecentSentiments()`. May be written twice: once on complete/kill, once more when `generateSentiment()` resolves (adds `sentiment` field).

4. **Companion state** (`~/.sisyphus/companion.json`) — global lifetime stats (`sessionsCompleted`, `totalActiveMs`, `lifetimeAgentsSpawned`, `stats.*`). Written by `onSessionComplete()` at session end. Uses its own load/save cycle, not `state.ts`.

5. **Mood signals** — transient in-memory `MoodSignals` struct built from live state each poll cycle in `pane-monitor.ts`. Snapshotted to history on mood change as `signals-snapshot` events.

The key architectural fact: **these five stores are never read together or cross-validated**. Each has its own write path, its own consumer, and its own definition of what "active time" means.

---

## Issues Found

### CRITICAL

**1. `handleKillAgent()` emits no history event** — `session-manager.ts:803–822`

When a user explicitly kills an agent (`sisyphus kill-agent`), `handleKillAgent()` updates state to `status: 'killed'` but calls no `emitHistoryEvent()`. Only `handleAgentKilled()` in `agent.ts:474` emits `agent-exited` (for user-killed agents) and only `handlePaneExited()` in `session-manager.ts:895` emits it for crashes. The user-initiated kill path in `session-manager.ts` is a silent void. History shows the agent was spawned but never terminated.

**2. `handleKillAgent()` also skips `flushTimers()`** — `session-manager.ts:803–822`

The agent's accumulated in-memory time in `activeTimers` is never persisted to state before the agent is marked killed. The `activeMs` written to state at line 820 is omitted entirely — compare to `handleAgentSubmit()` (agent.ts:437–441) which explicitly calls `flushAgentTimer()` before updating. The killed agent's `activeMs` stays at whatever was last flushed, losing the current poll interval's worth of time.

**3. `handleRollback()` agents emit no events** — `session-manager.ts:843–852`

Rollback kills running agents by writing `status: 'killed'` directly via `state.updateAgent()` without calling `emitHistoryEvent()`. No `agent-exited` events are emitted for any of these agents. The event log for a rolled-back session shows agents that were spawned but never terminated.

---

### MAJOR

**4. `wallClockMs` absent from `handleKill()`** — `session-manager.ts:785`

`handleComplete()` computes and saves `wallClockMs` at line 630–631. `handleKill()` does not — the `session-end` event at line 785 includes no `wallClockMs`, and `writeSessionSummary()` is called with `session.wallClockMs` still null (since it was never written). The `SessionSummary.wallClockMs` field is nullable, so this is silently missing for all killed sessions. The history CLI correctly renders `—` for null, but the data gap is permanent.

**5. `computeWisdomGain()` double-credits on continue → re-complete** — `companion.ts:660+`

`onSessionComplete()` uses `companionCreditedCycles`, `companionCreditedActiveMs`, and `companionCreditedStrength` sentinels to prevent double-counting on re-completion. `computeWisdomGain()` has no equivalent — it recomputes from raw `session.agents` and `session.orchestratorCycles` every call. A `continue` → re-complete cycle credits wisdom points again for the same agents and cycles already counted in the first completion.

**6. Lost agents on resume emit no events** — `session-manager.ts:329–341`

When `resumeSession()` marks running agents as `lost` (because their panes are gone), it calls `state.updateAgent()` directly with no `emitHistoryEvent()`. The history log has no record that these agents ever terminated. Compare to the pane-monitor path which at least emits `agent-exited` with `status: 'crashed'` at `session-manager.ts:895`. `lost` is a distinct terminal status in `AgentStatus` but has no corresponding history event type.

**7. Signals snapshot emits once per mood change, not per session end** — `pane-monitor.ts:288`

`signals-snapshot` events fire into `emitHistoryEvent()` for ALL currently tracked sessions when any session's mood changes (the loop at line 287). This means a mood shift triggered by session A emits an event in session B's event log. The `signals` captured are global (cross-session max values), not per-session. A session's event log contains mood transitions caused by other sessions.

**8. `agent-exited` `activeMs` reads stale in-memory value for crashes** — `session-manager.ts:895`

`handlePaneExited()` emits `agent-exited` with `activeMs: agent?.activeMs ?? 0` — this reads the persisted value from `state.json`, not the in-memory `activeTimers` accumulator. The un-flushed time since the last `flushTimers()` is not included. For a 5-second poll interval, this is a minor gap, but it diverges from how `handleAgentSubmit()` works (which explicitly calls `flushAgentTimer()` first).

**9. `recentCrashes` in `MoodSignals` counts from persisted `completedAt`** — `pane-monitor.ts:228–232`

`recentCrashes` counts agents with `status === 'crashed'` and `completedAt` within the last 30 minutes. This reads from state, which only reflects flushed data. An agent that crashes in the current poll cycle hasn't been flushed yet, so `completedAt` may be null (for in-flight agents) or slightly behind. Low impact in practice but means mood update lags by up to one poll interval after a crash.

---

### MINOR

**10. `cycle-boundary` event fires at yield, not at cycle start** — `session-manager.ts:435–439`

The event is emitted when `handleYield()` is called, and data is `lastCycle` (the cycle that just completed). The event name is misleading — it represents the end of a cycle, not a boundary between cycles. The `activeMs` field in the event is `session.activeMs` (cumulative session time), not the cycle's own active time. The `SessionSummaryCycle.activeMs` field is correct (per-cycle), but the event payload inconsistently uses the session total.

**11. `agent-completed` truncates `reportSummary` to 500 chars** — `agent.ts:442`

The emitted event includes `reportSummary: report.slice(0, 500)`. The `SessionSummary.agents` struct has no `reportSummary` field at all — agent reports are only accessible via `session.agents[].reports[]` in state or `session-manager.ts`'s full summary. The history event has more granular data than the summary, but with no cross-reference path.

**12. Double `loadAllSummaries()` in `listSessions()`** — `cli/commands/history.ts:165`

The list view calls `loadAllSummaries()` at the top (line 114) to populate `sessions`, then again at line 165 to get `total` for the "Showing N of M" footer. Both calls scan the full history directory. Small perf issue for large histories.

**13. `history.ts:pruneHistory()` uses `statSync` mtime for directories without `session.json`** — `history.ts:156–162`

Directories that failed to write `session.json` (e.g., killed before summary was written) fall back to directory mtime for age determination. Directory mtime changes on any write inside it, including event log appends. A session that never completed but keeps getting events appended will never look "old" by mtime and will never be pruned.

**14. `companion.debugMood` saved only on mood change** — `pane-monitor.ts:281–289`

`computeMood()` mutates `companion.debugMood` on every call. But `saveCompanion()` is only called inside `if (newMood !== companion.mood)`. Between mood transitions, `debugMood` on disk is stale — the current signals scores are only observable in a debug view if the mood happened to change recently.

**15. `SessionSummary.completedAt` is non-nullable but session may not have `completedAt`** — `history.ts:43`

`writeSessionSummary()` writes `completedAt: session.completedAt ?? new Date().toISOString()`. For a killed session, `completedAt` is not set by `handleKill()` — the kill handler calls `state.completeSession()` only for completions, and for kills updates status without setting `completedAt`. So `completedAt` in the summary is the write timestamp of `writeSessionSummary()`, not a real end time. The distinction matters for `wallClockMs` calculation audit but is invisible in the summary schema.

---

## Observations

**What works well and should be preserved:**

- **`state.ts` mutex pattern** — `withSessionLock()` per session ID prevents read-modify-write races for all state mutations. This is correct and necessary; the companion's lockless concurrent writes are the counterexample of what happens without it.

- **Sleep-aware elapsed calculation** — `pane-monitor.ts:186–188`: capping increment at `storedPollIntervalMs` when elapsed > 3× prevents battery/sleep events from inflating active time totals. Clean one-liner that solves a real edge case.

- **Delta flush pattern** — `flushTimers()` computes `entry.sessionMs - session.activeMs` (delta, not absolute) before writing to state. This is correct for concurrent write safety — two flush calls don't compound.

- **Graceful shutdown flush** — `index.ts` iterates `getTrackedSessionIds()` and calls `flushTimers()` on SIGTERM/SIGINT before stopping. Only daemon crashes lose unflushed time. This is the right behavior.

- **`companionCredited*` sentinel fields** — the delta-safe completion pattern for `cycles`, `activeMs`, and `strength` on `Session` prevents companion stats from inflating on `continue → re-complete` cycles. Well-designed for an inherently tricky case.

- **History as append-only NDJSON** — event log format is durable (append failures don't corrupt existing data), queryable, and correct for temporal analysis. Good choice for a fire-and-forget metrics channel.

- **`writeSessionSummary()` atomic write** — uses temp file + rename (`history.ts:81–83`), consistent with `state.ts`. The second write (sentiment enrichment) also goes through this path, so no partial-write state.

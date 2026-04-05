# Metrics/Analytics Coverage Gap Audit

## 1. Missing History Events

### Lifecycle transitions with **zero** history coverage

| Handler | What happens | Event emitted? |
|---|---|---|
| `handleRestartAgent()` (session-manager.ts:792) | Agent restarted in new pane; `spawnedAt` reset | ❌ None |
| `handleKillAgent()` (session-manager.ts:803) | User explicitly kills agent; status → `killed` | ❌ None |
| `handleRollback()` (session-manager.ts:824) | State rewound to prior cycle; running agents killed | ❌ None |
| `handleContinue()` (session-manager.ts:728) | Completed session reactivated in-place | ❌ None |
| `resumeSession()` (session-manager.ts:297) | Session resumed; paused agents marked `lost` | ❌ None |
| Orchestrator pane crash (session-manager.ts:917) | Orchestrator exits without yielding; cycle force-completed | ❌ None |
| Agents marked `lost` during resume (session-manager.ts:330) | Running agents silently transition to `lost` | ❌ No `agent-exited` emitted |

### Detail notes

- **`handleKillAgent`** writes `status: 'killed'` to state but emits nothing. You can infer it from missing `agent-exited` + final status, but can't distinguish user-kill from crash.
- **`handleRestartAgent`** calls `restartAgent()` in agent.ts which resets `spawnedAt`, `completedAt`, and `claudeSessionId` — all prior identity is overwritten. No event means you can't reconstruct that this agent had a prior life.
- **`handleRollback`** is entirely invisible in history. You can't tell a session was ever rolled back from its event log.
- **`handleContinue`** (continuing a completed session) is invisible. The session summary looks like one run but it may have been continued multiple times.
- **Orchestrator crash** in `handlePaneExited` (role='orchestrator' path): `state.completeOrchestratorCycle` is called but no history event is emitted. You can detect it indirectly by observing that `cycle.completedAt` was written without a preceding `cycle-boundary` event, but this is fragile.

---

## 2. Missing Metrics (derivable but not stored)

### Inter-cycle gap time
`OrchestratorCycle` has `timestamp` (start) and `completedAt` (yield). But the **gap between cycles** — time from one cycle's `completedAt` to the next cycle's `timestamp` — is not stored anywhere. This is orchestrator think-time + agent wait-time overhead. It's computable from raw cycle data but we never surface it.

### Agent utilization ratio
`wallClockMs` and per-agent `activeMs` both exist, but "what fraction of wall time had agents running in parallel" is never computed. This would reveal whether the orchestrator is spending too long between cycles vs. parallelizing effectively.

### Orchestrator-only vs. agent-active time within a cycle
`OrchestratorCycle.activeMs` accumulates time from cycle start through completion, but **we don't split it** into "orchestrator planning before agents spawned" vs. "orchestrator waiting while agents run." Both behaviors are collapsed.

### Agent restart count
`restartAgent()` in agent.ts resets `spawnedAt` and `completedAt` in-place. There's no `restartCount` field on `Agent`. You cannot tell how many times an agent was restarted from state or history.

### Time-to-first-agent per cycle
`OrchestratorCycle.timestamp` marks cycle start. `agent.spawnedAt` marks spawn. The delta — orchestrator planning time before first spawn — is computable but never stored or surfaced.

### Session efficiency ratio
`activeMs / wallClockMs` exists as raw ingredients but is never computed or stored. The companion's Welford baselines only track `sessionMs` (which is `activeMs`), not the ratio.

### Crash time (agent runtime before crash)
When an agent crashes, we know `spawnedAt` and `completedAt`. The "runtime before crash" is computable but not stored separately. Useful for detecting agents that consistently die early vs. late.

### `sessionsPerDay` baseline lag
Noted in companion.ts CLAUDE.md: `pendingDayCount` is never flushed if no subsequent day arrives. Sessions on the final day of use are permanently excluded from the `sessionsPerDay` Welford distribution. The baseline silently underestimates true frequency.

### `computeWisdomGain()` double-credit risk
Not a missing metric, but a data quality gap: wisdom is not delta-safe. `continue` → re-complete double-credits wisdom. Other stats (strength, endurance, patience) use `companionCreditedX` guards; wisdom doesn't. The companion's wisdom score may be inflated on long-running sessions.

---

## 3. Missing Session/Agent Fields

### `Agent` type (src/shared/types.ts:88)
```ts
restartCount?: number;          // how many times restartAgent() was called on this agent
originalSpawnedAt?: string;     // spawnedAt before first restart (restartAgent resets spawnedAt)
```

### `OrchestratorCycle` type (src/shared/types.ts:109)
```ts
interCycleGapMs?: number;       // time between previous cycle's completedAt and this cycle's timestamp
planningMs?: number;            // activeMs before first agent was spawned this cycle
waitingMs?: number;             // activeMs after all agents spawned (orchestrator waiting)
```

### `Session` type (src/shared/types.ts:50)
```ts
rollbackCount?: number;         // how many times handleRollback() was called
resumeCount?: number;           // how many times resumeSession() was called
continueCount?: number;         // how many times handleContinue() was called
```

### `SessionSummary` type (src/shared/history-types.ts:49)
Missing fields that would enable analytics queries without loading full session state:
```ts
crashCount: number;             // agents with status 'crashed' — already computed in generateSentiment but not stored in summary
lostCount: number;              // agents marked 'lost'
killedAgentCount: number;       // agents explicitly killed by user
rollbackCount: number;
efficiency: number | null;      // activeMs / wallClockMs ratio (null if wallClockMs missing)
```

### `SessionSummaryAgent` (src/shared/history-types.ts:29)
```ts
restartCount: number;           // for per-agent-type reliability analysis
```

---

## 4. CLI Stats Improvements (`history --stats`)

Current `showStats()` (src/cli/commands/history.ts:316): total/completed/killed, avg activeMs, totals for agents/cycles/messages, per-project breakdown.

### High-value additions

**Per-agent-type performance table**
Aggregate across all sessions: for each agentType, show count, avg activeMs, crash rate (crashed/total), completion rate. Requires iterating `summary.agents[]` not just counts. This would immediately reveal which agent types are unreliable.

**Efficiency distribution**
`activeMs / wallClockMs` per session. Show median, p90, and histogram buckets. Sessions with ratio < 0.3 suggest the orchestrator is idle most of the time; ratio > 0.9 suggests tight execution.

**Duration distributions**
Currently only shows `avg`. Add p50/p90 (sort sessions by activeMs, take indices). The average is misleading when there are outlier long sessions.

**Temporal patterns**
`session.startHour` and `session.startDayOfWeek` are stored but never surfaced in CLI stats. A "busiest hours" heatmap and "sessions per day-of-week" breakdown are free given the existing fields.

**Error/crash rate per project**
Currently per-project shows `count`, `activeMs`, `agents`. Add `crashedSessions` (sessions with any crashed agent) and `crashRate`. Identifies problem projects.

**Trend over time**
Group sessions by day (from `startedAt`), show sessions/day for the last N days. Useful for seeing if usage is growing or declining.

**Rollback/restart counts**
Once tracked (see section 3), surface in stats: sessions that required rollbacks, agents that required restarts.

---

## 5. Priority Assessment

### Must-have

| Gap | Why |
|---|---|
| `agent-restarted` history event | Without this, agent reliability analysis is impossible — you can't count restarts or correlate restart patterns with agent type |
| `agent-killed` (user-initiated) history event | Currently indistinguishable from crash in history log; breaks error rate analysis |
| `rollback` history event | Rollbacks are a signal of orchestrator failure or bad planning; completely invisible now |
| `Agent.restartCount` field | Needed by history stats and per-type reliability analysis; currently unrecoverable from state |
| `SessionSummary.crashCount` | Already computed in `generateSentiment` input but not stored; free to add |

### Should-have

| Gap | Why |
|---|---|
| `session-resumed` history event | Resumed sessions look identical to fresh ones in history; important for understanding session lifecycle |
| `session-continued` history event | Continued sessions have misleading stats (multi-run activeMs looks like one run) |
| Inter-cycle gap time on `OrchestratorCycle` | Would reveal orchestrator overhead; derivable but never surfaced |
| Per-agent-type stats in `history --stats` | Most valuable analytics missing from CLI; data already exists in summaries |
| Efficiency ratio in `history --stats` | `activeMs`/`wallClockMs` ingredients already stored; just needs to be computed |
| `Session.rollbackCount` / `resumeCount` | Low cost to add; enables filtering "troubled sessions" |

### Nice-to-have

| Gap | Why |
|---|---|
| `planningMs` / `waitingMs` on cycles | Rich orchestrator behavior data, but complex to instrument correctly |
| Duration distributions (p50/p90) | Better than avg; can be computed from existing data in history --stats |
| Temporal pattern analysis in CLI | startHour/startDayOfWeek exist; just needs rendering in showStats() |
| `originalSpawnedAt` on Agent | Useful for deep debugging; edge case |
| Wisdom double-credit fix (`companionCreditedWisdom`) | Data quality issue in companion, not analytics gap |
| `pendingDayCount` flush fix | Small bias in sessionsPerDay baseline; low impact |

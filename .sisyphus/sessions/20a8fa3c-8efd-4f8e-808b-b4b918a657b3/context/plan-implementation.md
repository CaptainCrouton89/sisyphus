# Metrics/Analytics Implementation Plan

**Audits:** `context/audit-architecture.md`, `context/audit-coverage-gaps.md`

## Phases

### Phase 1: Type Foundation

**Scope:** All new types, fields, event types. Pure additive — no runtime change.

#### T1: Type & Schema Changes
**Files:** `src/shared/types.ts`, `src/shared/history-types.ts`
**Depends on:** —

**`types.ts` — Agent interface (~line 88):** Add `restartCount?: number` and `originalSpawnedAt?: string`. Follow `killedReason?` pattern (optional, populated only in specific lifecycle paths).

**`types.ts` — Session interface (~line 50):** Add `rollbackCount?: number`, `resumeCount?: number`, `continueCount?: number`, `companionCreditedWisdom?: number`. The sentinel follows the existing `companionCreditedCycles?` / `companionCreditedActiveMs?` / `companionCreditedStrength?` pattern at lines 74-78.

**`types.ts` — OrchestratorCycle interface (~line 109):** Add `interCycleGapMs?: number`.

**`history-types.ts` — HistoryEventType (~line 3):** Append 5 members to the string union: `'agent-killed'`, `'agent-restarted'`, `'rollback'`, `'session-resumed'`, `'session-continued'`.

**`history-types.ts` — SessionSummary (~line 60):** Add required fields: `crashCount: number`, `lostCount: number`, `killedAgentCount: number`, `rollbackCount: number`, `efficiency: number | null`.

**`history-types.ts` — SessionSummaryAgent (~line 31):** Add `restartCount?: number`.

**Backward compat:** All new Session/Agent/Cycle fields are optional — old persisted JSON works. SessionSummary fields are required in the interface but absent from old `session.json` files; CLI readers must use `?? 0`.

**Verify:** `npm run build` passes.

---

### Phase 2: Core Logic

**Scope:** Independent fixes across 4 files. All parallel.

#### T2: Agent Restart Tracking
**File:** `src/daemon/agent.ts`  
**Depends on:** T1

Modify `restartAgent()` (line 307-368):
- Before overwriting `spawnedAt`, preserve `originalSpawnedAt`: set to current `agent.spawnedAt` only if `!agent.originalSpawnedAt` (immutable after first restart)
- Compute `restartCount: (agent.restartCount ?? 0) + 1`
- Include both in the `state.updateAgent()` call (lines 357-365)
- After state update + `tmux.sendKeys`, emit `agent-restarted` event: `{ agentId, restartCount, originalSpawnedAt, previousStatus: agent.status }`
- `emitHistoryEvent` is already imported (line 21). Follow mutate-then-emit pattern from `handleAgentSubmit` (line 436-442)

**Verify:** `npm run build` passes.

#### T3: Wisdom Delta Fix
**File:** `src/daemon/companion.ts`  
**Depends on:** T1

1. **Export `computeWisdomGain`** — add `export` to the function declaration at line 640
2. **Apply delta pattern** in `onSessionComplete()` at line 686-687. Replace `companion.stats.wisdom += computeWisdomGain(session)` with the delta pattern used by strength (lines 672-674): read `session.companionCreditedWisdom ?? 0`, compute total, credit `Math.max(0, totalWisdom - creditedWisdom)`

**Verify:** `npm run build` + `npm test` passes (existing wisdom tests in `src/__tests__/companion.test.ts`).

#### T4: Signals-Snapshot Scope Fix
**File:** `src/daemon/pane-monitor.ts`  
**Depends on:** —

Fix lines 287-289. Currently emits `signals-snapshot` for ALL tracked sessions on mood change. Replace the `for (const [sessionId] of trackedSessions)` loop: emit to only the first tracked session (`trackedSessions.keys().next().value`), guarded by null check. Mood is a global companion signal — emitting to all sessions causes cross-session bleed in per-session history.

**Verify:** `npm run build` passes.

#### T5: InterCycleGapMs Computation
**File:** `src/daemon/orchestrator.ts`  
**Depends on:** T1

In `spawnOrchestrator()` where `addOrchestratorCycle` is called (~line 433-443): read the previous cycle from `session.orchestratorCycles[session.orchestratorCycles.length - 1]`. If it exists and has `completedAt`, compute `interCycleGapMs = Date.now() - new Date(prevCycle.completedAt).getTime()`. Only meaningful for `cycleNum >= 2`. Include in the cycle object passed to `addOrchestratorCycle`.

**Verify:** `npm run build` passes.

**Phase 2 parallelism:** T2 ‖ T3 ‖ T4 ‖ T5 — all different files.

---

### Phase 3: Session Manager + History

**Scope:** All session-manager.ts lifecycle fixes (merged from lifecycle + data quality concerns) and history.ts summary/pruning. Two independent files.

#### T6: Session Manager Lifecycle Fixes
**File:** `src/daemon/session-manager.ts`  
**Depends on:** T1, T3 (needs `computeWisdomGain` export)

**Imports to add:**
- `flushAgentTimer` from `./pane-monitor.js` (line 6)
- `computeWisdomGain` from `./companion.js` (line 17, alongside existing `computeStrengthGain`)

**6 handler modifications (all follow mutate-then-emit convention):**

**1. `handleKillAgent()` (lines 803-822) — CRITICAL**
Between `unregisterAgentPane` and tmux kill: call `flushAgentTimer(sessionId, agentId)` to persist accumulated time. Use flushed `activeMs` in `state.updateAgent`. After state update: emit `agent-killed` event with `{ agentId, status: 'killed', activeMs, reason: 'killed by user' }`. Follow mutate-then-emit pattern (see `handleAgentSubmit` in agent.ts:436-442).
**Note:** `handleKillAgent` unregisters the pane (line 810) BEFORE killing it, so pane-monitor never fires `handleAgentKilled`/`handlePaneExited` for user-kills. The existing `agent-exited` in `handleAgentKilled` (agent.ts:474) stays unchanged for crash/unexpected-exit. No conflict between event types.

**2. `handleRollback()` (lines 824-873) — CRITICAL**
Before agent-kill loop: call `flushTimers(sessionId)`, then re-read session from state to get flushed `activeMs` values. Read `currentRollbackCount = (session.rollbackCount ?? 0) + 1` BEFORE restore (snapshot wipes state). In the loop: after each `state.updateAgent`, emit `agent-exited` with `{ agentId, status: 'killed', activeMs: <agent's flushed activeMs from re-read>, reason: 'session rolled back' }`. After `restoreSnapshot` (line 867) and `deleteSnapshotsAfter` (line 870), but BEFORE the `return` at line 872: emit `rollback` event with `{ fromCycle, toCycle, killedAgentCount }`. Then `state.updateSession(cwd, sessionId, { rollbackCount: currentRollbackCount })` — MUST be after restore since restore wipes state, and BEFORE return.

**3. `resumeSession()` (lines 297-362) — MAJOR**
In lost-agent loop (lines 330-341): after each `state.updateAgent` marking `lost`, emit `agent-exited` with `{ agentId, status: 'lost', activeMs: agent.activeMs, reason: 'pane gone on resume' }`. After status update to `active` (line 344): emit `session-resumed` with `{ previousStatus, lostAgentCount }`. Increment: `state.updateSession(cwd, sessionId, { resumeCount: (session.resumeCount ?? 0) + 1 })`.

**4. `handleKill()` (lines 732-789) — MAJOR**
After `flushTimers(sessionId)` (line 737): compute `wallClockMs = Date.now() - new Date(session.createdAt).getTime()` and persist via `state.updateSession(cwd, sessionId, { wallClockMs })`. Follow the pattern from `handleComplete()` lines 630-631. Include `wallClockMs` in the `session-end` event data at line 785.

**5. `handleContinue()` (lines 728-730) — SHOULD-HAVE**
Read session before `state.continueSession()`. After: `state.updateSession(cwd, sessionId, { continueCount: (session.continueCount ?? 0) + 1 })`. Emit `session-continued` with `{ cycleCount, activeMs }`.

**6. `handleComplete()` (lines 670-675) — MUST-FIX (wisdom)**
Add `companionCreditedWisdom: computeWisdomGain(completedSession)` to the `state.updateSession` call at lines 671-674 alongside existing `companionCreditedCycles`, `companionCreditedActiveMs`, `companionCreditedStrength`.

**Verify:** `npm run build` passes.

#### T7: Session Summary + Pruning
**File:** `src/daemon/history.ts`  
**Depends on:** T1

**1. `writeSessionSummary` new fields** — In the summary object construction, add:
- `crashCount: session.agents.filter(a => a.status === 'crashed').length`
- `lostCount: session.agents.filter(a => a.status === 'lost').length`
- `killedAgentCount: session.agents.filter(a => a.status === 'killed').length`
- `rollbackCount: session.rollbackCount ?? 0`
- `efficiency: session.wallClockMs ? session.activeMs / session.wallClockMs : null`
- In agents mapping: `restartCount: agent.restartCount ?? 0` on SessionSummaryAgent

**2. `pruneHistory` mtime fix (lines 156-162)** — Replace dir mtime fallback. Read first line of `events.jsonl`, parse its `ts` field for a stable creation timestamp. `readFileSync` is already imported. Fall back to dir mtime only if events.jsonl is unreadable.

**Verify:** `npm run build` passes.

**Phase 3 parallelism:** T6 ‖ T7 — different files. T6 blocks on T3 completion.

---

### Phase 4: CLI Stats

**Scope:** Display new events + stats improvements. Single file.

#### T8: CLI Stats & Event Display
**File:** `src/cli/commands/history.ts`  
**Depends on:** T1

**A. `formatEventData` switch** — Add cases for 5 new event types: `agent-killed`, `agent-restarted`, `rollback`, `session-resumed`, `session-continued`. Follow existing case patterns.

**B. `showStats()` improvements** — Decompose into helper functions. Add 4 sections using existing `c(color, text)` helper and `formatDuration()`:

1. **Efficiency line** in summary block — `activeMs/wallClockMs` average across sessions with data. Use `summary.efficiency ?? (summary.wallClockMs ? summary.activeMs/summary.wallClockMs : null)`. Color: green >=0.7, yellow >=0.4, red below.

2. **Duration distributions** — p50/p90 for `activeMs`. Sort sessions, take percentile indices (`ceil(p/100 * n) - 1`). Append to "Time" line. Gate on `sessions.length >= 3`.

3. **Per-agent-type performance table** — Group `summary.agents[]` by `agentType` (null → 'untyped'). Columns: Type, Count, Avg Time, Crash Rate, Completion. Sort by count desc. Aligned columns via `padEnd`/`padStart`.

4. **Temporal patterns** — Derive from `startedAt` (exists on all summaries). Top 3 busiest 2-hour blocks + day-of-week breakdown. Gate on `sessions.length >= 5`.

**Verify:** `npm run build` passes. `sisyphus history --stats` shows new sections.

---

## Task Table

| # | Task | Phase | Depends | Files | Priority |
|---|------|-------|---------|-------|----------|
| T1 | Type & schema changes | 1 | — | types.ts, history-types.ts | Must-have |
| T2 | Agent restart tracking | 2 | T1 | agent.ts | Must-have |
| T3 | Wisdom delta fix | 2 | T1 | companion.ts | Must-fix |
| T4 | Signals-snapshot scope fix | 2 | — | pane-monitor.ts | Must-fix |
| T5 | InterCycleGapMs computation | 2 | T1 | orchestrator.ts | Should-have |
| T6 | Session manager lifecycle fixes | 3 | T1, T3 | session-manager.ts | Must-fix |
| T7 | Session summary + pruning | 3 | T1 | history.ts | Should-have |
| T8 | CLI stats & event display | 4 | T1 | cli/commands/history.ts | Should-have |

### Parallelism Summary
- **Phase 1:** T1 only
- **Phase 2:** T2 ‖ T3 ‖ T4 ‖ T5 (4 parallel agents)
- **Phase 3:** T6 ‖ T7 (2 parallel agents; T6 blocks on T3)
- **Phase 4:** T8 only

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| `agent-killed` as new event type (not `agent-exited` with status) | Semantic clarity; `agent-exited` stays for crashes. User action vs failure. |
| New Session/Agent fields optional, SessionSummary fields required | Optional preserves backward compat with persisted JSON. Summary always populated by `writeSessionSummary`. |
| Signals-snapshot emits to single session | Mood is global but per-session history should not contain events triggered by other sessions. |
| rollbackCount written AFTER `restoreSnapshot` | Snapshot wipes state. Read before, restore, write after. |
| `computeWisdomGain` exported from companion.ts | session-manager needs it to record credited value alongside other sentinels. |
| Pruning uses events.jsonl first-line timestamp | Dir mtime resets on event appends — unstable for age determination. First event ts is immutable. |
| CLI temporal analysis from `startedAt` | Already on all summaries. No new type dependency. |
| `originalSpawnedAt` set only on first restart | Immutable — check `!agent.originalSpawnedAt` before setting. Multiple restarts preserve original. |

## Verification

- [ ] Phase 1: `npm run build`
- [ ] Phase 2: `npm run build` + `npm test` (companion wisdom tests)
- [ ] Phase 3: `npm run build` + manual: kill agent → `agent-killed` in history events
- [ ] Phase 4: `npm run build` + `sisyphus history --stats` shows new sections
- [ ] Final: `npm test` clean, `npm run build` clean

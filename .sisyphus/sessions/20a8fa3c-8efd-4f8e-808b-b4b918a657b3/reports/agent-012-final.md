# Review Report: Phases 1-3 Implementation

**Build**: passes | **Tests**: 346/346 pass | **Files reviewed**: 8

## High

### 1. handleRollback: updateAgent writes are dead code — overwritten by restoreSnapshot

**`src/daemon/session-manager.ts:873-877`**

The loop at lines 871-881 calls `state.updateAgent()` to mark running agents as `killed`. But `state.restoreSnapshot()` at line 896 replaces the entire state file with the snapshot (confirmed via `state.ts:305-319` — reads snapshot's state.json, modifies a few fields, atomically overwrites). All updateAgent writes are deterministically discarded.

**Impact**: State/history inconsistency. History events at line 878 record agents as `killed`, but restored state shows them at their snapshot statuses (e.g., `running`). The updateAgent calls are pure waste.

**Fix**: Remove the `updateAgent` calls from the rollback loop. The `emitHistoryEvent` calls are the only useful part — they correctly record that agents were killed during rollback. The agents don't need their state updated because `restoreSnapshot` will wipe it anyway.

## Medium

### 2. signals-snapshot event attributed to arbitrary first session

**`src/daemon/pane-monitor.ts:287`**

The old code emitted `signals-snapshot` to ALL tracked sessions (excessive — mood is global companion state). The new code picks `trackedSessions.keys().next().value` — whichever session is first in Map insertion order. This is strictly better than the old behavior (no duplication), but the event attribution is still semantically wrong — mood transitions aren't scoped to any particular session.

**Impact**: History data for mood transitions is associated with whichever session happened to be tracked first. Low practical impact but misleading in analytics.

## Verified Correct

The following aspects were validated and found correct:

- **Mutate-then-emit pattern**: All `emitHistoryEvent` calls follow state mutations (handleContinue event reads fields that `continueSession()` doesn't mutate — confirmed correct)
- **Type safety**: All new Session/Agent fields use `?` in types.ts; `?? 0` / `?? null` defaults consistently applied
- **Backward compatibility**: SessionSummary reads use fallback defaults for old persisted data
- **Wisdom delta-safety**: `companionCreditedWisdom` follows the exact same pattern as existing `companionCredited*` fields — crash window is pre-existing design, not introduced by this change
- **Timer flush ordering**: `flushTimers()` called before kill and rollback; `flushAgentTimer()` before kill-agent
- **Pane unregister ordering**: `handleKillAgent` unregisters before killing (preserved)
- **State writes**: All mutations go through `state.ts`
- **Rollback event ordering**: `rollback` event payload doesn't include `rollbackCount`, so emit-before-write is fine
- **Optional field handling**: All new fields on Session, Agent, OrchestratorCycle are optional
- **Event data**: New event types include all specified fields from the plan

## Not Worth Fixing

- Triple `.filter()` on agents in `history.ts:47-49` — array is trivially small (<20 agents)
- `readFileSync` for entire events.jsonl in `history.ts:166` — cold fallback path during pruning only
- Duplicate `wallClockMs` computation in handleComplete/handleKill — two call sites, same file, simple expression
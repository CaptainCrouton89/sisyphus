Implementation plan saved to context/plan-implementation.md

## Summary
8 tasks across 4 phases, structured for maximum parallelism:
- Phase 1: T1 (types.ts + history-types.ts) — type foundation
- Phase 2: T2 (agent.ts) || T3 (companion.ts) || T4 (pane-monitor.ts) || T5 (orchestrator.ts) — 4 parallel
- Phase 3: T6 (session-manager.ts) || T7 (history.ts) — 2 parallel, T6 blocks on T3
- Phase 4: T8 (cli/commands/history.ts) — stats + event display

## Coverage Verified
- 6/6 must-fix bugs: handleKillAgent, handleRollback, lost agents, wallClockMs, wisdom, signals
- 4/4 must-have tracking: agent-restarted, agent-killed, rollback event, crashCount
- 7/7 should-have: session-resumed, session-continued, interCycleGapMs, agent-type table, efficiency, counters, summary fields
- 4/4 nice-to-have: p50/p90, temporal patterns, pruning fix, originalSpawnedAt

## Key Decisions
- agent-killed is a new event type (not agent-exited with status) — paths are distinct
- rollbackCount written AFTER restoreSnapshot (snapshot wipes state)
- computeWisdomGain exported from companion.ts for session-manager to record credited value
- Signals-snapshot scoped to single representative session (mood is global)

## Review Findings Addressed
- Clarified agent-killed vs agent-exited non-conflict (handleKillAgent unregisters pane before kill)
- Added re-read step in handleRollback after flushTimers for accurate activeMs
- Made rollbackCount/rollback event placement explicit (before return at line 872)
- Fixed interCycleGapMs cycle indexing guidance
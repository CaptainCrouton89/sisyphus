Coverage gap audit complete. Key findings:

## Missing History Events (most critical)
- handleRestartAgent() — no event emitted; restart count unrecoverable
- handleKillAgent() — user-kills indistinguishable from crashes in history
- handleRollback() — entirely invisible in event log
- handleContinue() — session continuation leaves no trace
- resumeSession() — agents silently marked 'lost' with no agent-exited events
- Orchestrator crash path — no history event, only state mutation

## Missing Metrics
- Inter-cycle gap time (yield → next cycle start) — computable but never stored
- Agent utilization ratio (fraction of wallClock with agents running)
- Agent restart count — restartAgent() resets spawnedAt in-place, count lost
- Efficiency ratio (activeMs/wallClockMs) — ingredients exist, never computed
- planningMs per cycle (orchestrator planning before first spawn)

## Missing Type Fields
- Agent.restartCount, Agent.originalSpawnedAt
- OrchestratorCycle.interCycleGapMs, planningMs, waitingMs
- Session.rollbackCount, resumeCount, continueCount
- SessionSummary.crashCount, lostCount, killedAgentCount, efficiency

## CLI Stats Improvements
- Per-agent-type reliability table (crash rate, avg duration)
- Efficiency distribution (p50/p90, not just avg)
- Temporal patterns (startHour/startDayOfWeek already stored, never displayed)
- Error rates per project

Full audit at: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-coverage-gaps.md
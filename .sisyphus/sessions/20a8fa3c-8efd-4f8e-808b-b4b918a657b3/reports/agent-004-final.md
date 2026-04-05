T1 complete — all type/schema changes applied, build passes cleanly.

## Changes

### src/shared/types.ts
- **Session** (line 79-82): added `rollbackCount?`, `resumeCount?`, `continueCount?`, `companionCreditedWisdom?` (all optional)
- **Agent** (line 105-106): added `restartCount?`, `originalSpawnedAt?` (both optional)
- **OrchestratorCycle** (line 114): added `interCycleGapMs?` (optional)

### src/shared/history-types.ts
- **HistoryEventType** (lines 13-17): appended `'agent-killed' | 'agent-restarted' | 'rollback' | 'session-resumed' | 'session-continued'`
- **SessionSummaryAgent** (line 40): added `restartCount?` (optional)
- **SessionSummary** (lines 80-84): added `crashCount`, `lostCount`, `killedAgentCount`, `rollbackCount`, `efficiency` (all required)

## Verification
`npm run build` passes with no errors. All new fields are additive — no downstream breakage.
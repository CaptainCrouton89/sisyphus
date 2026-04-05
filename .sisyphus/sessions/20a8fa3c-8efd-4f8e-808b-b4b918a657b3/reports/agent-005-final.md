T2: Agent Restart Tracking — implemented in src/daemon/agent.ts:356-376

Changes to restartAgent() function:
- Line 357: Preserves originalSpawnedAt (agent.originalSpawnedAt ?? agent.spawnedAt) — immutable after first restart
- Line 358: Computes restartCount as (agent.restartCount ?? 0) + 1
- Line 359: Captures previousStatus before state mutation
- Lines 370-371: Both fields included in state.updateAgent() call
- Line 376: Emits agent-restarted history event with {agentId, restartCount, originalSpawnedAt, previousStatus}

Files changed: src/daemon/agent.ts
Dependencies verified: Agent.restartCount/originalSpawnedAt in src/shared/types.ts (lines 109-110), agent-restarted event in src/shared/history-types.ts (line 17), emitHistoryEvent already imported (line 20)
Build: npm run build passes clean
No issues encountered.
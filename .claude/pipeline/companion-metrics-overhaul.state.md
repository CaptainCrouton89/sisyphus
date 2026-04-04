# Pipeline State: companion-metrics-overhaul

## Specification Phase

### Alternatives Considered
- Boulder = running agent count (current, rejected — shrinks as agents finish, doesn't represent cumulative effort)
- Boulder = cycle count across sessions (user's initial suggestion, refined to total agents spawned which is richer)
- Strength = session counter with higher XP weight (rejected — misaligned semantics)
- Strength = lifetime agents / scaling factor (rejected — tiered per-session gain is more legible)
- Mood cycleCount fix: targeted reset at session boundaries vs derive-from-active-each-poll (chose derive-from-active — targeted reset is incomplete for multi-session scenarios)

### Key Discoveries
- `resetCycleCount()` exists in pane-monitor.ts but is never called — confirmed bug
- `getTotalRunningAgents()` in status-dots.ts is the single source for boulder in status bar, computed inside `recomputeDots()` loop
- `listSessions()` in session-manager.ts returns `agentCount: session.agents.length` (total, all statuses) — this is what boulder needs
- Historical data: 9 sessions, 102 lifetime agents, max 19 agents/session, max 14 cycles/session, avg ~11 agents/session
- Tree panel already has `runningAgentCount` field added earlier in this conversation — needs renaming to match new metric
- `consecutiveEfficientSessions` field stays as-is, powers the renamed `speed-demon` achievement
- `totalAgentCount` mood signal is intentionally max-across-sessions, only the comment is wrong
- Welford baselines only have count=1 in current companion — cold-start territory

### Handoff Notes
- The `runningAgentCount` field on SessionSummary/SessionTreeNode was added earlier this session and needs to become a total-agents count
- New `consecutiveHighCycleSessions` counter on CompanionState needs forward-compat fill in loadCompanion
- Strength delta-safe crediting needs a mechanism to track credited agent count per session (analogous to `companionCreditedCycles`)
- `currentMaxCycleCount` should be derived from active sessions each poll, not maintained as a monotonic module variable

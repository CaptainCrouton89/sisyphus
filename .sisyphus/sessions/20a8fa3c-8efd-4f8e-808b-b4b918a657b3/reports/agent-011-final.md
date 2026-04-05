T8 — CLI Stats & Event Display: COMPLETE

## Changes
File: src/cli/commands/history.ts

### Part A: formatEventData — 5 new event type cases (lines 334-344)
- `agent-killed` — shows agentId, status (colored), activeMs, reason
- `agent-restarted` — shows agentId, restartCount, previousStatus
- `rollback` — shows fromCycle → toCycle, killedAgentCount
- `session-resumed` — shows previousStatus (colored), lostAgentCount
- `session-continued` — shows cycleCount, activeMs

All follow existing case patterns (same ANSI helpers, same field access style).

### Part B: showStats — 4 new sections

1. **Efficiency line** (lines 427-430) — Computes avg efficiency using `s.efficiency ?? (s.wallClockMs ? s.activeMs/s.wallClockMs : null)`. Colors: green >= 0.7, yellow >= 0.4, red below. Shows count of sessions with data.

2. **Duration distributions** (lines 420-421) — p50/p90 for activeMs appended to the Time line. Gated on `sessions.length >= 3`. Uses `Math.ceil(p/100 * n) - 1` index formula.

3. **Per-agent-type performance table** (lines 448-460) — Groups agents across sessions by `agentType` (null → 'untyped'). Columns: Type, Count, Avg Time, Crash %, Done %. Sorted by count desc. Uses padEnd/padStart alignment, existing c()/formatDuration/DIM/BOLD/RESET helpers.

4. **Temporal patterns** (lines 463-470) — Top 3 busiest 2-hour blocks + day-of-week breakdown. Gated on `sessions.length >= 5`.

JSON output includes: avgEfficiency, p50Ms, p90Ms, agentTypes (with avgMs/crashRate/completionRate), temporalPatterns.

## Verification
`npm run build` passes clean with no errors.
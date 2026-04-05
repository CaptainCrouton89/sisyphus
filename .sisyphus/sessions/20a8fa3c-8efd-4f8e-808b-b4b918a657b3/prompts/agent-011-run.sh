#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-011' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-011-plugin" --session-id "2d302cd6-c02c-4aef-a7d7-de98ddf45a11" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t8-cli-stats-devcore:programmer c7' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-011-system.md')" '## Session Goal
Audit and improve sisyphus metrics/analytics system — implement coverage gaps and architectural fixes.

## Your Task: T8 — CLI Stats & Event Display
**File:** `src/cli/commands/history.ts` (this is the ONLY file you modify)

Read `context/plan-implementation.md` section "T8: CLI Stats & Event Display" for the full spec. Also read the CLAUDE.md files at `src/cli/CLAUDE.md` and `src/cli/commands/CLAUDE.md` for conventions.

### Part A: formatEventData switch — Add 5 new event types

Add cases to `formatEventData()` for these event types, following the existing case patterns in the switch:
- `agent-killed` — show agentId, status, activeMs, reason
- `agent-restarted` — show agentId, restartCount, previousStatus
- `rollback` — show fromCycle, toCycle, killedAgentCount
- `session-resumed` — show previousStatus, lostAgentCount
- `session-continued` — show cycleCount, activeMs

### Part B: showStats() improvements — Add 4 new sections

1. **Efficiency line** in the summary block — compute avg efficiency across sessions that have the data. Use `summary.efficiency ?? (summary.wallClockMs ? summary.activeMs/summary.wallClockMs : null)`. Color: green >= 0.7, yellow >= 0.4, red below. Add after the existing "Time:" line.

2. **Duration distributions** — p50/p90 for `activeMs`. Sort sessions by activeMs, take percentile indices (`Math.ceil(p/100 * n) - 1`). Append to the "Time" line. Gate on `sessions.length >= 3`.

3. **Per-agent-type performance table** — Group all `summary.agents[]` across all sessions by `agentType` (null → '\''untyped'\''). Columns: Type, Count, Avg Time, Crash Rate, Completion Rate. Sort by count desc. Aligned columns via `padEnd`/`padStart`. Use the existing `c()`, `formatDuration()`, `BOLD`, `DIM`, `RESET` helpers.

4. **Temporal patterns** — Derive from `startedAt`. Top 3 busiest 2-hour time blocks + day-of-week breakdown. Gate on `sessions.length >= 5`.

### Important Notes
- Keep all formatting consistent with the existing code style (same ANSI helpers, same spacing conventions)
- The `SessionSummary` type is from `../../shared/history-types.js` — it has `efficiency: number | null`, `crashCount: number`, `lostCount: number`, `killedAgentCount: number`, `rollbackCount: number` fields. Agent summaries have `restartCount?: number`.
- For JSON output in showStats, include new metrics in the JSON object too.
- Run `npm run build` to verify.

### Done condition
`npm run build` passes clean. All 5 event type cases added. All 4 stats sections added with proper gating and color coding.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %336
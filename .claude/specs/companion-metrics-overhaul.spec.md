# Companion Metrics Overhaul

## Summary

Fix bugs and realign companion metrics with their semantic meaning. Boulder sizing should reflect cumulative effort (total agents across active sessions), not instantaneous running count. Strength should measure session intensity, not just session count. XP weights need rebalancing after strength redefinition. The `cycleCount` mood signal has a bug where it never resets between sessions. The `iron-will` achievement rewards efficiency but is named for persistence — keep its behavior and rename it, then add a true persistence achievement.

## Behavior

### Boulder Sizing

The boulder represents "how much rock is being pushed" — cumulative active workload, not instantaneous agent count.

**Input metric:** Total agents spawned across all sessions with `status === 'active'`. For each such session, count all agents regardless of agent status (running, completed, crashed, etc.). Sum across sessions. When no sessions have `status === 'active'`, the boulder is empty.

**Scaling thresholds (recalibrated for higher range):**

Historical data shows sessions averaging ~11 agents, with peaks at 19. Multiple concurrent sessions can push totals to 30-50+. New thresholds should produce the same visual progression but for the cumulative range:

| Total Agents | Boulder | Semantic |
|---|---|---|
| 0 | (empty) | idle |
| 1-2 | `o` | light work |
| 3-6 | `O` | moderate |
| 7-15 | `◉` | heavy |
| 16-35 | `@` | intense |
| 36+ | `@@` | extreme |

Both the status bar and tree panel must display the same boulder size for the same companion state.

### Strength Stat

Strength currently increments +1 per session completion regardless of effort. A trivial 0-agent session credits the same as a 19-agent marathon.

**New definition:** Strength reflects session intensity — how many agents were deployed. On session completion, strength gains scale with the session's total agent count (all agents spawned in the session, regardless of status):

- 0 agents: +0 strength
- 1-2 agents: +1
- 3-5 agents: +2
- 6-10 agents: +3
- 11-20 agents: +4
- 21+ agents: +5

Strength must not be double-credited when a session is continued and re-completed. Only agents spawned since the last credit are counted for the tier lookup.

### XP Rebalancing

After strength redefinition, the XP formula needs reweighting. Strength now earns fewer raw points per session (0-5 vs always 1), but each point represents more effort:

| Stat | Current Weight | New Weight | Rationale |
|---|---|---|---|
| Strength | 80 per point | 50 per point | Points are harder to earn now; each worth more |
| Endurance | 15 per hour | 20 per hour | Slightly increase time-based progression |
| Wisdom | 40 per point | 40 per point | Unchanged — already well-calibrated |
| Patience | 5 per point | 8 per point | Slight bump — patience accumulates slowly |

Level thresholds (150 base, ×1.35) remain unchanged.

### Achievement Changes

**Rename `iron-will` to `speed-demon`:** Same condition (10 consecutive sessions completing in ≤3 orchestrator cycles). Description and badge art should reflect efficiency/speed, not persistence. The existing counter `consecutiveEfficientSessions` continues to power this achievement.

**New achievement `iron-will`:** Awarded when the user completes 5 consecutive sessions each with 8+ orchestrator cycles. "Orchestrator cycles" means `session.orchestratorCycles.length`. This represents true persistence — repeatedly pushing through complex, high-iteration work. A new counter tracks consecutive qualifying sessions; it increments when a session completes with ≥8 cycles, resets to 0 otherwise. Badge art and description should match the persistence theme.

### Mood Signal Bug: `cycleCount` Never Resets

The mood signal `cycleCount` reflects the highest cycle count ever seen, not the current cycle count of active sessions. A 10-cycle session permanently inflates the frustrated mood signal for all subsequent sessions, even trivial ones.

**Expected behavior:** The `cycleCount` mood signal should reflect the current maximum cycle count across sessions that are currently active (status `active`). When sessions complete or are killed, their cycle counts no longer contribute. The signal should always represent current reality, not historical peaks.

### Mood Signal: `totalAgentCount` Comment Fix

The `totalAgentCount` mood signal uses the maximum `agents.length` across all tracked active sessions. The type comment incorrectly says "total agents spawned in current session." The comment should be corrected to describe the actual behavior.

## Constraints

- Delta-safe crediting must be preserved for all stat changes (strength, patience, etc.) to prevent double-counting on continue→re-complete
- Welford baselines feed z-scores — changes to what stats measure should not break baseline accumulation
- Boulder sizing must produce identical results in status bar and tree panel — single source of truth for the metric
- Rename the `iron-will` achievement ID to `speed-demon` everywhere it appears. Add the new `iron-will` as a fresh achievement ID

## Related Files

- `src/shared/companion-render.ts` — boulder form thresholds, render logic
- `src/shared/companion-types.ts` — CompanionStats, CompanionState, AchievementDef, CompanionRenderOpts
- `src/shared/companion-badges.ts` — achievement definitions, badge art
- `src/daemon/companion.ts` — XP formula, stat updates, onSessionComplete, computeWisdomGain, achievements
- `src/daemon/pane-monitor.ts` — mood signals, cycleCount tracking
- `src/daemon/session-manager.ts` — event hooks calling companion functions, listSessions response
- `src/daemon/status-bar.ts` — status bar companion rendering
- `src/daemon/status-dots.ts` — agent count computation for status bar
- `src/tui/panels/tree.ts` — tree panel companion rendering
- `src/tui/state.ts` — SessionSummary type
- `src/tui/types/tree.ts` — SessionTreeNode type
- `src/tui/lib/tree.ts` — tree node builder

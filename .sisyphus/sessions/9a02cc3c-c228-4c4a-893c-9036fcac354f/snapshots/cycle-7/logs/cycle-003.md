# Cycle 3 — Validation Review

## Findings

agent-004 (review-recalibration) completed a thorough review and found:

**5 critical bugs:**
1. `sessionsCompletedToday` passes lifetime total instead of daily count (pane-monitor.ts:241)
2. Luck formula denominator double-counts — `sessionsCompleted / (sessionsCompleted + sessionsCrashed)` but sessionsCrashed is a subset of sessionsCompleted. Luck can never drop below 0.5.
3. Patience stat never incremented (permanently 0) — OUT OF SCOPE, pre-existing missing feature
4. 10 achievement descriptions don't match recalibrated checker thresholds
5. Level curve: instant jump to L3 on first session because luckXP=300 overshoots L3 threshold (352)

**2 medium issues:**
6. XP formula in daemon/CLAUDE.md is stale (all coefficients wrong)
7. Needless recomputeXpLevelTitle calls in onAgentSpawned/onAgentCrashed

**Positive findings:**
- Temporal decay wiring for justCompleted/justCrashed/justLeveledUp is correct
- Mood scoring produces good variability across representative scenarios
- Edge cases (all-zero signals, undefined signals) are safe

## Decisions

- **Luck coefficient:** Reverting from 3 to 2 (the pre-recalibration value). With 3, first session = 385 XP → instant L3. With 2, first session = 285 XP → L2 only. L3 at session 2, L4 at session 5. Matches spec's intent.
- **recentCompletions retention:** Increasing from 3 to 10 entries so daily session count is accurate (needed for sessionsCompletedToday fix).
- **Patience accumulation:** OUT OF SCOPE. Adding stat accumulation logic is a new feature, not recalibration. The XP term is dormant (patience=0) — acceptable.
- **Pre-existing bugs** (wanderer lastSeen, dawn-patrol logic, dead code getBaseForm): OUT OF SCOPE.

## Action

Wrote context/fix-plan.md with all 6 mechanical fixes. Transitioning to implementation mode to apply them.

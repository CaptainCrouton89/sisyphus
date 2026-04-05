## Goal

Recalibrate the companion system's thresholds (mood scoring, XP/leveling curves, boulder sizing, stat cosmetics, achievement thresholds) to be grounded in real historical session data rather than arbitrary guesses. The result should produce high variability in companion presentation — moods, appearance, and achievements should shift meaningfully over the course of individual sessions, across sessions in a day, and over longer arcs. The companion should feel alive and responsive, not stuck in one state.

**In scope:** mood scoring weights, XP formula & level curve, boulder form thresholds, stat cosmetic thresholds, achievement trigger values, any hardcoded magic numbers in companion.ts / companion-render.ts / pane-monitor.ts mood signals.

**Not in scope:** new features, new achievements, new moods, UI changes, commentary generation, badge art.

**Done when:** The companion visibly cycles through multiple moods during a typical session, levels up at a rate that feels rewarding across the first week of use, and achievements unlock at a pace that keeps engagement (not all frontloaded, not all years away).

## Context

@.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/logs/cycle-002.md

### Most Recent Cycle

- **agent-001** (impl-companion-core) [completed]: @.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/reports/agent-001-final.md
- **agent-002** (impl-render-types) [completed]: @.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/reports/agent-002-final.md
- **agent-003** (impl-pane-monitor) [completed]: @.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/reports/agent-003-final.md

## Strategy

@.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/strategy.md

## Roadmap

@.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/roadmap.md


## Continuation Instructions

All 3 implementation agents completing. Review their reports, verify build succeeds, check for any conflicts between the parallel edits (especially around MoodSignals types and pane-monitor imports). If build passes, transition to validation.
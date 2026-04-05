## Goal

Calibrate the sisyphus companion feature using real session data (~55 sessions across 6+ repos, primarily ~/Code/northlight), and enrich session metadata collection for better analytics and companion behavior.

Two workstreams:
1. **Threshold calibration** — mood scoring, XP/leveling curve, achievement thresholds, and cosmetic unlock thresholds are currently based on guesswork. Use real data to set values that produce meaningful progression and varied mood states for a power user running 5-15 sessions/day.
2. **Session metadata enrichment** — sessions currently lack model info, sessionLabel, timing breakdowns, and the original user goal. Add metadata fields that enable better companion behavior and future analytics.

Done when: companion thresholds produce realistic progression (level ~8-10 after 50 sessions, mood varies meaningfully, achievements unlock at achievable but non-trivial rates), and sessions persist richer metadata.

## Context

@.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/logs/cycle-002.md

### Most Recent Cycle

- **agent-001** (companion-thresholds) [completed]: @.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/reports/agent-001-final.md
- **agent-002** (session-metadata) [completed]: @.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/reports/agent-002-final.md

## Strategy

@.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/strategy.md

## Roadmap

@.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/roadmap.md


## Continuation Instructions

Both agents should be done. Review their reports, run 'npm run build' and 'npm test', fix any issues. If clean, transition to review/validation.
# Cycle 1 — Strategy + Exploration

## Decisions
- Combined strategy and exploration into a single cycle — the codebase is small enough to analyze directly.
- Analyzed 32 historical sessions (19 from northlight, 13 from sisyphus project) plus 232 individual agent records.
- Wrote a complete recalibration spec rather than spawning explore agents — all source files were readable in-cycle.

## Key Findings
- **Mood**: `grinding` always wins due to base 5 score advantage. `frustrated` never fires (0% crash rate). Mood is effectively static during sessions.
- **XP/Leveling**: After 1 session, user is level 2 with 315 XP. Level 5 takes ~6 sessions. 1.5x scaling is aggressive.
- **Boulder**: Maxes out at 9 agents (`@`), but median session has 9 agents and P75 has 20. Most of the time it's at max.
- **Stat cosmetics**: All unreachable for months (50h endurance, 50h patience, 15 wisdom).
- **Achievements**: Some too easy (marathon at 10 agents = median), some too hard (centurion at 100 sessions, all-nighter at 8h when max observed is 7.2h).
- **Temporal signals**: `justCompleted`, `justCrashed`, `justLeveledUp` hardcoded false in poll loop — only event hooks set them transiently at 5s poll boundaries.

## Artifacts
- `context/recalibration-spec.md` — Complete spec with all proposed changes and rationale

## Next
- Spawn 3 parallel implementation agents to apply the spec

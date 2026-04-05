# Cycle 6 — Stats Audit + Fix Kickoff

## Context
During completion review, user flagged that `luck` is always 1.0 (zero crashes in 55 sessions) and `patience` is permanently 0 (never written anywhere). Data analysis confirmed both stats are broken.

## Decision
- **Remove luck entirely** — no replacement stat. Remove from CompanionStats, XP formula, cosmetics (sparkle), commentary prompts, nickname style guide, TUI overlay.
- **Fix patience** — accumulate from `cycleCount` on session complete, +3 bonus for validation mode, +2 for completion mode. Based on real data: cycles range 1–43 (P50=9), ~35% sessions hit validation, ~45% hit completion.

## Agents
- Spawning implementation agent to do the full removal + fix across all affected files.

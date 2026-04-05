## Goal

Implement the Companion system — a persistent ASCII character that lives inside sisyphus. Core deliverables:

1. **Core module** (`src/daemon/companion.ts`): CompanionState type, atomic persistence to `~/.sisyphus/companion.json`, stat accumulation from session data, XP/leveling, mood computation, achievement checking (35 achievements across 4 categories), repo memory, idle behavior.
2. **Shared renderer** (`src/shared/companion-render.ts`): Single `renderCompanion(state, fields, opts)` function with field mask, maxWidth, color toggle. Composes base form + stat cosmetics + achievement badges + mood face + boulder.
3. **Commentary generation** (`src/daemon/companion-commentary.ts`): Per-event Haiku calls following `summarize.ts` fire-and-forget pattern.
4. **Agent naming**: Mood+stat-dependent nickname generation via Haiku.
5. **Daemon hooks**: Integration into session-manager (start/complete/spawn/crash), pane-monitor (mood recompute, idle animation, flash expiry), status-bar (companion append).
6. **CLI**: `sisyphus companion` command — full profile dump.
7. **TUI**: Companion pinned to bottom of tree panel; leader key `c` for overlay.
8. **Tests**: Comprehensive coverage for stat accumulation, XP/leveling, mood computation, all 35 achievements, visual evolution, rendering with field masks, cosmetic stacking.

"Done" = companion renders in tmux status bar, TUI, and CLI; accumulates real stats from session events; generates commentary via Haiku; all 35 achievements checkable; solid test coverage. Full spec: `.claude/specs/companion.spec.md`.

## Context

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/context

### Messages

- [user @ 2026-04-02T06:36:54.450Z] "Make sure to do robust tests. That doesn't mean testing theater—it just means that our tests have to ACTUALLY test stuff."

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/logs/cycle-003.md

## Strategy

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/strategy.md

## Roadmap

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/roadmap.md


## Continuation Instructions

Phase 1: Spawn 3 parallel agents for WP1 (types+core module), WP2 (renderer), WP3 (commentary). Plan is in context/plan-companion.md. Spec is in .claude/specs/companion.spec.md. No file conflicts between packages.
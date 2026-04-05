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

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/logs/cycle-010.md

### Most Recent Cycle

- **agent-013** (validate-tui) [completed]: @.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/reports/agent-013-final.md

## Strategy

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/strategy.md

## Roadmap

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/roadmap.md


## Continuation Instructions

Validation passed — all 8 exit criteria verified with evidence. Build clean, 238 tests pass, CLI/status-bar/TUI all rendering companion correctly, daemon hooks confirmed firing. Ready for user confirmation.
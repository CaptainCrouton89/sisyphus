## Goal

Implement the Companion system for sisyphus as specified in .claude/specs/companion.spec.md. This is a persistent ASCII character that lives inside sisyphus — it has stats derived from real usage, a mood system, Haiku-generated commentary, agent nicknames, repo memory, achievements, and visual evolution. Key implementation areas: 1) Core companion module (src/daemon/companion.ts): CompanionState type, read/write ~/.sisyphus/companion.json (atomic writes), stat accumulation from session data, XP/leveling calculation, mood computation (error rates, time of day, idle duration, streaks), achievement checking (35 achievements across 4 categories). 2) Rendering function (src/shared/companion-render.ts): Single renderCompanion(state, fields, opts) function that accepts a field mask and returns an inline ASCII string. Shared by CLI, daemon, and TUI. 3) Commentary generation (src/daemon/companion-commentary.ts): Per-event-type context builders using Haiku via @r-cli/sdk (same fire-and-forget pattern as summarize.ts). 4) Agent naming: Mood+stat-dependent nickname generation via Haiku. 5) Daemon integration hooks in session-manager, pane-monitor, status-bar. 6) tmux status bar: Append companion to @sisyphus_status with 5-second flash on events. 7) TUI: Companion pinned to bottom of tree panel, leader key c for overlay. 8) CLI: sisyphus companion command. 9) Tests: Solid coverage for stat accumulation, XP/leveling, mood computation, all 35 achievements, visual evolution, rendering with field masks, cosmetic stacking. Use node native test runner.

## Context

Full spec: .claude/specs/companion.spec.md. Key patterns to follow: src/daemon/summarize.ts (Haiku SDK usage), src/daemon/state.ts (atomic writes), src/shared/types.ts (existing types), src/daemon/status-bar.ts and src/daemon/status-dots.ts (tmux rendering). The rendering function should be in src/shared/ so CLI, daemon, and TUI can all import it. All ASCII art is single-line (no vertical elements). No emojis — use ASCII characters only. Achievement badges are inline ASCII markers. Boulder sizes: . o O @. This needs solid test coverage since there are many stat/mood/achievement variations.

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/logs/cycle-001.md

## Strategy

(empty)

## Roadmap

@.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/roadmap.md


## Continuation Instructions

Review the current session and delegate the next cycle of work.
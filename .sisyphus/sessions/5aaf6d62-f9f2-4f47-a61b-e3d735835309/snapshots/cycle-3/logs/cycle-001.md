# Cycle 1 — Strategy

**Decided:** Companion implementation follows a design-first approach. The spec is detailed enough (550 lines, exact ASCII art, 35 achievements, stat formulas) that we can produce a complete implementation plan before writing code.

**Key findings from codebase exploration:**
- `summarize.ts` provides the exact Haiku SDK pattern for commentary/naming (fire-and-forget, 5-min cooldown)
- `state.ts` provides atomic write pattern (`atomicWrite` with temp + rename)
- `status-bar.ts` renders to `@sisyphus_status` global tmux option — companion appends here
- `status-dots.ts` tracks session phases, `writeStatusBar()` called each poll cycle
- Some companion infrastructure already exists: `companion-context.ts` CLI command, `buildCompanionContext()` in `tui/lib/context.ts`, `openCompanionPane()` in `tui/lib/tmux.ts`
- Types in `shared/types.ts` — Agent type has no `nickname` field yet (needs adding)
- Session manager has clear hook points: `startSession()`, `handleComplete()`, `handleSpawn()`, `handlePaneExited()`
- Pane monitor polls every 5s — mood recompute and flash expiry fit naturally

**Spawning:**
1. `explore-integration` — Deep exploration of all integration surfaces (session-manager hooks, pane-monitor, status-bar, TUI tree/overlays, CLI registration)
2. `plan-companion` — Design agent to produce the full implementation plan with types, interfaces, and parallel work packages

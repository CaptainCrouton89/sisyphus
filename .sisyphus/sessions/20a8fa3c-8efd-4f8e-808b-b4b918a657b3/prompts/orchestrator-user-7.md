## Goal

Audit the sisyphus metrics/analytics system for architectural issues and coverage gaps, then implement improvements. "Done" means: (1) a clear architectural critique with identified issues, (2) a coverage gap analysis documenting what we should track but don't, and (3) implemented fixes — cleaner architecture, new tracking for missing metrics, and improved history/stats CLI output. All data remains local-only. Scope includes history.ts, history-types.ts, state.ts, session-manager.ts, pane-monitor.ts, companion.ts, agent.ts, and the history CLI command. Out of scope: external telemetry, TUI rendering, companion mood/achievement logic (unless it's buggy).

## Context

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/logs/cycle-007.md

### Most Recent Cycle

- **agent-009** (t6-session-mgr) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-009-final.md
- **agent-010** (t7-history-summary) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-010-final.md

## Strategy

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/strategy.md

## Roadmap

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/roadmap.md

## Digest

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/digest.json


## Continuation Instructions

Phase 3 agents T6 (agent-009) and T7 (agent-010) running. When complete, verify build+test, then spawn Phase 4: T8 (CLI stats). T6 is the heaviest task (6 handler mods in session-manager.ts) — review its report carefully.
## Goal

Audit the sisyphus metrics/analytics system for architectural issues and coverage gaps, then implement improvements. "Done" means: (1) a clear architectural critique with identified issues, (2) a coverage gap analysis documenting what we should track but don't, and (3) implemented fixes — cleaner architecture, new tracking for missing metrics, and improved history/stats CLI output. All data remains local-only. Scope includes history.ts, history-types.ts, state.ts, session-manager.ts, pane-monitor.ts, companion.ts, agent.ts, and the history CLI command. Out of scope: external telemetry, TUI rendering, companion mood/achievement logic (unless it's buggy).

## Context

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/logs/cycle-009.md

## Strategy

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/strategy.md

## Roadmap

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/roadmap.md

## Digest

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/digest.json


## Continuation Instructions

All 4 implementation phases complete and reviewed. HIGH review issue fixed (dead updateAgent in rollback). Build+test clean. Validate all 21 scope items from context/audit-coverage-gaps.md are implemented. Check history events, CLI stats output, type additions.
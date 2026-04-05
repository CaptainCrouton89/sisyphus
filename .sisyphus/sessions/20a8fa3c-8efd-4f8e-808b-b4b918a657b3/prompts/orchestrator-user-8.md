## Goal

Audit the sisyphus metrics/analytics system for architectural issues and coverage gaps, then implement improvements. "Done" means: (1) a clear architectural critique with identified issues, (2) a coverage gap analysis documenting what we should track but don't, and (3) implemented fixes — cleaner architecture, new tracking for missing metrics, and improved history/stats CLI output. All data remains local-only. Scope includes history.ts, history-types.ts, state.ts, session-manager.ts, pane-monitor.ts, companion.ts, agent.ts, and the history CLI command. Out of scope: external telemetry, TUI rendering, companion mood/achievement logic (unless it's buggy).

## Context

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/logs/cycle-008.md

### Most Recent Cycle

- **agent-011** (t8-cli-stats) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-011-final.md
- **agent-012** (review-phases-1-3) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-012-final.md

## Strategy

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/strategy.md

## Roadmap

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/roadmap.md

## Digest

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/digest.json


## Continuation Instructions

Phase 4 (T8 agent-011) and review (agent-012) running. When both complete: verify build+test, triage review findings, fix any CRITICAL/MAJOR issues. If clean, transition to validation.
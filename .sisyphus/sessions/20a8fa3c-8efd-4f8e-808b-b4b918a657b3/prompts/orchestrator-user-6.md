## Goal

Audit the sisyphus metrics/analytics system for architectural issues and coverage gaps, then implement improvements. "Done" means: (1) a clear architectural critique with identified issues, (2) a coverage gap analysis documenting what we should track but don't, and (3) implemented fixes — cleaner architecture, new tracking for missing metrics, and improved history/stats CLI output. All data remains local-only. Scope includes history.ts, history-types.ts, state.ts, session-manager.ts, pane-monitor.ts, companion.ts, agent.ts, and the history CLI command. Out of scope: external telemetry, TUI rendering, companion mood/achievement logic (unless it's buggy).

## Context

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/logs/cycle-006.md

### Most Recent Cycle

- **agent-005** (t2-agent-restart) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-005-final.md
- **agent-006** (t3-wisdom-fix) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-006-final.md
- **agent-007** (t4-signals-scope) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-007-final.md
- **agent-008** (t5-intercycle-gap) [completed]: @.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/reports/agent-008-final.md

## Strategy

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/strategy.md

## Roadmap

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/roadmap.md

## Digest

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/digest.json


## Continuation Instructions

Phase 2 agents (T2-T5) running in parallel. When they complete, verify build+test, then spawn Phase 3: T6 (session-manager.ts lifecycle fixes) and T7 (history.ts summary+pruning). T6 depends on T3 exporting computeWisdomGain.
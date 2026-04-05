## Goal

Comprehensive audit and improvement of metrics/analytics system. Three goals: (1) Architecture review — identify messy patterns, scattered tracking, missing abstractions, duplicated logic. Be critical. (2) Coverage gaps — we track locally only (no external telemetry), so we should capture everything useful: agent durations, cycle times, orchestrator think-time, frustration signals, retry counts, step counts, state snapshots, idle time, error rates. Identify what we're missing. (3) Implement improvements — fix architectural issues and add missing tracking.

## Context

Metrics-related files: src/daemon/history.ts (history recording), src/shared/history-types.ts (history types), src/daemon/state.ts (state mutations where metrics should be captured), src/shared/types.ts (core types including session/agent state), src/daemon/session-manager.ts (session lifecycle), src/daemon/companion.ts (companion tracks some stats), src/cli/commands/history.ts (history CLI). Also check: src/daemon/pane-monitor.ts (polls agents — timing data), src/daemon/orchestrator.ts (orchestrator lifecycle), src/daemon/agent.ts (agent spawn/completion). All data is local-only, stored in session state files. No external telemetry. Track everything that helps improve the product.

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/logs/cycle-001.md

## Strategy

(empty)

## Roadmap

@.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/roadmap.md

## Digest

(not yet created)


## Continuation Instructions

Review the current session and delegate the next cycle of work.
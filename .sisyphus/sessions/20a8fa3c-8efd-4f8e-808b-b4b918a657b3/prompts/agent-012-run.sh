#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-012' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-012-plugin" --session-id "6f8d499d-8378-46e3-a691-66d6cfe3e9c7" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit review-phases-1-3-review c7' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-012-system.md')" '## Session Goal
Audit and improve sisyphus metrics/analytics system.

## Your Task: Review all implementation from Phases 1-3

Review the changes made across 7 tasks in 3 phases. The implementation plan is at `context/plan-implementation.md`. The architecture audit is at `context/audit-architecture.md` and coverage gaps at `context/audit-coverage-gaps.md`.

### Files changed (all in src/):
- `shared/types.ts` — New optional fields on Session, Agent, OrchestratorCycle interfaces
- `shared/history-types.ts` — New HistoryEventType union members, new SessionSummary fields, new SessionSummaryAgent field
- `daemon/agent.ts` — Agent restart tracking (restartCount, originalSpawnedAt, agent-restarted event)
- `daemon/companion.ts` — Wisdom delta fix (computeWisdomGain export, delta pattern)
- `daemon/pane-monitor.ts` — Signals-snapshot scope fix (emit to single session)
- `daemon/orchestrator.ts` — InterCycleGapMs computation
- `daemon/session-manager.ts` — 6 lifecycle handler fixes (kill-agent, rollback, resume, kill, continue, complete)
- `daemon/history.ts` — SessionSummary new fields, pruning mtime fix

### Review Focus
1. **Correctness** — Do event emissions follow the mutate-then-emit pattern? Are state reads/writes ordered correctly (especially rollback: read before restore, write after)?
2. **Type safety** — Are optional fields handled with `?? 0` / `?? null` consistently? Any missing null guards?
3. **Event data completeness** — Do emitted events include all the data fields that the plan specified?
4. **Backward compatibility** — New Session/Agent fields must be optional. SessionSummary fields must use `?? 0` defaults when reading from old persisted data.
5. **Code quality** — No duplicated logic, no stale imports, no unused variables.
6. **Build verification** — `npm run build` and `npm test` should both pass.

Report confirmed issues only. Skip stylistic nits. Classify each finding as CRITICAL / MAJOR / MINOR.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %337
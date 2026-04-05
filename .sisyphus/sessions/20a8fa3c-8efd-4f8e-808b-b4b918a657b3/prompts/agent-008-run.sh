#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-008' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-008-plugin" --session-id "54f17583-973b-4534-a796-867c09b4cd7c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t5-intercycle-gap-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-008-system.md')" '## Goal
Sisyphus metrics/analytics improvements — you are implementing T5: InterCycleGapMs Computation.

## Task
Modify `src/daemon/orchestrator.ts` to compute and record the gap between orchestrator cycles.

### What to do
In `spawnOrchestrator()` where `addOrchestratorCycle` is called (~line 433-443): read the previous cycle from `session.orchestratorCycles[session.orchestratorCycles.length - 1]`. If it exists and has `completedAt`, compute `interCycleGapMs = Date.now() - new Date(prevCycle.completedAt).getTime()`. Only meaningful for `cycleNum >= 2`. Include in the cycle object passed to `addOrchestratorCycle`.

### Context
- Read `context/plan-implementation.md` for full spec (T5 section)
- The new OrchestratorCycle field `interCycleGapMs` was added to `src/shared/types.ts` in Phase 1

### Done condition
- `npm run build` passes
- Report: what changed, file list, any issues'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %330
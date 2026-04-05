#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-005-plugin" --session-id "834c218b-3d5c-4987-ba6b-fc5e1a9e06a9" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t2-agent-restart-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-005-system.md')" '## Goal
Sisyphus metrics/analytics improvements — you are implementing T2: Agent Restart Tracking.

## Task
Modify `src/daemon/agent.ts` — specifically `restartAgent()` (around line 307-368) to track restart metadata.

### What to do
1. Before overwriting `spawnedAt`, preserve `originalSpawnedAt`: set to current `agent.spawnedAt` only if `!agent.originalSpawnedAt` (immutable after first restart)
2. Compute `restartCount: (agent.restartCount ?? 0) + 1`
3. Include both in the `state.updateAgent()` call (around lines 357-365)
4. After state update + `tmux.sendKeys`, emit `agent-restarted` event: `{ agentId, restartCount, originalSpawnedAt, previousStatus: agent.status }`
5. `emitHistoryEvent` is already imported (line 21). Follow the mutate-then-emit pattern from `handleAgentSubmit` (line 436-442)

### Context
- Read `context/plan-implementation.md` for full spec (T2 section)
- Read `context/audit-architecture.md` for architectural context
- The new Agent fields (`restartCount`, `originalSpawnedAt`) were added to `src/shared/types.ts` in Phase 1

### Done condition
- `npm run build` passes
- Report: what changed, file list, any issues'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %327
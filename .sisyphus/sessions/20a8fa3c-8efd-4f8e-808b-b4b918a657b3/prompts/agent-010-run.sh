#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-010' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-010-plugin" --session-id "c4e44192-2920-40d5-b26a-ac6c18c0970c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t7-history-summary-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-010-system.md')" 'Session goal: Improve sisyphus metrics/analytics — add new fields to session summary and fix pruning.

YOUR TASK: Implement T7 from the implementation plan at context/plan-implementation.md (Phase 3, "Session Summary + Pruning"). This task modifies src/daemon/history.ts.

READ THESE FILES FIRST:
- .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/plan-implementation.md (T7 section, lines 114-128)
- src/daemon/history.ts (the file you'\''ll modify)
- src/shared/types.ts (to see Session/Agent types with new fields)
- src/shared/history-types.ts (to see SessionSummary and SessionSummaryAgent interfaces)

TWO CHANGES:

1. writeSessionSummary — Add new fields to the summary object:
   - crashCount: session.agents.filter(a => a.status === '\''crashed'\'').length
   - lostCount: session.agents.filter(a => a.status === '\''lost'\'').length
   - killedAgentCount: session.agents.filter(a => a.status === '\''killed'\'').length
   - rollbackCount: session.rollbackCount ?? 0
   - efficiency: session.wallClockMs ? session.activeMs / session.wallClockMs : null
   - In the agents mapping, add: restartCount: agent.restartCount ?? 0

2. pruneHistory mtime fix (around lines 156-162):
   - Replace dir mtime fallback with reading first line of events.jsonl
   - Parse the `ts` field from the first event for a stable creation timestamp
   - Fall back to dir mtime only if events.jsonl is unreadable
   - readFileSync should already be imported; if not, add it

VERIFY: npm run build must pass clean. Report all files changed and any issues.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %333
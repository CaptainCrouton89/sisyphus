#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-006-plugin" --session-id "2e2176db-c0bd-4be8-a702-c524303a31af" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t3-wisdom-fix-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-006-system.md')" '## Goal
Sisyphus metrics/analytics improvements — you are implementing T3: Wisdom Delta Fix.

## Task
Modify `src/daemon/companion.ts` to fix the wisdom double-counting bug.

### What to do
1. **Export `computeWisdomGain`** — add `export` to the function declaration at line 640
2. **Apply delta pattern** in `onSessionComplete()` at line 686-687. Replace `companion.stats.wisdom += computeWisdomGain(session)` with the delta pattern used by strength (lines 672-674): read `session.companionCreditedWisdom ?? 0`, compute total, credit `Math.max(0, totalWisdom - creditedWisdom)`

The delta pattern prevents double-counting when `onSessionComplete` is called multiple times for the same session. Look at how `computeStrengthGain` is handled a few lines above — it reads `companionCreditedStrength`, computes total, and credits only the uncredited portion. Apply the same pattern to wisdom.

### Context
- Read `context/plan-implementation.md` for full spec (T3 section)
- The new Session field `companionCreditedWisdom` was added to `src/shared/types.ts` in Phase 1

### Done condition
- `npm run build` passes
- `npm test` passes (especially companion wisdom tests in `src/__tests__/companion.test.ts`)
- Report: what changed, file list, any issues'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %328
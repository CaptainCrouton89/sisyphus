#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-007-plugin" --agent 'devcore:programmer' --session-id "b23b03e8-c6eb-4be0-889e-eff53acb594a" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-threshold-metadata-an fix-session-mgr-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-007-system.md')" '**Session goal:** Calibrate companion feature thresholds and enrich session metadata.

**Your task:** Fix the stale session bug (MEDIUM #4 from the review).

**The bug:** In `src/daemon/session-manager.ts`, `handleComplete()` at line 497 reads `state.getSession` BEFORE `flushTimers` at line 498. The captured `session` object has pre-flush `activeMs`. This stale object is passed to `onSessionComplete` at line 516, feeding achievement checkers (`blitz`, `speed-run`, `all-nighter`) stale timing values.

**Fix:** Move `const session = state.getSession(cwd, sessionId)` to AFTER `flushTimers(sessionId)` and `handleOrchestratorComplete(sessionId, cwd, report)`. The wallClockMs calculation and all subsequent code that uses `session` should see post-flush values.

**Files to modify:**
- `src/daemon/session-manager.ts` — reorder the `getSession` call

**Constraints:**
- Read `src/daemon/CLAUDE.md` before modifying
- This is a simple reordering — do NOT restructure the function beyond moving the getSession call
- Do NOT modify any other files
- Run `npm run build` to verify no type errors

Report what you changed and any issues encountered.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2446
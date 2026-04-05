#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-004-plugin" --agent 'devcore:programmer' --session-id "fbdc2ed4-5ef4-40a6-aaef-fd444c64228f" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-threshold-metadata-an fix-render-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-004-system.md')" '**Session goal:** Calibrate companion feature thresholds and enrich session metadata.

**Your task:** Fix the `splitBodyAndBoulder` rendering corruption bug (HIGH #1 from the review).

**The bug:** `getBaseForm()` embeds inline boulders per level tier (`OO` for levels 12-19, `@` for 20+). `getBoulderForm()` returns a dynamic boulder based on agent count (`.`, `o`, `O`, `@`). When these don'\''t match, `splitBodyAndBoulder()` either fails to find the boulder base (`lastIndexOf` returns -1) or splits incorrectly — producing corrupted status bar output at level 12+.

**Files to modify:**
- `src/shared/companion-render.ts` — Fix `getBaseForm` / `splitBodyAndBoulder` / `composeLine` so they work correctly at all level tiers regardless of dynamic boulder form
- `src/__tests__/companion-render.test.ts` — Add test coverage for cross-level/boulder combinations (level 15 + 0 agents, level 15 + 6 agents with wisps cosmetic, level 20 + 0 agents, etc.)

**Approach guidance:** The fundamental design issue is that `getBaseForm` embeds a boulder that `composeLine` later needs to replace with a different boulder. Consider separating the body and boulder in `getBaseForm` (e.g., use a placeholder like `{BOULDER}` or return them separately) so `composeLine` doesn'\''t need fragile string splitting.

**Constraints:**
- Read `src/shared/CLAUDE.md` and the existing test file before making changes
- Do NOT modify files outside `src/shared/companion-render.ts` and `src/__tests__/companion-render.test.ts`
- Run `node --import tsx --test src/__tests__/companion-render.test.ts` to verify tests pass
- Run `npm run build` to verify no type errors

Report what you changed and any issues encountered.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2443
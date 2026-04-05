#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-006-plugin" --agent 'devcore:programmer' --session-id "020b715d-e064-4bb4-8c28-640bbf03ed33" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-threshold-metadata-an fix-haiku-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-006-system.md')" '**Session goal:** Calibrate companion feature thresholds and enrich session metadata.

**Your task:** Fix the duplicated `callHaiku` function (HIGH #3 from the review).

**The bug:** `src/daemon/companion-commentary.ts:8-42` and `src/daemon/summarize.ts:16-49` have word-for-word identical `callHaiku` patterns — module-level `disabledUntil`, `COOLDOWN_MS`, same `query()` call, same `for await` text accumulation, same 401/403 cooldown logic. Two independent cooldown clocks mean if one gets a 401, the other still fires.

**Fix:** Extract a shared `callHaiku(prompt: string): Promise<string | null>` function into a new file `src/daemon/haiku.ts` with unified cooldown. Then update both `companion-commentary.ts` and `summarize.ts` to import and use it instead of their own copies.

**Files to modify:**
- `src/daemon/haiku.ts` (new file) — shared `callHaiku` with unified cooldown
- `src/daemon/companion-commentary.ts` — remove local `callHaiku`, `disabledUntil`, `COOLDOWN_MS`; import from `haiku.ts`
- `src/daemon/summarize.ts` — remove local `disabledUntil`, `COOLDOWN_MS`, and the duplicated query pattern; import `callHaiku` from `haiku.ts`

**Constraints:**
- Read `src/daemon/CLAUDE.md` before making changes
- Do NOT modify any files outside the three listed above
- The extracted `callHaiku` should preserve the exact existing behavior (5-min cooldown on 401/403, error logging, empty→null)
- `summarize.ts` functions have their own prompt templates and post-processing — only extract the shared Haiku call plumbing, not the prompt construction
- Run `npm run build` to verify no type errors

Report what you changed and any issues encountered.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2445
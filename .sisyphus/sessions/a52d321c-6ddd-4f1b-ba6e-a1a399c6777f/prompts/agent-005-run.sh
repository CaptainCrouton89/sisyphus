#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-005-plugin" --agent 'devcore:programmer' --session-id "c9692149-81ce-4f28-8323-29c79d0b3d96" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-threshold-metadata-an fix-companion-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-005-system.md')" '**Session goal:** Calibrate companion feature thresholds and enrich session metadata.

**Your task:** Fix 4 issues in the companion system identified in the review at `reports/agent-003-final.md`:

### Issue #2 (HIGH): `onAgentCrashed` counts per-agent, not per-session
- `src/daemon/companion.ts:505-511`
- `sessionsCrashed` increments per agent crash call, but the luck formula treats it as a session count. A session with 5 crashed agents inflates `sessionsCrashed` by 5x.
- **Fix:** Track which sessions have already been counted as crashed. Add a `crashedSessionIds` Set<string> (or similar) to CompanionState, and in `onAgentCrashed` accept a `sessionId` parameter. Only increment `sessionsCrashed` if this sessionId hasn'\''t been counted yet. Or: rename the counter to reflect what it actually counts and adjust the luck formula accordingly — use your judgment on which approach is cleaner.
- The caller is `session-manager.ts:handlePaneExited` — you'\''ll need to pass the sessionId through. Check how `onAgentCrashed` is called.

### Issue #5 (MEDIUM): Unconditional `saveCompanion` every 5s from `debugMood`
- `src/daemon/companion.ts:214` mutates `companion.debugMood` every `computeMood` call
- `src/daemon/pane-monitor.ts:227-228` always saves after mood recompute because of this
- **Fix:** Only save companion when mood actually changes. Move the `debugMood` assignment in `computeMood` to still happen (it'\''s useful), but change pane-monitor to only call `saveCompanion` when `newMood !== companion.mood` (i.e., inside the existing `if` block). The debugMood will be slightly stale in companion.json when mood hasn'\''t changed — acceptable for a debug feature.
- Update the CLAUDE.md comment that says "always saved" to reflect the new behavior.

### Issue #6 (MEDIUM): Double `state.getSession` per session per poll cycle
- `src/daemon/pane-monitor.ts:187` (mood signal loop) + `:236` (inside `pollSession`)
- Each `state.getSession` does `readFileSync` + `JSON.parse`. The mood signal builder re-reads sessions already read by `pollSession`.
- **Fix:** Cache session objects within a poll cycle. Pass session objects from `pollSession` to the mood signal loop, or add a simple per-poll cache.

### Issue #8 (MEDIUM): `saveCompanion` uses fixed temp filename
- `src/daemon/companion.ts:44` uses `.companion.json.tmp` vs `state.ts:36` which uses `.state.${randomUUID()}.tmp`
- **Fix:** Use `randomUUID()` for the temp filename, consistent with state.ts pattern. Import from `node:crypto`.

**Files you may modify:**
- `src/daemon/companion.ts`
- `src/daemon/pane-monitor.ts`
- `src/shared/companion-types.ts` (if adding `crashedSessionIds` to CompanionState)
- `src/daemon/CLAUDE.md` (update the "always saved" comment)
- `src/__tests__/companion.test.ts` (update tests if needed)

**Constraints:**
- Read each file'\''s CLAUDE.md before modifying
- Do NOT modify `session-manager.ts`, `companion-render.ts`, `companion-commentary.ts`, or `summarize.ts`
- Run `node --import tsx --test src/__tests__/companion.test.ts` to verify tests pass
- Run `npm run build` to verify no type errors

Report what you changed and any issues encountered.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2444
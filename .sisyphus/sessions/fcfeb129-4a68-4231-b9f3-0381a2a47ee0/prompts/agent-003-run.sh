#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export SISYPHUS_AGENT_ID='agent-003' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-003-plugin" --session-id "ead0392c-5371-4e5c-b1a7-7ce1978a1ae4" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-present-command review-present-review c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-003-system.md')" 'Review the implementation of `sisyphus present` in `src/cli/commands/present.ts`.

**Goal:** This command renders termrender markdown to ANSI, opens it in neovim via tmux for user editing, blocks until :wq, diffs ANSI-stripped original vs edited text, wraps user insertions in <!-- user: --> / <!-- /user --> comment tags, and returns the annotated version to stdout.

**Files to review:**
- `src/cli/commands/present.ts` (new file — the full implementation)
- `src/cli/index.ts` lines 44 and 95 (registration)

**Context:**
- Plan: `.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/context/plan-present.md`
- Project conventions: `src/cli/commands/CLAUDE.md` and `src/cli/CLAUDE.md`
- Reference for tmux blocking pattern: `src/cli/commands/review.ts`

**Focus areas:**
1. LCS diff algorithm correctness — does it correctly identify user-added lines?
2. ANSI stripping completeness — any escape sequences that could leak through?
3. Edge cases: empty file, no changes, user deletes everything, very large files
4. Convention compliance with the rest of the CLI commands
5. The --no-wait flag: temp file should NOT be deleted when neovim is still using it (already fixed — verify the fix is correct)
6. Error handling and cleanup paths'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %406
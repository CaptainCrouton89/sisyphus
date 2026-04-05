#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-002-plugin" --session-id "09d18d9e-813a-4784-9514-ddb21424836c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-present-command impl-present-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-002-system.md')" 'Implement the `sisyphus present` CLI command. Read `context/plan-present.md` for the full spec.

**Two files to change:**

1. **Create `src/cli/commands/present.ts`** — Full implementation of the present command following the plan exactly. Key aspects:
   - `registerPresent(program: Command)` export matching the convention in other command files
   - termrender invocation via `execFileSync('\''termrender'\'', ...)`
   - tmux blocking via `tmux new-window` + `tmux send-keys` with `nvim <temp>; tmux wait-for -S <channel>; exit` + blocking `tmux wait-for <channel>`
   - ANSI stripping function (5 regex patterns for SGR, CSI, OSC BEL, OSC ST, charset, standalone ESC)
   - LCS-based diff that tags user-inserted/modified lines with `<!-- user: -->` / `<!-- /user -->` comment blocks
   - Explicit check for `process.env.TMUX` before tmux operations
   - Temp file cleanup via try/finally
   - Import `shellQuote` from `../../shared/shell.js`

2. **Modify `src/cli/index.ts`** — Add import and registration:
   - Import: `import { registerPresent } from '\''./commands/present.js'\'';` (after line 43, the registerReview import)
   - Registration: `registerPresent(program);` (after line 93, the `registerReview(program)` call)

**After implementing, run `npm run build` to verify it compiles cleanly.** Fix any type errors.

Reference `src/cli/commands/review.ts` for the exact tmux blocking pattern and import conventions.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %404
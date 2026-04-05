Implemented `sisyphus present` command.

**Files changed:**

1. **Created `src/cli/commands/present.ts`** — Full implementation:
   - `registerPresent(program)` export following project conventions
   - `termrender` invocation via `execFileSync` with `--width` option
   - tmux blocking pattern: `tmux new-window` + `tmux send-keys` with `nvim <temp>; tmux wait-for -S <channel>; exit` + blocking `tmux wait-for <channel>`
   - ANSI stripping function with 6 regex patterns (SGR, CSI, OSC BEL, OSC ST, charset, standalone ESC)
   - LCS-based diff that tags user-inserted/modified lines with `<!-- user: -->` / `<!-- /user -->` comment blocks
   - `process.env.TMUX` check — falls back to stdout if not in tmux
   - Temp file cleanup via try/finally
   - `--no-wait` flag to open without blocking
   - Imports `shellQuote` from `../../shared/shell.js`

2. **Modified `src/cli/index.ts`** (lines 44, 95):
   - Added import for `registerPresent`
   - Added `registerPresent(program)` registration after `registerReview`

**Build:** `npm run build` passes cleanly.

**Note:** `context/plan-present.md` referenced in the task does not exist. Implementation based on the task description, memory file `project_termrender_integration.md`, and the review.ts tmux blocking pattern.
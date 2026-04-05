# Cycle 004 — Fix review issues

## Review findings addressed (from agent-003)

1. **Critical #1 — `--no-wait` temp file deletion**: `finally` always runs in JS regardless of `return`. Added `skipCleanup` flag set before the `--no-wait` return, checked in `finally`. Temp file now persists for neovim.

2. **High #2 — Use shared `exec()`**: Replaced all three `execSync` calls with `exec()` from `src/shared/exec.ts`. This gains `EXEC_ENV` PATH augmentation (Homebrew, nix paths). The `tmux wait-for` blocking call uses `timeout: 0` (no timeout) since the user controls when they close nvim.

3. **Medium #3 — Redundant regex**: Removed the SGR-specific regex (`\x1b\[[0-9;]*m`) since the general CSI regex (`\x1b\[[0-9;]*[A-Za-z]`) already covers it.

4. **Medium #4 — Temp file before TMUX check**: Moved TMUX check before temp file creation. Non-tmux path now prints directly to stdout without writing/deleting a temp file.

5. **Medium #5 — tmux pattern duplication with review.ts**: Noted as tech debt, not addressed this cycle.

## Build
- `npm run build` passes cleanly

## Next
- Transition to validation mode for e2e testing of the full tmux flow

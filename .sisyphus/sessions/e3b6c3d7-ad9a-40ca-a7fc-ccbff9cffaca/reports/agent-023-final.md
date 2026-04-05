# CLI/TUI/Shared Failure Mode Analysis — Complete

Analyzed all files in src/cli/, src/tui/, src/shared/ for real failure modes.

## Findings (5 actionable, ranked by severity)

### HIGH: `execSafe` has no timeout — can block daemon forever
- **File:** `src/shared/exec.ts:10-14`  
- **Impact:** ~50 call sites in daemon tmux operations. `execSync` with no timeout = infinite block if tmux hangs (lock contention, server not responding). Freezes entire daemon.
- **Fix:** Add `timeoutMs = 30_000` parameter to match `exec()`. One-line change.
- **Test:** Kill tmux server mid-operation, verify daemon recovers.

### MEDIUM: `homedir()` returns empty string when HOME unset (Linux/Docker)
- **File:** `src/shared/paths.ts:4-6`
- **Impact:** All paths resolve to `/.sisyphus/...` (root-owned). CLI commands fail silently or write to wrong location.
- **Fix:** Guard with `homedir() || process.env.HOME || '/tmp'` or throw early.
- **Test:** `HOME= node dist/cli.js doctor`

### MEDIUM: `spawn --name` not validated for tmux-unsafe characters
- **File:** `src/cli/commands/spawn.ts:15`
- **Impact:** Names with quotes/semicolons could break tmux commands. Daemon-side likely uses shellQuote, but no CLI validation.
- **Fix:** Reject names with `[^a-zA-Z0-9_-]` at CLI layer.

### MEDIUM: Tree cache key uses `expanded.size` not contents
- **File:** `src/tui/app.ts:403`
- **Impact:** Collapse+expand different nodes at same set size = stale tree for one frame. Already documented in CLAUDE.md.

### LOW: Retry counter display off-by-one
- **File:** `src/cli/client.ts:33`
- **Impact:** Shows "4/4" but retries once more. Cosmetic.

## Non-findings (investigated, correct)
- Socket client protocol handling: correct, line-delimited with proper newline parsing
- TUI terminal size handling: proper minimum check at 60x12
- companion.json corruption: properly returns cached state on parse failure
- PATH augmentation: correctly doesn't verify dir existence (by design)
- Companion render maxWidth: correctly operates on pre-ANSI text

## Full analysis
Saved to: `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/explore-cli-tui-failures.md`
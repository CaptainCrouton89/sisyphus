# CLI/TUI/Shared Failure Mode Analysis

## Critical Findings

### 1. Socket client silently accumulates data on multi-response (LOW risk)
**File:** `src/shared/client.ts:21-31`
**Issue:** The `data` handler accumulates chunks and parses on first `\n`. If the daemon sends extra data after the newline (e.g., a logging race), it's silently discarded. This is correct by design (line-delimited protocol), but there's no guard against the daemon sending a response with embedded newlines in string values — `JSON.stringify` doesn't produce them, so this is safe in practice.
**Realistic:** Low. Protocol is well-defined.

### 2. `homedir()` crash when HOME is unset
**File:** `src/shared/paths.ts:4-6`
**Issue:** `homedir()` from `node:os` returns empty string `""` when `$HOME` is unset (not undefined — Node still returns something on Linux). All paths become `/.sisyphus/...` which is root-owned. On macOS `homedir()` uses `getpwuid()` so it works even without `$HOME`, but on Linux in Docker with a stripped env, you get `""`.
**Realistic:** Medium — affects Docker/CI environments with stripped envs. The daemon runs via launchd (macOS) so it's fine there, but CLI usage in Docker is realistic.
**Test:** `HOME= node dist/cli.js doctor`

### 3. `exec()` 30s default timeout with no context in error
**File:** `src/shared/exec.ts:7`
**Issue:** `execSync` with `timeout: 30000` throws a generic error with no indication it was a timeout vs. a command failure. The caller gets an error with `.killed = true` and `.signal = 'SIGTERM'` but the error message is just the stderr output (if any), not "command timed out." In daemon context, git operations on large repos could timeout silently.
**Realistic:** Medium — large git repos with slow network.
**Test:** `exec('sleep 60')` — verify error is distinguishable from command failure.

### 4. `execSafe` swallows ALL errors including timeouts
**File:** `src/shared/exec.ts:10-14`
**Issue:** `execSafe` catches everything and returns `null`. No timeout parameter exposed — uses Node's default (no timeout). If a command hangs forever, it blocks the Node event loop (it's `execSync`). No timeout = infinite block.
**Realistic:** HIGH. Any `execSafe` call with a command that hangs (e.g., `git fetch` on unreachable remote, `tmux` waiting for a lock) blocks the entire daemon.
**Test:** In daemon code, grep for `execSafe` calls — any that touch network or external state are risks.

### 5. `sendRequest` retry counter display is off-by-one
**File:** `src/cli/client.ts:33`
**Issue:** `process.stderr.write(\`Daemon not ready, retrying (${attempt}/${MAX_ATTEMPTS - 1})...\n\`)` — denominator is `MAX_ATTEMPTS - 1` (4), but the loop goes to `MAX_ATTEMPTS` (5). On attempt 4, it shows "4/4" suggesting last retry, but attempt 5 still happens. Cosmetic only.
**Realistic:** Always visible when daemon is slow to start on non-macOS.

### 6. `sendRequest` on non-macOS throws `lastErr` which could be undefined
**File:** `src/cli/client.ts:72`
**Issue:** After the loop, non-darwin falls through to `throw lastErr`. If somehow all attempts succeeded (impossible due to loop structure) or the first attempt threw a non-ENOENT/ECONNREFUSED error (caught at line 22-24, rethrown immediately), `lastErr` is always set. Actually safe — but `lastErr` is typed `unknown` and thrown raw, so the caller gets an untyped error.
**Realistic:** Low — code path is correct.

### 7. TUI `getCompanion()` returns stale cache on file corruption
**File:** `src/tui/app.ts:58-68`
**Issue:** If `companion.json` becomes corrupted (partial write, disk full), `statSync` succeeds (file exists, has new mtime), `readFileSync` succeeds (file has content), `JSON.parse` throws. The catch block returns `_cachedCompanion` — the previous good state. This is actually GOOD error handling. But: if the file was never valid (first read fails), `_cachedCompanion` is `null`, which is also fine.
**Realistic:** Not a bug — good defensive code.

### 8. TUI minimum terminal size check is 60x12 but tree width is hardcoded 36
**File:** `src/tui/app.ts:373`
**Issue:** At 60 cols, detail panel gets `60 - 36 = 24` cols. With borders (4 chars), inner width is 20. This is very narrow but functional. Below 60, a message is shown. This is fine.
**Realistic:** Edge case only — very small terminals.

### 9. `treeCacheKey` uses `expanded.size` not contents — hash collision
**File:** `src/tui/app.ts:403` (documented in CLAUDE.md)
**Issue:** Cache key `${expanded.size}:...` means collapsing node A and expanding node B (same set size) won't rebuild the tree. This is a known/documented issue per the CLAUDE.md.
**Realistic:** Medium — happens during navigation. Effect is stale tree for one render cycle until next poll triggers rebuild.
**Test:** Collapse one session, immediately expand another.

### 10. `env.ts` PATH augmentation doesn't verify directories exist
**File:** `src/shared/env.ts:18-28`
**Issue:** Candidates like `/opt/homebrew/bin` are prepended to PATH even if they don't exist. This is harmless — shell lookups just skip nonexistent dirs. Not a bug.
**Realistic:** N/A — by design.

### 11. `companion-render.ts` `applyColor` uses string `.replace()` which is fragile
**File:** `src/shared/companion-render.ts:263`
**Issue:** `result.replace(facePart, coloredFace)` — if `facePart` contains regex-special characters (it does: `^`, `.`, `*`, `(`, `)`), this still works because `.replace()` with a string argument does literal replacement, not regex. Safe.
**Realistic:** Not a bug.

### 12. `companion-render.ts` `maxWidth` truncation counts ANSI escape sequences
**File:** `src/shared/companion-render.ts:225`
**Issue:** `joined.length > maxWidth` — but `joined` contains ANSI codes from composeLine cosmetics? No — `composeLine` doesn't add ANSI. Color is applied later by `applyColor`. So `joined` is plain text at this point. The `maxWidth` check is correct for the pre-colorized string.
**Realistic:** Not a bug. The final `result.slice(0, maxWidth - 1)` at line 241 could theoretically break a multi-byte Unicode character, but the content is ASCII art.

### 13. `spawn.ts` doesn't validate `--name` for tmux-unsafe characters
**File:** `src/cli/commands/spawn.ts:15`
**Issue:** Agent name is passed through to the daemon which uses it in tmux pane titles. If `--name` contains characters that break tmux (quotes, semicolons, newlines), the tmux command could fail or inject commands. The daemon likely uses `shellQuote` but this isn't validated at the CLI layer.
**Realistic:** Medium — user could pass weird names. Depends on daemon-side sanitization.
**Test:** `sisyphus spawn --name '; kill-server' "task"`

### 14. `status.ts` `capturePaneOutput` shell-injects paneId
**File:** `src/cli/commands/status.ts:124-125`
**Issue:** `tmux capture-pane -t "${paneId}"` — paneId comes from session state (daemon-controlled), not user input. Uses double quotes which prevents most injection, but a paneId containing `"` or `$()` could be problematic. Since paneId is daemon-generated (format: `%N`), this is safe in practice.
**Realistic:** Low — daemon controls the value.

### 15. `rollback.ts` accepts `toCycle: 0` as invalid but `parseInt("0")` = 0 which passes `isNaN` check
**File:** `src/cli/commands/rollback.ts:11`
**Issue:** `toCycle < 1` correctly rejects 0 and negative. This is fine.
**Realistic:** N/A — correct.

## Summary of Actionable Findings

| # | File | Severity | Issue |
|---|------|----------|-------|
| 2 | `shared/paths.ts:4` | Medium | `homedir()` returns `""` on Linux with no `$HOME` |
| 4 | `shared/exec.ts:10` | **HIGH** | `execSafe` has no timeout — can block daemon forever |
| 5 | `cli/client.ts:33` | Low | Retry counter display off-by-one |
| 9 | `tui/app.ts:403` | Medium | Tree cache key collision (documented) |
| 13 | `cli/commands/spawn.ts` | Medium | No CLI-side validation of `--name` for tmux-safe chars |

### The Big One: `execSafe` with no timeout (#4)

This is the most realistic production failure. Any `execSafe` call in the daemon that runs a command which blocks (network timeout, tmux lock contention, hung process) will freeze the entire daemon's event loop because `execSync` is synchronous. The daemon becomes unresponsive to all socket requests.

Grep for `execSafe` usage in daemon code to identify specific risk vectors. The fix is simple: add a timeout parameter to `execSafe` (defaulting to 30s like `exec`).

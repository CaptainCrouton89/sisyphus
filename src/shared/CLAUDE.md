# src/shared/

## Paths

- `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.
- `legacyLogsPath` (`logs.md`) — read for backward compat. Don't delete even though new code never creates it.
- `tmuxSessionName` produces `ssyph_` prefix; `isSisyphusSession` checks it — renaming breaks pane-monitor detection.

## Config

- `statusBar` deep-merges `colors` and `segments` sub-objects independently; all other top-level fields shallow-merge (last wins).

## Types

- `companionCredited*` sentinels prevent double-counting on re-complete. Adding a new companion stat requires a matching credited sentinel or it double-counts every re-completion.
- `Session.tmuxSessionId` (`$N` format) is stable across renames; prefer over `tmuxSessionName` for exact-match targeting.
- `update-segment` only updates `content`, not `side`/`priority`/`bg`.

## Companion Types

- `commentaryHistory` is a 30-entry ring buffer for anti-repetition. Trimming below ~30 lets duplicates recur.
- `recentCompletions` comment says "last 3" but stores enough for momentum check (5 in 4h). Don't cap to 3.
- `RunningStats.m2` is raw sum of squared deviations (Welford's). Variance = `m2 / (count - 1)`, not `m2` directly.
- Achievement counter names are misleading: `consecutiveEfficientSessions` tracks `speed-demon`; `consecutiveHighCycleSessions` tracks `iron-will`. Both reset to 0 on a non-qualifying session.

## Companion Render

- `getBaseForm` placeholder asymmetry: bare `FACE` (no braces) vs `{BOULDER}` (with braces). A face string containing `{BOULDER}` corrupts output.
- `'hobby'` is deterministic: `(getHours() + companion.level) % IDLE_HOBBIES.length` — same hour + level always yields the same hobby.
- Color drops silently on narrow `maxWidth` — truncates `facePart` out of the replace target, returning uncolored output with no error.

## History

- `wallClockMs` vs `activeMs`: wall time (start→end) vs cumulative agent active time. Summing cycle-level `activeMs` double-counts cross-cycle agents.
- `SessionSummary.efficiency` may be null even when `wallClockMs` exists (written before the field was added); `history.ts` CLI recomputes inline — don't assume `null` means data unavailable.

## Exec

- `EXEC_ENV` augments PATH with Homebrew/nix/user-local dirs — skipping it may fail to find `tmux`/`git`/`claude` in stripped environments (launchd, CI).
- `exec` bleeds stderr to logs; `execSafe` suppresses and returns null. Default 30s timeout.

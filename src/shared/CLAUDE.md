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
- `AgentStatus 'lost'` ≠ `'crashed'`: `'lost'` means the tmux pane vanished (daemon restart, session resume with pane gone); `'crashed'` means process exited non-zero. Filtering only `'crashed'` misses silently-disappeared agents.
- `Agent.resumeEnv`/`resumeArgs` and `OrchestratorCycle.resumeEnv`/`resumeArgs` store the exact env exports + CLI flags used to spawn the process — written for pane recovery, not display.
- `OrchestratorCycle.interCycleGapMs` is undefined on cycle 1 (no previous cycle); from cycle 2+ it measures wall time from the previous cycle's `completedAt` to the current spawn, including daemon poll delay and any user pause.

## Companion Types

- `commentaryHistory` is a 30-entry ring buffer for anti-repetition. Trimming below ~30 lets duplicates recur.
- `recentCompletions` comment says "last 3" but stores enough for momentum check (5 in 4h). Don't cap to 3.
- `RunningStats.m2` is raw sum of squared deviations (Welford's). Variance = `m2 / (count - 1)`, not `m2` directly.
- Achievement counter names are misleading: `consecutiveEfficientSessions` tracks `speed-demon`; `consecutiveHighCycleSessions` tracks `iron-will`; `consecutiveCleanSessions` tracks `hot-streak`. All reset to 0 on a non-qualifying session.
- Two distinct agent count fields on `CompanionState`, both optional (absent = pane-monitor hasn't run): `recentActiveAgents` (pane-monitor → boulder size + TUI; sum of agents in sessions with 2h-recent activity), `lastRecentAgentCount` (per-agent count of those with 2h-recent timestamps; used for mood baseline at session completion). Don't conflate them.
- `CompanionBaselines.recentAgentThroughput` is a *completion-time snapshot* RunningStats — its z-score drives the `grind` mood signal. Different from `recentActiveAgents` (live value, written by pane-monitor). Updating one doesn't update the other.
- `debugMood` on `CompanionState` is written by pane-monitor, consumed only by the TUI debug overlay. Don't use it as a mood input source — it's a read-after-write snapshot and may be stale.
- `taskHistory` keys are normalized task hashes. Adding task tracking without matching the same normalization silently misses matches, breaking `sisyphean`/`stubborn`/`one-must-imagine` achievement counts.
- `CompanionBaselines.pendingDayCount` holds the current day's running total and is finalized the next day. `sessionsPerDay` RunningStats always lags one full day — never reflects today's count.
- `MoodSignals` frustration fields (`rollbackCount`, `restartedAgentCount`, `lostAgentCount`, `killedAgentCount`) are aggregated across all tracked active sessions (max rollbacks, totals for the rest), not scoped to the current session.

## Companion Render

- `getBaseForm` placeholder asymmetry: bare `FACE` (no braces) vs `{BOULDER}` (with braces). A face string containing `{BOULDER}` corrupts output.
- `'hobby'` is deterministic: `(getHours() + companion.level) % IDLE_HOBBIES.length` — same hour + level always yields the same hobby.
- Color drops silently on narrow `maxWidth` — truncates `facePart` out of the replace target, returning uncolored output with no error.

## History

- `wallClockMs` vs `activeMs`: wall time (start→end) vs cumulative agent active time. Summing cycle-level `activeMs` double-counts cross-cycle agents.
- `SessionSummary.efficiency` may be null even when `wallClockMs` exists (written before the field was added); `history.ts` CLI recomputes inline — don't assume `null` means data unavailable.

## Tmux

- `openTmuxPane` appends `; tmux wait-for -S <channel>` to the command — signal fires only when the outermost shell exits. A command that never returns blocks `waitForTmuxPane` forever with no timeout.
- `waitForTmuxPane` passes timeout=`0` to `exec` — infinite wait by design. The two are decoupled: omit `waitForTmuxPane` for fire-and-forget (non-blocking) splits.

## Exec

- `EXEC_ENV` augments PATH with Homebrew/nix/user-local dirs — skipping it may fail to find `tmux`/`git`/`claude` in stripped environments (launchd, CI).
- `exec` bleeds stderr to logs; `execSafe` suppresses and returns null. Default 30s timeout.

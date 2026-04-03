# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## paths.ts

- **`daemonUpdatingPath()`** — sentinel written by `updater.ts`; CLI's `waitForDaemon` extends socket-ready timeout while it exists. Without it the CLI times out during self-updates.
- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.
- **`legacyLogsPath`** — `state.ts` reads and writes `logs.md` for backward compat. Don't delete even though new code never creates it.
- **`contextDir`** — Files injected into orchestrator prompt on cycle 1+. On cycle 0 only `session.context` string is used — files added before the first yield are invisible until cycle 1.
- **`messagesDir`** — Only messages longer than 200 chars get a file; shorter ones inline in state.json. Don't assume `message.content` is full text when `filePath` is set.
- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}`. `isSisyphusSession` checks `ssyph_` prefix — renaming breaks all pane-monitor detection.

## Protocol (protocol.ts)

- **`continue` / `resume` / `reopen-window` / `reconnect`**: `continue` reactivates completed session in-place (no cycle increment). `resume` increments cycle, optionally injects message, creates new tmux session if needed. `reopen-window` recreates tmux window only. `reconnect` re-attaches daemon tracking to an already-running tmux session by name — fails if the session doesn't exist.
- **`pane-exited`** — internal only, sent by `pane-monitor.ts`. Carries `paneId` (not `agentId`); never route from CLI code.

## types.ts

- **`AgentStatus` terminal states**: `killed` = explicit kill; `crashed` = pane exited unexpectedly; `lost` = pane gone with no exit event. `Agent.killedReason` only populated for `killed`.
- **`claudeSessionId`** — pre-generated UUID passed as `--session-id`. Not set for OpenAI agents. TUI uses it to build `claude --resume`.

## companion-types.ts

- **`AchievementDef.badge`** is inline short text for list views — distinct from `BADGE_ART` multi-line art in `companion-badges.ts`. `badge: null` doesn't mean no `BADGE_ART` entry is needed; missing art silently renders blank.
- **`CompanionState.baselines`** is optional — absent until the first session completes. Mood z-score comparisons fall back to raw signal values when undefined; don't assume it's populated on new installs.
- **`RunningStats.m2`** is the raw sum of squared deviations (Welford's algorithm). Variance is `m2 / (count - 1)`, not `m2` directly.
- **`recentCompletions`** comment says "last 3" but stores enough for momentum check (5 completions in 4 hours). Don't cap or trim it to 3.
- **`taskHistory`** keys are normalized task hashes, not raw strings. Powers sisyphean/stubborn/one-must-imagine achievements.
- **`dailyRepos`** and `repos` both key on absolute cwd paths — same path format, different shapes (`string[]` vs `RepoMemory`).

## companion-badges.ts

- **Dual registration required**: achievement in `ACHIEVEMENTS` also needs `BADGE_ART` entry. Missing art silently renders blank — `BADGE_ART[def.id] ?? []` falls back to empty.
- **Fixed card geometry**: `CARD_WIDTH=34`, `CARD_HEIGHT=18`. Art hard-capped at 9 lines; description wraps at 28 chars, max 2 lines. `centerLine` strips ANSI before padding — don't embed ANSI in `BADGE_ART` strings.

## companion-render.ts

- **Placeholder asymmetry**: `getBaseForm` uses bare `FACE` (no braces) and `{BOULDER}` (with braces). A face string containing `{BOULDER}` corrupts output.
- **`'hobby'` is deterministic**: `(getHours() + companion.level) % IDLE_HOBBIES.length` — same hour and level always yields the same hobby.
- **Mood intensity requires `debugMood`**: without it, intensity is always 0 → always mild-tier face (normal runtime).

## history-types.ts

- **`wallClockMs` vs `activeMs`**: `wallClockMs` is start→end wall time (null on sessions predating the field); `activeMs` is cumulative agent active time. They diverge heavily during idle/paused periods.

## exec.ts

- **`EXEC_ENV`** augments `PATH` with Homebrew, nix, and user-local bin dirs. Skipping it may fail to find `tmux`, `git`, or `claude` in stripped environments (launchd, CI).
- **`exec` vs `execSafe`**: `exec` bleeds stderr to daemon logs; `execSafe` suppresses and returns `null` on non-zero exit. Default 30s timeout — pass `timeoutMs` for network or large git ops.

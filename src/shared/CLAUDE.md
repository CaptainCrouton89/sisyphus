# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## paths.ts Patterns

- **`daemonUpdatingPath()`** — sentinel file written by `updater.ts`; CLI's `waitForDaemon` extends its socket-ready timeout while it exists. Without it the CLI times out during self-updates.

- **`reportFilePath` suffix** is either a zero-based integer (`agent-001-0.md`) or `'final'` (`agent-001-final.md`). Only these two shapes are written by `agent.ts`.

- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.

- **`legacyLogsPath`** — `state.ts` reads and writes `logs.md` for backward compat. Don't delete even though new code never creates it.

- **`contextDir`** — Files injected into orchestrator prompt on cycle 1+. On cycle 0 only `session.context` string is used — files added before the first yield are invisible until cycle 1.

- **`goalPath` vs `roadmapPath`**: `goal.md` is the canonical task (written at creation, edited by `update-task`/TUI `g` key). `roadmap.md` is the orchestrator's working plan, rewritten each cycle.

- **`messagesDir`** — Only messages longer than 200 chars get a file; shorter ones inline in state.json. Don't assume `message.content` is the full text when `filePath` is set.

- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}` — underscores only. `isSisyphusSession` checks `ssyph_` prefix; renaming it breaks all pane-monitor detection.

## Protocol Patterns

- **`report` vs `submit`**: `report` → `AgentReport.type: 'update'`; `submit` → `'final'` (marks agent done). An agent that only calls `report` never completes.

- **`continue` / `resume` / `reopen-window` / `reconnect`**: `continue` reactivates completed session in-place (no cycle increment). `resume` increments cycle, optionally injects message, creates new tmux session if needed. `reopen-window` recreates tmux window only. `reconnect` re-attaches daemon tracking to an already-running tmux session by name — fails if the session doesn't exist.

- **`yield.mode`** — stored on `OrchestratorCycle`; selects which template file loads on next spawn (falls back to `'strategy'`).

- **`pane-exited`** — internal only, sent by `pane-monitor.ts`. Carries `paneId` (not `agentId`); never route from CLI code.

## types.ts Patterns

- **`AgentStatus` terminal states**: `killed` = explicit kill; `crashed` = pane exited unexpectedly; `lost` = pane gone with no exit event. `Agent.killedReason` only populated for `killed`.

- **`claudeSessionId`** on `Agent` and `OrchestratorCycle` — pre-generated UUID passed as `--session-id`. Not set for OpenAI agents. TUI uses it to build `claude --resume`.

- **`Agent.repo`** — relative subdir from session `cwd`; pane CWD set to `join(cwd, repo)`. Default `'.'`; `state.ts` backfills missing values on load.

## companion-types.ts Patterns

- **`AchievementDef.badge`** is inline short text (e.g. `'*'`, `'[]'`) for list views — distinct from `BADGE_ART` multi-line art in `companion-badges.ts`. An achievement can have `badge: null` but still need a `BADGE_ART` entry; missing art silently renders blank.

- **`CompanionState.taskHistory`** — normalized task hash → attempt count (not raw task string). Powers sisyphean/stubborn/one-must-imagine achievements.

- **`CompanionState.dailyRepos`** — ISO date → `string[]` of absolute cwd paths; used for 'wanderer' achievement (3+ repos in a day). `repos` record uses the same absolute-path keys.

- **`CompanionState.recentCompletions`** — comment says "last 3" but 'momentum' needs 5 sessions in 4 hours; the field stores enough for the current check window, not a fixed cap.

## companion-badges.ts Patterns

- **Dual registration required**: achievement in `ACHIEVEMENTS` also needs `BADGE_ART` entry. Missing art silently renders blank — `BADGE_ART[def.id] ?? []` falls back to empty.

- **Fixed card geometry**: `CARD_WIDTH=34`, `CARD_HEIGHT=18`. Art hard-capped at 9 lines; description wraps at 28 chars, max 2 lines. `centerLine` strips ANSI before padding — don't embed ANSI in `BADGE_ART` strings.

- **`createBadgeGallery` sort order**: unlocked first (ascending `unlockedAt`), then locked in `ACHIEVEMENTS` array order. `startIndex` is a position in this sorted list, not an achievement index.

## companion-render.ts Patterns

- **Placeholder asymmetry in base forms**: `getBaseForm` uses bare `FACE` (no braces) and `{BOULDER}` (with braces). `renderCompanion` replaces `FACE` first, then `composeLine` replaces `{BOULDER}`. A face string containing `{BOULDER}` would corrupt output.

- **`'boulder'` field is a no-op when `'face'` is present**: boulder is embedded in the face template; the `'boulder'` switch-case skips if `hasFace`.

- **`getBoulderForm` appends `repoNickname`** as `boulder "${nickname}"` when `opts.repoPath` is provided and a nickname exists. This extends the rendered string length — account for it when computing `maxWidth`.

- **`'hobby'` field is deterministic**: `(getHours() + companion.level) % IDLE_HOBBIES.length` — same hour and level always yields the same hobby. Shifts by level, so companions at different levels show different hobbies at the same time.

- **Mood intensity requires `debugMood`**: `getMoodFace` receives `companion.debugMood?.scores[companion.mood] ?? 0`. Without `debugMood` (normal runtime), intensity is always 0 → always mild-tier face.

- **`maxWidth` truncation**: commentary shortened first (progressively, overhead-aware), then hard-truncated with `…`. Empty parts filtered before joining.

- **Color is string-replace on `facePart`**: `applyColor` replaces first occurrence. Silent no-op if `'face'` isn't in fields or `facePart` is null.

## history-types.ts Patterns

- **`SessionSummary.wallClockMs` vs `activeMs`**: `wallClockMs` is start→end wall time (null on sessions predating the field); `activeMs` is cumulative agent active time. They diverge heavily during idle/paused periods.

- **`HistoryEvent.data` is untyped** — `Record<string, unknown>` with per-event-type schema, no discriminated union. Look at the writer to understand the shape for each `HistoryEventType`.

- **`signals-snapshot` event** — periodic `MoodSignals` snapshot written by `pane-monitor.ts`. `SessionSummary.finalMoodSignals` is populated from the last such event in the session.

## exec.ts Patterns

- **`EXEC_ENV`** augments `PATH` with Homebrew, nix, and user-local bin dirs. Any `execSync`/`spawn` skipping it may fail to find `tmux`, `git`, or `claude` in stripped environments (launchd, CI).

- **`exec` vs `execSafe`**: `exec` lets stderr bleed to daemon logs; `execSafe` suppresses it and returns `null` on non-zero exit. Default timeout is 30s with no warning — pass `timeoutMs` for network or large git ops.

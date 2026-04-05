# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## paths.ts

- **`daemonUpdatingPath()`** — sentinel written by `updater.ts`; CLI's `waitForDaemon` extends socket-ready timeout while it exists. Without it the CLI times out during self-updates.
- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.
- **`legacyLogsPath`** — `state.ts` reads and writes `logs.md` for backward compat. Don't delete even though new code never creates it.
- **`contextDir`** — Files injected into orchestrator prompt on cycle 1+. On cycle 0 only `session.context` string is used — files added before the first yield are invisible until cycle 1.
- **`messagesDir`** — Only messages longer than 200 chars get a file; shorter ones inline in state.json. Don't assume `message.content` is full text when `filePath` is set.
- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}`. `isSisyphusSession` checks `ssyph_` prefix — renaming breaks all pane-monitor detection.

## config.ts

- **`statusBar` deep-merges** `colors` and `segments` sub-objects independently; all other top-level fields are shallow-merged (last wins). A project config `statusBar: { colors: { processing: 'red' } }` merges with global colors, not replaces the entire `statusBar` object.
- **`DEFAULT_CONFIG` includes `requiredPlugins: [{ name: 'devcore', marketplace: 'crouton-kit' }]`** — always present unless overridden by project config. Plugins listed here are validated at session start.

## Protocol (protocol.ts)

- **`continue` / `resume` / `reopen-window` / `reconnect`**: `continue` reactivates completed session in-place (no cycle increment). `resume` increments cycle, optionally injects message, creates new tmux session if needed. `reopen-window` recreates tmux window only. `reconnect` re-attaches daemon tracking to an already-running tmux session by name — fails if the session doesn't exist.
- **`pane-exited`** — internal only, sent by `pane-monitor.ts`. Carries `paneId` (not `agentId`); never route from CLI code.
- **`register-segment` / `update-segment` / `unregister-segment`** — external status bar injection. `priority` determines sort order within a side (lower = closer to edge). Segments persist until `unregister-segment`; `update-segment` only updates `content`, not `side`/`priority`/`bg`.

## types.ts

- **`AgentStatus` terminal states**: `killed` = explicit kill; `crashed` = pane exited unexpectedly; `lost` = pane gone with no exit event. `Agent.killedReason` only populated for `killed`.
- **`claudeSessionId`** — pre-generated UUID passed as `--session-id`. Not set for OpenAI agents. Both `Agent.claudeSessionId` and `OrchestratorCycle.claudeSessionId` exist; TUI uses whichever is set to build `claude --resume` for the respective pane.
- **`Session.tmuxSessionId`** (`$N` format) is stable across renames; `tmuxSessionName` can be renamed and breaks if the `ssyph_` prefix is lost. When both are present, use `tmuxSessionId` for exact-match targeting.
- **`companionCredited*`** (`companionCreditedCycles`, `companionCreditedActiveMs`, `companionCreditedStrength`) — sentinels tracking stats already awarded to the companion. On `continue` → re-complete, companion logic awards only the delta (current total − credited). Without them every re-completion double-counts all three stats.
- **`resumeEnv`/`resumeArgs`** on both `Agent` and `OrchestratorCycle` — carry the env vars and CLI args needed for `--resume` re-attachment. Written by daemon on spawn; read by `agent.ts` and `orchestrator.ts` on restart. Absent on pre-resume agents.

## companion-types.ts

- **`AchievementDef.badge`** is inline short text for list views — distinct from `BADGE_ART` multi-line art in `companion-badges.ts`. `badge: null` has no bearing on `BADGE_ART`; the two registrations are independent.
- **`MoodSignals` optional fields** — `cycleCount`, `sessionsCompletedToday`, and `activeAgentCount` absent → treated as 0 (degraded but not broken mood variety). `totalAgentCount` is a cross-session aggregate (max agents across all tracked active sessions), used for z-score baselines — don't supply a single-session agent count here.
- **`CompanionState.baselines`** is optional — absent until the first session completes. Mood z-score comparisons fall back to raw signal values when undefined; don't assume it's populated on new installs.
- **`CompanionBaselines.pendingDayCount`** holds today's session count until `lastCountedDay` rolls over — `sessionsPerDay` baselines always lag by one calendar day. Reading `sessionsPerDay.mean` intra-day misses all of today's sessions.
- **`RunningStats.m2`** is the raw sum of squared deviations (Welford's algorithm). Variance is `m2 / (count - 1)`, not `m2` directly.
- **`commentaryHistory`** is a 30-entry ring buffer fed to Haiku on every commentary call for anti-repetition. Trimming it below ~30 entries lets duplicate lines recur — Haiku needs the window to detect them.
- **`recentCompletions`** comment says "last 3" but stores enough for momentum check (5 completions in 4 hours). Don't cap or trim it to 3.
- **`taskHistory`** keys are normalized task hashes, not raw strings. Powers sisyphean/stubborn/one-must-imagine achievements.
- **`dailyRepos`** keys on ISO date strings (`YYYY-MM-DD`), values are arrays of cwd paths. **`repos`** keys on absolute cwd paths, values are `RepoMemory`. Different key formats — don't join or compare them directly.
- **`spinnerVerbIndex`** — persists verb spinner position across daemon restarts; load from state, don't reset to 0 on read.
- **Achievement counter semantics** (misleading names): `consecutiveEfficientSessions` tracks `speed-demon` (≤3 cycles per session, 10-streak); `consecutiveHighCycleSessions` tracks `iron-will` (8+ cycles per session, 5-streak). Both reset to 0 on a non-qualifying session. Adding a session-completion path requires updating both counters or the corresponding achievement silently never unlocks.

## companion-badges.ts

- **`BADGE_ART` is `Record<AchievementId, string[]>`** (not Partial) — adding a new `AchievementId` without a `BADGE_ART` entry is a TypeScript compile error. Art hard-capped at 9 lines via `art.slice(0, 9)`; `first-blood` (12) and `marathon` (10) silently lose bottom lines. `centerLine` strips ANSI before padding — don't embed ANSI in art strings.
- **Gallery sort**: unlocked first by `unlockedAt` date, then locked in their `ACHIEVEMENTS` category order. `createBadgeGallery` always re-sorts — index from a prior call is not stable across unlock events.

## companion-render.ts

- **Placeholder asymmetry**: `getBaseForm` uses bare `FACE` (no braces) and `{BOULDER}` (with braces). A face string containing `{BOULDER}` corrupts output.
- **`getStatCosmetics` thresholds**: `wisdom > 5` → wisps; `endurance > 36_000_000` ms (10 hrs) → trail; `patience > 50` → zen-prefix. Units differ — don't compare endurance to a raw count.
- **`'hobby'` is deterministic**: `(getHours() + companion.level) % IDLE_HOBBIES.length` — same hour and level always yields the same hobby.
- **`'verb'` field**: `opts.verbIndex` overrides `companion.spinnerVerbIndex` — lets callers advance the spinner frame independently without mutating companion state.
- **Mood intensity requires `debugMood`**: without it, intensity is always 0 → always mild-tier face (normal runtime).
- **`getBoulderForm` with `repoNickname`**: when `opts.repoPath` resolves a nickname, return value is a display string (`o "reponame"`), not a bare boulder char.
- **Boulder thresholds**: ≤2→`o`, ≤6→`O`, ≤15→`◉`, ≤35→`@`, else `@@`. Thresholds were bumped ~2× in a refactor to reflect typical multi-agent session sizes — old thresholds (≤1/≤4/≤9/≤20) appear in git history but are no longer active.
- **Color drops silently on narrow `maxWidth`**: `applyColor` does `result.replace(facePart, coloredFace)`. If `maxWidth` truncates `facePart` out of the string, the replace finds no match and returns uncolored output. Color also requires `'face'` in fields — `color: true` with only `['mood', 'commentary']` is a no-op.
- **`maxWidth` truncates commentary first**: shortens `lastCommentary.text` progressively before hard-truncating with `…`; uses `stringWidth` (display columns) not `.length` — wide chars like ಠ益ಠ have `.length < displayWidth`.
- **`zen-prefix` vs `wisps`/`trail` asymmetry**: `zen-prefix` (☯ prefix) applies even when boulder is empty; `wisps` and `trail` are no-ops without a boulder.

## history-types.ts

- **`wallClockMs` vs `activeMs`**: `wallClockMs` is start→end wall time (null on sessions predating the field); `activeMs` is cumulative agent active time. They diverge heavily during idle/paused periods.

## exec.ts

- **`EXEC_ENV`** augments `PATH` with Homebrew, nix, and user-local bin dirs. Skipping it may fail to find `tmux`, `git`, or `claude` in stripped environments (launchd, CI).
- **`exec` vs `execSafe`**: `exec` bleeds stderr to daemon logs; `execSafe` suppresses and returns `null` on non-zero exit. Default 30s timeout — pass `timeoutMs` for network or large git ops.

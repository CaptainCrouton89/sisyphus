# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## paths.ts Patterns

- **`daemonUpdatingPath()`** returns `~/.sisyphus/updating` — sentinel file written by `updater.ts` containing the version being installed. CLI's `waitForDaemon` extends its socket-ready timeout while this file exists; without it the CLI times out during self-updates.

- **`reportFilePath` suffix** is either a zero-based integer (`agent-001-0.md`) or the literal string `'final'` (`agent-001-final.md`). Only these two shapes are written by `agent.ts`.

- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.

- **`legacyLogsPath`** — old sessions stored a flat `logs.md`; `state.ts` reads it during snapshot restore and writes it back for backwards compat. Don't delete even though new code never writes it.

- **`contextDir`** — Files here (excluding `CLAUDE.md`) are injected into the orchestrator prompt on cycle 1+. On cycle 0, only `session.context` string is used — files added before the first yield won't be seen until cycle 1.

- **`goalPath` vs `roadmapPath`**: `goal.md` is the canonical task description — written at session creation with the task string, kept in sync by `update-task`. Orchestrator reads it (falls back to `session.task`); TUI `g` key edits it. `roadmap.md` is the orchestrator's working plan, rewritten each cycle. These are different files serving different audiences.

- **`messagesDir`** — Only messages longer than 200 chars get a file here (`{messageId}.md`); shorter messages stored inline in state.json. Don't assume `message.content` is full text when `filePath` is set.

- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}` — underscores only (slashes break `-t` targeting; dots are tmux-reserved). `isSisyphusSession` checks `ssyph_` prefix; `tmuxSessionDisplayName` strips it back. Renaming the prefix breaks all pane-monitor detection.

- **`sessionsManifestPath/TSV`** — global cross-project index at `~/.sisyphus/sessions-manifest.{json,tsv}`, written by `sessions-manifest.ts` after every state change. CLI's `tmux-sessions` command reads the JSON version. Distinct from per-project `state.json` — the manifest is ephemeral metadata; state.json is authoritative.

- **`tuiScratchDir`** — `.tui/` inside the session dir; TUI assembles neovim overview files here. Not read or written by daemon or agents; safe to delete.

## Protocol Patterns

- **`report` vs `submit`**: `report` → `AgentReport.type: 'update'`; `submit` → `AgentReport.type: 'final'` (marks agent done). Orchestrator state summary uses `final` if present, else falls back to last `update`. An agent that only calls `report` never completes.

- **`continue` / `resume` / `reopen-window` / `reconnect`**: `continue` reactivates a `completed` session in-place — no cycle increment, no message injection. `resume` increments cycle, optionally injects a message, creates a new tmux session if needed. `reopen-window` recreates the tmux window only (no state/cycle change). `reconnect` re-attaches daemon tracking to an *already-running* tmux session by name lookup — for when the daemon restarted and lost track; fails if the tmux session doesn't exist.

- **`yield.nextPrompt`** — replaces the default continuation instruction for the next cycle's user prompt; overridden by `sisyphus resume --message` if both are present.

- **`yield.mode`** — stored on the completed `OrchestratorCycle`; read on next orchestrator spawn to select which template file to load (falls back to `'strategy'`). Available mode names are injected into the system prompt each cycle.

- **`pane-exited`** — sent internally by `pane-monitor.ts` to the daemon socket, not a CLI command. Carries a raw `paneId` (not `agentId`); never route this from CLI code.

## types.ts Patterns

- **`AgentStatus` terminal states**: `killed` = explicit kill; `crashed` = pane exited unexpectedly; `lost` = pane gone with no exit event. `Agent.killedReason` only populated for `killed`.

- **`claudeSessionId`** on `Agent` and `OrchestratorCycle` — UUID pre-generated before spawn, passed as `--session-id`. Not set for OpenAI agents. TUI uses this with `resumeEnv`/`resumeArgs` to build `claude --resume`.

- **`Session.tmuxSessionId`** — tmux `$N` numeric ID, stable across renames. `isSessionAlive` prefers it over `tmuxSessionName`. Both optional — absent on sessions created before this field was added.

- **`Agent.repo`** — relative subdir from session `cwd`; pane CWD set to `join(cwd, repo)`. Default `'.'`; `state.ts` backfills missing values on load.

## companion-badges.ts Patterns

- **Dual registration required**: achievement in `ACHIEVEMENTS` (`companion-types.ts`) also needs `BADGE_ART` entry in `companion-badges.ts`. Missing art silently renders blank — `BADGE_ART[def.id] ?? []` falls back to empty, no error thrown.

- **Fixed card geometry**: `CARD_WIDTH=34`, `CARD_HEIGHT=18` used by TUI for layout. Art hard-capped at 9 lines; description wraps at 28 chars, max 2 lines rendered. `centerLine` strips ANSI before padding — don't embed ANSI in `BADGE_ART` strings. Changing constants requires matching TUI updates.

- **`createBadgeGallery` sort order**: unlocked first (ascending `unlockedAt`), then locked in `ACHIEVEMENTS` array order. `startIndex` is a position in this sorted list, not an achievement index.

## companion-render.ts Patterns

- **Placeholder asymmetry in base forms**: `getBaseForm` uses bare `FACE` (no braces) and `{BOULDER}` (with braces). `renderCompanion` replaces `FACE` first via `.replace('FACE', face)`, then `composeLine` replaces `{BOULDER}`. A face string that literally contains `{BOULDER}` would corrupt output.

- **Boulder embedded in face — `'boulder'` field is a no-op when `'face'` is present**: `composeLine` substitutes the boulder into the face template. The `'boulder'` switch-case explicitly skips if `hasFace`. Passing both fields doesn't double-render the boulder.

- **Color is string-replace on `facePart`**: `applyColor` does `result.replace(facePart, coloredFace)` — replaces first occurrence. Both `opts.color` and `opts.tmuxFormat` are silent no-ops if `'face'` isn't in fields or `facePart` is null.

- **Mood intensity requires `debugMood`**: `getMoodFace` receives `companion.debugMood?.scores[companion.mood] ?? 0`. Without `debugMood` (normal runtime), intensity is always 0 → always mild-tier face, regardless of actual mood score.

- **`endurance` cosmetic threshold is milliseconds**: `getStatCosmetics` uses `endurance > 36_000_000` for the `'trail'` cosmetic — that's 10 hours in ms.

- **`maxWidth` truncation sequence**: commentary is shortened first (progressively, overhead-aware), then the assembled string is hard-truncated with `…`. Empty parts are filtered before joining, so dropped commentary leaves no stray double-spaces.

## exec.ts Patterns

- **`EXEC_ENV`** augments `PATH` with Homebrew, nix, and user-local bin dirs at daemon startup. Any `execSync`/`spawn` skipping it may fail to find `tmux`, `git`, or `claude` in stripped environments (launchd, CI).

- **`exec` vs `execSafe`**: `exec` lets stderr bleed to daemon logs; `execSafe` suppresses it and returns `null` on non-zero exit. Default `exec` timeout is 30s with no warning — pass explicit `timeoutMs` for network or large git ops.

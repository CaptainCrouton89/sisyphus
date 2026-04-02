# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Config & Effort Levels

- **EffortLevel** type: `'low' | 'medium' | 'high' | 'max'` — case-sensitive, must be exact match
- **Immutable at runtime** — Load once via `loadConfig(cwd)`, don't re-read files

## paths.ts Patterns

- **`daemonUpdatingPath()`** returns `~/.sisyphus/updating` — sentinel file written by `updater.ts` containing the version being installed. CLI's `waitForDaemon` extends its socket-ready timeout while this file exists; without it the CLI times out during self-updates.

- **`reportFilePath(cwd, sessionId, agentId, suffix)`** — suffix is either a zero-based integer (`agent-001-0.md`) or the literal string `'final'` (`agent-001-final.md`). Only these two shapes are written by `agent.ts`.

- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.

- **`legacyLogsPath`** — old sessions stored a flat `logs.md`; `state.ts` reads it during snapshot restore and writes it back for backwards compat. Don't delete even though new code never writes it.

- **`contextDir`** — Files here (excluding `CLAUDE.md`) are injected into the orchestrator prompt on cycle 1+. On cycle 0, only `session.context` string is used — files added before the first yield won't be seen until cycle 1. `state.ts` seeds this dir with `CLAUDE.md` always, and `initial-context.md` if context was provided.

- **`goalPath`** — Written at session creation. Overwritten by the `update-task` protocol request; TUI and context summary always read the file directly.

- **`strategyPath`** — Written by the orchestrator (not at session creation); shows as `(empty)` until first written. Persists across cycles — orchestrator updates it in place.

- **`messagesDir`** — Only messages longer than 200 chars get a file here (`{messageId}.md`); shorter messages stored inline in state.json. Don't assume `message.content` is full text when `filePath` is set.

- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}` — underscores only (slashes break `-t` targeting; dots are tmux-reserved). `isSisyphusSession` checks `ssyph_` prefix — renaming it breaks all pane-monitor detection.

- **`companionPath()`** returns `~/.sisyphus/companion.json` — global gamification state shared across all projects. Deleting it only resets gamification, nothing else.

## Protocol Patterns

- **`report` vs `submit`**: `report` → `AgentReport.type: 'update'` (intermediate snapshot); `submit` → `AgentReport.type: 'final'` (completion signal, marks agent done). Orchestrator state summary uses `final` if present, else falls back to last `update`. An agent that only ever calls `report` never completes.

- **`continue` vs `resume` vs `reopen-window`**: `continue` reactivates a `completed` session in-place — clears `completedAt`/`completionReport`, no cycle increment, no message injection. `resume` increments the cycle and optionally injects a message. `reopen-window` recreates the tmux window without touching state or cycle count.

- **`update-task`** — amends the task description; overwrites `goalPath`. Orchestrator sees the new task on its next cycle's context summary.

- **`yield.nextPrompt`** — replaces the default "Review the current session…" continuation instruction for the next cycle's user prompt. Overridden by `sisyphus resume --message` if both are present — the stateless orchestrator's only way to carry explicit intent across a cycle boundary.

- **`yield.mode`** — stored on the completed `OrchestratorCycle`; read on next orchestrator spawn to select which template file to load (falls back to `'strategy'`). Available mode names are injected into the system prompt each cycle.

## types.ts Patterns

- **`AgentStatus` terminal states**: `killed` = explicit kill request; `crashed` = pane exited unexpectedly; `lost` = pane gone with no exit event received. `Agent.killedReason` string is only populated for `killed`.

- **`claudeSessionId`** on `Agent` and `OrchestratorCycle` — UUID pre-generated before spawn, passed as `--session-id` to Claude. Not set for OpenAI agents. TUI uses this alongside `resumeEnv`/`resumeArgs` to reconstruct `claude --resume` for `o`/`O` keys.

- **`resumeEnv` / `resumeArgs`** — exact env-export string and CLI flags captured at spawn time. If absent (OpenAI agents), TUI still attempts resume without flags.

- **`Session.launchConfig`** — snapshot of `{ model, context, orchestratorPrompt }` at session creation. Never read by daemon after creation — audit trail only.

- **`Session.wallClockMs` / `startHour` / `startDayOfWeek`** — companion analytics fields. `wallClockMs` written at session completion; `startHour`/`startDayOfWeek` at creation. Not used by daemon scheduling or orchestrator logic.

- **`Session.parentSessionId`** — set when created via `sisyphus resume`; only used by companion achievement checker (`comeback-kid`). No effect on orchestrator or agent behavior.

## exec.ts Patterns

- **`EXEC_ENV`** is a module-level singleton (sourced from `env.ts`) that augments `PATH` with Homebrew, nix, and user-local bin dirs at daemon startup. Any `execSync`/`spawn` call that skips `EXEC_ENV` may fail to find `tmux`, `git`, or `claude` in stripped environments (launchd, CI).

- **`exec` vs `execSafe`**: `exec` lets stderr bleed to daemon logs on failure; `execSafe` suppresses it and returns `null` on any non-zero exit. Use `execSafe` for probe-style checks where failure is expected.

- **Default timeout** on `exec` is 30 s — throws silently with no warning emitted. Pass explicit `timeoutMs` for commands that may block (network calls, large git ops).

# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Files

- **protocol.ts** — `Request` and `Response` union types; all CLI↔Daemon operations
- **types.ts** — Core domain types (`Session`, `Agent`, `OrchestratorCycle`, `MessageSource`)
- **paths.ts** — Path helpers for global (`~/.sisyphus/`), project (`.sisyphus/`), and session directories
- **config.ts** — Layered config resolution (defaults → global → project); `EffortLevel` type; `Config` interface with effort, notifications, plugins

## Config & Effort Levels

- **EffortLevel** type: `'low' | 'medium' | 'high' | 'max'` — case-sensitive, must be exact match
- Config fields include `orchestratorEffort`, `agentEffort`, `notifications`, `requiredPlugins`, `model`, `editor`, `repos`, etc.
- **Immutable at runtime** — Load once via `loadConfig(cwd)`, don't re-read files

## paths.ts Patterns

- **`daemonUpdatingPath()`** returns `~/.sisyphus/updating` — a sentinel file written by `updater.ts` containing the version string being installed. CLI's `waitForDaemon` extends its socket-ready timeout while this file exists; without it the CLI would time out during self-updates.

- **`reportFilePath(cwd, sessionId, agentId, suffix)`** — suffix is either a zero-based integer (incremental snapshots: `agent-001-0.md`) or the literal string `'final'` (`agent-001-final.md`). Only these two shapes are written by `agent.ts`.

- **Padding inconsistency**: `cycleLogPath` zero-pads to 3 digits (`cycle-001.md`); `snapshotDir` does not (`cycle-1/`). Don't sort or glob them interchangeably.

- **`legacyLogsPath`** — old sessions stored a single flat `logs.md`; new sessions use `logs/cycle-NNN.md`. `state.ts` reads `legacyLogsPath` during snapshot restore and writes it back for backwards compatibility. Don't delete this function even though new code never writes it directly.

- **`contextDir`** — Files here (excluding `CLAUDE.md`) are injected into the orchestrator prompt as `@.sisyphus/sessions/{id}/context/` on cycle 1+ (after at least one yield). On the very first orchestrator invocation (`cycleNum === 0`), only the inline `session.context` string is used instead; files added before the first yield won't be seen until cycle 1. `state.ts` seeds this dir with `CLAUDE.md` always, and `initial-context.md` if `context` was provided at session creation.

- **`goalPath`** — Immutable task description written at session creation. Can be overwritten via `state.ts` if the task is amended, but TUI and context summary always read the file directly.

- **`strategyPath`** — Written by the orchestrator (not at session creation); shows as `(empty)` in the orchestrator prompt until first written. Persists across cycles — the orchestrator updates it in place.

- **`messagesDir`** — Only messages longer than 200 chars get a file here (named `{messageId}.md` where the ID is a UUID); shorter messages are stored inline in state.json only. The orchestrator state summary prints a file reference next to the truncated summary — don't assume `message.content` is the full text when a `filePath` is set.

- **`tuiScratchDir`** — Hidden `.tui/` dir under the session dir, used exclusively by `overview-writer.ts` for TUI rendering scratch files. Never read by daemon or CLI.

- **`tmuxSessionName`** produces `ssyph_{basename(cwd)}_{sessionLabel}` — underscores only. Slashes break tmux `-t` target resolution; dots get silently converted to underscores by tmux (reserved for `window.pane` targeting). `isSisyphusSession` checks `ssyph_` prefix; `tmuxSessionDisplayName` strips `ssyph_{segment}_` via regex. Renaming the `ssyph` prefix breaks all pane-monitor detection.

## Critical Constraints

- **Protocol is the contract** — Changes to `Request` or `Response` invalidate active sessions; coordinate with CLI and Daemon
- **Types must serialize cleanly** — No circular refs, class methods, or non-JSON properties
- **No local dependencies** — Never import from `src/cli/` or `src/daemon/`
- **paths.ts exports functions only** — No constants; all paths computed to stay portable across cwd changes

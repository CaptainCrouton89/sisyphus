# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

## Entry Point (`index.ts`)

- Node version check runs **before any `import` statements** — must stay at the top or the ESM import of Commander fails before the check runs.
- `sortSubcommands: false` — help lists commands in **registration order**, not alphabetical; append new commands at the end of `index.ts` to preserve logical grouping.
- First-run welcome fires when `~/.sisyphus/` doesn't exist AND immediately `mkdirSync`s it — fires exactly once on the first non-skipped command. The `skipWelcome` list exempts `doctor`, `setup`, `init`, `getting-started`, etc.; any command not on that list consumes the welcome even if it subsequently fails.

## Client Communication (`client.ts`)

- `rawSend()` — Low-level socket send (10s timeout, single attempt)
- `sendRequest()` — Wraps `rawSend()` with retry logic:
  - 5 attempts total, 2s delay between retries
  - On macOS: auto-installs daemon via launchd on first ENOENT/ECONNREFUSED
  - On non-macOS: retries, then suggests manual daemon startup
  - Non-socket errors are thrown immediately (not retried)

**Pattern**: All commands use `sendRequest(request)` → waits for response or throws after max retries.

## Daemon Installation (`install.ts`)

- `ensureDaemonInstalled()` — Called on first connection attempt (macOS only):
  - Generates launchd plist with `Label: com.sisyphus.daemon`
  - Looks for daemon binary as sibling to CLI (`dirname(import.meta.url)/daemon.js`)
  - Installs plist to `~/Library/LaunchAgents/`
  - Loads via `launchctl load -w`
  - Calls `setupTmuxKeybind()` from `tmux-setup.ts` for session cycling/navigation
- `waitForDaemon(maxWaitMs)` — Blocks until socket is ready (detects daemon updates via `.daemon-updating` file)
- `uninstallDaemon(purge)` — Removes plist, unloads daemon, optionally purges all state

## Tmux Integration (`tmux-setup.ts`)

Scripts installed to `~/.sisyphus/bin/`; config written to `~/.sisyphus/tmux.conf` then sourced into user's tmux config (prefers XDG `~/.config/tmux/tmux.conf` over `~/.tmux.conf`). If no user config exists, the source line is omitted and a manual instruction is printed.

**Session grouping**: cycle/home/kill scripts read `~/.sisyphus/sessions-manifest.tsv` (written by the daemon) to find related sessions. TSV columns: `type\tname\tcwd\tphase\tdwid`. `type=H` is the home session; other types are sisyphus sessions. Lines starting with `#` are skipped. Scripts group by matching `cwd` — only same-cwd sessions cycle together. The daemon is solely responsible for keeping this file current.

**Session identity**: `ssyph_` prefix marks agent/orchestrator sessions. The `prefix-x` override uses `grep -q '^ssyph_'` on the session name — home/non-sisyphus sessions get default `kill-pane ; select-layout even-horizontal` directly.

**Dashboard window**: `dwid` column in the manifest stores a window *ID* (e.g. `@3`), not a name — so jumping to the dashboard survives window renames.

**`prefix-x` override** (within kill-pane script):
- **Multiple panes**: kills current pane + `select-layout even-horizontal`
- **Last pane**: looks up home session via manifest, switches there + selects dashboard window, then `kill-session`; falls through to plain `kill-pane` if no home session found

**`setupTmuxKeybind`** always reinstalls all three scripts and rewrites `~/.sisyphus/tmux.conf` (idempotent), then checks `tmux list-keys` for conflicts on both keys before touching user config. On conflict with a non-sisyphus binding: scripts are written but conf and source line are not. `already-installed` status is cosmetic only — script and conf writes still happen. Applies bindings live via `tmux bind-key` if a server is running. **Conflict detection requires a running tmux server** — if tmux is down, `getExistingBinding` returns null and all bindings are written without conflict checking.

**Extended keys alias**: Any key matching `M-[A-Z]` (e.g. `DEFAULT_HOME_KEY = 'M-S'`) gets a second binding `M-S-{lower}` (e.g. `M-S-s`) to the same script — required because terminals with `extended-keys on` send the modifier form instead. `DEFAULT_KEY = 'M-s'` (lowercase) doesn't match and gets no alias. Conflict checking covers the primary key only, not the alias.

**`removeTmuxKeybind`** scans both `~/.tmux.conf` and `~/.config/tmux/tmux.conf` for the source line regardless of which was written — handles config moves since install. Also deletes the three scripts from `~/.sisyphus/bin/` and restores default `prefix-x` live if tmux is running.

**Status bar**: Daemon renders the complete status string and writes it to the global tmux option `@sisyphus_status`. To show session indicators, add `#{@sisyphus_status}` to `status-right`. No shell scripts — the daemon pre-renders tmux format strings with per-client conditionals for current-session highlighting. Updated every poll cycle (5s). `@sisyphus_phase` is still written per-session for CLI commands (`tmux-sessions`).

## Companion Commands (`companion.ts`, `companion-context.ts`)

- `sisyphus companion` — human-readable profile display (XP, level, mood, achievements, per-repo memory). `--name <name>` renames the companion via daemon request, not a local write.
- `sisyphus companion-context` — **machine-readable only**: outputs `{"additionalContext":"<string>"}` to stdout with no trailing newline. Designed to be called as a Claude Code hook (e.g. `userPromptSubmit`), not invoked directly by users. Reads live session state via `buildCompanionContext` in `src/tui/lib/context.ts` — does **not** contact the daemon, exits synchronously.


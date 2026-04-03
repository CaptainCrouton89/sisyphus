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

**Key table architecture**: `DEFAULT_CYCLE_KEY = 'M-s'` binds directly to cycle in the root table. `DEFAULT_PREFIX_KEY = 'C-s'` enters the `sisyphus` key table (`KEY_TABLE`), which provides: `s`=cycle, `h`=home/dashboard, `x`=kill-pane, `n`=new-prompt popup, `m`=message popup. The `n` and `m` popup bindings use `display-popup -d "#{pane_current_path}"` — popup opens in the current pane's directory, not the session cwd.

**Session grouping**: cycle/home/kill scripts read `~/.sisyphus/sessions-manifest.tsv` (written by the daemon) to find related sessions. TSV columns: `type\tname\tcwd\tphase\tdwid`. `type=H` is the home session; `type=S` is a sisyphus session. Lines starting with `#` are skipped. Scripts group by matching `cwd` — only same-cwd sessions cycle together. The daemon is solely responsible for keeping this file current.

**Session identity**: `ssyph_` prefix marks agent/orchestrator sessions. The `prefix-x` override uses `grep -q '^ssyph_'` on the session name — home/non-sisyphus sessions get default `kill-pane ; select-layout even-horizontal` directly.

**Dashboard window**: `dwid` column in the manifest stores a window *ID* (e.g. `@3`), not a name — so jumping to the dashboard survives window renames. `-` is the placeholder when no dashboard window exists; all scripts guard `dwid != "-"` before calling `select-window`. Scripts also fall back to `select-window -t sisyphus-dashboard` by name if the ID fails.

**Home script two-phase lookup**: First checks `@sisyphus_dashboard` tmux option on the *current* session — if set, selects that window in place (no session switch). Only falls back to manifest cwd-matching when the current session has no `@sisyphus_dashboard`. The option is set by the daemon on home sessions; agent/orchestrator sessions never have it. Manifest fallback does two passes: (1) find current session's cwd by name, (2) find the `type=H` row with that cwd.

**`prefix-x` override** (within kill-pane script):
- **Multiple panes**: kills current pane + `select-layout even-horizontal`
- **Last pane**: looks up home session via manifest, switches there + selects dashboard window, then `kill-session`; falls through to plain `kill-pane` if no home session found

**`sisyphus-msg` session ID resolution**: Reads `@sisyphus_session_id` tmux option from the current session first. If absent (e.g. called from a home session), scans manifest for a `type=S` row with matching cwd and reads `@sisyphus_session_id` from that session. Errors with `sleep 1` before exit so the popup doesn't flash and disappear.

**`sisyphus-new`/`sisyphus-msg` scripts**: Both open nvim on a tmpfile; if the file is empty/whitespace after exit, they no-op. `sisyphus-new` calls `sisyphus start "$(cat tmpfile)"`. `sisyphus-msg` resolves the session ID via the chain above, then calls `sisyphus message --session`.

**`setupTmuxKeybind`** always reinstalls all five scripts and rewrites `~/.sisyphus/tmux.conf` (idempotent), then checks `tmux list-keys` for conflicts on both keys before touching user config. On conflict with a non-sisyphus binding: scripts are written but conf and source line are not. `already-installed` status is cosmetic only — script and conf writes still happen. Applies bindings live via `tmux bind-key` if a server is running. **Conflict detection requires a running tmux server** — if tmux is down, `getExistingBinding` returns null and all bindings are written without conflict checking.

**`removeTmuxKeybind`** scans both `~/.tmux.conf` and `~/.config/tmux/tmux.conf` for the source line regardless of which was written — handles config moves since install. Also deletes all five scripts from `~/.sisyphus/bin/` and restores default `prefix-x` live if tmux is running.

**Status bar**: Daemon renders the complete status string and writes it to the global tmux option `@sisyphus_status`. To show session indicators, add `#{@sisyphus_status}` to `status-right`. No shell scripts — the daemon pre-renders tmux format strings with per-client conditionals for current-session highlighting. Updated every poll cycle (5s). `@sisyphus_phase` is still written per-session for CLI commands (`tmux-sessions`).

## Companion Commands (`companion.ts`, `companion-context.ts`)

- `sisyphus companion` — human-readable profile display (XP, level, mood, achievements, per-repo memory). `--name <name>` renames the companion via daemon request, not a local write.
- `sisyphus companion-context` — **machine-readable only**: outputs `{"additionalContext":"<string>"}` to stdout with no trailing newline. Designed to be called as a Claude Code hook (e.g. `userPromptSubmit`), not invoked directly by users. Reads live session state via `buildCompanionContext` in `src/tui/lib/context.ts` — does **not** contact the daemon, exits synchronously.


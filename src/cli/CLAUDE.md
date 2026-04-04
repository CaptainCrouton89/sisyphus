# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

## Entry Point (`index.ts`)

- Node version check runs **before any `import` statements** — must stay at the top or the ESM import of Commander fails before the check runs.
- `sortSubcommands: false` — help lists commands in **registration order**, not alphabetical; append new commands at the end of `index.ts` to preserve logical grouping.
- First-run welcome fires when `~/.sisyphus/` doesn't exist AND `firstArg` is truthy — bare `sisyphus` (no args) skips the welcome silently even on a fresh install; only a named subcommand triggers it. Immediately `mkdirSync`s `~/.sisyphus/` on fire (fires exactly once). `skipWelcome` exempts `doctor`, `setup`, `init`, `getting-started`, `uninstall`, `help`, `--help`, `-h`, `--version`, `-V`; any other command consumes the welcome even if it subsequently fails.

## Client Communication (`client.ts`)

- `sendRequest()` — 5 attempts, 2s delay; on macOS auto-installs daemon via launchd on ENOENT/ECONNREFUSED; non-socket errors thrown immediately (not retried).

## Daemon Installation (`install.ts`)

- `ensureDaemonInstalled()` — plist `Label: com.sisyphus.daemon`; looks for daemon binary as sibling to CLI (`dirname(import.meta.url)/daemon.js`); installs to `~/Library/LaunchAgents/`; calls `setupTmuxKeybind()` from `tmux-setup.ts`.
- `waitForDaemon(maxWaitMs)` — blocks until socket ready; detects in-progress daemon updates via `.daemon-updating` sentinel file.

## Tmux Integration (`tmux-setup.ts`)

Scripts installed to `~/.sisyphus/bin/`; config written to `~/.sisyphus/tmux.conf` then sourced into user config (prefers XDG `~/.config/tmux/tmux.conf` over `~/.tmux.conf`). If no user config exists, source line is omitted and a manual instruction is printed.

**Key table architecture**: `M-s` binds cycle in root table. `C-s` enters `sisyphus` key table: `s`=cycle, `h`=home/dashboard, `x`=kill-pane, `n`=new-prompt popup, `m`=message popup, `k`=kill-session popup, `d`=delete-session popup. All popups use `-d "#{pane_current_path}"`. `n`/`m` are `80% × 60%`; `k`/`d` are fixed `40 × 5` with `-S 'fg=red'` and a titled border — intentionally distinct from editor popups.

**Session grouping**: `~/.sisyphus/sessions-manifest.tsv` columns: `type\tname\tcwd\tphase\tdwid`. `type=H` = home session; `type=S` = sisyphus session. Scripts group by matching `cwd`. Daemon is solely responsible for keeping manifest current.

**Session identity + `prefix-x`**: `ssyph_` prefix marks agent/orchestrator sessions. `prefix-x` override routes to `sisyphus-kill-pane` for `ssyph_` sessions; others get default `kill-pane ; select-layout even-horizontal`. Kill-pane script: multiple panes → kill + rebalance; last pane → switch to home + select dashboard, then `kill-session`; falls through to plain `kill-pane` if no home found.

**Dashboard window**: `dwid` stores a window *ID* (e.g. `@3`), not a name — survives window renames. `-` is placeholder when absent; scripts fall back to name `sisyphus-dashboard` if ID lookup fails.

**Home script two-phase lookup**: checks `@sisyphus_dashboard` tmux option on current session first (set by daemon on home sessions) — selects that window in place. Falls back to manifest: find current session's cwd, then find `type=H` row with same cwd.

**`SESSION_RESOLVE` pattern** (kill-session, delete-session, msg scripts): reads `@sisyphus_session_id` + `@sisyphus_cwd` from current session tmux options first, then falls back to manifest scan for `type=S` row with matching cwd. Errors `sleep 1` before exit so popup doesn't flash. After kill/delete, navigates to home via `go_home` helper. `sisyphus-delete-session` requires `yes` (not `y`) at prompt; passes `--cwd "$cwd"` to `sisyphus delete` for daemon cleanup when called from a non-sisyphus session.

**`sisyphus-new`/`sisyphus-msg`**: Both open nvim on a tmpfile; no-op if file is empty/whitespace after exit.

**`setupTmuxKeybind`**: always reinstalls all seven scripts first. On conflict with a non-sisyphus binding, returns early — conf and source line are **not** written (scripts already installed). `installed` vs `already-installed` depends on whether tmux is running, not freshness: conf/source writes happen before the final binding check, so a running tmux server means live-apply succeeds → `isSisyphusBinding` matches → always `already-installed`; `installed` is only returned when tmux is down (live apply silently fails, post-apply check returns null). **Conflict detection also requires a running tmux server** — if tmux is down, `getExistingBinding` returns null and all bindings are written without conflict checking.

**`removeTmuxKeybind`**: scans *both* `~/.tmux.conf` and `~/.config/tmux/tmux.conf` for the source line — handles config moves since install. Restores default `prefix-x` live if tmux is running.

**Status bar**: Daemon pre-renders complete status to global `@sisyphus_status` every poll cycle (5s). Add `#{@sisyphus_status}` to `status-right`. `@sisyphus_phase` still written per-session for CLI use (`tmux-sessions`).

## Companion Commands (`companion.ts`, `companion-context.ts`)

- `sisyphus companion-context` — **machine-readable only**: outputs `{"additionalContext":"<string>"}` with no trailing newline. Designed as a Claude Code hook (`userPromptSubmit`). Calls `buildCompanionContext` in `src/tui/lib/context.ts` — does **not** contact the daemon, exits synchronously.
- `sisyphus companion --name <name>` — renames companion via daemon request, not a local write.

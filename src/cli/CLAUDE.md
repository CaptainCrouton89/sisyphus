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

**Key table architecture**: `M-s` binds cycle in root table. `C-s` enters `sisyphus` key table:

| Key | Action | Popup size |
|-----|---------|------------|
| `s` | cycle sessions | — |
| `h` | home/dashboard | — |
| `x` | kill-pane (smart) | — |
| `a` | jump to agent pane (`tmux display-menu` built from pane `@pane_role`/`@pane_cycle` options) | — |
| `z` | zoom toggle (`resize-pane -Z`) | — |
| `n` | new-prompt (nvim tmpfile → `sisyphus start`) | `80% × 60%` |
| `m` | message orchestrator | `80% × 60%` |
| `l` | session picker — fzf if available, numbered list fallback; filters to current cwd | `60% × 60%` |
| `c` | continue session (`y` or `yes` accepted) | `50 × 5`, yellow border |
| `r` | restart agent popup | `70% × 50%` |
| `t` | session status (`sisyphus status` or `sisyphus list`) | `90% × 90%` |
| `k` | kill session | `40 × 5`, red border |
| `d` | delete session (requires `yes`) | `40 × 5`, red border |
| `?` | keybinding cheatsheet | `44 × 27` |

All popups use `-d "#{pane_current_path}"`. `k`/`d` use `-S 'fg=red'` — intentionally distinct from editor popups. `sisyphus-pick-agent` exits silently when there is only one pane (`${#args[@]} <= 5`).

**Session grouping**: `~/.sisyphus/sessions-manifest.tsv` columns: `type\tname\tcwd\tphase\tdwid`. `type=H` = home session; `type=S` = sisyphus session. Scripts group by matching `cwd`. Daemon is solely responsible for keeping manifest current.

**Session identity + `prefix-x`**: `ssyph_` prefix marks agent/orchestrator sessions. `prefix-x` override routes to `sisyphus-kill-pane` for `ssyph_` sessions; others get default `kill-pane ; select-layout even-horizontal`. Kill-pane script: multiple panes → kill + rebalance; last pane → switch to home + select dashboard, then `kill-session`; falls through to plain `kill-pane` if no home found.

**Dashboard window**: `dwid` stores a window *ID* (e.g. `@3`), not a name — survives window renames. `-` is placeholder when absent; scripts fall back to name `sisyphus-dashboard` if ID lookup fails.

**Home script two-phase lookup**: checks `@sisyphus_dashboard` tmux option on current session first (set by daemon on home sessions) — selects that window in place. Falls back to manifest: find current session's cwd, then find `type=H` row with same cwd.

**`SESSION_RESOLVE` pattern** (kill-session, delete-session, continue-session, restart-agent, msg, status-popup scripts): reads `@sisyphus_session_id` + `@sisyphus_cwd` from current session tmux options first, then falls back to manifest scan for `type=S` row with matching cwd. Errors `sleep 1` before exit so popup doesn't flash. After kill/delete, navigates to home via `go_home` helper. `sisyphus-delete-session` requires `yes` (not `y`) at prompt; passes `--cwd "$cwd"` to `sisyphus delete` for daemon cleanup when called from a non-sisyphus session.

**`sisyphus-new`/`sisyphus-msg`**: Both open nvim on a tmpfile; no-op if file is empty/whitespace after exit.

**`setupTmuxKeybind`**: always reinstalls all thirteen scripts first. On conflict with a non-sisyphus binding, returns early — conf and source line are **not** written (scripts already installed). `installed` vs `already-installed` depends on whether tmux is running, not freshness: conf/source writes happen before the final binding check, so a running tmux server means live-apply succeeds → `isSisyphusBinding` matches → always `already-installed`; `installed` is only returned when tmux is down (live apply silently fails, post-apply check returns null). **Conflict detection also requires a running tmux server** — if tmux is down, `getExistingBinding` returns null and all bindings are written without conflict checking.

**`removeTmuxKeybind`**: scans *both* `~/.tmux.conf` and `~/.config/tmux/tmux.conf` for the source line — handles config moves since install. Restores default `prefix-x` live if tmux is running.

**Status bar**: Daemon pre-renders complete status to global `@sisyphus_status` every poll cycle (5s). Add `#{@sisyphus_status}` to `status-right`. `@sisyphus_phase` still written per-session for CLI use (`tmux-sessions`).

## Companion Commands (`companion.ts`, `companion-context.ts`)

- `sisyphus companion-context` — **machine-readable only**: outputs `{"additionalContext":"<string>"}` with no trailing newline. Designed as a Claude Code hook (`userPromptSubmit`). Calls `buildCompanionContext` in `src/tui/lib/context.ts` — does **not** contact the daemon, exits synchronously.
- `sisyphus companion --name <name>` — renames companion via daemon request, not a local write.

## Present Command (`commands/present.ts`)

`sisyphus present <file>` renders a markdown file via `termrender` and displays it in a tmux split pane.

- **Outside tmux**: prints ANSI-rendered output straight to stdout and exits — no temp file, no pane.
- **Default (non-interactive)**: delegates to `termrender --tmux` — opens `less -R` in a split pane with auto-detected width and self-cleaning temp file. This is the mode agents use to show visual output to the user.
- **`--interactive`**: renders to temp file, opens editable nvim with baleia ANSI plugin, blocks until nvim closes, reads back the file and writes to stdout, then cleans up.

## Requirements / Design Review Commands (`commands/review.ts`)

`registerReview` registers **two** commands — `sisyphus requirements` and `sisyphus design` — not a `review` command.

**File resolution (first match wins):** positional arg → `--session-id` / `SISYPHUS_SESSION_ID` env → most recent session dir under `.sisyphus/sessions/` that contains the target file.

**`--wait`** implies `--window`; blocks until the TUI window closes, reads `review-feedback.md` from the same dir as the JSON file, prints it to stdout, then deletes it. Without `--wait`/`--window`, the TUI binary runs inline via `execSync` (no new window). The feedback file is what the TUI writes on completion — agents call with `--wait` to receive structured feedback.

**History events**: when `--wait` is used with a session ID, emits `review-started` and `review-completed` events to the session's history log with timing and item counts sourced from the JSON `meta` field.

`--schema` / `--annotated` print the JSON schema or an annotated writing guide without launching the TUI — designed for agents generating these files.

## Onboarding (`onboard.ts`)

Called by `sisyphus setup` (`commands/setup.ts`) and selectively by `doctor` and `getting-started`.

- **`runOnboarding()`** — auto-installs tmux + nvim via Homebrew on macOS only; Linux never auto-installs tmux. tmux defaults (`~/.tmux.conf`) are written only when tmux was just auto-installed AND no config existed beforehand — won't touch an existing config and always writes to `~/.tmux.conf`, not the XDG path (even though `hasExistingTmuxConf` checks both).
- **`tryAutoInstallNvim()`** — calls `installBaleiaPlugin()` on **every invocation**, including when nvim was already installed. So `sisyphus setup` re-attempts baleia install idempotently each run. LazyVim starter config is only cloned if `~/.config/nvim/` doesn't exist at all; `.git` is stripped post-clone so the user owns the config.
- **`installBaleiaPlugin()`** — copies `dist/templates/baleia.lua` → `~/.config/nvim/lua/plugins/sisyphus-baleia.lua`. Silently skips if `plugins/` dir doesn't exist (requires existing LazyVim-style nvim config). Never overwrites.
- **`installBeginCommand()`** — copies `dist/templates/begin.md` → `~/.claude/commands/sisyphus/begin.md`, which surfaces as the `/sisyphus:begin` Claude Code slash command. Never overwrites; updating the template requires deleting the installed file.
- **iTerm option key check**: reads `~/Library/Preferences/com.googlecode.iterm2.plist` via `plutil`; filters to only the profile named in `ITERM_PROFILE` env if set. `checked:false, allCorrect:false` means the plist was missing (not "all profiles correct") — distinct from `checked:false, allCorrect:true` which means not running iTerm at all.

## Status Bar Segments (`commands/register-segment.ts`, `commands/unregister-segment.ts`)

`sisyphus register-segment --id <id> --side left|right --priority <n> --bg <hex> --content <tmux-format>` — registers an external segment with the daemon via socket; content is a tmux format string (`#{...}` variables). Lower priority = further from center on that side. Daemon merges external segments into `@sisyphus_status` at the next poll cycle. `sisyphus unregister-segment --id <id>` removes it.

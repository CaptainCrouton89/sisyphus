# CLI Layer

## Entry point

- `sortSubcommands: false` — help lists commands in registration order; append new commands at the end of `index.ts`
- First-run welcome: triggered by `!existsSync(globalDir())` — creating `~/.sisyphus` suppresses it. `skipWelcome` exempts `doctor`, `setup`, `init`, `getting-started`, `uninstall`, `help`, `--help`, `-h`, `--version`, `-V`; any other command creates `~/.sisyphus` and won't show again (deleting `~/.sisyphus` re-triggers)

## Tmux integration

- `M-s` cycles sessions in root table; `C-s` enters `sisyphus` key table
- `@sisyphus_dashboard` stores window ID (not name) — survives renames
- `ssyph_` prefix marks sisyphus sessions; renaming breaks pane-monitor detection AND `RESOLVE_HOME` (which skips `ssyph_*` when finding the home session)
- `setupTmuxKeybind` always rewrites `~/.sisyphus/tmux.conf` — conflict detection requires a running tmux server (if tmux is down, written without checking). Re-running setup is safe and self-heals drift.
- Bindings live in `~/.sisyphus/tmux.conf` (managed file); user's tmux.conf only gets a `source-file` line appended. `removeTmuxKeybind` strips that line, deletes `~/.sisyphus/tmux.conf`, and restores `prefix-x` to default `kill-pane \; select-layout even-horizontal`.
- `userTmuxConfPath()` for `source-file` append: prefers XDG (`~/.config/tmux/tmux.conf`) over dotfile; returns `null` if neither exists → `source-file` line is skipped and the setup result message includes the manual line to add. `removeTmuxKeybind` scans both paths.
- Keybinding scripts (`sisyphus-cycle`, `sisyphus-home`, etc.) install to `~/.sisyphus/bin/` and are **regenerated on every `setupTmuxKeybind` call** — edits to those scripts are lost on next setup
- `cycleKey` (`M-s`) and `pick-session` (`C-s l`) both scope to same cwd only — read `sessions-manifest.tsv`, skip sessions from other projects. Cycle includes H-type (home) sessions alongside S-type; `SESSION_RESOLVE` skips H-type when resolving session ID for kill/delete/etc. `pick-session` uses fzf if available, falls back to numbered prompt — behavior differs on machines without fzf
- `prefix-x` override only fires for `ssyph_*` sessions; non-sisyphus sessions get default `kill-pane \\; select-layout even-horizontal`
- `RESOLVE_HOME` (home/kill-pane navigation) reads live `@sisyphus_cwd` from tmux options — works without manifest but requires a live tmux server. `CYCLE_SCRIPT` reads manifest instead — works without running tmux but requires an up-to-date manifest. If a session appears in one but not the other, home nav and cycling diverge.
- Kill/delete scripts: `SESSION_RESOLVE` captures `$cwd` **before** the destructive action; `GO_HOME_AFTER` consumes that captured value. If `SESSION_RESOLVE` ran after the kill, the session would be gone and cwd lookup would return empty, silently skipping home navigation.
- Status bar: daemon pre-renders to global `@sisyphus_status`; add `#{@sisyphus_status}` to `status-right`

## Companion

- `sisyphus companion-context` — machine-readable only: outputs `{"additionalContext":"..."}` with no trailing newline. Does not contact the daemon. Designed as a Claude Code `userPromptSubmit` hook.

## Review commands

- `registerReview` registers two commands: `requirements` and `design` — not a `review` command
- `--wait` implies `--pane` (undocumented in help)
- Schemas and annotated writing guides are hardcoded constants in `review.ts` — update them there if artifact format changes

## Install / onboard

- `isInstalled()` checks plist **file existence only** — a plist present but not loaded (e.g. after manual `launchctl unload` without file removal) skips re-install and drops straight to `waitForDaemon()`, which will timeout. Fix: delete the plist or `launchctl load -w ~/.sisyphus/../LaunchAgents/com.sisyphus.daemon.plist`.
- `installBeginCommand()` runs on every `ensureDaemonInstalled()` call, **outside** the `!isInstalled()` guard — self-heals missing `/begin` command for users who installed before the command existed
- `waitForDaemon()` starts with 6s timeout but extends to 30s when `daemonUpdatingPath()` file is present — check that path if startup seems to hang indefinitely
- Plist bakes in `process.execPath` at install time — upgrading or moving Node breaks the daemon; fix with `sisyphus setup` (which regenerates the plist)
- `writeTmuxDefaults()` always writes to `~/.tmux.conf`, never XDG path — but `hasExistingTmuxConf()` checks both; defaults only written on fresh auto-install with no existing config
- `tryAutoInstallNvim`: if no `~/.config/nvim` dir exists, clones LazyVim starter and removes `.git` (user owns config). `lazyVimInstalled` uses `lazy-lock.json` as signal — that file is generated on first nvim launch, not at clone time, so it will be `false` immediately after clone. `installBaleiaPlugin()` silently returns `false` if `lua/plugins/` doesn't exist; both self-heal on next `sisyphus setup` after nvim has bootstrapped.
- `tryAutoInstallTermrender`: prefers pipx over pip3/pip (isolated install); falls through to pip if pipx unavailable
- `checkItermOptionKey()` only checks the currently-active profile when `ITERM_PROFILE` is set; all other profiles are skipped
- `runOnboarding()` (nvim/termrender auto-install, iTerm check) is **only called by `sisyphus setup`** — `ensureDaemonInstalled()` (auto-install on first command) only installs the begin command, tmux keybindings, and required plugins

## Status bar segments

`sisyphus register-segment` / `unregister-segment` — external status bar injection via daemon socket. Lower priority = closer to edge.

## Command pitfalls

- **spawn**: `--repo` rejects paths containing `/`, `..`, or `\`. `--list-types` exits before any validation (no session, no tmux check).
- **doctor**: always exits 0 — not CI-usable as a health gate
- **getting-started**: outputs `<claude-instructions>` XML for Claude, not human-readable. Checks `CLAUDECODE` env.
- **status**: `inferOrchestratorPhase()` is a local heuristic, not daemon-provided. Pane output XML tags carry attributes for machine consumption.
- **notify**: `pane-exited` uses `rawSend()` (single attempt, no retry) — correct by design since daemon may be stopped
- **tmux-sessions**: `process.stdout.write()` (no trailing newline) — `console.log` breaks tmux format string parsing
- **continue vs resume**: `continue` reactivates in-place (same cycle); `resume` increments cycle with optional new instructions

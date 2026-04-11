# CLI Layer

## Entry point

- `sortSubcommands: false` — help lists commands in registration order; append new commands at the end of `index.ts`
- First-run welcome: triggered by `!existsSync(globalDir())` — creating `~/.sisyphus` suppresses it. `skipWelcome` exempts `doctor`, `setup`, `init`, `getting-started`, `uninstall`, `help`, `--help`, `-h`, `--version`, `-V`; any other command creates `~/.sisyphus` and won't show again (deleting `~/.sisyphus` re-triggers)

## Tmux integration

- `M-s` cycles sessions in root table; `C-s` enters `sisyphus` key table
- `@sisyphus_dashboard` stores window ID (not name) — survives renames
- `ssyph_` prefix marks sisyphus sessions; renaming breaks pane-monitor detection AND `RESOLVE_HOME` (which skips `ssyph_*` when finding the home session)
- `setupTmuxKeybind` always rewrites `~/.sisyphus/tmux.conf` and regenerates all scripts — conflict detection and `already-installed` status are both checked *after* the full rewrite (diagnostic only, no early exit). Re-running is safe and self-heals drift.
- Bindings live in `~/.sisyphus/tmux.conf`; user's tmux.conf only gets a `source-file` line appended. `removeTmuxKeybind` strips that line, deletes the conf, and restores `prefix-x` to default. It live-unbinds **hardcoded** `DEFAULT_CYCLE_KEY`/`DEFAULT_PREFIX_KEY` — custom keys passed to `setupTmuxKeybind` survive removal as live bindings (file is still cleaned up).
- `userTmuxConfPath()` prefers XDG (`~/.config/tmux/tmux.conf`) over dotfile; returns `null` if neither exists → `source-file` line skipped, setup result includes the manual line to add. `removeTmuxKeybind` scans both paths.
- All keybinding scripts install to `~/.sisyphus/bin/` and are **regenerated on every `setupTmuxKeybind` call** — edits are lost. Exception: `homeScript()` is a function (not a const) because it bakes `import.meta.dirname` as the absolute TUI path; if `dist/tui.js` moves, the script silently uses the stale path until re-run post-rebuild.
- `homeScript()` also validates `@sisyphus_dashboard` window liveness and auto-recreates it if stale (spawns new window, launches TUI, updates tmux option). No other script does this recovery.
- `cycleKey` and `pick-session` (`C-s l`) scope to same cwd only — read `sessions-manifest.tsv`. Cycle includes H-type sessions; `SESSION_RESOLVE` skips H-type and resolves to the matching S-type's session_id, so kill/delete/message/continue all work from home sessions. `pick-session` uses fzf if available, falls back to numbered prompt.
- `prefix-x` override only fires for `ssyph_*` sessions; non-sisyphus sessions get default `kill-pane \; select-layout even-horizontal`
- `RESOLVE_HOME` reads live `@sisyphus_cwd` from tmux options (no manifest, requires live server). `CYCLE_SCRIPT` reads manifest (no server, requires up-to-date manifest). If a session appears in one but not the other, home nav and cycling diverge.
- Kill/delete scripts: `SESSION_RESOLVE` captures `$cwd` **before** the destructive action; `GO_HOME_AFTER` consumes it. Running after the kill would find no session and silently skip home navigation.
- Status bar: daemon pre-renders to `@sisyphus_status`; add `#{@sisyphus_status}` to `status-right`. `register-segment`/`unregister-segment` — external injection via daemon socket, lower priority = closer to edge.

## Companion

- `sisyphus companion-context` — machine-readable only: outputs `{"additionalContext":"..."}` with no trailing newline. Does not contact the daemon. Designed as a Claude Code `userPromptSubmit` hook.

## Review commands

- `registerReview` registers two commands: `requirements` and `design` — not a `review` command
- `--wait` implies `--pane` (undocumented in help)
- Schemas and annotated writing guides are hardcoded constants in `review.ts` — update them there if artifact format changes

## Install / onboard

- `isInstalled()` checks plist **file existence only** — a plist present but not loaded (e.g. after manual `launchctl unload` without file removal) skips re-install and drops straight to `waitForDaemon()`, which will timeout. Fix: delete the plist or `launchctl load -w ~/.sisyphus/../LaunchAgents/com.sisyphus.daemon.plist`.
- Slash command installers (`installBeginCommand`, `installAutopsyCommand`) both delegate to the generic `installSlashCommand(name, srcOverride)` helper — add new user-facing slash commands by dropping a `templates/{name}.md` file and adding a matching `install{Name}Command` wrapper
- `installSlashCommand` is idempotent by **dest file existence** — if `~/.claude/commands/sisyphus/{name}.md` exists it returns early without reading the bundled template. Package updates that change a template are silently ignored for existing installs; to force a refresh, delete the dest file.
- `installBeginCommand()` and `installAutopsyCommand()` run on every `ensureDaemonInstalled()` call, **outside** the `!isInstalled()` guard — self-heal missing `/sisyphus:begin` and `/sisyphus:autopsy` commands for users who installed before the command existed
- `waitForDaemon()` starts with 6s timeout but extends to 30s when `daemonUpdatingPath()` file is present (reads version string from that file for the log message) — check that path if startup seems to hang indefinitely
- Plist bakes in `process.execPath` at install time — upgrading or moving Node breaks the daemon; fix with `sisyphus setup` (which regenerates the plist)
- `writeTmuxDefaults()` always writes to `~/.tmux.conf`, never XDG path — but `hasExistingTmuxConf()` checks both; defaults only written on fresh auto-install with no existing config
- `tryAutoInstallNvim`: if no `~/.config/nvim` dir exists, clones LazyVim starter and removes `.git` (user owns config). `NvimInfo.lazyVimInstalled` has split semantics: in the auto-install path it is set `true` at clone time (before nvim ever runs); in the pre-existing-nvim path it reads `lazy-lock.json`, which is generated on first nvim launch — so it is `false` until the user opens nvim. `installBaleiaPlugin()` silently returns `false` if `lua/plugins/` doesn't exist; self-heals on next `sisyphus setup` after nvim has bootstrapped.
- `tryAutoInstallTermrender`: prefers pipx over pip3/pip (isolated install); falls through to pip if pipx unavailable **or if pipx install throws or leaves termrender off PATH**
- `runOnboarding()` and `formatOnboardingMessages()` are a two-step API — `runOnboarding()` executes all side effects and returns structured `OnboardResult` **with no console output**; `formatOnboardingMessages()` converts that result to display lines. Calling only `runOnboarding()` runs setup silently.
- `runOnboarding()` (tmux auto-install, nvim, termrender, begin/autopsy slash commands, iTerm check) is **only called by `sisyphus setup`** — `ensureDaemonInstalled()` (auto-install on first command) only installs the begin/autopsy commands, tmux keybindings, and required plugins

## Command pitfalls

- **spawn**: `--repo` rejects paths containing `/`, `..`, or `\`. `--list-types` exits before any validation (no session, no tmux check).
- **doctor**: always exits 0 — not CI-usable as a health gate
- **getting-started**: outputs `<claude-instructions>` XML for Claude, not human-readable. Checks `CLAUDECODE` env.
- **status**: `inferOrchestratorPhase()` is a local heuristic, not daemon-provided. Pane output XML tags carry attributes for machine consumption.
- **notify**: `pane-exited` uses `rawSend()` (single attempt, no retry) — correct by design since daemon may be stopped
- **tmux-sessions**: `process.stdout.write()` (no trailing newline) — `console.log` breaks tmux format string parsing
- **continue vs resume**: `continue` reactivates in-place (same cycle); `resume` increments cycle with optional new instructions

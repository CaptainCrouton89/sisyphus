# CLI Commands

## dashboard.ts

`openDashboardWindow(tmuxSession, cwd)` and `registerDashboard` (the `sisyphus dashboard` command) launch the same TUI binary but through different mechanisms:
- `registerDashboard` runs `node tui.js` inline, blocking the current terminal (`stdio: 'inherit'`)
- `openDashboardWindow` creates a new tmux window and sends the command via `send-keys`

**Deduplication:** `openDashboardWindow` reads `@sisyphus_dashboard` (tmux session option storing window ID). If the stored ID is stale (window gone), it falls through and creates a fresh window, updating the option. Returns `true` if created, `false` if existing window was focused — `start.ts` ignores the return value.

**`; exit` suffix:** The command sent to the new window is `node tui.js ...; exit`. Without this, the window would stay open with a shell prompt after the TUI process exits.

## start.ts

**`SISYPHUS_CWD` env var:** Working directory comes from `process.env['SISYPHUS_CWD'] ?? process.cwd()`, not a `--cwd` flag. This is the only way to override cwd programmatically.

**Session naming collision:** `ensureTmuxSessionExists` names the session `sisyphus-{basename(cwd)}`. Two projects sharing a directory name (e.g., `/foo/app` and `/bar/app`) map to the same tmux session.

**`--no-tmux-check` misname:** Despite the flag name, it does NOT skip the tmux installation check (`isTmuxInstalled()` always runs). It skips tmux session management — no dashboard window, no attach/switch.

**Attach timing:** When invoked outside tmux, `start` opens the dashboard window first, then calls `attachToTmuxSession` — so the user lands directly on the dashboard. When already inside tmux, `switch-client` is used instead of attach; no blocking call.

**`openDashboardWindow` failure is non-fatal:** Wrapped in `try/catch` with no error output. A broken tmux state won't abort the start flow.

**`@sisyphus_cwd` session tag:** `start` sets this option on the tmux session *before* calling `openDashboardWindow` — so even if the dashboard open fails (non-fatal catch), the tag is already written. `sessions-manifest.ts` uses it to discover "home sessions" — non-`ssyph_`-prefixed sessions started via `sisyphus start`. Without it, the session is invisible to the daemon manifest (which otherwise only auto-discovers `ssyph_`-prefixed agent sessions).

**`Monitor:` output timing:** The `console.log('Monitor: sisyphus status ...')` at the end of the action runs *after* `attachToTmuxSession` returns — i.e., after the user detaches from tmux, not before attach. It's a post-session message, not a pre-attach hint.

**tmux session selection when already inside tmux:** `start` uses the *current* tmux session (`getTmuxSession()`) rather than creating a new one. The new dashboard window opens inside the session the user is already in — no new session is created.

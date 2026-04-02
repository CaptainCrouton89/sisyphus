# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

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

**Session grouping**: cycle/home/kill scripts match sessions by `@sisyphus_cwd` tmux option — only sessions sharing the same cwd are cycled together. This option must be set on each sisyphus tmux session by the daemon at spawn time.

**Session identity**: `ssyph_` prefix marks agent/orchestrator sessions (bash pattern `ssyph_*`). Home/kill scripts skip these when searching for the home session.

**`@sisyphus_dashboard`** stores a window *ID* (e.g. `@3`), not a name — so jumping to the dashboard survives window renames.

**`prefix-x` override**: the tmux.conf bind-key uses `if-shell` to only invoke the kill-pane script for `ssyph_*` sessions; non-sisyphus sessions get `kill-pane ; select-layout even-horizontal` directly. Within the script:
- **Multiple panes**: kills current pane + runs `select-layout even-horizontal`
- **Last pane**: switches to home session dashboard, then calls `kill-session` (the whole session is destroyed, not just the pane); falls through to plain `kill-pane` if no home session found

**`setupTmuxKeybind`** always reinstalls all three scripts (`cycle`, `home`, `kill-pane`) and rewrites `~/.sisyphus/tmux.conf` (idempotent), then checks `tmux list-keys` for conflicts on both the cycle key and home key before touching the user's tmux config. On conflict, scripts exist in `~/.sisyphus/bin/` but no bindings are configured. `already-installed` status is cosmetic only — writes still happen. Also applies bindings live via `tmux bind-key` if a server is running — no reload needed. **Conflict detection requires a running tmux server** — if tmux is down at setup time, `getExistingBinding` returns null and all bindings are written without conflict checking.

**`removeTmuxKeybind`** scans both `~/.tmux.conf` and `~/.config/tmux/tmux.conf` for the source line regardless of which one setup wrote to — handles cases where the user has moved their config since install. Also restores the default `prefix-x` binding (`kill-pane ; select-layout even-horizontal`) live if tmux is running.

**Status bar**: Daemon renders the complete status string and writes it to the global tmux option `@sisyphus_status`. To show session indicators, add `#{@sisyphus_status}` to `status-right`. No shell scripts — the daemon pre-renders tmux format strings with per-client conditionals for current-session highlighting. Updated every poll cycle (5s). `@sisyphus_phase` is still written per-session for CLI commands (`tmux-sessions`).

## Conventions

- Use `SISYPHUS_SESSION_ID` / `SISYPHUS_AGENT_ID` env vars when agent-spawned (set automatically by daemon)
- Daemon binary path is resolved relative to the CLI binary (`dirname(import.meta.url)/daemon.js`) — supports any install directory

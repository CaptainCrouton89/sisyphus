# Adversarial tmux Integration Test Scenarios

## 1. Session Name Collision with User's Existing Session

- **Scenario name**: Preexisting `ssyph_`-prefixed session
- **What the user does**: User already has a tmux session named `ssyph_myproject_dev` from a previous sisyphus run (or manually created). They run `sisyphus start "task"` in a project called `myproject` with name `dev`.
- **What breaks**: `tmux new-session -d -s "ssyph_myproject_dev"` fails with "duplicate session" error. `createSession()` uses `exec()` (not `execSafe()`), so this throws and crashes the daemon handler. The session-manager retry logic (lines 91-96) only retries on Haiku auto-naming collisions, not on the initial `tmuxSessionName()` call.
- **How to test it**:
  ```bash
  tmux new-session -d -s "ssyph_myproject_task1234"
  cd /tmp && mkdir myproject && cd myproject
  sisyphus start --name task1234 "do something"
  # Expect: error about duplicate session
  ```
- **Tier**: tmux

## 2. User's tmux.conf Sets `pane-border-status` to `off` or `bottom`

- **Scenario name**: Custom pane-border-status conflicts
- **What the user does**: User has `set -g pane-border-status off` in tmux.conf. Sisyphus sets it per-window with `set -w` (line 198 of tmux.ts), which should override. But some users also have `set-hook -g after-new-window "set pane-border-status off"` to enforce it globally.
- **What breaks**: The hook fires after sisyphus creates a window and resets `pane-border-status` to `off`. Pane labels (role badges, session names, cycle info) become invisible. Users think sisyphus is broken because they see no visual feedback.
- **How to test it**:
  ```bash
  cat > /tmp/test-tmux.conf << 'EOF'
  set -g pane-border-status off
  set-hook -g after-new-window "set pane-border-status off"
  EOF
  tmux -f /tmp/test-tmux.conf new-session -d -s test
  # Start sisyphus, check if pane borders show
  tmux display-message -t "ssyph_*" -p "#{pane-border-status}"
  ```
- **Tier**: tmux

## 3. tmux-resurrect Captures and Restores Sisyphus Sessions

- **Scenario name**: tmux-resurrect restores zombie sisyphus sessions
- **What the user does**: User has tmux-resurrect installed. They save their tmux environment (`prefix + Ctrl-s`), which captures all `ssyph_` sessions. After a reboot, tmux-resurrect recreates the sessions as empty shells.
- **What breaks**: `findHomeSession()` iterates all sessions and skips `ssyph_`-prefixed ones — that's fine. But `listAllSessions()` and `listAllPanes()` return these zombie sessions. `status-bar.ts` renders dots for them (they have `ssyph_` prefix). `sessionExists()` returns `true` for zombie sessions, so `reopenWindow()` thinks the tmux session is alive and tries to reuse it, but the window/pane IDs from state.json don't match the resurrected session's new IDs.
- **How to test it**:
  ```bash
  # Simulate resurrect by creating empty sessions with ssyph_ names
  tmux new-session -d -s "ssyph_project_old-task"
  # Start sisyphus, check status-bar for phantom dots
  # Start a new session in same project, check if reopenWindow conflicts
  ```
- **Tier**: full (needs TPM/resurrect, but can simulate with manual session creation at tmux tier)

## 4. Nested tmux (tmux inside tmux)

- **Scenario name**: Running sisyphus from within a tmux pane
- **What the user does**: User is already inside a tmux session. They run `sisyphus start`. Sisyphus calls `tmux new-session -d` which targets the **outer** tmux server (since TMUX env var is set). This works. But if user has `set -g @plugin_that_hooks_sessions`, the outer session's hooks fire.
- **What breaks**: Generally works because sisyphus uses `-d` (detached). The real issue: `switchAttachedClients()` on completion tries to switch the user's client to the home session, which may switch them away from their current window in the outer session unexpectedly if the home session detection (`findHomeSession`) matches their outer session.
- **How to test it**:
  ```bash
  tmux new-session -d -s outer
  tmux send-keys -t outer "tmux set-option @sisyphus_cwd '$(pwd)'" Enter
  # Now findHomeSession will match 'outer'
  tmux send-keys -t outer "sisyphus start 'test'" Enter
  # On completion, client gets switched to 'outer' — verify behavior
  ```
- **Tier**: tmux

## 5. Custom TMUX_TMPDIR or Socket Path

- **Scenario name**: Non-default tmux socket path
- **What the user does**: User sets `TMUX_TMPDIR=/run/user/1000/tmux` or uses `tmux -L mysocket`. Sisyphus daemon inherits the default socket path from its launch environment (launchd), which may differ from the user's shell environment.
- **What breaks**: Daemon's tmux commands hit a different tmux server than the user's. `sessionExists()` returns false for user's sessions. Sisyphus creates sessions on the daemon's server, invisible to the user. `notify.ts` hardcodes socket path to `/tmp/tmux-{uid}/default` (noted in CLAUDE.md) — doubly broken.
- **How to test it**:
  ```bash
  export TMUX_TMPDIR=/tmp/tmux-custom
  mkdir -p $TMUX_TMPDIR
  tmux new-session -d -s user-session
  # Start sisyphusd without TMUX_TMPDIR set
  # sisyphus start — creates session on default server
  tmux list-sessions  # from user's shell — won't see sisyphus sessions
  ```
- **Tier**: tmux

## 6. User Kills tmux Server While Sessions Active

- **Scenario name**: `tmux kill-server` during active session
- **What the user does**: User runs `tmux kill-server` (or tmux crashes) while sisyphus has active sessions with agents.
- **What breaks**: Pane monitor's next poll calls `paneExists()` → `tmux display-message` → fails because there's no tmux server at all. `execSafe` returns `null`, so `paneExists()` returns `false`. Monitor marks all agents as lost and triggers `onAllAgentsDone()`. Respawn tries `createSession()` → `exec('tmux new-session ...')` which **starts a new tmux server** silently (tmux auto-starts on first command). A new detached session appears that the user can't see. Agents are respawned into this invisible session. User has no idea work is continuing.
- **How to test it**:
  ```bash
  sisyphus start "long task"
  sleep 5
  tmux kill-server
  sleep 10
  # Check: daemon.log for respawn activity
  # Check: tmux list-sessions shows a new ssyph_ session
  # Verify agents are running in an invisible server
  ```
- **Tier**: tmux

## 7. User Manually Renames a `ssyph_` Session

- **Scenario name**: Manual `tmux rename-session` on sisyphus session
- **What the user does**: User runs `tmux rename-session -t ssyph_project_task "my-work"` because the auto-name is ugly.
- **What breaks**: `session.tmuxSessionName` in state.json still holds the old name. Every subsequent tmux operation targets the old name: `paneExists()`, `killPane()`, `switchAttachedClients()`, `setSessionOption()`. All return null/fail silently via `execSafe`. Pane monitor can't find any panes, marks everything as lost. Triggers respawn which creates a **new** session with the old name, leaving the renamed one orphaned.
- **How to test it**:
  ```bash
  sisyphus start "test"
  SNAME=$(tmux list-sessions -F "#{session_name}" | grep ssyph_)
  tmux rename-session -t "$SNAME" "renamed-session"
  sleep 10  # wait for pane monitor poll
  # Check daemon.log — expect "agent lost" / respawn
  tmux list-sessions  # expect both renamed-session AND new ssyph_ session
  ```
- **Tier**: tmux

## 8. User Manually Kills an Agent Pane via tmux

- **Scenario name**: `tmux kill-pane` on an agent pane
- **What the user does**: User sees an agent stuck and runs `tmux kill-pane -t %42` directly instead of using `sisyphus kill-agent`.
- **What breaks**: Pane monitor detects the pane is gone via `paneExists()` returning false. `handlePaneExited()` fires. The pane is NOT unregistered from `pane-registry` first (unlike `handleKillAgent` which unregisters before killing). So pane-registry still has the mapping, `handlePaneExited` processes it, marks the agent as crashed, sends a notification, and potentially triggers respawn. This is actually mostly correct behavior — but the user gets a "crash" notification for something they intentionally killed, and depending on orchestrator logic, the agent may be respawned.
- **How to test it**:
  ```bash
  sisyphus start "multi-agent task"
  # Wait for agents to spawn
  PANE=$(tmux list-panes -a -F "#{pane_id}" | tail -1)
  tmux kill-pane -t "$PANE"
  # Check: notification says "agent crashed"
  # Check: next orchestrator cycle may respawn the agent
  ```
- **Tier**: tmux

## 9. Old tmux Version Missing Features

- **Scenario name**: tmux 2.x or early 3.x missing per-pane user options
- **What the user does**: User is on Ubuntu 20.04 with tmux 3.0a (from apt). They install sisyphus.
- **What breaks**: Per-pane user options (`@pane_role`, `@pane_color`, etc.) were introduced in tmux 3.1. `set -p` flag for per-pane options also requires 3.1+. On older versions, `execSafe` calls in `setPaneStyle()` silently fail. Pane borders show raw format strings like `#{@pane_role}` instead of resolved values. `pane-border-format` with `#{?#{@pane_color},...}` conditionals render incorrectly. Functionally sisyphus still works but looks completely broken visually.
- **How to test it**:
  ```bash
  # In Docker with old tmux:
  apt-get install -y tmux=3.0a-*  # or build from source
  tmux -V  # confirm version
  sisyphus start "test"
  tmux capture-pane -t ssyph_* -p  # check for raw format strings
  ```
- **Tier**: base (install specific tmux version)

## 10. `set-option -g status-right` Conflict with Powerline/tmux-powerline

- **Scenario name**: Powerline overwrites status-right after sisyphus injects
- **What the user does**: User has tmux-powerline or powerline-daemon running, which continuously overwrites `status-right` with its own format string on every status interval.
- **What breaks**: `ensureStatusRightIntegration()` (status-bar.ts) injects `#{E:@sisyphus_status}` into `status-right` once (module-level `statusRightInjected` flag, never re-checked). Powerline's next refresh overwrites `status-right`, removing the sisyphus injection. Sisyphus status dots and companion display disappear from the status bar. Sisyphus keeps writing to `@sisyphus_status` global option, but nothing references it anymore.
- **How to test it**:
  ```bash
  # Simulate powerline overwriting status-right every 5s
  while true; do
    tmux set -g status-right "#[fg=green]powerline-only"
    sleep 5
  done &
  sisyphus start "test"
  sleep 15
  tmux show -gv status-right  # should NOT contain @sisyphus_status
  ```
- **Tier**: tmux (full for actual powerline)

## 11. Session Name with Dots Gets Silently Mangled

- **Scenario name**: Project directory name contains dots
- **What the user does**: User's project is at `~/code/my.cool.project/`. They run `sisyphus start "task"`.
- **What breaks**: `tmuxSessionName()` produces `ssyph_my.cool.project_task1234`. tmux silently converts dots to underscores in session names (noted in tmux.ts comment). Actual tmux session becomes `ssyph_my_cool_project_task1234`. But `session.tmuxSessionName` stores the dotted version. All subsequent `has-session -t`, `display-message -t`, etc. fail to find the session by the stored name. Same cascade as scenario 7.
- **How to test it**:
  ```bash
  mkdir -p /tmp/my.dotted.project && cd /tmp/my.dotted.project
  sisyphus start "test"
  tmux list-sessions  # check actual name vs state.json stored name
  cat .sisyphus/sessions/*/state.json | grep tmuxSessionName
  ```
- **Tier**: tmux

## 12. `allow-rename` / `automatic-rename` Overridden by Global Hook

- **Scenario name**: Global tmux hook re-enables automatic-rename
- **What the user does**: User has `set-hook -g after-new-session "set automatic-rename on"` in tmux.conf (common for users who want window titles to show the running command).
- **What breaks**: `configureSessionDefaults()` sets `automatic-rename off` per-window. But the global hook fires on session creation and sets it back to `on` at the session level, which overrides the window-level setting. Running processes in panes (claude commands) overwrite the window name. The carefully constructed pane titles are clobbered.
- **How to test it**:
  ```bash
  tmux set-hook -g after-new-session "set automatic-rename on"
  sisyphus start "test"
  sleep 5
  tmux display-message -t ssyph_* -p "#{automatic-rename}"
  # Expected: "on" (hook overrode sisyphus setting)
  ```
- **Tier**: tmux

## 13. `status-right-length` Capped by User Config

- **Scenario name**: User sets restrictive `status-right-length`
- **What the user does**: User has `set -g status-right-length 50` in tmux.conf. Sisyphus bumps it to 250 if below that (status-bar.ts line 165).
- **What breaks**: If user's tmux.conf is sourced AFTER sisyphus starts (e.g., user runs `tmux source ~/.tmux.conf`), the length gets reset to 50. Sisyphus status bar gets truncated. `statusRightInjected` is already `true` so `ensureStatusRightIntegration()` never re-checks. The `#{E:@sisyphus_status}` reference is still in `status-right` but gets cut off mid-render, showing partial/garbled format strings.
- **How to test it**:
  ```bash
  sisyphus start "test"
  tmux set -g status-right-length 50
  # Check status bar — expect truncated/garbled output
  ```
- **Tier**: tmux

## 14. Multiple tmux Servers (Named Sockets)

- **Scenario name**: User runs separate tmux instances with `-L`
- **What the user does**: User has `tmux -L work` for work and `tmux -L personal` for personal projects. Sisyphus daemon uses the default socket.
- **What breaks**: Same as scenario 5 but more subtle — user may have BOTH a default server AND named servers. `sisyphus start` from within a `-L work` session creates the sisyphus session on the default server (daemon doesn't inherit the `-L` flag). User's `tmux list-sessions` (from within `-L work`) doesn't see it. `switchAttachedClients` can't find clients on the wrong server.
- **How to test it**:
  ```bash
  tmux -L custom new-session -d -s work
  tmux -L custom send-keys -t work "sisyphus start 'test'" Enter
  tmux -L custom list-sessions  # no ssyph_ session
  tmux list-sessions  # ssyph_ session here (default server)
  ```
- **Tier**: tmux

## 15. Race: User Attaches to `ssyph_` Session During Teardown

- **Scenario name**: User attaches to sisyphus session as it completes
- **What the user does**: User runs `tmux attach -t ssyph_project_task` to watch agents work. Session completes — `handleComplete()` calls `switchAttachedClients()` then `killSession()`.
- **What breaks**: Usually fine — `switchAttachedClients` moves them first. But if user attaches **between** `switchAttachedClients` and `killSession` (race window), their client is attached to a session that gets killed. tmux drops them to their previous session or exits entirely if it was their only session. Not a crash, but jarring — user's terminal suddenly shows a different session or exits tmux.
- **How to test it**:
  ```bash
  # Hard to reproduce reliably — simulate by adding a sleep
  # between switchAttachedClients and killSession in dev build
  # Then quickly: tmux attach -t ssyph_*
  ```
- **Tier**: tmux

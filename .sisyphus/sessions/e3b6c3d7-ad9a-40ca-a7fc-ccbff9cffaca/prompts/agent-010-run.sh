#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-010' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-010-plugin" --agent 'devcore:programmer' --session-id "0690e88a-844e-437f-a3a2-5072f8bcecd0" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-test-full-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-010-system.md')" '## Session Goal
Create integration test suites for the sisyphi package in Docker containers.

## Your Task
Create `test/integration/suites/test-full.sh` — the full tier test suite (8+ additional tests).

### Key Context Files
Read these before implementing:
- `test/integration/lib/assert.sh` — assertion library (assert_cmd, assert_file_exists, assert_socket_exists, assert_contains with grep regex, start_daemon, stop_daemon, run_doctor, set_tier, print_results)
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §2 Task 2C and §3.3 for source chain convention, §4.6 for `sisyphus setup` on Linux

### Source Chain Convention
```bash
#!/bin/bash
_SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SUITE_DIR/test-tmux.sh"  # sources test-base.sh + assert.sh transitively

# ... test function definitions ...

run_full_tests() { ... }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set_tier "full"
  run_base_tests
  run_tmux_tests
  run_full_tests
  print_results
fi
```

### Tests to implement (8+ total)

1. **test_nvim_installed** — `assert_cmd "nvim-installed" which nvim`

2. **test_claude_mock** — `assert_cmd "claude-mock" which claude`

3. **test_doctor_full** — Run doctor, check full-environment results:
   ```bash
   DOCTOR_OUTPUT=$(run_doctor)
   assert_contains "doctor-claude-ok" "$DOCTOR_OUTPUT" '\''✓.*Claude'\''
   assert_contains "doctor-nvim-ok" "$DOCTOR_OUTPUT" '\''✓.*nvim'\''
   ```
   (note: `assert_contains` uses grep regex matching)

4. **test_full_setup** — Start daemon first (sisyphus setup calls ensureDaemonInstalled which on Linux checks PID file), then run `sisyphus setup`:
   - Start tmux session: `tmux new-session -d -s setup-test`
   - `start_daemon`
   - Run `sisyphus setup` — may print warnings but should succeed
   - Check artifacts:
     - `assert_file_exists "setup-begin-cmd" "$HOME/.claude/commands/sisyphus/begin.md"`
   - `stop_daemon`
   - `tmux kill-server 2>/dev/null || true`

5. **test_status_bar** — Verify daemon writes @sisyphus_status to tmux:
   - `tmux new-session -d -s status-test`
   - `start_daemon`
   - `sleep 2` (wait for initial status bar write — happens on startup + every 5s poll)
   - Check: `tmux show-option -gv @sisyphus_status` returns non-empty
     ```bash
     local status_val
     status_val=$(tmux show-option -gv @sisyphus_status 2>/dev/null || echo "")
     if [ -n "$status_val" ]; then
       assert_pass "status-bar-write"
     else
       assert_fail "status-bar-write" "tmux @sisyphus_status is empty"
     fi
     ```
   - `stop_daemon`
   - `tmux kill-server 2>/dev/null || true`

6. **test_list_empty** — Start daemon, verify `sisyphus list` works with no sessions:
   - `start_daemon`
   - `assert_cmd "list-empty" sisyphus list`
   - `stop_daemon`

### Important Notes
- Doctor symbols: ok=`✓` (U+2713), warn=`!`, fail=`✗` (U+2717). NOT `⚠` for warn.
- Doctor ALWAYS exits 0
- `assert_contains` uses grep regex matching (not literal substring)
- Daemon has no auto-start on Linux — must explicitly call `start_daemon`/`stop_daemon`
- `sisyphus setup` on Linux: calls ensureDaemonInstalled which checks PID file. Start daemon BEFORE running setup.
- Container runs as root, `~` = `/root`
- test-tmux.sh may not exist yet (being created in parallel) — trust the source chain convention
- Each test that starts a daemon/tmux MUST clean up after itself (stop_daemon, tmux kill-server)
- `run_full_tests()` must be callable by code that sources this file

### Done Condition
- File exists at `test/integration/suites/test-full.sh`
- Executable
- 8+ test assertions
- Sources test-tmux.sh (which transitively sources test-base.sh + assert.sh)
- Defines `run_full_tests()` that calls all test functions
- When executed directly: runs run_base_tests() + run_tmux_tests() + run_full_tests() + print_results
- Proper cleanup of daemon and tmux after each test group'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2415
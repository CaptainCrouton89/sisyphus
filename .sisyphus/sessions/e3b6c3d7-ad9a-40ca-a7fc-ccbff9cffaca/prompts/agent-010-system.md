# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Session Goal
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
   assert_contains "doctor-claude-ok" "$DOCTOR_OUTPUT" '✓.*Claude'
   assert_contains "doctor-nvim-ok" "$DOCTOR_OUTPUT" '✓.*nvim'
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
- Proper cleanup of daemon and tmux after each test group

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.

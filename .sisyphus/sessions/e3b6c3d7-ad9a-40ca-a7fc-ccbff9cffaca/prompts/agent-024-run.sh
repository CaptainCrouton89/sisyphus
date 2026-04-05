#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-024' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-024-plugin" --agent 'devcore:programmer' --session-id "f83564c8-f0ba-4661-b46b-f59b2628c287" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing base-adversarial-devcore:programmer c12' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-024-system.md')" '## Goal
Add adversarial integration tests to the base tier test suite and new shared helpers to the assertion library.

## Session context
We'\''re building a comprehensive integration test suite for the sisyphus multi-agent orchestration tool. Tests run in Docker containers across 3 tiers (base/tmux/full). We already have ~28 base tier assertions. Now adding adversarial scenarios found by code analysis.

## Files to edit
1. `test/integration/lib/assert.sh` — add new helper functions
2. `test/integration/suites/test-base.sh` — add new test functions + update run_base_tests()

Read both files first. Reference `context/plan-adversarial-tests.md` for the full plan, and `context/brainstorm-state-adversarial.md` + `context/explore-cli-tui-failures.md` for scenario details.

Context files are at: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/

## What to add to assert.sh

Add these BEFORE the `print_results` function:

### assert_not_contains
```bash
assert_not_contains() {
  local name="${1:?assert_not_contains requires a test name}"
  local haystack="${2:?assert_not_contains requires a haystack}"
  local pattern="${3:?assert_not_contains requires a pattern}"
  if echo "$haystack" | grep -q "$pattern"; then
    assert_fail "$name" "expected NOT to match: $pattern"
  else
    assert_pass "$name"
  fi
}
```

### assert_daemon_alive
Verify daemon is still responsive after an operation:
```bash
assert_daemon_alive() {
  local name="${1:?assert_daemon_alive requires a test name}"
  local resp
  resp=$(send_request '\''{"type":"status"}'\'')
  local ok
  ok=$(json_field "$resp" "ok")
  if [ "$ok" = "true" ]; then
    assert_pass "$name"
  else
    assert_fail "$name" "daemon not responsive"
  fi
}
```

### wait_for_session_status
Poll until a session reaches expected status:
```bash
wait_for_session_status() {
  local sid="$1" expected="$2" timeout="${3:-10}"
  local deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local state_json
    state_json=$(read_session_state "$sid")
    local status
    status=$(json_field "$state_json" "status")
    [ "$status" = "$expected" ] && return 0
    sleep 0.5
  done
  return 1
}
```

## What to add to test-base.sh

Add these test functions and add their calls to `run_base_tests()`:

### test_config_robustness (~5 assertions)
Tests that daemon starts with malformed/unusual config:

1. Save original config, write `{"model":"test","futureKey":"value","nestedFuture":{"a":1}}` to `~/.sisyphus/config.json`
2. Start daemon → assert_daemon_alive "config-unknown-keys"
3. stop_daemon
4. Write `{"pollIntervalMs":"not-a-number"}` → start_daemon → assert_daemon_alive "config-wrong-type"
5. stop_daemon
6. Write `{"pollIntervalMs":-1}` → start_daemon → assert_daemon_alive "config-negative-interval"
7. stop_daemon
8. Restore original config: `{"autoUpdate":false}`

### test_sigkill_recovery (~3 assertions)
Tests daemon recovery after SIGKILL:

1. Start daemon
2. Read PID from `~/.sisyphus/daemon.pid`
3. `kill -9 $pid`
4. Sleep briefly to let it die
5. assert_file_exists "sigkill-stale-pid" "$HOME/.sisyphus/daemon.pid"
6. start_daemon → should clean up stale PID and start fresh
7. assert_pass "sigkill-restart-ok" (if start_daemon succeeded)
8. assert_daemon_alive "sigkill-daemon-alive"
9. stop_daemon

### test_home_unset (~1 assertion)
Tests that CLI works with unset HOME:

```bash
test_home_unset() {
  # Run doctor in a subshell with HOME unset
  # On Linux in Docker, homedir() returns "" when HOME unset
  if (unset HOME; sisyphus --version >/dev/null 2>&1); then
    assert_pass "home-unset-version"
  else
    # Acceptable — just shouldn'\''t segfault/hang. Non-zero exit is OK.
    assert_pass "home-unset-version"
  fi
}
```
Note: The test passes either way — we'\''re testing it doesn'\''t hang or segfault.

### test_protocol_edge_cases (~4 assertions)
Extends existing protocol tests with adversarial inputs:

1. Start daemon
2. Send empty string: `send_request ""` → assert_json_error "protocol-empty-request"
3. Send request with extra fields: `send_request '\''{"type":"status","extra":"ignored"}'\''` → assert_json_ok "protocol-extra-fields" (daemon should ignore extras)
4. Send very long task string (5KB+): Generate with printf, send as start request → assert daemon doesn'\''t crash: assert_daemon_alive "protocol-large-payload"
5. stop_daemon

### test_empty_task (~2 assertions)
Tests that starting a session with empty task is handled:

1. Start daemon  
2. `send_request '\''{"type":"start","task":"","cwd":"/tmp/empty-task-test"}'\''`
3. If ok:true → that'\''s acceptable (empty task allowed)
4. If ok:false → that'\''s also acceptable (validation rejected it)
5. Either way: assert_daemon_alive "empty-task-daemon-survives"
6. stop_daemon
7. rm -rf /tmp/empty-task-test

## Update run_base_tests()

Add all new test function calls AFTER the existing ones:
```bash
run_base_tests() {
  # ... existing calls ...
  test_config_robustness
  test_sigkill_recovery
  test_home_unset
  test_protocol_edge_cases
  test_empty_task
}
```

## Conventions
- Follow the existing code style in both files exactly
- Each test function starts/stops its own daemon as needed
- Clean up all side effects (restore config, remove temp dirs)
- Use existing helpers (start_daemon, stop_daemon, send_request, etc.)
- Test names should be descriptive and unique across all tiers

## Report
When done, list all new assertions added with their names.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2465
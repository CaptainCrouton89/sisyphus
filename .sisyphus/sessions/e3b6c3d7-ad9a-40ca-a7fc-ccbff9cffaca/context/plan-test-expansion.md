# Test Expansion Plan

Expand integration tests from ~28 shallow "does X exist" checks to ~55+ tests including protocol-level, session lifecycle, resilience, and e2e workflow tests.

## New assert.sh Helpers

Add these to `test/integration/lib/assert.sh` (AFTER existing helpers, BEFORE `print_results`):

### `send_request <json_string>`
Send a JSON request to the daemon socket, print response JSON to stdout. Uses node for reliable socket handling. Pipe-based to avoid quoting issues:

```bash
send_request() {
  local json="$1"
  echo "$json" | node -e "
    const net = require('net');
    let input = '';
    process.stdin.on('data', c => input += c);
    process.stdin.on('end', () => {
      const t = setTimeout(() => { process.stderr.write('TIMEOUT'); process.exit(1); }, 5000);
      const s = net.connect(process.env.HOME + '/.sisyphus/daemon.sock');
      s.on('connect', () => s.write(input.trim() + '\n'));
      s.on('data', d => {
        clearTimeout(t);
        process.stdout.write(d.toString().trim());
        process.exit(0);
      });
      s.on('error', () => { clearTimeout(t); process.stderr.write('CONN_ERR'); process.exit(1); });
    });
  "
}
```

### `json_field <json_string> <dot.path>`
Extract a field from JSON by dot-separated path. Prints value to stdout:

```bash
json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | FIELD="$field" node -e "
    let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const v=process.env.FIELD.split('.').reduce((a,k)=>a!=null?a[k]:undefined,o);
        process.stdout.write(v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v));
      } catch(e){ process.stderr.write(e.message); process.exit(1); }
    });
  "
}
```

### `assert_json_ok <name> <json>`
Assert response has `ok:true`:

```bash
assert_json_ok() {
  local name="$1"
  local json="$2"
  local ok
  ok=$(json_field "$json" "ok")
  if [ "$ok" = "true" ]; then
    assert_pass "$name"
  else
    local err
    err=$(json_field "$json" "error")
    assert_fail "$name" "expected ok:true, got: $err"
  fi
}
```

### `assert_json_error <name> <json>`
Assert response has `ok:false`:

```bash
assert_json_error() {
  local name="$1"
  local json="$2"
  local ok
  ok=$(json_field "$json" "ok")
  if [ "$ok" = "false" ]; then
    assert_pass "$name"
  else
    assert_fail "$name" "expected ok:false but got ok:true"
  fi
}
```

### `assert_json_field <name> <json> <field> <expected>`
Assert a specific field equals an expected value:

```bash
assert_json_field() {
  local name="$1"
  local json="$2"
  local field="$3"
  local expected="$4"
  local actual
  actual=$(json_field "$json" "$field")
  if [ "$actual" = "$expected" ]; then
    assert_pass "$name"
  else
    assert_fail "$name" "field $field: expected '$expected', got '$actual'"
  fi
}
```

### `assert_valid_json <name> <string>`
Assert a string is valid JSON:

```bash
assert_valid_json() {
  local name="$1"
  local text="$2"
  if echo "$text" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{JSON.parse(d);process.exit(0)}catch{process.exit(1)}})" 2>/dev/null; then
    assert_pass "$name"
  else
    assert_fail "$name" "not valid JSON"
  fi
}
```

### `setup_test_project` / `cleanup_test_project`
Create/remove a test working directory for session tests:

```bash
TEST_CWD="/tmp/sisyphus-integ-test"

setup_test_project() {
  rm -rf "$TEST_CWD"
  mkdir -p "$TEST_CWD"
}

cleanup_test_project() {
  rm -rf "$TEST_CWD"
}
```

### `extract_session_id <start_response_json>`
Extract sessionId from a start response:

```bash
extract_session_id() {
  json_field "$1" "data.sessionId"
}
```

### `read_session_state <session_id>`
Read a session's state.json and print it:

```bash
read_session_state() {
  local sid="$1"
  cat "$TEST_CWD/.sisyphus/sessions/$sid/state.json" 2>/dev/null
}
```

---

## New Base Tier Tests (test-base.sh)

Add these test functions. Call them from `run_base_tests()`.

### CLI Surface Tests

```bash
test_help_lists_commands() {
  local help_output
  help_output=$(sisyphus --help 2>&1)
  assert_contains "help-has-start" "$help_output" "start"
  assert_contains "help-has-list" "$help_output" "list"
  assert_contains "help-has-status" "$help_output" "status"
  assert_contains "help-has-doctor" "$help_output" "doctor"
}

test_unknown_command_fails() {
  if sisyphus notacommand >/dev/null 2>&1; then
    assert_fail "unknown-command-fails" "expected non-zero exit"
  else
    assert_pass "unknown-command-fails"
  fi
}

test_doctor_exit_code() {
  sisyphus doctor >/dev/null 2>&1
  local ec=$?
  if [ "$ec" -eq 0 ]; then
    assert_pass "doctor-always-exits-zero"
  else
    assert_fail "doctor-always-exits-zero" "exit code: $ec"
  fi
}
```

### Protocol Robustness Tests

These require the daemon running. Add them inside `test_daemon_lifecycle` or as a separate function called after daemon start.

Recommended approach: create a new `test_protocol_robustness()` that starts/stops its own daemon:

```bash
test_protocol_robustness() {
  if ! start_daemon; then
    assert_fail "protocol-start" "daemon start failed"
    return
  fi

  # Invalid JSON
  local resp
  resp=$(send_request "this is not json")
  assert_json_error "protocol-invalid-json" "$resp"

  # Unknown request type
  resp=$(send_request '{"type":"bogus"}')
  assert_json_error "protocol-unknown-type" "$resp"

  # Status with nonexistent session
  resp=$(send_request '{"type":"status","sessionId":"nonexistent-session-id"}')
  assert_json_error "protocol-unknown-session" "$resp"

  # Concurrent connections — send 3 status requests in parallel, all should succeed
  local pids=() results=()
  for i in 1 2 3; do
    send_request '{"type":"status"}' > "/tmp/concurrent-$i.txt" 2>&1 &
    pids+=($!)
  done
  local all_ok=true
  for pid in "${pids[@]}"; do
    wait "$pid" || all_ok=false
  done
  if $all_ok; then
    local concurrent_pass=true
    for i in 1 2 3; do
      local r
      r=$(cat "/tmp/concurrent-$i.txt")
      local ok_val
      ok_val=$(json_field "$r" "ok")
      [ "$ok_val" != "true" ] && concurrent_pass=false
      rm -f "/tmp/concurrent-$i.txt"
    done
    if $concurrent_pass; then
      assert_pass "protocol-concurrent"
    else
      assert_fail "protocol-concurrent" "one or more responses not ok"
    fi
  else
    assert_fail "protocol-concurrent" "one or more connections failed"
  fi

  stop_daemon
}
```

### Daemon Resilience Tests

```bash
test_daemon_resilience() {
  # Test 1: Stale socket file
  stop_daemon  # ensure clean
  touch "$HOME/.sisyphus/daemon.sock"  # create a fake socket file
  if start_daemon; then
    assert_pass "daemon-stale-socket-cleanup"
    stop_daemon
  else
    assert_fail "daemon-stale-socket-cleanup" "daemon failed to start with stale socket"
    rm -f "$HOME/.sisyphus/daemon.sock"
  fi

  # Test 2: Stale PID file (dead process)
  stop_daemon  # ensure clean
  echo "99999" > "$HOME/.sisyphus/daemon.pid"  # PID that likely doesn't exist
  if start_daemon; then
    assert_pass "daemon-stale-pid-cleanup"
    stop_daemon
  else
    assert_fail "daemon-stale-pid-cleanup" "daemon failed to start with stale PID"
    rm -f "$HOME/.sisyphus/daemon.pid" "$HOME/.sisyphus/daemon.sock"
  fi

  # Test 3: Double start
  if start_daemon; then
    # Try starting again — should exit 0 (acquirePidLock exits 0 when already running)
    sisyphusd start >/dev/null 2>&1
    local ec=$?
    if [ "$ec" -eq 0 ]; then
      assert_pass "daemon-double-start"
    else
      assert_fail "daemon-double-start" "second start exited $ec"
    fi
    stop_daemon
  else
    assert_fail "daemon-double-start" "first start failed"
  fi
}
```

**Update `run_base_tests()`** to call:
```bash
run_base_tests() {
  test_install_ok
  test_node_pty_native
  test_cli_version
  test_daemon_version
  test_daemon_lifecycle
  test_doctor_base
  test_postinstall_no_swift
  test_help_lists_commands
  test_unknown_command_fails
  test_doctor_exit_code
  test_protocol_robustness
  test_daemon_resilience
}
```

---

## New Tmux Tier Tests (test-tmux.sh)

Add these test functions. Call them from `run_tmux_tests()`.

### Session Lifecycle via Protocol

These tests create real sessions via the daemon socket protocol and verify state/artifacts.

**Important**: When we `start` a session, the daemon creates the session dir, spawns a tmux session, and tries to run the orchestrator (claude). In the tmux tier, `claude` is not installed, so the command fails immediately. The pane exits, `handlePaneExited` fires, and the session ends up `paused`. This is expected and fine — we're testing the protocol/state, not the orchestrator.

In the full tier, the mock `claude` (`#!/bin/sh\ntrue`) also exits immediately. Same result.

```bash
test_session_lifecycle_protocol() {
  setup_test_project
  tmux kill-server 2>/dev/null || true
  tmux new-session -d -s protocol-test 2>/dev/null

  if ! start_daemon; then
    assert_fail "session-create-protocol" "daemon start failed"
    cleanup_test_project
    return
  fi

  # --- Create session ---
  local create_resp
  create_resp=$(send_request "{\"type\":\"start\",\"task\":\"integration test task\",\"cwd\":\"$TEST_CWD\"}")
  assert_json_ok "session-create-protocol" "$create_resp"

  local session_id
  session_id=$(extract_session_id "$create_resp")
  if [ -z "$session_id" ]; then
    assert_fail "session-has-id" "no sessionId in response"
    stop_daemon
    cleanup_test_project
    tmux kill-server 2>/dev/null || true
    return
  fi
  assert_pass "session-has-id"

  # Wait a moment for orchestrator to exit (mock claude / no claude exits immediately)
  sleep 2

  # --- Verify state.json ---
  local state_json
  state_json=$(read_session_state "$session_id")
  assert_valid_json "session-state-valid-json" "$state_json"
  assert_json_field "session-state-id" "$state_json" "id" "$session_id"
  assert_json_field "session-state-task" "$state_json" "task" "integration test task"

  # Verify session dir structure
  local sdir="$TEST_CWD/.sisyphus/sessions/$session_id"
  assert_file_exists "session-dir-state" "$sdir/state.json"
  if [ -d "$sdir/context" ]; then
    assert_pass "session-dir-context"
  else
    assert_fail "session-dir-context" "context/ dir missing"
  fi
  if [ -d "$sdir/prompts" ]; then
    assert_pass "session-dir-prompts"
  else
    assert_fail "session-dir-prompts" "prompts/ dir missing"
  fi

  # --- Verify tmux session created ---
  if tmux has-session -t "ssyph_" 2>/dev/null || tmux list-sessions 2>/dev/null | grep -q "ssyph_"; then
    assert_pass "session-tmux-exists"
  else
    assert_fail "session-tmux-exists" "no ssyph_ tmux session found"
  fi

  # --- Verify session in list ---
  local list_resp
  list_resp=$(send_request "{\"type\":\"list\",\"cwd\":\"$TEST_CWD\"}")
  assert_json_ok "session-list-ok" "$list_resp"
  local sessions_json
  sessions_json=$(json_field "$list_resp" "data.sessions")
  if echo "$sessions_json" | grep -q "$session_id"; then
    assert_pass "session-in-list"
  else
    assert_fail "session-in-list" "session not found in list"
  fi

  # --- Verify status returns session detail ---
  local status_resp
  status_resp=$(send_request "{\"type\":\"status\",\"sessionId\":\"$session_id\"}")
  assert_json_ok "session-status-ok" "$status_resp"
  local status_id
  status_id=$(json_field "$status_resp" "data.session.id")
  if [ "$status_id" = "$session_id" ]; then
    assert_pass "session-status-has-detail"
  else
    assert_fail "session-status-has-detail" "status response missing session id"
  fi

  # --- Send message and verify stored ---
  local msg_resp
  msg_resp=$(send_request "{\"type\":\"message\",\"sessionId\":\"$session_id\",\"content\":\"hello from integration test\"}")
  assert_json_ok "session-message-ok" "$msg_resp"
  # Re-read state to check message
  state_json=$(read_session_state "$session_id")
  if echo "$state_json" | grep -q "hello from integration test"; then
    assert_pass "session-message-stored"
  else
    assert_fail "session-message-stored" "message not found in state.json"
  fi

  # --- Kill session and verify cleanup ---
  local kill_resp
  kill_resp=$(send_request "{\"type\":\"kill\",\"sessionId\":\"$session_id\"}")
  assert_json_ok "session-kill-ok" "$kill_resp"
  sleep 1

  # Tmux session should be gone
  if tmux list-sessions 2>/dev/null | grep -q "ssyph_"; then
    assert_fail "session-kill-tmux-gone" "ssyph_ session still exists after kill"
  else
    assert_pass "session-kill-tmux-gone"
  fi

  # --- Create another session, then delete it ---
  local create2_resp session_id2
  create2_resp=$(send_request "{\"type\":\"start\",\"task\":\"delete test\",\"cwd\":\"$TEST_CWD\"}")
  session_id2=$(extract_session_id "$create2_resp")
  sleep 1
  if [ -n "$session_id2" ]; then
    local del_resp
    del_resp=$(send_request "{\"type\":\"delete\",\"sessionId\":\"$session_id2\",\"cwd\":\"$TEST_CWD\"}")
    assert_json_ok "session-delete-ok" "$del_resp"
    local sdir2="$TEST_CWD/.sisyphus/sessions/$session_id2"
    if [ ! -d "$sdir2" ]; then
      assert_pass "session-delete-dir-gone"
    else
      assert_fail "session-delete-dir-gone" "session dir still exists"
    fi
  else
    assert_fail "session-delete-ok" "failed to create second session"
    assert_fail "session-delete-dir-gone" "skipped (no session)"
  fi

  stop_daemon
  tmux kill-server 2>/dev/null || true
  cleanup_test_project
}
```

### Multi-Session Test

```bash
test_multi_session() {
  local cwd1="/tmp/sisyphus-multi-1"
  local cwd2="/tmp/sisyphus-multi-2"
  mkdir -p "$cwd1" "$cwd2"
  tmux kill-server 2>/dev/null || true
  tmux new-session -d -s multi-test 2>/dev/null

  if ! start_daemon; then
    assert_fail "multi-session-create" "daemon start failed"
    rm -rf "$cwd1" "$cwd2"
    return
  fi

  local r1 r2 sid1 sid2
  r1=$(send_request "{\"type\":\"start\",\"task\":\"session one\",\"cwd\":\"$cwd1\"}")
  sid1=$(extract_session_id "$r1")
  r2=$(send_request "{\"type\":\"start\",\"task\":\"session two\",\"cwd\":\"$cwd2\"}")
  sid2=$(extract_session_id "$r2")

  if [ -n "$sid1" ] && [ -n "$sid2" ] && [ "$sid1" != "$sid2" ]; then
    assert_pass "multi-session-create"
  else
    assert_fail "multi-session-create" "failed to create two independent sessions"
    stop_daemon
    tmux kill-server 2>/dev/null || true
    rm -rf "$cwd1" "$cwd2"
    return
  fi

  sleep 1

  # Both appear in all-list
  local list_resp
  list_resp=$(send_request "{\"type\":\"list\",\"cwd\":\"$cwd1\",\"all\":true}")
  local sessions_str
  sessions_str=$(json_field "$list_resp" "data.sessions")
  if echo "$sessions_str" | grep -q "$sid1" && echo "$sessions_str" | grep -q "$sid2"; then
    assert_pass "multi-session-both-listed"
  else
    assert_fail "multi-session-both-listed" "not both sessions in list"
  fi

  # Kill one, other survives
  send_request "{\"type\":\"kill\",\"sessionId\":\"$sid1\"}" >/dev/null
  sleep 1
  local status2
  status2=$(send_request "{\"type\":\"status\",\"sessionId\":\"$sid2\"}")
  assert_json_ok "multi-session-other-survives" "$status2"

  # Cleanup
  send_request "{\"type\":\"kill\",\"sessionId\":\"$sid2\"}" >/dev/null
  stop_daemon
  tmux kill-server 2>/dev/null || true
  rm -rf "$cwd1" "$cwd2"
}
```

**Update `run_tmux_tests()`** to call both new functions:
```bash
run_tmux_tests() {
  test_tmux_installed
  test_setup_keybind
  test_tmux_conf
  test_tmux_server
  test_doctor_tmux
  test_daemon_with_tmux
  test_session_lifecycle_protocol
  test_multi_session

  tmux kill-server 2>/dev/null || true
}
```

---

## New Full Tier Tests (test-full.sh)

### Complete Lifecycle

```bash
test_session_complete_lifecycle() {
  setup_test_project
  tmux kill-server 2>/dev/null || true
  tmux new-session -d -s complete-test 2>/dev/null

  if ! start_daemon; then
    assert_fail "complete-lifecycle-create" "daemon start failed"
    cleanup_test_project
    return
  fi

  local resp session_id
  resp=$(send_request "{\"type\":\"start\",\"task\":\"lifecycle test\",\"cwd\":\"$TEST_CWD\"}")
  session_id=$(extract_session_id "$resp")
  if [ -z "$session_id" ]; then
    assert_fail "complete-lifecycle-create" "no sessionId"
    stop_daemon
    tmux kill-server 2>/dev/null || true
    cleanup_test_project
    return
  fi
  assert_pass "complete-lifecycle-create"

  sleep 2  # Wait for mock claude to exit

  # Complete the session
  local comp_resp
  comp_resp=$(send_request "{\"type\":\"complete\",\"sessionId\":\"$session_id\",\"report\":\"integration test complete\"}")
  assert_json_ok "complete-lifecycle-complete" "$comp_resp"

  sleep 1

  # Verify state shows completed
  local state_json
  state_json=$(read_session_state "$session_id")
  local status_val
  status_val=$(json_field "$state_json" "status")
  if [ "$status_val" = "completed" ]; then
    assert_pass "complete-lifecycle-status"
  else
    assert_fail "complete-lifecycle-status" "expected completed, got: $status_val"
  fi

  # Verify completionReport stored
  local report_val
  report_val=$(json_field "$state_json" "completionReport")
  if [ "$report_val" = "integration test complete" ]; then
    assert_pass "complete-lifecycle-report-stored"
  else
    assert_fail "complete-lifecycle-report-stored" "report not stored: $report_val"
  fi

  # Completed session should still be visible in list
  local list_resp sessions_str
  list_resp=$(send_request "{\"type\":\"list\",\"cwd\":\"$TEST_CWD\"}")
  sessions_str=$(json_field "$list_resp" "data.sessions")
  if echo "$sessions_str" | grep -q "$session_id"; then
    assert_pass "complete-lifecycle-in-list"
  else
    assert_fail "complete-lifecycle-in-list" "completed session not in list"
  fi

  stop_daemon
  tmux kill-server 2>/dev/null || true
  cleanup_test_project
}
```

### Update Task Test

```bash
test_update_task() {
  setup_test_project
  tmux kill-server 2>/dev/null || true
  tmux new-session -d -s task-test 2>/dev/null

  if ! start_daemon; then
    assert_fail "update-task" "daemon start failed"
    cleanup_test_project
    return
  fi

  local resp session_id
  resp=$(send_request "{\"type\":\"start\",\"task\":\"original task\",\"cwd\":\"$TEST_CWD\"}")
  session_id=$(extract_session_id "$resp")
  sleep 1

  if [ -n "$session_id" ]; then
    local update_resp
    update_resp=$(send_request "{\"type\":\"update-task\",\"sessionId\":\"$session_id\",\"task\":\"updated task description\"}")
    assert_json_ok "update-task-ok" "$update_resp"

    # Verify goal file was updated
    local goal_file="$TEST_CWD/.sisyphus/sessions/$session_id/goal.md"
    if [ -f "$goal_file" ] && grep -q "updated task description" "$goal_file"; then
      assert_pass "update-task-goal-updated"
    else
      assert_fail "update-task-goal-updated" "goal file not updated"
    fi

    send_request "{\"type\":\"kill\",\"sessionId\":\"$session_id\"}" >/dev/null
  else
    assert_fail "update-task-ok" "no session created"
    assert_fail "update-task-goal-updated" "skipped"
  fi

  stop_daemon
  tmux kill-server 2>/dev/null || true
  cleanup_test_project
}
```

**Update `run_full_tests()`**:
```bash
run_full_tests() {
  test_nvim_installed
  test_claude_mock
  test_doctor_full
  test_full_setup
  test_status_bar
  test_list_empty
  test_session_complete_lifecycle
  test_update_task
}
```

---

## Test Count Summary

### Before expansion:
- Base: 11 assertions
- Tmux: +7 = 18 cumulative
- Full: +7 = 25 cumulative

### After expansion:
- Base: +~17 new assertions (help×4, unknown-cmd×1, doctor-exit×1, protocol×4, concurrent×1, resilience×3, plus existing 11) ≈ 28
- Tmux: +~23 new (session lifecycle: create, has-id, state-valid, state-id, state-task, dir-state, dir-context, dir-prompts, tmux-exists, list-ok, in-list, status-ok, status-detail, message-ok, message-stored, kill-ok, kill-tmux-gone, delete-ok, delete-dir-gone; multi: create, both-listed, other-survives) ≈ ~45 cumulative 
- Full: +~9 new (complete: create, complete, status, report-stored, in-list; update-task: ok, goal-updated) ≈ ~54 cumulative

**Total: ~55 assertions across all tiers.**

## File Edit Summary

| File | Changes |
|------|---------|
| `test/integration/lib/assert.sh` | Add send_request, json_field, assert_json_ok, assert_json_error, assert_json_field, assert_valid_json, setup_test_project, cleanup_test_project, extract_session_id, read_session_state |
| `test/integration/suites/test-base.sh` | Add test_help_lists_commands, test_unknown_command_fails, test_doctor_exit_code, test_protocol_robustness, test_daemon_resilience; update run_base_tests |
| `test/integration/suites/test-tmux.sh` | Add test_session_lifecycle_protocol, test_multi_session; update run_tmux_tests |
| `test/integration/suites/test-full.sh` | Add test_session_complete_lifecycle, test_update_task; update run_full_tests |
| `test/integration/Dockerfile` | No changes needed |
| `test/integration/run.sh` | No changes needed |

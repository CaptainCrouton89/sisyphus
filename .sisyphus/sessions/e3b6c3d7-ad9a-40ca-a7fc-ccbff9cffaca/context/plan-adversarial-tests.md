# Adversarial Test Implementation Plan

Synthesized from 7 agent brainstorm/exploration reports. Focus: highest-impact scenarios that are deterministically testable in Docker containers.

## Shared: New assert.sh Helpers

Add to `test/integration/lib/assert.sh`:

### `assert_not_contains <name> <haystack> <pattern>`
Inverse of assert_contains — verify a string does NOT match a pattern.

### `assert_daemon_alive <name>`
After an operation that shouldn't crash the daemon, verify it's still responsive:
```bash
assert_daemon_alive() {
  local name="$1"
  local resp
  resp=$(send_request '{"type":"status"}')
  local ok
  ok=$(json_field "$resp" "ok")
  if [ "$ok" = "true" ]; then
    assert_pass "$name"
  else
    assert_fail "$name" "daemon not responsive after operation"
  fi
}
```

### `wait_for_session_status <sessionId> <expected_status> <timeout_seconds>`
Poll session status up to timeout:
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

---

## Wave 1: Base Tier Additions (`test-base.sh`)

These test daemon robustness without tmux.

### test_config_robustness (~5 assertions)
Source: brainstorm-state-adversarial.md #12, #13

```
1. Write config with unknown keys: {"model":"test","futureKey":"value","nestedFuture":{"a":1}}
   Start daemon → should start fine → assert_daemon_alive
2. Write config with wrong types: {"pollIntervalMs":"not-a-number"}
   Start daemon → should start (may use defaults) → assert_daemon_alive
3. Write config with negative pollInterval: {"pollIntervalMs":-1}
   Start daemon → should not spin CPU → assert_daemon_alive
4. Restore clean config after each sub-test
```

### test_sigkill_recovery (~3 assertions)
Source: brainstorm-state-adversarial.md #8

```
1. Start daemon, get its PID
2. kill -9 the PID (SIGKILL, no graceful shutdown)
3. Verify stale PID file exists
4. Start daemon again → should detect stale PID, clean up, start fresh
5. assert_daemon_alive "sigkill-recovery"
```

### test_home_unset (~1 assertion)
Source: explore-cli-tui-failures.md #2

```
1. HOME= sisyphus doctor → should not crash (may show errors)
   Wrap in subshell to not affect parent env
```

### test_empty_task_protocol (~1 assertion)
Source: brainstorm-lifecycle-adversarial.md #10

```
1. Start daemon
2. send_request '{"type":"start","task":"","cwd":"/tmp/test"}'
   Should return error OR create session without crash
3. assert_daemon_alive after regardless
```

### test_protocol_edge_cases (~4 assertions)  
Source: brainstorm-lifecycle-adversarial.md #12, #14

```
1. Empty request body: send_request ""
2. Huge request (10KB): generate large JSON task field
3. Request with extra fields: {"type":"status","extra":"ignored"}
4. Binary garbage: printf '\x00\x01\x02' | send to socket
All should get error responses, daemon should survive all.
```

---

## Wave 2: Tmux Tier Additions (`test-tmux.sh`)

### test_state_corruption (~6 assertions)
Source: brainstorm-state-adversarial.md #1, #2

```
1. Start session, get SID
2. Wait for session to settle (orchestrator exits)
3. Write garbage to state.json: echo "not json" > state.json
4. sisyphus status via protocol → should return error, not crash daemon
5. assert_daemon_alive "state-corrupt-daemon-survives"
6. Write valid JSON with wrong schema: {"id":"x"} (missing agents, etc)
7. send_request status for that session → should error gracefully
8. Kill the corrupted session to clean up
```

### test_rollback_invalid_cycle (~3 assertions)
Source: brainstorm-state-adversarial.md #11, brainstorm-lifecycle-adversarial.md #17

```
1. Start session, wait for it to settle
2. send_request rollback with cycle 999 → should return error
3. send_request rollback with cycle -1 → should return error  
4. assert_daemon_alive after both
```

### test_message_to_killed_session (~2 assertions)
Source: brainstorm-lifecycle-adversarial.md #8

```
1. Start session, get SID
2. Kill session
3. send_request message to killed session → should return error
4. assert_daemon_alive
```

### test_dotted_directory_name (~3 assertions)
Source: brainstorm-tmux-adversarial.md #11 — THIS IS A REAL BUG

```
1. mkdir /tmp/my.dotted.project && cd there
2. Start session with cwd=/tmp/my.dotted.project
3. tmux list-sessions → check actual name (dots → underscores)
4. Read state.json → get tmuxSessionName
5. Verify tmux can find the session by stored name (tmux has-session -t <stored>)
   If they mismatch, this documents the known bug
6. Clean up
```

### test_session_name_collision (~2 assertions)
Source: brainstorm-tmux-adversarial.md #1

```
1. Pre-create a tmux session named "ssyph_test_collision"
2. Start a sisyphus session that would get that name
3. Verify daemon handles the collision (error or auto-rename)
4. Clean up
```

### test_external_pane_kill (~3 assertions)
Source: brainstorm-lifecycle-adversarial.md #4, brainstorm-tmux-adversarial.md #8

```
1. Start session, wait for orchestrator to spawn
2. Find the orchestrator pane ID from tmux
3. tmux kill-pane on it
4. Wait for pane monitor to detect (5-10 seconds)
5. Check session status — should not be stuck in "active" with no pane
6. assert_daemon_alive
```

### test_daemon_restart_recovery (~4 assertions)
Source: brainstorm-lifecycle-adversarial.md #15

```
1. Start daemon + session
2. Get SID
3. stop_daemon (graceful)
4. start_daemon (new instance)
5. send_request status for SID → should find the session
6. Session should be in a recoverable state
7. assert_daemon_alive
```

### test_concurrent_messages (~2 assertions)
Source: brainstorm-state-adversarial.md #20

```
1. Start session
2. Fire 10 message requests in parallel (backgrounded)
3. Wait for all
4. Read state.json → verify all 10 messages present
5. assert_daemon_alive
```

### test_subdirectory_cwd_isolation (~2 assertions)
Source: brainstorm-state-adversarial.md #16

```
1. mkdir -p /tmp/project/src
2. Start session with cwd=/tmp/project
3. send_request list with cwd=/tmp/project/src → should NOT see the session
4. send_request list with cwd=/tmp/project → SHOULD see the session
```

---

## Wave 3: Full Tier Additions (`test-full.sh`)

### test_agent_type_resolution (~4 assertions)
Source: brainstorm-plugins-adversarial.md #1, #4

```
1. Create /tmp/test-project/.claude/agents/custom-reviewer.md with:
   ---
   color: red
   ---
   Custom reviewer body
2. Start session in that project
3. Verify discoverAgentTypes via daemon or by checking that the file is resolvable
   (Easiest: use sisyphus spawn --list-types and check output includes custom-reviewer)
4. Test with missing .claude/ dir: start session in /tmp/bare-project → should work fine
```

### test_malformed_frontmatter (~3 assertions)
Source: brainstorm-plugins-adversarial.md #2, #12

```
1. Create agent file with missing closing ---:
   ---
   model: test-model
   Custom body without closing frontmatter
2. Create agent with inline YAML array: skills: [a, b]
3. Verify these don't crash when listed/resolved
```

### test_setup_idempotency (~2 assertions)
Source: brainstorm-plugins-adversarial.md #6

```
1. Run sisyphus setup → creates begin.md
2. Modify begin.md content
3. Run sisyphus setup again → modified content preserved (not overwritten)
```

### test_tui_no_tty (~2 assertions)
Source: brainstorm-tui-adversarial.md #8, #15

```
1. echo "" | sisyphus tui → should exit with error, not crash
2. sisyphus tui < /dev/null → should exit with error
(Tests for graceful handling of non-interactive launch)
```

### test_doctor_all_checks (~3 assertions)
Source: explore-doctor-matrix.md

```
1. Run doctor in full tier (tmux running, claude mock, nvim installed)
2. Verify NO fail markers (✗) in output
3. Verify key checks show ok (✓)
```

---

## Test Count Summary

| Tier | Existing | New | Total |
|------|----------|-----|-------|
| Base | ~28 | ~14 | ~42 |  
| Tmux | ~45 cumulative | ~27 | ~72 |
| Full | ~54 cumulative | ~14 | ~86 |

## Implementation Strategy

Three parallel agents, one per tier:
1. **base-adversarial**: Adds shared assert.sh helpers + base tier tests
2. **tmux-adversarial**: Adds tmux tier tests (no assert.sh changes needed — uses helpers from agent 1, but can inline any needed helpers)
3. **full-adversarial**: Adds full tier tests

File conflict avoidance:
- Agent 1 edits: assert.sh, test-base.sh
- Agent 2 edits: test-tmux.sh only
- Agent 3 edits: test-full.sh only

Since agents 2 and 3 need the new assert.sh helpers that agent 1 will add, either:
a) Run agent 1 first, then 2+3 in parallel
b) Have agents 2+3 also add any helpers they need (risk of conflict)
c) Include the helpers inline in agent instructions so they know the API

**Choose (c)**: Give agents 2+3 the exact helper signatures so they can write tests that use them, and agent 1 adds the actual implementations. Since the tests won't run until Docker build, the helpers just need to exist when the suite runs.

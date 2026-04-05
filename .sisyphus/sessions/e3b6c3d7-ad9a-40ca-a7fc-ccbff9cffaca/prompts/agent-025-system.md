# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Goal
Add adversarial integration tests to the tmux tier test suite.

## Session context
We're building a comprehensive integration test suite for sisyphus. Tests run in Docker containers. We already have ~22 tmux-tier-specific assertions (session lifecycle, multi-session). Now adding adversarial scenarios found by code analysis of the daemon.

## File to edit
`test/integration/suites/test-tmux.sh` — add new test functions + update run_tmux_tests()

Read this file first. Also read `test/integration/lib/assert.sh` for available helpers.

Reference these context files for scenario details:
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-state-adversarial.md`
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-tmux-adversarial.md`
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-lifecycle-adversarial.md`
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/explore-daemon-failures.md`

## Available assert.sh helpers you can use

Existing:
- `start_daemon` / `stop_daemon` — daemon lifecycle
- `send_request <json>` — send JSON to daemon socket, returns response
- `json_field <json> <dot.path>` — extract nested field
- `assert_json_ok / assert_json_error / assert_json_field / assert_valid_json`
- `assert_cmd / assert_file_exists / assert_contains`
- `setup_test_project / cleanup_test_project` — creates/removes `/tmp/sisyphus-integ-test`
- `extract_session_id <response>` — gets data.sessionId
- `read_session_state <sid>` — reads state.json from TEST_CWD

Being added by a parallel agent (will exist at test time):
- `assert_not_contains <name> <haystack> <pattern>` — verify string does NOT match
- `assert_daemon_alive <name>` — verify daemon is responsive (sends status request)
- `wait_for_session_status <sid> <status> <timeout>` — poll for session status

## What to add

### test_state_corruption (~6 assertions)
Tests daemon survives corrupted state.json.

```
1. setup_test_project
2. tmux kill-server; tmux new-session -d -s state-corrupt-test
3. start_daemon
4. Create a session: send_request start with cwd=$TEST_CWD
5. Extract SID, sleep 2 (let orchestrator exit)
6. Overwrite state.json with "not json": echo "not json" > $TEST_CWD/.sisyphus/sessions/$SID/state.json
7. send_request status for that SID → assert_json_error "state-corrupt-status-fails"
8. assert_daemon_alive "state-corrupt-daemon-survives"
9. Overwrite with valid JSON but wrong schema: echo '{"id":"x"}' > state.json
10. send_request status → assert_json_error or partial response
11. assert_daemon_alive "state-wrong-schema-daemon-survives"
12. Clean up: stop_daemon, tmux kill-server, cleanup_test_project
```

### test_rollback_invalid (~3 assertions)
Tests clean error on invalid rollback targets.

```
1. setup_test_project, start tmux, start daemon
2. Create session, get SID, sleep 2
3. send_request '{"type":"rollback","sessionId":"$SID","toCycle":999}' → assert_json_error "rollback-nonexistent-cycle"
4. send_request '{"type":"rollback","sessionId":"$SID","toCycle":0}' → assert_json_error "rollback-cycle-zero"
5. assert_daemon_alive "rollback-invalid-daemon-survives"
6. Clean up
```

### test_message_to_killed_session (~2 assertions)
Tests that messaging a killed session fails gracefully.

```
1. Create session, kill it
2. send_request message to killed SID → should error
3. assert_daemon_alive
```

### test_dotted_directory_name (~3 assertions)
THIS TESTS A KNOWN BUG — dots in dir names get mangled by tmux.

```
1. mkdir -p /tmp/my.dotted.project
2. Start session with cwd=/tmp/my.dotted.project
3. Extract SID
4. tmux list-sessions | grep ssyph_ → capture actual session name
5. Read state.json → get tmuxSessionName field
6. If stored name contains dots but tmux has underscores, they mismatch → document bug
7. Try tmux has-session -t <stored_name> → if it fails, that confirms the bug
8. Record results as assertions that document current behavior
   (Use assert_pass/assert_fail to document what works vs what's broken)
9. Clean up: rm -rf /tmp/my.dotted.project
```

### test_session_name_collision (~2 assertions)
Tests behavior when a ssyph_ session already exists.

```
1. Pre-create tmux session: tmux new-session -d -s "ssyph_collision_test"
2. Start daemon
3. Create a session whose name would collide (may not collide exactly due to UUID-based naming,
   but the daemon needs to handle any tmux name collision)
4. The key test: daemon doesn't crash → assert_daemon_alive
5. Clean up
```

### test_external_pane_kill (~4 assertions)
Tests that killing a tmux pane directly is detected by the pane monitor.

```
1. Create session, sleep 2 for orchestrator to spawn
2. Get the session's tmux panes from state.json or tmux list-panes
3. If an orchestrator/agent pane exists, kill it with tmux kill-pane
4. Wait ~10 seconds for pane monitor to detect
5. Read state.json — orchestrator should show signs of handling (cycle transition, paused, etc.)
6. assert_daemon_alive
7. Clean up
```

### test_daemon_restart_recovery (~4 assertions)
Tests that sessions survive a daemon restart.

```
1. Start daemon + create session
2. Get SID
3. stop_daemon (graceful)
4. start_daemon (new instance)
5. send_request status for SID → should still know about it
6. assert_json_ok "daemon-restart-session-accessible"
7. Verify session state is intact on disk
8. Clean up
```

### test_concurrent_messages (~2 assertions)
Tests that concurrent message sends all succeed.

```
1. Create session
2. Send 10 messages in parallel using backgrounded send_request calls
3. Wait for all background jobs
4. Read state.json → count messages array length
5. Verify all 10 present (or at least no crash/corruption)
6. assert_daemon_alive
```

### test_subdirectory_cwd_isolation (~2 assertions)
Tests that sessions are project-relative and invisible from subdirectories.

```
1. mkdir -p /tmp/project-root/subdir
2. Create session with cwd=/tmp/project-root
3. send_request list with cwd=/tmp/project-root → should include session
4. send_request list with cwd=/tmp/project-root/subdir → should NOT include session
5. Clean up
```

## Update run_tmux_tests()

Add all new test function calls AFTER the existing ones, BEFORE the final `tmux kill-server`:
```bash
run_tmux_tests() {
  # ... existing calls ...
  test_state_corruption
  test_rollback_invalid
  test_message_to_killed_session
  test_dotted_directory_name
  test_session_name_collision
  test_external_pane_kill
  test_daemon_restart_recovery
  test_concurrent_messages
  test_subdirectory_cwd_isolation

  tmux kill-server 2>/dev/null || true
}
```

## Conventions
- Follow the existing code style exactly (look at test_session_lifecycle_protocol for patterns)
- Each test manages its own daemon/tmux lifecycle (start at beginning, stop at end)
- Always clean up temp dirs and kill tmux servers
- Tests must be independent — each can run in any order
- Use `sleep 2` after session creation to let the mock orchestrator exit
- Test names must be unique across all tiers

## Report
When done, list all new assertions added with their names.

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

# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: Add session lifecycle and multi-session tests to the tmux tier integration tests.

## Context
Read `context/plan-test-expansion.md` in the session dir for the full spec. You are editing 1 file:

- `test/integration/suites/test-tmux.sh`

## Dependencies
The assert.sh file will have new helpers added by a parallel agent. You can use these helpers in your tests — they will be available at test-time since assert.sh is sourced transitively. Here are the signatures you can use:

- `send_request <json_string>` — sends JSON to daemon socket, prints response JSON to stdout
- `json_field <json_string> <dot.path>` — extracts field from JSON, prints to stdout
- `assert_json_ok <name> <json>` — pass if ok:true
- `assert_json_error <name> <json>` — pass if ok:false
- `assert_json_field <name> <json> <field> <expected>` — pass if field equals expected
- `assert_valid_json <name> <string>` — pass if string is valid JSON
- `TEST_CWD="/tmp/sisyphus-integ-test"` — test working directory
- `setup_test_project` — `rm -rf $TEST_CWD && mkdir -p $TEST_CWD`
- `cleanup_test_project` — `rm -rf $TEST_CWD`
- `extract_session_id <response_json>` — extracts data.sessionId from start response
- `read_session_state <session_id>` — cats `$TEST_CWD/.sisyphus/sessions/$sid/state.json`

## Task: Add test_session_lifecycle_protocol() and test_multi_session()

### `test_session_lifecycle_protocol()`
Full session lifecycle test via raw daemon protocol:

1. `setup_test_project`, kill any tmux server, start a detached tmux session (needed for daemon)
2. Start daemon
3. Create session via `send_request` with `{type:"start", task:"integration test task", cwd:TEST_CWD}`
4. `assert_json_ok "session-create-protocol"` on response
5. Extract sessionId. Assert it's non-empty.
6. `sleep 2` — wait for orchestrator to exit (no claude / mock claude exits immediately)
7. Read state.json → `assert_valid_json`, check `id` matches, check `task` matches
8. Check session dir has `state.json`, `context/` dir, `prompts/` dir
9. Check tmux session with `ssyph_` prefix exists (use `tmux list-sessions | grep ssyph_`)
10. Send `{type:"list", cwd:TEST_CWD}` → assert ok, assert sessionId appears in sessions JSON
11. Send `{type:"status", sessionId:...}` → assert ok, assert response has session.id matching
12. Send `{type:"message", sessionId:..., content:"hello from integration test"}` → assert ok, re-read state.json, assert contains the message text
13. Send `{type:"kill", sessionId:...}` → assert ok, sleep 1, verify no ssyph_ tmux session remains
14. Create ANOTHER session, send `{type:"delete", sessionId:..., cwd:TEST_CWD}` → assert ok, verify session dir is gone
15. Stop daemon, kill tmux server, cleanup_test_project

This function produces ~21 assertions.

### `test_multi_session()`
Multi-session isolation test:

1. Create two test cwds: `/tmp/sisyphus-multi-1`, `/tmp/sisyphus-multi-2`
2. Start tmux + daemon
3. Create 2 sessions with different cwds
4. Assert both created ok, have different IDs
5. Send `{type:"list", cwd:..., all:true}` → assert both appear
6. Kill one session
7. Send status for the other → assert still ok
8. Cleanup everything

This function produces ~4 assertions.

### Update `run_tmux_tests()`
Add both new functions to the end of `run_tmux_tests()`, BEFORE the `tmux kill-server` cleanup line.

## Important Notes
- The daemon needs a running tmux server to create sessions. Start one with `tmux new-session -d -s <name>` before `start_daemon`
- Session creation triggers orchestrator spawn which runs `claude`. In tmux tier, claude isn't installed so it exits immediately → session becomes paused. This is fine — we're testing protocol/state.
- Always clean up: stop_daemon, kill tmux server, remove test dirs
- Proper error handling on every step — if create fails, skip dependent assertions and clean up
- The `start` request needs `cwd` field
- The `list` request needs `cwd` field, and optionally `all:true` for cross-cwd listing
- JSON in send_request must use proper escaping (double quotes)

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

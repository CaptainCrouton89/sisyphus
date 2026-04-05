# Cycle 9

**Status:** completed  |  **Duration:** 12m 5s
**Started:** Apr 2, 00:54:15
**Completed:** Apr 2, 01:02:58
**Mode:** implementation
**Claude Session:** 049f879a-790c-4b68-98fd-f4f27c10f6f1


---


## Agents

### agent-013 — impl-assert-base
- **Status:** completed  |  **Duration:** 2m 20s
- **Type:** devcore:programmer

**Instruction:**

Expand the integration test assertion library and base tier tests.

## Context
Read `context/plan-test-expansion.md` in the session dir for the full spec. You are editing 2 files:

1. `test/integration/lib/assert.sh` — Add new helpers
2. `test/integration/suites/test-base.sh` — Add new test functions

## Task 1: assert.sh new helpers

Add the following helpers to `test/integration/lib/assert.sh` AFTER the existing `assert_contains` function and BEFORE `start_daemon`:

- `send_request` — send JSON to daemon socket via node, return response
- `json_field` — extract field from JSON by dot-path via node
- `assert_json_ok` — assert response has ok:true
- `assert_json_error` — assert response has ok:false
- `assert_json_field` — assert specific field equals expected value
- `assert_valid_json` — assert string is valid JSON
- `TEST_CWD` variable set to `/tmp/sisyphus-integ-test`
- `setup_test_project` / `cleanup_test_project` — create/remove test working dir
- `extract_session_id` — extract sessionId from start response
- `read_session_state` — cat session state.json

See the plan for exact implementations. Follow the code style of the existing helpers.

## Task 2: test-base.sh new tests

Add these test functions to `test/integration/suites/test-base.sh`:

### `test_help_lists_commands()`
Run `sisyphus --help`, assert output contains: start, list, status, doctor

### `test_unknown_command_fails()`
Run `sisyphus notacommand`, assert non-zero exit code

### `test_doctor_exit_code()`
Run `sisyphus doctor`, explicitly check `$?` is 0

### `test_protocol_robustness()`
Start daemon, then test:
- Send `"this is not json"` → assert_json_error
- Send `{"type":"bogus"}` → assert_json_error  
- Send `{"type":"status","sessionId":"nonexistent-session-id"}` → assert_json_error
- Send 3 concurrent `{"type":"status"}` requests in parallel (background jobs), verify all return ok:true
- Stop daemon

### `test_daemon_resilience()`
- Create a regular file at `$HOME/.sisyphus/daemon.sock`, start daemon → should work (cleans stale socket)
- Write "99999" to `$HOME/.sisyphus/daemon.pid`, start daemon → should work (handles stale PID)
- Start daemon, try starting again → second should exit 0 (acquirePidLock exits 0 when already running)
- Clean up between each sub-test

### Update `run_base_tests()`
Add the 5 new test functions to the existing `run_base_tests()` call list (after the existing ones).

## Important Notes
- Follow existing code style exactly (shellcheck-clean, `set_tier`, etc.)
- Use `#!/bin/bash` shebang
- All new helpers in assert.sh must respect the `_ASSERT_LOADED` guard (add them after it)
- The `send_request` helper uses pipe-based node approach to avoid shell quoting issues
- Test functions that start the daemon must call `stop_daemon` before returning (even on failure paths)
- The concurrent test should use background jobs (`&`) and `wait`

**Latest report** (final, Apr 2, 01:04:33):**

I don't have a work report to summarize. Could you please provide the report text or document you'd like me to summarize?

### agent-014 — impl-tmux-tests
- **Status:** completed  |  **Duration:** 1m 20s
- **Type:** devcore:programmer

**Instruction:**

Add session lifecycle and multi-session tests to the tmux tier integration tests.

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

**Latest report** (final, Apr 2, 01:04:00):**

I don't see any agent work report provided. Could you please share the report you'd like me to summarize?

### agent-015 — impl-full-tests
- **Status:** completed  |  **Duration:** 50s
- **Type:** devcore:programmer

**Instruction:**

Add complete lifecycle and update-task tests to the full tier integration tests.

## Context
Read `context/plan-test-expansion.md` in the session dir for the full spec. You are editing 1 file:

- `test/integration/suites/test-full.sh`

## Dependencies
The assert.sh file will have new helpers added by a parallel agent. You can use these helpers — they're available at test-time since assert.sh is sourced transitively via test-tmux.sh → test-base.sh → assert.sh. Signatures:

- `send_request <json_string>` — sends JSON to daemon socket, prints response JSON to stdout
- `json_field <json_string> <dot.path>` — extracts field from JSON
- `assert_json_ok <name> <json>` — pass if ok:true
- `assert_json_error <name> <json>` — pass if ok:false
- `assert_json_field <name> <json> <field> <expected>` — pass if field equals expected
- `assert_valid_json <name> <string>` — pass if valid JSON
- `TEST_CWD="/tmp/sisyphus-integ-test"` — test working directory
- `setup_test_project` — rm + mkdir test dir
- `cleanup_test_project` — rm test dir
- `extract_session_id <response_json>` — extracts data.sessionId
- `read_session_state <session_id>` — cats state.json from TEST_CWD

## Task: Add test_session_complete_lifecycle() and test_update_task()

### `test_session_complete_lifecycle()`
Full create→complete→verify test:

1. `setup_test_project`, start tmux session, start daemon
2. Create session via protocol: `{type:"start", task:"lifecycle test", cwd:TEST_CWD}`
3. Extract sessionId, assert non-empty
4. `sleep 2` — mock claude exits immediately, session becomes paused
5. Send `{type:"complete", sessionId:..., report:"integration test complete"}`
6. Assert ok
7. `sleep 1`
8. Read state.json → check `status` is `"completed"`
9. Check `completionReport` equals `"integration test complete"`
10. Send `{type:"list", cwd:TEST_CWD}` → assert sessionId still appears in response (completed sessions remain visible)
11. Stop daemon, kill tmux, cleanup

Produces ~5 assertions: create-ok, complete-ok, status-completed, report-stored, in-list-after-complete

### `test_update_task()`
Update task description e2e:

1. `setup_test_project`, start tmux + daemon
2. Create session with task "original task"
3. Extract sessionId
4. `sleep 1`
5. Send `{type:"update-task", sessionId:..., task:"updated task description"}`
6. Assert ok
7. Check goal.md file at `$TEST_CWD/.sisyphus/sessions/$sid/goal.md` contains "updated task description"
8. Kill session, stop daemon, cleanup

Produces ~2 assertions: update-ok, goal-file-updated

### Update `run_full_tests()`
Add both new functions to `run_full_tests()` after the existing tests.

## Important Notes
- Full tier has mock claude (`#!/bin/sh\ntrue`) so orchestrator spawns and exits immediately
- Session will be paused after mock claude exits — `complete` still works on paused sessions
- The `complete` handler in the daemon does full teardown (kills tmux session, updates state). The tmux session may be gone after complete — don't assert on tmux state after completing.
- `update-task` handler overwrites the goal.md file (via `state.updateTask`)
- Always clean up: stop_daemon, kill tmux server, cleanup_test_project
- Use unique tmux session names to avoid conflicts with tmux tier tests (e.g., `complete-test`, `task-test`)
- If session creation fails, skip dependent assertions and clean up (don't leave daemon/tmux running)

**Latest report** (final, Apr 2, 01:03:42):**

Test coverage expanded with lifecycle and update task tests including proper cleanup and dependency failure handling.



---


## Next Prompt

3 agents implementing test expansion. agent-013: assert.sh + base tests, agent-014: tmux session lifecycle tests, agent-015: full tier complete/update-task tests. After all complete, run validation: bash test/integration/run.sh. Fix any failures. See context/plan-test-expansion.md for spec.


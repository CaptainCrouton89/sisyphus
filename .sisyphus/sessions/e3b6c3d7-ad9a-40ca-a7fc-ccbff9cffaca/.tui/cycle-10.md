# Cycle 10

**Status:** running  |  **Duration:** running
**Started:** Apr 2, 01:04:33
**Mode:** implementation
**Claude Session:** 527ee24b-d250-42d2-8f8b-94abbf3555a3


---


## Agents

### agent-016 — impl-assert-base-retry
- **Status:** killed  |  **Duration:** 15s
- **Type:** devcore:programmer
- **Killed reason:** pane closed by user

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


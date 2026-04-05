# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: Expand the integration test assertion library and base tier tests.

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

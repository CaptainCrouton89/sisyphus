#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-015' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-015-plugin" --agent 'devcore:programmer' --session-id "a9ebf865-a4ca-4003-b9e0-babff4e99ff2" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-full-tests-devcore:programmer c9' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-015-system.md')" 'Add complete lifecycle and update-task tests to the full tier integration tests.

## Context
Read `context/plan-test-expansion.md` in the session dir for the full spec. You are editing 1 file:

- `test/integration/suites/test-full.sh`

## Dependencies
The assert.sh file will have new helpers added by a parallel agent. You can use these helpers — they'\''re available at test-time since assert.sh is sourced transitively via test-tmux.sh → test-base.sh → assert.sh. Signatures:

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
- The `complete` handler in the daemon does full teardown (kills tmux session, updates state). The tmux session may be gone after complete — don'\''t assert on tmux state after completing.
- `update-task` handler overwrites the goal.md file (via `state.updateTask`)
- Always clean up: stop_daemon, kill tmux server, cleanup_test_project
- Use unique tmux session names to avoid conflicts with tmux tier tests (e.g., `complete-test`, `task-test`)
- If session creation fails, skip dependent assertions and clean up (don'\''t leave daemon/tmux running)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2428
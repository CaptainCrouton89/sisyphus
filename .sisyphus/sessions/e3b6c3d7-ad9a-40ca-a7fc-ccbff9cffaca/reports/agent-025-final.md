Added 9 adversarial test functions + updated run_tmux_tests() in test/integration/suites/test-tmux.sh (lines 237-508).

## What was done

Added 9 new test functions after the existing test_multi_session function:

1. test_state_corruption (lines ~237-287) — 4 assertions:
   - state-corrupt-status-fails: status request on corrupt state.json returns ok:false
   - state-corrupt-daemon-survives: daemon responsive after corrupt state
   - state-wrong-schema-status-handled: status request on schema-invalid state returns error or partial response
   - state-wrong-schema-daemon-survives: daemon responsive after schema-invalid state

2. test_rollback_invalid (lines ~289-330) — 3 assertions:
   - rollback-nonexistent-cycle: rollback to cycle 999 returns ok:false
   - rollback-cycle-zero: rollback to cycle 0 returns ok:false
   - rollback-invalid-daemon-survives: daemon responsive after invalid rollbacks

3. test_message_to_killed_session (lines ~332-371) — 2 assertions:
   - msg-killed-session-errors: message to killed session returns ok:false
   - msg-killed-daemon-survives: daemon responsive after messaging dead session

4. test_dotted_directory_name (lines ~373-422) — 3 assertions (2 EXPECTED TO FAIL — documents known bug):
   - dotted-dir-tmux-name-matches-stored: FAIL expected — stored name has dots, tmux mangles to underscores
   - dotted-dir-tmux-has-session-by-stored-name: FAIL expected — has-session fails with dotted stored name
   - dotted-dir-daemon-survives: daemon still responsive

5. test_session_name_collision (lines ~424-455) — 2 assertions:
   - collision-daemon-survives-create: daemon survives when ssyph_collision_test pre-exists
   - collision-list-still-works: list request works after potential collision

6. test_external_pane_kill (lines ~457-500) — 4 assertions:
   - pane-kill-session-created: session create ok:true
   - pane-kill-pane-killed-externally: pass/skip depending on whether ssyph_ pane found
   - pane-kill-daemon-survives: daemon alive after pane monitor processes killed pane
   - pane-kill-state-still-valid: state.json is valid JSON after pane kill

7. test_daemon_restart_recovery (lines ~502-545) — 4 assertions:
   - daemon-restart-session-created: initial session create ok:true
   - daemon-restart-session-accessible: status ok:true after daemon stop+restart
   - daemon-restart-state-intact: state.json is valid JSON after restart
   - daemon-restart-state-id-matches: state.json id field matches original SID

8. test_concurrent_messages (lines ~547-596) — 2 assertions:
   - concurrent-msg-all-present: all 10 parallel messages present in state.json
   - concurrent-msg-daemon-survives: daemon alive after concurrent writes

9. test_subdirectory_cwd_isolation (lines ~598-636) — 2 assertions:
   - subdir-isolation-root-has-session: list from project root includes session
   - subdir-isolation-subdir-no-session: list from subdirectory does NOT include session

run_tmux_tests() updated at line ~651 to call all 9 new functions before tmux kill-server.

## Verification
bash -n test/integration/suites/test-tmux.sh — syntax ok

## Flags / Code Smells
- test_dotted_directory_name will emit 2 FAILs on every run by design (documents known tmux dot-mangling bug in tmuxSessionName). No assert_xfail primitive exists in assert.sh. If CI treats any FAIL as a pipeline failure, these will always block. Recommend either adding an assert_known_bug helper or using assert_skip with a comment until the bug is fixed.
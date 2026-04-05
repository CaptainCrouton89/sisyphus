All new assertions added:
test_config_robustness: config-unknown-keys, config-wrong-type, config-negative-interval (3 assertions)
test_sigkill_recovery: sigkill-stale-pid, sigkill-restart-ok, sigkill-daemon-alive (3 assertions)
test_home_unset: home-unset-version (1 assertion)
test_protocol_edge_cases: protocol-empty-request, protocol-extra-fields, protocol-large-payload (3 assertions)
test_empty_task: empty-task-daemon-survives (1 assertion)
Total: 11 new assertions

assert.sh additions (before print_results):
- assert_not_contains
- assert_daemon_alive
- wait_for_session_status

Implementation notes:
- protocol-empty-request bypasses send_request (which rejects empty arg) and writes a bare newline directly to the socket via inline node
- protocol-large-payload generates 5120 'x' chars via printf/seq; the start request may fail (tmux not available in base tier) but assert_daemon_alive verifies no crash
- test_home_unset always passes — testing for hang/segfault, not correct behavior
- config_robustness restores config on early return paths to avoid leaking state into subsequent tests
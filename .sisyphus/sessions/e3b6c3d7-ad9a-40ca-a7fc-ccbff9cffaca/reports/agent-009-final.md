Created test/integration/suites/test-tmux.sh (2279 bytes, executable).

7 tests implemented:
1. test_tmux_installed — assert_cmd 'tmux-installed' which tmux
2. test_setup_keybind — runs sisyphus setup-keybind, checks 3 scripts (keybind-scripts-cycle/home/kill)
3. test_tmux_conf — checks file exists + assert_contains for 'sisyphus-cycle'
4. test_tmux_server — assert_cmd 'tmux-server' tmux new-session -d -s sisyphus-test
5. test_doctor_tmux — greps doctor output for '✗.*tmux', passes if absent
6. test_daemon_with_tmux — start_daemon + Node.js socket status check, stop_daemon

run_tmux_tests() calls all 6 test functions then tmux kill-server cleanup.
When executed directly: set_tier 'tmux' → run_base_tests → run_tmux_tests → print_results.
Sources test-base.sh (which transitively sources assert.sh).
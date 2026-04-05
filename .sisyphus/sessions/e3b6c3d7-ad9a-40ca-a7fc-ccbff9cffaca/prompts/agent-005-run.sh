#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-005-plugin" --agent 'devcore:programmer' --session-id "9fae7f76-01cd-4310-863a-d8dbbb858ea4" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-assert-lib-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-005-system.md')" 'Create the integration test assertion library at test/integration/lib/assert.sh.

Read context/plan-implementation.md §3.2 for the complete specification — function signatures, state variables, source guard, daemon lifecycle helpers, output format.

Key requirements:
- Source guard: `[ -n "${_ASSERT_LOADED:-}" ] && return 0` + `_ASSERT_LOADED=1`
- State: PASS_COUNT, FAIL_COUNT, SKIP_COUNT, RESULTS array, TIER variable
- Functions: set_tier, assert_pass, assert_fail, assert_skip, assert_cmd, assert_file_exists, assert_socket_exists, assert_contains, print_results
- Daemon helpers: start_daemon (background sisyphusd + poll for socket up to 5s), stop_daemon (kill + cleanup socket/pid), run_doctor
- print_results: outputs structured `STATUS|name` lines, summary line, exits non-zero on any FAIL
- assert_cmd: runs command, passes/fails based on exit code, suppresses stdout/stderr

The file must be valid bash, start with `#!/bin/bash`, and work correctly when sourced (not just executed). Create the directory structure as needed.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2399
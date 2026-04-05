#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-026' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-026-plugin" --agent 'devcore:programmer' --session-id "6a7a8151-59f3-4b94-85e8-3dd51e0a2b59" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing full-adversarial-devcore:programmer c12' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-026-system.md')" '## Goal
Add adversarial integration tests to the full tier test suite.

## Session context
We'\''re building a comprehensive integration test suite for sisyphus. Tests run in Docker containers. The full tier has tmux + neovim + claude mock. We already have ~9 full-tier-specific assertions. Now adding adversarial scenarios.

## File to edit
`test/integration/suites/test-full.sh` — add new test functions + update run_full_tests()

Read this file first. Also read `test/integration/lib/assert.sh` for available helpers.

Reference these context files for scenario details:
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-plugins-adversarial.md`
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-tui-adversarial.md`
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/explore-cli-tui-failures.md`

## Available assert.sh helpers

Same as existing test-full.sh uses: start_daemon, stop_daemon, send_request, json_field, assert_json_ok, assert_json_error, assert_cmd, assert_file_exists, assert_contains, setup_test_project, cleanup_test_project, extract_session_id, read_session_state.

Being added by parallel agent: assert_not_contains, assert_daemon_alive.

## What to add

### test_agent_type_resolution (~4 assertions)
Tests that local agent types are discoverable and local shadows global.

```
1. Create a test project dir: /tmp/agent-type-test
2. mkdir -p /tmp/agent-type-test/.claude/agents
3. Create a custom agent type file:
   cat > /tmp/agent-type-test/.claude/agents/custom-test.md << '\''EOF'\''
   ---
   color: red
   ---
   Custom test agent body
   EOF
4. Start daemon (tmux session needed)
5. Use send_request with type "list-agent-types" if that exists, OR
   verify the file is correctly structured by testing that sisyphus spawn --list-types
   works from that directory. Run: cd /tmp/agent-type-test && sisyphus spawn --list-types 2>&1
   Check output contains "custom-test"
6. Test with missing .claude/ dir:
   mkdir /tmp/no-claude-dir
   cd /tmp/no-claude-dir && sisyphus spawn --list-types → should work without crash
7. Clean up
```

Note: Check if `sisyphus spawn --list-types` exists by reading `src/cli/commands/spawn.ts` first.

### test_malformed_frontmatter (~3 assertions)
Tests daemon handles broken agent type files gracefully.

```
1. Create test project with .claude/agents/ dir
2. Create agent file with missing closing ---:
   printf '\''---\nmodel: test-model\nThis is the body without closing frontmatter'\'' \
     > /tmp/fm-test/.claude/agents/broken.md
3. Create agent file with inline YAML array (known parse limitation):
   printf '\''---\nskills: [code-review, testing]\n---\nBody here'\'' \
     > /tmp/fm-test/.claude/agents/array-skills.md
4. Verify listing types doesn'\''t crash: cd /tmp/fm-test && sisyphus spawn --list-types 2>&1
5. If broken types appear with defaults, assert_pass. If they don'\''t appear, also assert_pass
   (either behavior is acceptable as long as no crash)
6. Clean up
```

### test_setup_idempotency (~3 assertions)
Tests that running setup twice preserves existing modifications.

```
1. Start daemon + tmux (setup may need them)
2. Run sisyphus setup (first run)
3. Verify begin.md was created: assert_file_exists
4. Append a marker to begin.md: echo "# CUSTOM MARKER" >> ~/.claude/commands/sisyphus/begin.md
5. Run sisyphus setup again (second run)
6. Check begin.md still contains the marker (not overwritten):
   assert_contains "setup-idempotent-preserves-custom" "$(cat ~/.claude/commands/sisyphus/begin.md)" "CUSTOM MARKER"
7. Clean up
```

### test_tui_graceful_no_tty (~2 assertions)
Tests that TUI fails gracefully when stdin is not a terminal.

```
1. echo "" | sisyphus tui 2>&1; capture exit code
   Non-zero exit is expected. Key check: it exits quickly (within 5s), doesn'\''t hang.
2. sisyphus tui < /dev/null 2>&1; capture exit code
   Same: should exit with error, not hang.
3. For each: if exit code != 0, assert_pass (graceful failure)
   If exit code == 0, that'\''s also fine if it exited quickly.
   The real failure would be a hang (test with timeout).
```

Implementation:
```bash
test_tui_graceful_no_tty() {
  # Test 1: piped stdin
  local exit_code
  timeout 5 bash -c '\''echo "" | sisyphus tui'\'' >/dev/null 2>&1
  exit_code=$?
  if [ "$exit_code" -ne 124 ]; then
    # 124 = timeout killed it (bad — hung), anything else means it exited on its own
    assert_pass "tui-no-tty-pipe"
  else
    assert_fail "tui-no-tty-pipe" "TUI hung with piped stdin"
  fi

  # Test 2: /dev/null stdin
  timeout 5 bash -c '\''sisyphus tui < /dev/null'\'' >/dev/null 2>&1
  exit_code=$?
  if [ "$exit_code" -ne 124 ]; then
    assert_pass "tui-no-tty-devnull"
  else
    assert_fail "tui-no-tty-devnull" "TUI hung with /dev/null stdin"
  fi
}
```

### test_doctor_comprehensive (~4 assertions)
Tests that doctor shows all-green in full tier (tmux running, claude mock, nvim).

```
1. Ensure tmux server running + daemon running
2. Run doctor, capture output
3. assert_not_contains "doctor-no-failures" "$output" '\''✗'\''
   (No fail markers in output)
4. assert_contains "doctor-node-ok" — ✓.*Node
5. assert_contains "doctor-tmux-ok" — ✓.*tmux
6. assert_contains "doctor-claude-ok" — ✓.*Claude
7. assert_contains "doctor-nvim-ok" — ✓.*nvim
8. Stop daemon, clean up tmux
```

### test_permissions_agent_dir (~2 assertions)
Tests that unreadable agent dirs don'\''t crash agent type discovery.

```
1. mkdir -p /tmp/perm-test/.claude/agents
2. Create a valid agent file there
3. chmod 000 /tmp/perm-test/.claude/agents
4. cd /tmp/perm-test && sisyphus spawn --list-types → should not crash
5. chmod 755 /tmp/perm-test/.claude/agents (restore for cleanup)
6. rm -rf /tmp/perm-test
```

## Update run_full_tests()

Add all new test function calls AFTER existing ones:
```bash
run_full_tests() {
  # ... existing calls ...
  test_agent_type_resolution
  test_malformed_frontmatter
  test_setup_idempotency
  test_tui_graceful_no_tty
  test_doctor_comprehensive
  test_permissions_agent_dir
}
```

## Important notes
- `sisyphus spawn --list-types` — verify this flag exists before using it. If it doesn'\''t, find the actual way to list agent types from the CLI, or test resolution through the daemon protocol.
- Check `src/cli/commands/spawn.ts` and `src/daemon/frontmatter.ts` to understand how agent types are resolved and listed.
- In Docker, tests run as root. chmod 000 still prevents reading for root in some configurations — test may need to be adjusted.
- Follow existing code style exactly.
- Each test manages its own daemon/tmux lifecycle.
- Test names must be unique across all tiers.

## Report
When done, list all new assertions added with their names, and note any tests that were adjusted from the plan due to what you found in the codebase.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2467
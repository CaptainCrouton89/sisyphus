#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-007-plugin" --agent 'devcore:programmer' --session-id "6e740a6a-64b8-4557-bb4d-9bf65c5f69e5" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-test-base-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-007-system.md')" '## Session Goal
Build integration tests for sisyphus (sisyphi package) — verifying install, daemon, and doctor in Docker containers.

## Your Task
Create `test/integration/suites/test-base.sh` — the base tier test suite (10 tests).

## Source Chain Convention
The file must:
1. Resolve its own directory via `BASH_SOURCE[0]`
2. Source `../lib/assert.sh` via that resolved path
3. Define individual test functions and a `run_base_tests()` entry point
4. Only run when executed directly (not when sourced by higher tiers):

```bash
#!/bin/bash
_SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SUITE_DIR/../lib/assert.sh"

# ... test functions ...

run_base_tests() { ... }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set_tier "base"
  run_base_tests
  print_results
fi
```

## Assert.sh API (read `test/integration/lib/assert.sh` for full detail)
- `set_tier "name"` — sets tier for labeling
- `assert_pass "name"` / `assert_fail "name" "reason"` / `assert_skip "name" "reason"`
- `assert_cmd "name" cmd args...` — pass/fail based on exit code
- `assert_file_exists "name" "/path"` / `assert_socket_exists "name" "/path"`
- `assert_contains "name" "$haystack" "needle"`
- `start_daemon` / `stop_daemon` — lifecycle helpers (poll for socket, cleanup)
- `run_doctor` — capture doctor output
- `print_results` — emit STATUS|name lines, exit non-zero on FAIL

## Test Functions (10 tests)

### test_install_ok
- `assert_cmd "install-ok" which sisyphus`
- `assert_cmd "install-ok-daemon" which sisyphusd`

### test_node_pty_native
- `assert_cmd "node-pty-native" node -e "require('\''node-pty'\'')"`

### test_cli_version
- `assert_cmd "cli-version" sisyphus --version`

### test_daemon_version
- `assert_cmd "daemon-version" test -x "$(which sisyphusd)"`
- NOTE: sisyphusd has NO --help flag — it starts daemon immediately. Just verify executable exists.

### test_daemon_lifecycle (groups 3 sub-assertions + socket test)
1. Call `start_daemon`. If fails → `assert_fail "daemon-start"`, return early
2. `assert_pass "daemon-start"`
3. `assert_file_exists "daemon-pid" "$HOME/.sisyphus/daemon.pid"`
4. `assert_socket_exists "daemon-socket" "$HOME/.sisyphus/daemon.sock"`
5. Socket communication test — verify daemon responds to status request:
```bash
RESULT=$(node -e "
  const net = require('\''net'\'');
  const s = net.connect(process.env.HOME + '\''/.sisyphus/daemon.sock'\'');
  s.on('\''connect'\'', () => s.write('\''{\"type\":\"status\"}\\n'\''));
  s.on('\''data'\'', d => {
    const r = JSON.parse(d.toString().trim());
    process.stdout.write(r.ok ? '\''OK'\'' : '\''FAIL'\'');
    s.destroy();
  });
  setTimeout(() => { process.stdout.write('\''TIMEOUT'\''); process.exit(1); }, 5000);
")
if [ "$RESULT" = "OK" ]; then assert_pass "daemon-socket-response"; else assert_fail "daemon-socket-response" "$RESULT"; fi
```
6. Call `stop_daemon`

### test_doctor_base
- `DOCTOR_OUTPUT=$(run_doctor)`
- `assert_cmd "doctor-runs" sisyphus doctor` (doctor always exits 0)
- `assert_contains "doctor-node-ok" "$DOCTOR_OUTPUT" "✓"` — grep for checkmark + Node. Use pattern matching: check that output contains a line with ✓ and Node.

### test_postinstall_no_swift
- `assert_pass "postinstall-no-swift"` — unconditional pass (install already succeeded; postinstall has `|| true` for Swift)

## run_base_tests() order
Call test functions in order: test_install_ok, test_node_pty_native, test_cli_version, test_daemon_version, test_daemon_lifecycle, test_doctor_base, test_postinstall_no_swift

## Doctor Symbol Reference
- ok: `✓` (U+2713)
- warn: `!` (exclamation mark)  
- fail: `✗` (U+2717)
Doctor ALWAYS exits 0 — parse stdout, not exit codes.

## Environment
These run inside Docker containers at `/tests/suites/test-base.sh`. Running as root. Home is `/root`.

## Done Condition
- File exists at `test/integration/suites/test-base.sh`
- File is executable (has shebang)
- Defines `run_base_tests()` exported for higher tiers
- All 10 test assertions are implemented
- Standalone execution: `bash test-base.sh` prints structured results'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2408
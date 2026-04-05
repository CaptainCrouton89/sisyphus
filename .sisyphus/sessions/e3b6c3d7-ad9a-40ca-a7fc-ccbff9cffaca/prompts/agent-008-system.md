# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Session Goal
Create integration test suites for the sisyphi package in Docker containers.

## Your Task
Create `test/integration/suites/test-base.sh` — the base tier test suite (10 tests).

### Key Context Files
Read these before implementing:
- `test/integration/lib/assert.sh` — the assertion library you'll source (has assert_cmd, assert_file_exists, assert_socket_exists, assert_contains with grep regex matching, start_daemon, stop_daemon, run_doctor, set_tier, print_results)
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §2 Task 2A and §3.3 for source chain convention, §3.2 for assertion signatures

### Source Chain Convention
```bash
#!/bin/bash
_SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SUITE_DIR/../lib/assert.sh"

# ... test function definitions ...

run_base_tests() { ... }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set_tier "base"
  run_base_tests
  print_results
fi
```

### Tests to implement (10 total)
Define and export `run_base_tests()` calling these test functions:

1. **test_install_ok** — `assert_cmd "install-ok" which sisyphus` + `assert_cmd "install-ok-daemon" which sisyphusd`
   (Actually combine as single test group — plan says "install-ok" checks both binaries)

2. **test_node_pty_native** — `assert_cmd "node-pty-native" node -e "require('node-pty')"`

3. **test_cli_version** — `assert_cmd "cli-version" sisyphus --version`

4. **test_daemon_version** — `assert_cmd "daemon-version" test -x "$(which sisyphusd)"`
   NOTE: sisyphusd has NO `--help` flag (running it with unknown args starts the daemon). Just verify the binary is installed and executable.

5. **test_daemon_lifecycle** — Groups 3 sub-assertions:
   - Call `start_daemon` (from assert.sh), assert pass/fail for "daemon-start"
   - `assert_file_exists "daemon-pid" "$HOME/.sisyphus/daemon.pid"`
   - `assert_socket_exists "daemon-socket" "$HOME/.sisyphus/daemon.sock"`
   - Socket communication test via Node.js:
     ```bash
     RESULT=$(node -e "
       const net = require('net');
       const s = net.connect(process.env.HOME + '/.sisyphus/daemon.sock');
       s.on('connect', () => s.write('{\"type\":\"status\"}\\n'));
       s.on('data', d => {
         const r = JSON.parse(d.toString().trim());
         process.stdout.write(r.ok ? 'OK' : 'FAIL');
         s.destroy();
       });
       setTimeout(() => { process.stdout.write('TIMEOUT'); process.exit(1); }, 5000);
     ")
     ```
     Check RESULT equals "OK" → `assert_pass "daemon-socket-response"` / `assert_fail`
   - Call `stop_daemon` at the end

6. **test_doctor_base** — Groups doctor-related tests:
   - `DOCTOR_OUTPUT=$(run_doctor)` — capture doctor output
   - `assert_cmd "doctor-runs" sisyphus doctor` — exits 0 (doctor ALWAYS exits 0)
   - `assert_contains "doctor-node-ok" "$DOCTOR_OUTPUT" '✓.*Node'` — note: assert_contains uses grep regex

7. **test_postinstall_no_swift** — `assert_pass "postinstall-no-swift"` unconditionally (install already succeeded if we got here, and postinstall has `|| true` for Swift)

### Important Notes
- Doctor symbols: ok=`✓` (U+2713), warn=`!`, fail=`✗` (U+2717). NOT `⚠` for warn.
- Doctor ALWAYS exits 0 — parse stdout for check results
- Daemon has no auto-start on Linux — must explicitly call `start_daemon`/`stop_daemon`
- Container runs as root, so `~` = `/root`
- `assert_contains` uses grep regex (not literal matching)
- `run_base_tests()` must be callable by higher-tier suites that source this file

### Done Condition
- File exists at `test/integration/suites/test-base.sh`
- Executable (`chmod +x` or has shebang)
- 10 test assertions total across the functions
- Sources assert.sh correctly via BASH_SOURCE path resolution
- Defines `run_base_tests()` that calls all test functions
- Only runs when executed directly (not when sourced)

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

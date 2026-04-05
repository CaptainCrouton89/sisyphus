# Integration Test Implementation Plan

## 1. File Inventory

| # | File | Description |
|---|------|-------------|
| 1 | `test/integration/Dockerfile` | Multi-stage Docker image: base → tmux → full |
| 2 | `test/integration/lib/assert.sh` | Assertion helpers, daemon lifecycle utilities, result collection |
| 3 | `test/integration/suites/test-base.sh` | Base tier: install, native modules, daemon headless, doctor basics |
| 4 | `test/integration/suites/test-tmux.sh` | Tmux tier: keybinds, scripts, tmux.conf, daemon+tmux coexistence |
| 5 | `test/integration/suites/test-full.sh` | Full tier: nvim, claude mock, setup, status bar, list |
| 6 | `test/integration/run.sh` | Harness: pack → stage context → build → test → matrix report |
| 7 | `.github/workflows/integration-tests.yml` | GHA: Linux Docker job + macOS native job |

All paths relative to project root (`/Users/silasrhyneer/Code/claude-tools/sisyphus`).

---

## 2. Task Breakdown

### Wave 1: Foundation (parallel, no dependencies)

#### Task 1A: Assertion Library
- **File**: `test/integration/lib/assert.sh`
- **Context needed**: Design doc §Assertion Library for function signatures
- **Acceptance criteria**:
  - Sourcing the file sets up `PASS_COUNT`, `FAIL_COUNT`, `SKIP_COUNT`, `RESULTS` array
  - `assert_cmd "name" cmd args...` records PASS/FAIL based on exit code
  - `assert_file_exists`, `assert_socket_exists`, `assert_contains` work correctly
  - `start_daemon` / `stop_daemon` handle daemon lifecycle with socket wait loop
  - `print_results` outputs structured `STATUS|name` lines and exits non-zero on any failure
  - Guard variable (`_ASSERT_LOADED`) prevents double-sourcing

#### Task 1B: Dockerfile
- **File**: `test/integration/Dockerfile`
- **Context needed**: Design doc §Dockerfile Design, `explore-nodepty-docker.md` (confirms `node:22` needs no extra build deps)
- **Acceptance criteria**:
  - Three stages: `base`, `tmux`, `full` (each `FROM` previous)
  - `docker build --target base` / `tmux` / `full` all succeed
  - Base image installs sisyphi from tarball via `npm install -g`
  - Config pre-seeded with `{"autoUpdate":false}`
  - Test files copied to `/tests/`
  - Full stage has working `claude` mock and `nvim`

### Wave 2: Test Suites (parallel, depend on Wave 1 conventions)

All three suites can be written in parallel because the inter-file sourcing convention and function names are specified below in §3.3.

#### Task 2A: Base Tier Tests
- **File**: `test/integration/suites/test-base.sh`
- **Context needed**: Design doc §Test Cases (base), `explore-daemon-headless.md` §4 (smoke test), `explore-doctor-matrix.md` (doctor symbols)
- **Acceptance criteria**:
  - Defines and exports `run_base_tests()` calling 10 test functions
  - Daemon tests start daemon, verify socket response `{"ok":true}`, then clean up
  - Doctor tests parse output using correct symbols: `✓` (ok), `!` (warn), `✗` (fail)
  - Runs standalone: `bash test-base.sh` prints results and exits 0 on success

#### Task 2B: Tmux Tier Tests
- **File**: `test/integration/suites/test-tmux.sh`
- **Context needed**: Design doc §Test Cases (tmux), `explore-doctor-matrix.md` §Notes 2 (tmux warn/ok)
- **Acceptance criteria**:
  - Sources `test-base.sh` for base test functions
  - Defines `run_tmux_tests()` with 7 test functions
  - Starts tmux server before doctor tests (to get `✓` instead of `!`)
  - `run_base_tests()` + `run_tmux_tests()` both called when executed directly
  - Cleans up tmux server after tests

#### Task 2C: Full Tier Tests
- **File**: `test/integration/suites/test-full.sh`
- **Context needed**: Design doc §Test Cases (full), `explore-doctor-matrix.md` (claude mock requirements)
- **Acceptance criteria**:
  - Sources `test-tmux.sh` (which sources `test-base.sh`)
  - Defines `run_full_tests()` with 8+ test functions
  - `status-bar-write` test starts tmux + daemon, reads `@sisyphus_status`
  - `setup-begin-cmd` checks `~/.claude/commands/sisyphus/begin.md` exists after setup
  - `list-empty` verifies `sisyphus list` exits 0 with no sessions

### Wave 3: Orchestration (parallel, depend on Waves 1-2)

#### Task 3A: Harness Script
- **File**: `test/integration/run.sh`
- **Context needed**: Design doc §Harness Script, §Expected Matrix Output
- **Acceptance criteria**:
  - `bash test/integration/run.sh` from project root runs full suite
  - Creates temp staging directory (tarball + Dockerfile + test files) for small Docker context
  - Builds all three Docker targets
  - Runs each tier, captures structured output
  - Prints per-tier results and consolidated matrix
  - Exits 0 if all tiers pass, 1 if any fail
  - Cleans up tarball and staging dir on exit (trap)

#### Task 3B: GHA Workflow
- **File**: `.github/workflows/integration-tests.yml`
- **Context needed**: Design doc §GHA Workflow
- **Acceptance criteria**:
  - Triggers on push and pull_request
  - `linux-docker` job: checkout → setup-node 22 → npm ci → npm run build → bash test/integration/run.sh
  - `macos` job: checkout → setup-node 22 → npm ci → npm run build → npm pack → npm install -g → Swift build → verify .app → doctor
  - Both jobs use `ubuntu-latest` / `macos-latest` respectively

---

## 3. Key Implementation Details

### 3.1 Dockerfile (`test/integration/Dockerfile`)

```dockerfile
# === BASE: Node.js + sisyphi installed globally ===
FROM node:22 AS base

# Pre-seed config to prevent npm registry hits during tests
RUN mkdir -p /root/.sisyphus \
    && echo '{"autoUpdate":false}' > /root/.sisyphus/config.json

# Copy tarball and install globally
# Tarball is staged into context by run.sh, named sisyphi-*.tgz
COPY sisyphi-*.tgz /tmp/
RUN npm install -g /tmp/sisyphi-*.tgz

# Copy test infrastructure
COPY lib/ /tests/lib/
COPY suites/ /tests/suites/
RUN chmod +x /tests/suites/*.sh

# === TMUX: extends base with tmux ===
FROM base AS tmux
RUN apt-get update && apt-get install -y --no-install-recommends tmux \
    && rm -rf /var/lib/apt/lists/*

# === FULL: extends tmux with neovim + claude mock ===
FROM tmux AS full
RUN apt-get update && apt-get install -y --no-install-recommends neovim \
    && rm -rf /var/lib/apt/lists/*
# Minimal claude mock — doctor only checks `which claude` (doctor.ts:26)
RUN printf '#!/bin/sh\ntrue\n' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude
```

**Key decisions**:
- `node:22` (not slim/alpine): includes python3, make, g++ — no extra packages needed for node-pty compilation (see `explore-nodepty-docker.md`)
- Alpine is NOT viable (`-lutil` link fails with musl)
- `--no-install-recommends` keeps image small
- Config pre-seeding before install prevents auto-update during postinstall
- Docker runs as root, so `~` = `/root`

### 3.2 Assertion Library (`test/integration/lib/assert.sh`)

**Source guard** (prevents double-sourcing when test suites chain-source):
```bash
[ -n "${_ASSERT_LOADED:-}" ] && return 0
_ASSERT_LOADED=1
```

**State variables**:
```bash
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
RESULTS=()
TIER=""
```

**Core functions**:

| Function | Signature | Behavior |
|----------|-----------|----------|
| `set_tier` | `set_tier "name"` | Sets `TIER` for result labeling |
| `assert_pass` | `assert_pass "test-name"` | Increments PASS, appends `PASS\|name` to RESULTS |
| `assert_fail` | `assert_fail "test-name" "reason"` | Increments FAIL, appends `FAIL\|name\|reason` |
| `assert_skip` | `assert_skip "test-name" "reason"` | Increments SKIP, appends `SKIP\|name\|reason` |
| `assert_cmd` | `assert_cmd "test-name" cmd args...` | Runs command, calls pass/fail based on exit code |
| `assert_file_exists` | `assert_file_exists "test-name" "/path"` | `[ -f path ]` → pass/fail |
| `assert_socket_exists` | `assert_socket_exists "test-name" "/path"` | `[ -S path ]` → pass/fail |
| `assert_contains` | `assert_contains "test-name" "$text" "pattern"` | `echo "$text" \| grep -q "pattern"` → pass/fail |
| `print_results` | `print_results` | Prints all RESULTS lines, summary, exits non-zero if any FAIL |

**Daemon lifecycle helpers** (in assert.sh, shared across tiers):

```bash
DAEMON_PID=""

start_daemon() {
  # Start daemon in background
  sisyphusd &
  DAEMON_PID=$!
  # Poll for socket (up to 5 seconds)
  local attempts=50
  while [ $attempts -gt 0 ]; do
    [ -S "$HOME/.sisyphus/daemon.sock" ] && return 0
    sleep 0.1
    attempts=$((attempts - 1))
  done
  return 1
}

stop_daemon() {
  if [ -n "$DAEMON_PID" ]; then
    kill "$DAEMON_PID" 2>/dev/null
    wait "$DAEMON_PID" 2>/dev/null || true
    DAEMON_PID=""
  fi
  rm -f "$HOME/.sisyphus/daemon.sock" "$HOME/.sisyphus/daemon.pid"
}

# Capture doctor output (shared helper)
run_doctor() {
  sisyphus doctor 2>&1
}
```

**Output format** (structured lines for harness parsing):
```
PASS|install-ok
PASS|node-pty-native
FAIL|daemon-start|socket not created within 5s
---
TOTAL: 10 | PASS: 9 | FAIL: 1 | SKIP: 0
```

**Exit code**: `print_results` returns 0 if `FAIL_COUNT == 0`, non-zero otherwise.

### 3.3 Test Suites

#### Source chain convention

Each test suite:
1. Resolves its own directory via `BASH_SOURCE[0]` (not `$0` — critical for correct path when sourced)
2. Sources the assertion library via resolved path
3. Defines test functions and a `run_<tier>_tests()` entry point
4. Only runs when executed directly (not when sourced):

```bash
_SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_SUITE_DIR/../lib/assert.sh"

# ... test function definitions ...

run_<tier>_tests() { ... }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set_tier "<tier>"
  run_<tier>_tests  # and lower-tier tests
  print_results
fi
```

Higher tiers source lower tiers:
- `test-tmux.sh` sources `test-base.sh` → gets `run_base_tests()`
- `test-full.sh` sources `test-tmux.sh` → gets `run_base_tests()` + `run_tmux_tests()`

#### Base Tier (`test-base.sh`) — 10 tests

| Test Name | Function | Implementation |
|-----------|----------|---------------|
| `install-ok` | `test_install_ok` | `assert_cmd "install-ok" which sisyphus` and check `which sisyphusd` |
| `node-pty-native` | `test_node_pty_native` | `assert_cmd "node-pty-native" node -e "require('node-pty')"` |
| `cli-version` | `test_cli_version` | `assert_cmd "cli-version" sisyphus --version` |
| `daemon-version` | `test_daemon_version` | `assert_cmd "daemon-version" test -x "$(which sisyphusd)"` — NOTE: sisyphusd has no `--help` flag, just check binary is executable |
| `daemon-start` | `test_daemon_lifecycle` | Call `start_daemon`, assert pass/fail |
| `daemon-pid` | (within `test_daemon_lifecycle`) | `assert_file_exists "daemon-pid" "$HOME/.sisyphus/daemon.pid"` |
| `daemon-socket` | (within `test_daemon_lifecycle`) | `assert_socket_exists "daemon-socket" "$HOME/.sisyphus/daemon.sock"` |
| `doctor-runs` | `test_doctor_base` | `sisyphus doctor` exits 0 (doctor ALWAYS exits 0 — see `explore-doctor-matrix.md` §Exit Code) |
| `doctor-node-ok` | (within `test_doctor_base`) | `assert_contains "doctor-node-ok" "$DOCTOR_OUTPUT" '✓.*Node'` |
| `postinstall-no-swift` | `test_postinstall_no_swift` | Assert pass unconditionally — install already succeeded (postinstall has `\|\| true` for Swift) |

**Daemon lifecycle grouping**: `test_daemon_lifecycle` starts daemon, runs 3 sub-assertions (daemon-start, daemon-pid, daemon-socket), then tests socket communication with a raw `status` request via Node.js, then calls `stop_daemon`.

**Socket communication test** (within `test_daemon_lifecycle`):
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
Expected: `OK` (daemon returns `{ok:true, data:{message:'daemon running'}}` — see `explore-daemon-headless.md` §4).

**Doctor symbol correction**: The design doc says warn = `⚠` (U+26A0). This is WRONG. Actual symbols from `doctor.ts:251`:
- ok: `✓` (U+2713)
- warn: `!` (exclamation mark)
- fail: `✗` (U+2717)

All test suites must grep for `!` not `⚠` when checking warn status.

#### Tmux Tier (`test-tmux.sh`) — 7 additional tests

Sources `test-base.sh`. When executed directly: `run_base_tests()` then `run_tmux_tests()`.

| Test Name | Function | Implementation |
|-----------|----------|---------------|
| `tmux-installed` | `test_tmux_installed` | `assert_cmd "tmux-installed" which tmux` |
| `setup-keybind` | `test_setup_keybind` | Run `sisyphus setup-keybind`, check `~/.sisyphus/bin/sisyphus-cycle` exists + executable |
| `keybind-scripts` | (within `test_setup_keybind`) | Check all 3 scripts in `~/.sisyphus/bin/`: `sisyphus-cycle`, `sisyphus-home`, `sisyphus-kill-pane` |
| `tmux-conf` | `test_tmux_conf` | `assert_file_exists` + `grep -q sisyphus-cycle ~/.sisyphus/tmux.conf` |
| `tmux-server` | `test_tmux_server` | `tmux new-session -d -s sisyphus-test` exits 0 |
| `doctor-tmux-ok` | `test_doctor_tmux` | Start tmux server first, run doctor, assert NOT `✗.*tmux` (tmux check is NOT fail) |
| `daemon-with-tmux` | `test_daemon_with_tmux` | Start daemon + tmux, verify daemon status still works via socket |

**Tmux server management**: Start a detached tmux session before doctor/daemon tests that benefit from it. Clean up after all tests:
```bash
tmux kill-server 2>/dev/null || true
```

**setup-keybind prerequisite**: The daemon is NOT needed for `sisyphus setup-keybind` — it's a CLI-only operation that writes files to `~/.sisyphus/bin/` and `~/.sisyphus/tmux.conf`. No socket connection required.

**doctor-tmux-ok logic**: With tmux installed AND a server running, doctor should show `✓.*tmux` (ok). Without a server, it shows `!.*tmux` (warn). Both are acceptable ("≥ warn"). Test asserts tmux line does NOT contain `✗`:
```bash
if echo "$DOCTOR_OUTPUT" | grep -q '✗.*tmux'; then
  assert_fail "doctor-tmux-ok" "tmux check shows fail"
else
  assert_pass "doctor-tmux-ok"
fi
```

#### Full Tier (`test-full.sh`) — 8+ additional tests

Sources `test-tmux.sh`. When executed directly: `run_base_tests()` → `run_tmux_tests()` → `run_full_tests()`.

| Test Name | Function | Implementation |
|-----------|----------|---------------|
| `nvim-installed` | `test_nvim_installed` | `assert_cmd "nvim-installed" which nvim` |
| `claude-mock` | `test_claude_mock` | `assert_cmd "claude-mock" which claude` |
| `doctor-claude-ok` | `test_doctor_full` | `assert_contains "doctor-claude-ok" "$DOCTOR_OUTPUT" '✓.*Claude'` |
| `doctor-nvim-ok` | (within `test_doctor_full`) | `assert_contains "doctor-nvim-ok" "$DOCTOR_OUTPUT" '✓.*nvim'` |
| `full-setup` | `test_full_setup` | `sisyphus setup` exits 0 (may fail on daemon install since no launchd — catch and skip daemon part, verify keybinds) |
| `setup-begin-cmd` | (within `test_full_setup`) | `assert_file_exists "setup-begin-cmd" "$HOME/.claude/commands/sisyphus/begin.md"` |
| `status-bar-write` | `test_status_bar` | Start tmux server + daemon, wait, `tmux show-option -gv @sisyphus_status` returns non-empty |
| `list-empty` | `test_list_empty` | Start daemon, `sisyphus list` exits 0, no crash |

**`full-setup` complexity**: `sisyphus setup` calls `ensureDaemonInstalled()` which on Linux checks for PID file (no launchd). This may error. Two approaches:
1. Start daemon manually before running setup (so the daemon-running check succeeds)
2. Accept that setup partially fails but verify the parts that should succeed (keybinds, begin command)

**Recommended approach**: Start daemon first, then run `sisyphus setup`. Even if setup prints warnings for Linux-specific items, the key artifacts (keybinds, begin.md) should be created. Check `setup`'s exit code AND the artifacts independently.

**`status-bar-write`**: The daemon calls `writeStatusBar()` on startup (via `status-bar.ts`), which runs `tmux set-option -g @sisyphus_status <value>`. This requires a running tmux server. Sequence:
1. `tmux new-session -d -s test`
2. `start_daemon`
3. `sleep 2` (wait for initial status bar write — happens on startup + every 5s poll)
4. `tmux show-option -gv @sisyphus_status` → check non-empty output

**`list-empty`**: Requires daemon running. `sisyphus list` sends `{type:"list"}` to daemon. With no sessions, returns `{ok:true, data:{sessions:[]}}`. CLI prints empty table and exits 0.

### 3.4 Harness Script (`test/integration/run.sh`)

```bash
#!/bin/bash
set -euo pipefail
```

**Step 1: Pack**
```bash
TARBALL=$(npm pack 2>/dev/null | tail -1)
# Result: sisyphi-X.Y.Z.tgz in project root
trap "rm -f '$TARBALL'" EXIT
```

**Step 2: Stage Docker context** (avoids sending node_modules/src/.git as build context)
```bash
STAGE_DIR=$(mktemp -d)
trap "rm -rf '$STAGE_DIR' '$TARBALL'" EXIT

cp "$TARBALL" "$STAGE_DIR/"
cp test/integration/Dockerfile "$STAGE_DIR/"
cp -r test/integration/lib "$STAGE_DIR/lib"
cp -r test/integration/suites "$STAGE_DIR/suites"
```

**Step 3: Build all three targets** (sequential — shared layer cache)
```bash
for target in base tmux full; do
  docker build --target "$target" -t "sisyphus-test:$target" "$STAGE_DIR"
done
```

**Step 4: Run tests per tier** (sequential — capture results)
```bash
RESULTS_DIR=$(mktemp -d)
OVERALL_EXIT=0

for tier in base tmux full; do
  echo "=== Testing tier: $tier ==="
  if docker run --rm "sisyphus-test:$tier" bash /tests/suites/test-$tier.sh > "$RESULTS_DIR/$tier.txt" 2>&1; then
    echo "  ✓ $tier: all passed"
  else
    echo "  ✗ $tier: failures detected"
    OVERALL_EXIT=1
  fi
done
```

**Step 5: Print matrix**
```bash
print_matrix() {
  # Read all result files, build consolidated table
  # Parse PASS|name, FAIL|name|reason, SKIP|name|reason lines
  # Display as:
  #   Test                    base    tmux    full
  #   ─────────────────────────────────────────────
  #   install-ok              PASS    PASS    PASS
  #   tmux-installed          ----    PASS    PASS
  #   ...
}
```

The matrix builder:
1. Collects all unique test names across all result files
2. For each test name, checks each tier's result file for status
3. Shows `----` if the test name is not present in that tier's results
4. Prints summary totals per tier

**Exit code**: `exit $OVERALL_EXIT` (0 if all tiers pass, 1 if any fail).

### 3.5 GHA Workflow (`.github/workflows/integration-tests.yml`)

```yaml
name: Integration Tests
on:
  push:
    branches: [main]
  pull_request:

jobs:
  linux-docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: bash test/integration/run.sh

  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: npm pack
      - name: Install globally
        run: npm install -g sisyphi-*.tgz
      - name: Swift notification build
        run: bash native/build-notify.sh
      - name: Verify notification app
        run: test -d ~/.sisyphus/SisyphusNotify.app
      - name: Doctor
        run: sisyphus doctor
```

**macOS job notes**:
- No Docker — tests run natively
- Swift build requires Xcode Command Line Tools (available on `macos-latest`)
- The launchd plist test from the design doc is problematic in GHA (no LaunchAgents in CI). Consider: run `sisyphus setup` and check artifacts, or skip plist test. The design doc's approach (`sisyphus doctor || true` then check plist) may not work because `ensureDaemonInstalled()` requires a running launchd session.
- Doctor runs at the end as a smoke test — may show warnings for missing tmux, but should exit 0

---

## 4. Implementation Concerns

### 4.1 Daemon Lifecycle in Containers

**No auto-start on Linux.** The CLI does NOT auto-start the daemon on non-macOS (see `explore-daemon-headless.md` §5). Every test that needs the daemon must explicitly call `start_daemon` and `stop_daemon`.

**Socket wait race**: Daemon socket appears asynchronously after `sisyphusd &`. The `start_daemon` helper polls 50 times at 100ms intervals (5s total). This should be sufficient — the daemon typically creates the socket within 200ms.

**Cleanup between tests**: If a test starts the daemon, it MUST stop it before the next test that starts a daemon. Otherwise `acquirePidLock()` will fail or the socket will be stale. The `stop_daemon` function handles: kill process, wait for exit, remove socket + PID file.

**Container exit cleanup**: No special cleanup needed — containers are `--rm` so everything is discarded.

### 4.2 Doctor Output Parsing

**Correction from design doc**: The warn symbol is `!` (exclamation mark), NOT `⚠` (U+26A0). Source: `src/cli/commands/doctor.ts:251`:
```typescript
const SYMBOLS = { ok: '\u2713', warn: '!', fail: '\u2717' } as const;
```

**Doctor always exits 0** — it has no `process.exit()` call (see `explore-doctor-matrix.md` §Exit Code). Tests must parse stdout, not rely on exit codes, to verify individual check results.

**Output format**: `  ${symbol} ${check.name}: ${detail}` (two-space indent). Parse with:
```bash
grep '✓.*Node'   # ok check
grep '!.*tmux'   # warn check
grep '✗.*Claude' # fail check
```

**UTF-8 in containers**: `node:22` uses Debian with UTF-8 locale. The checkmark (✓, U+2713) and X mark (✗, U+2717) should render correctly. If grep fails to match, try `grep -P '\x{2713}'` or use `LC_ALL=C.UTF-8`.

### 4.3 Tarball Path Handling

**npm pack output**: `npm pack` writes the tarball to CWD and prints the filename to stdout (e.g., `sisyphi-1.1.16.tgz`). The last line of output is the filename.

**Staging approach**: The harness copies the tarball into a clean staging directory alongside the Dockerfile and test files. This avoids sending the full project tree (node_modules, .git, src, etc.) as Docker build context. Expected context size: ~5MB vs ~500MB+.

**Glob in Dockerfile**: `COPY sisyphi-*.tgz /tmp/` matches the tarball regardless of version number. Only one tarball should be present in the staging directory.

**Cleanup**: The harness's trap removes both the tarball (from project root) and the staging directory on exit.

### 4.4 Tmux Server Management Inside Containers

**Starting**: `tmux new-session -d -s <name>` creates a detached session (and implicitly starts the tmux server). No TTY required.

**Multiple sessions**: Tests can create additional sessions as needed. Each test should use a unique session name to avoid conflicts.

**Cleanup**: `tmux kill-server 2>/dev/null || true` stops all sessions and the server. Call this before starting a new set of tests that need a clean tmux state.

**tmux version**: `node:22` + `apt-get install tmux` on Debian Bookworm installs tmux 3.3a, which is >= 3.2 (the minimum version the doctor checks for). The tmux version check should show `✓`.

### 4.5 Race Conditions in Daemon Startup Tests

**Primary risk**: The daemon socket test reads the socket immediately after `start_daemon` returns. If the daemon is still initializing (loading config, recovering sessions), the status response might differ from expected.

**Mitigation**: The socket poll in `start_daemon` waits for the socket file to exist. By the time `net.connect()` succeeds, the daemon is listening and can respond to `status` requests. The `status` handler at `server.ts:149` is synchronous — no async setup needed.

**Secondary risk**: `writeStatusBar()` runs `tmux set-option` which requires tmux. If tmux isn't running, this silently fails (try/catch in status-bar.ts). For the `status-bar-write` test, ensure tmux server is started BEFORE the daemon.

### 4.6 `sisyphus setup` on Linux

`setup.ts` calls three functions in sequence:
1. `runOnboarding()` — checks/installs tmux, terminal, nvim, `/begin` command
2. `ensureDaemonInstalled()` — on Linux, just checks if daemon is running (PID file)
3. `setupTmuxKeybind()` — writes scripts and tmux.conf

On Linux in Docker:
- Step 1: tmux is installed (tmux/full tiers), nvim check may warn, `/begin` command is created
- Step 2: If daemon is already running (started manually), this succeeds. If not, it logs a warning but does NOT crash (falls back to `isInstalled()` check)
- Step 3: Writes keybind scripts + tmux.conf

**Strategy**: Start the daemon before running `sisyphus setup`. This makes step 2 pass cleanly. Then verify artifacts from all three steps.

### 4.7 `sisyphusd` Has No `--help` Flag

The daemon binary (`dist/daemon.js`) starts the daemon immediately when executed — it has no argument parser, no `--help`, no `--version`. Running `sisyphusd --help` would actually start a daemon instance.

The design doc test `daemon-version` (`sisyphusd --help` exits 0) won't work as intended. Replace with: `test -x "$(which sisyphusd)"` to verify the binary is installed and executable. The daemon's actual functionality is validated by `daemon-start` / `daemon-socket` tests.

### 4.8 `node:22` Image Contents

The `node:22` image (Debian Bookworm-based, via `buildpack-deps`) includes:
- Node.js 22, npm
- python3, make, g++ (sufficient for node-pty node-gyp build)
- git (so `doctor` git check will show `✓`)
- UTF-8 locale support

No additional `apt-get install` needed in the base stage. This is confirmed in `explore-nodepty-docker.md`.

### 4.9 GHA macOS Launchd Limitation

GHA macOS runners have limited launchd support. The design doc's launchd plist test (`test -f ~/Library/LaunchAgents/com.sisyphus.daemon.plist`) depends on `sisyphus setup` or `sisyphus doctor` triggering daemon installation. In CI, this may not work because:
- The GHA runner's launchd may not accept `launchctl load` for the CI user
- The plist generation and loading paths assume a full macOS desktop session

**Recommendation**: On macOS CI, test Swift build + doctor smoke test. Skip the launchd plist assertion or wrap it in a conditional that gracefully handles failure.

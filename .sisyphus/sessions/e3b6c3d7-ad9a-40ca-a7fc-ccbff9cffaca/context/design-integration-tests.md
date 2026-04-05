# Integration Test Architecture Design

## Overview

Docker-based Linux integration tests with a layered multi-stage Dockerfile. Each tier extends the previous, tests run inside containers against a locally-packed tarball. A shell harness orchestrates build → test → report. A separate GHA workflow covers macOS-specific paths.

## Docker Tier Architecture

Single Dockerfile with multi-stage targets. Each stage extends the previous:

```
base → tmux → full
```

Three tiers (not five — nvim and claude-mock don't warrant separate images; they're cheap additions rolled into `full`):

### Tier: `base`
- **Image**: `node:22` (includes python3, make, g++ — no extra apt needed)
- **Purpose**: Verify installation, native module compilation, daemon starts headless
- **Installs**: `npm install -g /tmp/sisyphi-*.tgz`

### Tier: `tmux`  
- **Image**: FROM base + `apt-get install -y tmux`
- **Purpose**: Test tmux-dependent features — keybind setup, tmux.conf generation, cycle/home/kill-pane scripts

### Tier: `full`
- **Image**: FROM tmux + neovim + claude mock (`#!/bin/sh\ntrue` at `/usr/local/bin/claude`)
- **Purpose**: Full setup end-to-end, all doctor checks pass/warn as expected, dashboard can open

## Test Structure

```
test/
  integration/
    Dockerfile              # Multi-stage: base, tmux, full
    run.sh                  # Harness: pack → build → test → report matrix
    suites/
      test-base.sh          # Tests for base tier
      test-tmux.sh          # Tests for tmux tier  
      test-full.sh          # Tests for full tier
    lib/
      assert.sh             # Test assertion helpers (pass/fail/skip tracking)
```

## Test Cases by Tier

### base tier

| Test | What it verifies | How |
|------|-----------------|-----|
| install-ok | `npm install -g` succeeded | `which sisyphus && which sisyphusd` |
| node-pty-native | Native module compiled | `node -e "require('node-pty')"` |
| cli-version | CLI binary works | `sisyphus --version` exits 0 |
| daemon-version | Daemon binary works | `sisyphusd --help` exits 0 |
| daemon-start | Daemon starts headless (no tmux) | Start daemon, wait for socket, send `{"type":"status"}\n`, expect `{"ok":true,...}` |
| daemon-pid | PID file created | `test -f ~/.sisyphus/daemon.pid` |
| daemon-socket | Socket created | `test -S ~/.sisyphus/daemon.sock` |
| doctor-runs | Doctor doesn't crash | `sisyphus doctor` exits 0 |
| doctor-node-ok | Node check passes | Parse doctor output for `✓.*Node` |
| postinstall-no-swift | postinstall succeeds without swiftc | Install completes (no Swift on Linux) |

### tmux tier (extends base)

| Test | What it verifies | How |
|------|-----------------|-----|
| tmux-installed | tmux available | `which tmux` |
| setup-keybind | Keybind setup works | `sisyphus setup-keybind` then check `~/.sisyphus/bin/sisyphus-cycle` exists + executable |
| keybind-scripts | All 3 scripts installed | Check cycle, home, kill-pane in `~/.sisyphus/bin/` |
| tmux-conf | sisyphus tmux.conf created | `test -f ~/.sisyphus/tmux.conf` + grep for `sisyphus-cycle` |
| tmux-server | tmux server starts | `tmux new-session -d -s test` succeeds |
| doctor-tmux-ok | Doctor tmux check improves | Parse for tmux status ≥ warn (installed) |
| daemon-with-tmux | Daemon + tmux coexist | Start both, verify daemon status still works |

### full tier (extends tmux)

| Test | What it verifies | How |
|------|-----------------|-----|
| nvim-installed | nvim available | `which nvim` |
| claude-mock | Mock claude on PATH | `which claude` |
| doctor-claude-ok | Doctor claude check passes | Parse doctor output for `✓.*Claude` |
| doctor-nvim-ok | Doctor nvim check passes | Parse doctor output for `✓.*nvim` |
| full-setup | `sisyphus setup` completes | Run setup, check exit code + all artifacts |
| setup-begin-cmd | /begin command installed | `test -f ~/.claude/commands/sisyphus/begin.md` |
| setup-daemon-started | Daemon running after setup | Check socket exists post-setup |
| setup-tmux-conf | Keybinds configured after setup | Check scripts + tmux.conf exist |
| status-bar-write | Daemon writes @sisyphus_status | Start daemon, wait, `tmux show-option -gv @sisyphus_status` returns something |
| dashboard-opens | Dashboard TUI launches | In tmux: `sisyphus dashboard &`, check process started (may need timeout-based approach) |
| list-empty | `sisyphus list` works with no sessions | Exits 0, no crash |
| config-respected | Config file loaded | Write `~/.sisyphus/config.json` with `autoUpdate: false`, start daemon, verify no update check |

## Assertion Library (`lib/assert.sh`)

Minimal bash test framework:

```bash
PASS_COUNT=0; FAIL_COUNT=0; SKIP_COUNT=0; RESULTS=()

assert_pass() {  # name
  PASS_COUNT=$((PASS_COUNT + 1))
  RESULTS+=("PASS|$1")
}

assert_fail() {  # name reason
  FAIL_COUNT=$((FAIL_COUNT + 1))  
  RESULTS+=("FAIL|$1|$2")
}

assert_skip() {  # name reason
  SKIP_COUNT=$((SKIP_COUNT + 1))
  RESULTS+=("SKIP|$1|$2")
}

# Run a test: assert_cmd "test-name" command args...
assert_cmd() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    assert_pass "$name"
  else
    assert_fail "$name" "command failed: $*"
  fi
}

print_results() {
  # Print structured results for harness to collect
  for r in "${RESULTS[@]}"; do echo "$r"; done
  echo "---"
  echo "TOTAL: $((PASS_COUNT + FAIL_COUNT + SKIP_COUNT)) | PASS: $PASS_COUNT | FAIL: $FAIL_COUNT | SKIP: $SKIP_COUNT"
  [ "$FAIL_COUNT" -eq 0 ]  # exit code reflects pass/fail
}
```

## Harness Script (`run.sh`)

```bash
#!/bin/bash
set -euo pipefail

# 1. npm pack
TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)

# 2. Build all tiers
docker build --target base -t sisyphus-test:base -f test/integration/Dockerfile --build-arg TARBALL="$TARBALL" .
docker build --target tmux -t sisyphus-test:tmux -f test/integration/Dockerfile --build-arg TARBALL="$TARBALL" .
docker build --target full -t sisyphus-test:full -f test/integration/Dockerfile --build-arg TARBALL="$TARBALL" .

# 3. Run tests per tier
for tier in base tmux full; do
  echo "=== $tier ==="
  docker run --rm sisyphus-test:$tier bash /tests/suites/test-$tier.sh
done

# 4. Print consolidated matrix
```

## Dockerfile Design

```dockerfile
# === BASE: Node.js + sisyphi installed ===
FROM node:22 AS base
ARG TARBALL
COPY ${TARBALL} /tmp/
COPY test/integration/suites/ /tests/suites/
COPY test/integration/lib/ /tests/lib/
# Disable auto-update in Docker
RUN mkdir -p ~/.sisyphus && echo '{"autoUpdate":false}' > ~/.sisyphus/config.json
RUN npm install -g /tmp/sisyphi-*.tgz

# === TMUX: + tmux ===
FROM base AS tmux
RUN apt-get update && apt-get install -y tmux && rm -rf /var/lib/apt/lists/*

# === FULL: + nvim + claude mock ===
FROM tmux AS full
RUN apt-get update && apt-get install -y neovim && rm -rf /var/lib/apt/lists/*
RUN printf '#!/bin/sh\ntrue\n' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude
```

## Daemon Smoke Test Detail

The daemon socket test (most important headless test):

```bash
# Start daemon in background
sisyphusd &
DAEMON_PID=$!

# Wait for socket (up to 5s)
for i in $(seq 1 50); do
  [ -S ~/.sisyphus/daemon.sock ] && break
  sleep 0.1
done

# Send status request via node (sisyphus CLI adds retry overhead)
RESULT=$(node -e "
  const net = require('net');
  const s = net.connect('$HOME/.sisyphus/daemon.sock');
  s.on('connect', () => s.write('{\"type\":\"status\"}\n'));
  s.on('data', d => { 
    const r = JSON.parse(d.toString().trim());
    process.stdout.write(r.ok ? 'OK' : 'FAIL');
    s.destroy();
  });
  setTimeout(() => { process.stdout.write('TIMEOUT'); process.exit(1); }, 5000);
")

# Cleanup
kill $DAEMON_PID 2>/dev/null
```

## GHA Workflow

File: `.github/workflows/integration-tests.yml`

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  linux-docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - run: bash test/integration/run.sh

  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - run: npm pack
      - run: npm install -g sisyphi-*.tgz
      - name: Swift notification build
        run: bash native/build-notify.sh
      - name: Verify notification app
        run: test -d ~/.sisyphus/SisyphusNotify.app
      - name: Launchd plist
        run: |
          # Trigger daemon install (creates plist)
          sisyphus doctor || true
          test -f ~/Library/LaunchAgents/com.sisyphus.daemon.plist
      - name: Doctor
        run: sisyphus doctor
```

## Doctor Output Parsing Strategy

Doctor prints lines like:
```
  ✓ Node.js: v22.x.x
  ✗ Claude CLI: Not found
  ⚠ tmux: Installed but no server running
```

Parse with grep patterns:
- `✓` (U+2713) = ok
- `✗` (U+2717) = fail  
- `⚠` (U+26A0) = warn

For CI assertions: `sisyphus doctor 2>&1 | grep -c '✗'` to count failures, compare against expected count per tier.

## Key Design Decisions

1. **Three tiers, not five**: nvim and claude-mock don't justify separate images. Rolling them into `full` keeps the matrix readable without losing coverage.

2. **Single multi-stage Dockerfile**: Layers share cache, builds are fast, no duplication.

3. **Shell-based test suites**: No test framework dependency. Bash scripts with a minimal assertion library. Each tier sources the library and calls assertion functions.

4. **Tarball installation**: `npm pack` → copy into Docker → `npm install -g`. Tests the real install path users experience.

5. **Daemon tested via raw socket**: CLI adds retry/auto-start overhead that obscures failures. Raw socket test is the cleanest daemon liveness check.

6. **Config pre-seeded**: `autoUpdate: false` written before install to prevent npm registry hits during tests.

7. **No interactive TUI testing**: Dashboard "opens" is verified by process launch, not by screen content. Full TUI testing would require xterm emulation — out of scope for integration tests.

8. **GHA macOS separate**: macOS-specific paths (launchd, Swift) can't run in Docker. Separate workflow job, no Docker.

## Expected Matrix Output

```
SISYPHUS INTEGRATION TEST RESULTS
==================================

Test                    base    tmux    full
─────────────────────────────────────────────
install-ok              PASS    PASS    PASS
node-pty-native         PASS    PASS    PASS
cli-version             PASS    PASS    PASS
daemon-start            PASS    PASS    PASS
daemon-socket           PASS    PASS    PASS
doctor-runs             PASS    PASS    PASS
doctor-node-ok          PASS    PASS    PASS
postinstall-no-swift    PASS    PASS    PASS
tmux-installed          ----    PASS    PASS
setup-keybind           ----    PASS    PASS
keybind-scripts         ----    PASS    PASS
tmux-conf               ----    PASS    PASS
doctor-tmux-ok          ----    PASS    PASS
nvim-installed          ----    ----    PASS
claude-mock             ----    ----    PASS
doctor-claude-ok        ----    ----    PASS
doctor-nvim-ok          ----    ----    PASS
full-setup              ----    ----    PASS
setup-begin-cmd         ----    ----    PASS
status-bar-write        ----    ----    PASS
list-empty              ----    ----    PASS
─────────────────────────────────────────────
TOTAL                   8/8     15/15   21/21
```

`----` means "not applicable for this tier" (not a failure).

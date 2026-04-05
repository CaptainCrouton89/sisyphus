# Cycle 8 — Validation

## What happened

Ran `bash test/integration/run.sh` locally. All 3 Docker images built successfully. Initial run found 2 bugs:

1. **`node-pty-native` (all tiers)**: `require('node-pty')` fails because node-pty is nested inside sisyphi's global node_modules, not at the top-level global modules dir. Fixed by resolving path through `npm root -g` + `sisyphi/node_modules/node-pty`.

2. **`daemon-socket-response` / `daemon-with-tmux` (all tiers)**: Node script output was `OKTIMEOUT` — the `setTimeout` callback fired after the `data` handler wrote `OK` because `s.destroy()` doesn't exit the process. Fixed by adding `clearTimeout(t)` and `process.exit(0)` in the data handler.

3. **Minor: duplicate TOTAL line** in per-tier summaries — `grep` pattern `^(FAIL|SKIP|TOTAL:)` already catches TOTAL, then a second `grep '^TOTAL:'` repeats it. Fixed by removing TOTAL from the first pattern.

After fixes: 28/28 PASS across all 3 tiers. Matrix output is clean and readable. Exit code 0.

## Evidence

Full passing output captured and verified:
- base: 12/12 PASS
- tmux: 21/21 PASS (12 base + 9 tmux)
- full: 28/28 PASS (12 base + 9 tmux + 7 full)

Test counts differ slightly from original plan (10/7/8+) because some tests were expanded during implementation (e.g., `install-ok` split into `install-ok` + `install-ok-daemon`). All planned functionality is covered.

## Files modified this cycle

- `test/integration/suites/test-base.sh` — node-pty require path fix, socket response exit fix
- `test/integration/suites/test-tmux.sh` — socket response exit fix
- `test/integration/run.sh` — duplicate TOTAL line fix

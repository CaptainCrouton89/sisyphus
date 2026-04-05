# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Goal
Create the integration test harness script at `test/integration/run.sh`.

## Session Goal
Build a comprehensive integration test suite for sisyphus that runs in Docker containers across 3 tiers (base/tmux/full) and reports a pass/fail matrix.

## Your Task
Create `test/integration/run.sh` — the harness that packs the project, builds Docker images, runs tests, and prints a consolidated matrix.

Read the full implementation plan at `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §3.4 for detailed spec.

### Key requirements:
1. `bash test/integration/run.sh` from project root runs the full suite
2. Creates a temp staging directory with: tarball (from `npm pack`), Dockerfile, lib/, suites/
3. Builds all 3 Docker targets (`base`, `tmux`, `full`) — sequential for layer cache
4. Runs each tier's test suite in its Docker container, captures structured output
5. Prints per-tier results AND a consolidated matrix table showing test names as rows, tiers as columns
6. Exits 0 if all tiers pass, 1 if any fail
7. Cleans up tarball and staging dir on exit (trap)

### Matrix output format:
```
Test                    base    tmux    full
─────────────────────────────────────────────
install-ok              PASS    PASS    PASS
tmux-installed          ----    PASS    PASS
nvim-installed          ----    ----    PASS
...
```

- `----` for tests not present in a tier
- Parse PASS|name, FAIL|name|reason, SKIP|name|reason lines from test output (everything before the `---` summary line)
- Collect all unique test names across tiers

### Test output format (from suites):
```
PASS|install-ok
FAIL|daemon-start|socket not created
---
TOTAL: 10 | PASS: 9 | FAIL: 1 | SKIP: 0
```

### Important details:
- `npm pack` outputs filename to stdout (last line) — capture it
- Staging dir avoids sending node_modules/.git as Docker build context
- The Dockerfile expects `sisyphi-*.tgz` in the build context root
- Use `set -euo pipefail`
- Make the script executable (`chmod +x`)

### Files to reference:
- `test/integration/Dockerfile` (existing)
- `test/integration/lib/assert.sh` (existing — see output format)
- `test/integration/suites/test-{base,tmux,full}.sh` (existing)

Report what you built, file path, and any design decisions you made.

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

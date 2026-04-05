#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-011' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-011-plugin" --agent 'devcore:programmer' --session-id "cf69f291-591b-408e-976d-2e9e3811d354" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-harness-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-011-system.md')" '## Goal
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
4. Runs each tier'\''s test suite in its Docker container, captures structured output
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

Report what you built, file path, and any design decisions you made.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2418
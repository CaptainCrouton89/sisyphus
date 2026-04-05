#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-004-plugin" --agent 'sisyphus:plan' --session-id "1668c297-25ad-4d54-9da7-f212882eff44" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing plan-integration-plan c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-004-system.md')" 'Create an implementation plan for the sisyphus integration test suite.

## Inputs

Read these context files (all in the session context dir):
- `context/design-integration-tests.md` — The architecture design (tiers, Dockerfile, test cases, harness, GHA workflow)
- `context/explore-nodepty-docker.md` — node-pty Docker compilation findings
- `context/explore-daemon-headless.md` — Daemon headless behavior findings
- `context/explore-doctor-matrix.md` — Doctor check expected outcomes per tier

## What to Produce

A concrete implementation plan saved to `context/plan-implementation.md` with:

### 1. File Inventory
Every file that needs to be created, with its full path and a brief description of its contents. Files live under `test/integration/` in the project root.

### 2. Task Breakdown
Group tasks into parallelizable waves. Tasks in the same wave have no dependencies on each other. Tasks in wave N+1 depend on outputs from wave N.

For each task:
- Which file(s) it creates/modifies
- What it needs to know (point to context docs, not inline the info)
- Concrete acceptance criteria (how to verify the task is done)

### 3. Key Implementation Details

For each file, provide enough detail that an implementation agent can write it without further research:

**Dockerfile** (`test/integration/Dockerfile`):
- Exact multi-stage structure (base → tmux → full)
- Which packages to install at each stage
- How the tarball gets into the image (COPY vs build-arg)
- Config pre-seeding (autoUpdate: false)

**Assertion library** (`test/integration/lib/assert.sh`):
- Function signatures and behavior
- Output format (structured for harness parsing)
- Exit code convention

**Test suites** (`test/integration/suites/test-{tier}.sh`):
- Exact test functions for each tier
- How daemon is started/stopped per test
- How doctor output is parsed
- How tmux server is managed (for tmux/full tiers)

**Harness script** (`test/integration/run.sh`):
- Build flow (npm pack → docker build per target)
- Test execution flow (docker run per tier)
- Matrix output collection and formatting
- Exit code (0 if all pass, 1 if any fail)

**GHA workflow** (`.github/workflows/integration-tests.yml`):
- Linux job (runs harness)
- macOS job (installs, tests launchd, Swift build, doctor)

### 4. Implementation Concerns

Note any tricky parts:
- Daemon lifecycle in containers (start, wait for socket, cleanup)
- Doctor output parsing (UTF-8 symbols)
- Tarball path handling between host and Docker context
- tmux server management inside containers
- Race conditions in daemon startup tests

## Constraints
- Keep it practical. No over-engineering.
- Shell scripts only (no test frameworks).
- Everything must work inside Docker AND in GHA.
- The test suite should be runnable locally with just `bash test/integration/run.sh`.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2392
# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: Create an implementation plan for the sisyphus integration test suite.

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
- The test suite should be runnable locally with just `bash test/integration/run.sh`.

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

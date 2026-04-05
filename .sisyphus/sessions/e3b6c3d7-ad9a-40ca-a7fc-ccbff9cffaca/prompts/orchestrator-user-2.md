## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Messages

- [user @ 2026-04-02T07:08:27.193Z] "the things we need to verify that work. One, we need to be able to like make sure that it correctly installs the right hooks properly. We need to check that installed the status line correctly. We nee..." → .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/messages/msg-001.md

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-002.md

### Most Recent Cycle

- **agent-001** (explore-nodepty) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-001-final.md
- **agent-002** (explore-daemon) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-002-final.md
- **agent-003** (explore-doctor) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-003-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

Three explore agents running: nodepty Docker compilation (agent-001), daemon headless behavior (agent-002), doctor check matrix (agent-003). Review their reports in context/, then design the test environment: Docker tiers, Dockerfiles, harness script, GHA workflow, Claude CLI mock. Transition to design once exploration findings are compiled.
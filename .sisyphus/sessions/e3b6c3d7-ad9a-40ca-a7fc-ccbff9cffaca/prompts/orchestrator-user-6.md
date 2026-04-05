## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-006.md

### Most Recent Cycle

- **agent-007** (impl-test-base) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-007-final.md
- **agent-008** (impl-test-base) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-008-final.md
- **agent-009** (impl-test-tmux) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-009-final.md
- **agent-010** (impl-test-full) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-010-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

Wave 2 agents (008/009/010) are writing 3 test suites. Review all 3 outputs, verify source chain convention, assertion usage, test count. Fix issues. If clean, spawn Wave 3 (harness run.sh + GHA workflow) in parallel.
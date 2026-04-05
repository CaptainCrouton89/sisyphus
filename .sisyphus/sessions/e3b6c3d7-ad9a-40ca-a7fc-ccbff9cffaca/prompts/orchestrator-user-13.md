## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-013.md

### Most Recent Cycle

- **agent-024** (base-adversarial) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-024-final.md
- **agent-025** (tmux-adversarial) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-025-final.md
- **agent-026** (full-adversarial) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-026-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

3 agents implementing adversarial tests (base/tmux/full tiers). Collect reports, check for assert.sh conflicts (agent-024 owns assert.sh, agents 025/026 may reference new helpers). Then validate in Docker.
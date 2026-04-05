## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-015.md

### Most Recent Cycle

- **agent-027** (impl-updater-test) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-027-final.md
- **agent-028** (impl-tui-test) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-028-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

Two agents implementing: (1) auto-updater test with Verdaccio, (2) TUI/neovim rendering test. Both add to test-full.sh. Updater also modifies Dockerfile. After both complete, need to: verify no merge conflicts in test-full.sh, run the full Docker suite to validate, then transition back to completion mode.
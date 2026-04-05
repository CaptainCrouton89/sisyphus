## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-011.md

### Most Recent Cycle

- **agent-016** (impl-assert-base-retry) [killed]: (no reports)

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

All 3 tiers pass (27+61+75). 3 bugs found and fixed during validation. Ready for completion review. User also asked about test speed — parallel tier execution is the main opportunity.
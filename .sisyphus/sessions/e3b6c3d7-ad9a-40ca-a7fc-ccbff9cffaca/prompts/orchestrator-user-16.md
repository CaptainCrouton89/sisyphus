## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-016.md

### Most Recent Cycle

- **agent-029** (fix-tui-docker) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-029-final.md
- **agent-030** (fix-updater-docker) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-030-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

Two debug agents fixing Docker test failures: agent-029 (TUI rendering) and agent-030 (Verdaccio updater). After they report, re-run full Docker suite. If all pass, transition to completion.
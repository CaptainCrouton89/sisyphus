## Goal

Create a comprehensive integration test suite that verifies sisyphus (`sisyphi` package) installs and runs correctly in fresh environments. Docker containers test the Linux permutation matrix (node-only → full stack), a GitHub Actions workflow covers macOS-specific paths (launchd, Swift notifications). A test harness builds all images, installs from `npm pack` tarball, runs `sisyphus doctor`, and tests key functionality per environment — reporting a pass/fail matrix. "Done" means: running `test/run-integration.sh` locally produces a clear matrix showing which capabilities work in each environment, and the GHA workflow runs on push/PR for macOS validation.

## Context

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-012.md

### Most Recent Cycle

- **agent-017** (adversarial-tmux) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-017-final.md
- **agent-018** (adversarial-plugins) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-018-final.md
- **agent-019** (adversarial-tui) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-019-final.md
- **agent-020** (adversarial-state) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-020-final.md
- **agent-021** (adversarial-lifecycle) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-021-final.md
- **agent-022** (explore-daemon-failures) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-022-final.md
- **agent-023** (explore-cli-tui-failures) [completed]: @.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/reports/agent-023-final.md

## Strategy

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/strategy.md

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

7 agents brainstorming adversarial test scenarios and exploring codebase for failure modes. Collect all reports, synthesize into concrete test plan with specific Docker-testable scenarios, then spawn implementation agents to write the tests.
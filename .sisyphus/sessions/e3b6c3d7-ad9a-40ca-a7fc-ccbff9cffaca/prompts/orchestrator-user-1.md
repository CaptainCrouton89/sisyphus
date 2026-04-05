## Goal

Create comprehensive integration test environment for sisyphus fresh installs

## Context

Two-tier approach: (1) Docker containers for Linux permutation matrix - base (node 22 only), +tmux, +neovim/lazyvim, +claude CLI mock, +full. Dockerfiles in test/environments/. (2) GitHub Actions workflow for macOS-specific paths (launchd, Swift notifications). Test harness script that builds all images, runs npm install -g from local tarball (npm pack), runs sisyphus doctor, tests key functionality, reports pass/fail matrix. Key verifications: node-pty native compilation, doctor diagnostics, daemon socket creation, tmux pane creation where available, graceful degradation, postinstall without swiftc. Package is sisyphi, commands are sisyphus/sisyphusd. See the conversation plan in the task description for full details on the matrix and what to verify per environment.

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/logs/cycle-001.md

## Strategy

(empty)

## Roadmap

@.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/roadmap.md


## Continuation Instructions

Review the current session and delegate the next cycle of work.
## Completed
- **exploration** — node-pty needs glibc (no Alpine), daemon starts without tmux, 14 doctor checks mapped across tiers, Claude mock just needs `which claude`
- **design** — 3-tier Docker architecture (base/tmux/full), single multi-stage Dockerfile, shell-based test suites, GHA workflow for macOS
- **planning** — 7 files, 3 waves (Foundation → Test Suites → Orchestration), 25+ test cases, key design doc corrections (warn=`!`, no sisyphusd --help, doctor exits 0)
- **implementation + validation (v1)** — 28 tests pass across 3 Docker tiers, matrix output verified. Mostly shallow "does X exist" checks.
- **implementation + validation (test expansion)** — Expanded to 75 deep tests (protocol, session lifecycle, multi-session, resilience, complete lifecycle, update-task). Fixed 3 bugs during validation: json_field crash on missing paths, bare `wait` hanging on daemon child, tmux tier missing claude mock.
- **implementation + validation (test hardening)** — Added 55+ adversarial tests (state corruption, config robustness, protocol edge cases, SIGKILL recovery, dotted dir names, session collisions, external pane kill, concurrent messages, agent type resolution, malformed frontmatter, TUI no-tty, permission errors, setup idempotency, comprehensive doctor). Fixed 3 issues during validation (config missing autoUpdate, claude mock exiting immediately, status bar timing). All 129 tests pass across 3 tiers.

## Current Stage: implementation (test expansion v2)

Two new test categories:
1. **Auto-updater test** — Verdaccio mock npm registry in Docker, publish two versions, install older, trigger update, verify newer lands
2. **TUI/Neovim integration** — Launch TUI in a real tmux pane, use `tmux capture-pane` to verify rendering, send keystrokes and verify response

Both go in the full tier (needs tmux + neovim).

## Ahead
- Validate expanded suite
- Complete

# Cycle 14 — Implementation (test expansion v2)

User requested two additions before completion:
1. Auto-updater integration test via Verdaccio mock npm registry
2. TUI/Neovim integration test via tmux capture-pane

Both are independent — spawning two parallel agents. Both target the full Docker tier.

## Key design decisions
- Verdaccio runs inside the Docker container (no Docker-in-Docker). Install it as a devDependency of the test, not globally.
- TUI test runs `sisyphus tui` inside a tmux pane, captures output with `tmux capture-pane -p`, asserts on rendered content.
- Both add to `test-full.sh` following the existing pattern (function + registration in `run_full_tests`).

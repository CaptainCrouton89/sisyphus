# Cycle 15 — Validate new tests

## Assessment
Both implementation agents (027, 028) reported completion. Verified:
- No merge conflicts in test-full.sh — both cleanly added their functions
- `run_full_tests()` correctly calls all new test functions
- Dockerfile properly installs verdaccio in full tier
- test-full.sh now 737 lines with auto-updater + TUI tests

## Validation Results
Ran full Docker test suite (`test/integration/run.sh`):
- **base**: 38/38 PASS ✓
- **tmux**: 96 PASS, 2 SKIP (known dotted-dir bug) ✓
- **full**: 129 PASS, 6 FAIL, 4 SKIP ✗

### Failures (all in new tests)
1. **TUI tests (5)**: `tui-renders-output`, `tui-shows-borders`, `tui-shows-keyhints`, `tui-shows-session-task`, `tui-input-quit-closes-pane` — root cause: `tmux capture-pane` returns empty. TUI likely not rendering in Docker (TERM, terminal size, or socket timing).
2. **Updater test (1)**: `updater-registry-latest-version` — npm view returns empty string. Verdaccio starts and package is packed, but publish/view chain fails.

## Agents Spawned
- **agent-029** (fix-tui-docker): Debug/fix TUI Docker failures
- **agent-030** (fix-updater-docker): Debug/fix updater Verdaccio failures

Fixed all 5 failing TUI integration tests in test/integration/suites/test-full.sh.

## Root Cause
The tests called `sisyphus tui` which does not exist as a CLI command. Commander printed "error: unknown command tui" and exited immediately, causing the tmux window to close before any TUI output was rendered. `tmux capture-pane` then returned empty.

## Fix (2 lines changed)
- Line 317: `tmux new-window -t tui-render-test -n tui "sisyphus tui"` → `tmux new-window -t tui-render-test -n tui -c "$TEST_CWD" "sisyphus dashboard"`
- Line 369: `tmux new-window -t tui-input-test -n tui "sisyphus tui"` → `tmux new-window -t tui-input-test -n tui -c "$TEST_CWD" "sisyphus dashboard"`

Two changes per line:
1. Replaced `sisyphus tui` with the actual CLI command `sisyphus dashboard`
2. Added `-c "$TEST_CWD"` so the dashboard process.cwd() matches the test session cwd, ensuring the TUI displays the test session

## Verification
All 5 tests pass in Docker (full tier): tui-renders-output, tui-shows-borders, tui-shows-keyhints, tui-shows-session-task, tui-input-quit-closes-pane.

## Out-of-scope issue
FAIL|updater-registry-latest-version — verdaccio registry test failing independently (got empty string for latest version). Unrelated to TUI tests.
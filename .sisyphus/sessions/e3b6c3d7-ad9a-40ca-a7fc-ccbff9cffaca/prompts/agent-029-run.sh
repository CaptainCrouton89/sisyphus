#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-029' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-029-plugin" --agent 'sisyphus:debug' --session-id "d3e249d7-9215-4adf-aa41-23cbdc5f3fc9" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing fix-tui-docker-debug c15' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-029-system.md')" '## Goal
Fix 5 failing TUI integration tests in Docker (full tier). The TUI pane produces no output when launched via `tmux new-window -t ... "sisyphus tui"`.

## Symptoms
Running `bash test/integration/run.sh` shows:
- FAIL|tui-renders-output|TUI pane produced no output
- FAIL|tui-shows-borders|no box-drawing border chars in TUI output
- FAIL|tui-shows-keyhints|no key hints in TUI status bar
- FAIL|tui-shows-session-task|session task text not visible in TUI tree
- FAIL|tui-input-quit-closes-pane|TUI did not render before keystroke

All 5 trace to one root cause: `tmux capture-pane` returns empty.

## Test code
See `test/integration/suites/test-full.sh` lines 299-403 — `test_tui_rendering()` and `test_tui_input_handling()`.

## Debug approach
1. Build the full Docker image: `docker build --target full -t sisyphus-test:full /tmp/test-context/` (you'\''ll need to stage context first — see run.sh for the staging approach, or just use the already-built image `sisyphus-test:full`)
2. Run an interactive shell in the Docker container: `docker run --rm -it sisyphus-test:full bash`
3. Inside the container, manually reproduce the issue:
   - Start a tmux session
   - Start the daemon
   - Create a session
   - Launch `sisyphus tui` in a tmux pane
   - Try `tmux capture-pane` to see if output appears
   - Check if the TUI is actually starting (stderr, exit code)
   - Try increasing sleep times
   - Check TERM env var, terminal size

The TUI (src/tui/) uses raw ANSI cursor rendering. It connects to the daemon via socket. Common failure modes in Docker:
- No TERM set → TUI can'\''t render
- Terminal size too small → TUI crashes or renders nothing
- Socket not ready → TUI fails to connect
- node-pty issues → native module problems

## Deliverable
Fix the test code in `test/integration/suites/test-full.sh` (or the Dockerfile if needed) so the TUI tests pass in Docker. Do NOT modify the TUI source code — only test/Docker infrastructure.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2499
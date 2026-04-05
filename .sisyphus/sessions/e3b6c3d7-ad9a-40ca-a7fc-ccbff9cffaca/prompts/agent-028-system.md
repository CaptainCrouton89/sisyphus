# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: Add TUI/Neovim integration tests to `test/integration/suites/test-full.sh` that prove the TUI launches, renders, and handles input in a real terminal via tmux.

## Approach

The full Docker tier has tmux + neovim. A tmux pane IS a real PTY. We can:
1. Start the daemon
2. Create a session (so the TUI has something to show)
3. Launch `sisyphus tui` inside a tmux pane (NOT piped — a real pane with a PTY)
4. Wait briefly for it to render
5. Use `tmux capture-pane -p -t <pane>` to grab the rendered output
6. Assert the output contains expected TUI elements (borders, session info, etc.)
7. Optionally send keystrokes via `tmux send-keys` and verify the display changes
8. Clean up (kill the TUI pane, stop daemon, kill tmux)

## Test function: `test_tui_rendering`

```bash
test_tui_rendering() {
  tmux new-session -d -s tui-test 2>/dev/null || true
  start_daemon
  setup_test_project
  
  # Create a session so the TUI has something to display
  cd "$TEST_CWD"
  local resp
  resp=$(send_request '{"type":"start","task":"tui rendering test","cwd":"'"$TEST_CWD"'"}')
  local sid
  sid=$(extract_session_id "$resp")
  sleep 2  # let session initialize
  
  # Launch TUI in a real tmux pane (not piped — needs a PTY)
  tmux new-window -t tui-test -n tui-pane "sisyphus tui"
  sleep 3  # let TUI render
  
  # Capture the rendered output
  local captured
  captured=$(tmux capture-pane -t tui-test:tui-pane -p 2>/dev/null || echo "")
  
  if [ -n "$captured" ]; then
    assert_pass "tui-renders-output"
  else
    assert_fail "tui-renders-output" "TUI pane produced no output"
  fi
  
  # Check for key TUI elements — the TUI should show session info
  # Look for common elements: borders (box-drawing chars), the session or status indicators
  # The exact content depends on the TUI implementation — check what it actually renders
  
  # Clean up
  tmux kill-window -t tui-test:tui-pane 2>/dev/null || true
  stop_daemon
  tmux kill-server 2>/dev/null || true
  cleanup_test_project
}
```

## Important details

- **Read `src/tui/` first** to understand what the TUI actually renders. Look at `app.ts`, `render.ts`, `panels/tree.ts`, `panels/bottom.ts` to know what text/borders/elements to assert on.
- The TUI uses raw ANSI rendering with box-drawing characters. `tmux capture-pane -p` captures the visible text.
- The TUI needs a running daemon and may need an active session to show meaningful content.
- If the TUI exits immediately when there are no sessions or some other condition, handle that gracefully.
- Use `tmux capture-pane -p -e` to include escape sequences if plain text capture misses content.

## Also test: TUI input handling

Add a second test `test_tui_input_handling` that:
1. Launches the TUI in a pane
2. Sends a keystroke via `tmux send-keys` (e.g., 'q' to quit, or arrow keys to navigate)
3. Captures the pane again and verifies the output changed (or the pane closed if 'q' quits)

## Files to modify
- `test/integration/suites/test-full.sh` — add test functions and register them in `run_full_tests()`

Read `test/integration/suites/test-full.sh` and `test/integration/lib/assert.sh` first to match the existing patterns. Also read the TUI source to know what to assert on.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.

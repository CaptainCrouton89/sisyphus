# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Goal
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
1. Build the full Docker image: `docker build --target full -t sisyphus-test:full /tmp/test-context/` (you'll need to stage context first — see run.sh for the staging approach, or just use the already-built image `sisyphus-test:full`)
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
- No TERM set → TUI can't render
- Terminal size too small → TUI crashes or renders nothing
- Socket not ready → TUI fails to connect
- node-pty issues → native module problems

## Deliverable
Fix the test code in `test/integration/suites/test-full.sh` (or the Dockerfile if needed) so the TUI tests pass in Docker. Do NOT modify the TUI source code — only test/Docker infrastructure.

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

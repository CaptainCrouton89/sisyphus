# CLI Commands

Each file exports a command registration function following this pattern:

```ts
export function register{Command}(program: Command): void {
  program.command('{command}').action(async (args, opts) => { ... });
}
```

## Conventions

- **Registration**: Each command file exports `register{Command}()` called in `index.ts`
- **Communication**: Commands use `sendRequest()` to send protocol requests via Unix socket
- **Error handling**: Throw on invalid args or daemon errors; exit with code 1 and error message
- **Session lookup**: Commands requiring session ID use `process.env.SISYPHUS_SESSION_ID` or error if missing
- **Output**: Use `console.log()` for success; `console.error()` for errors
- **Validation**: Early validation of required args; avoid side effects before confirming validity
- **Stdin support**: Use `readStdin()` for optional input piping (e.g., `spawn`, `yield`)

## Key Constraints

- **start.ts** — Requires tmux (checks `TMUX` env var; skip with `--no-tmux-check`). Options: `--context` (background info), `--name` (session label). Respects `SISYPHUS_CWD` env var (falls back to `process.cwd()`). Auto-launches dashboard in current tmux session (only if not already open). Sets `@sisyphus_cwd` tmux option.
- **continue.ts** — Clears roadmap and reactivates completed session (stays in current cycle); requires `SISYPHUS_SESSION_ID` env var.
- **resume.ts** — Respawns orchestrator with new instructions; takes session ID as **argument** (not env var).
- **submit.ts** — Blocks if git worktree has uncommitted changes. Agent must commit first.
- **yield.ts** — Orchestrator-only; requires `SISYPHUS_SESSION_ID` environment variable.
- **rollback.ts** — Pauses session after rollback; use `resume` to respawn orchestrator.
- **dashboard.ts** — Checks if dashboard window exists before launching (prevents duplicates). Launches in current tmux session via TUI binary.
- **doctor.ts** — Platform-aware health checks; verifies dependencies and tmux/daemon setup.
- **getting-started.ts** — Interactive guide; checks tmux install/status and displays workflow guidance.

## Key Interactions

- `start.ts` → creates new session, returns session ID; uses `dashboard.ts` helpers to auto-launch dashboard
- **`continue.ts` vs `resume.ts`** — Both reactivate sessions; use `continue` to add work without new instructions, `resume` to restart with explicit new direction
- `spawn.ts`, `submit.ts`, `yield.ts`, `complete.ts` — Lifecycle commands; require active session
- `status.ts`, `dashboard.ts` — Query/monitor commands; read-only
- `list.ts`, `resume.ts`, `kill.ts`, `rollback.ts` — Session management; don't require active session
- `doctor.ts` — Health check; validates dependencies, daemon, and tmux setup
- `getting-started.ts` — Onboarding; explains task scope, workflow, and command reference

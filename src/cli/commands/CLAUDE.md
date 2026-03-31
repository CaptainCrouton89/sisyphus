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

- **init.ts** — Creates `.sisyphus/config.json` and optional `orchestrator.md` template. Option: `--orchestrator` (create custom prompt). Idempotent (logs and exits if config exists).
- **start.ts** — Requires tmux (checks `TMUX` env var; skip with `--no-tmux-check`). Options: `--context` (background info), `--name` (session label). Respects `SISYPHUS_CWD` env var (falls back to `process.cwd()`). Auto-launches dashboard in current tmux session (only if not already open). Sets `@sisyphus_cwd` tmux option.
- **continue.ts** — Clears roadmap and reactivates completed session (stays in current cycle); requires `SISYPHUS_SESSION_ID` env var.
- **resume.ts** — Takes session ID as **positional argument** (not env var). Optional second arg for additional orchestrator instructions. Returns tmux session name for attaching.
- **submit.ts** — Submits agent work report. Requires `SISYPHUS_SESSION_ID` and `SISYPHUS_AGENT_ID` env vars.
- **spawn.ts** — Orchestrator-only; requires `SISYPHUS_SESSION_ID`. Instruction from positional arg, `--instruction` flag, or stdin. Options: `--agent-type` (default: `worker`), `--name` (required). **`--repo <name>`** specifies subdirectory for multi-repo workflows (directory name only, no paths). If omitted, agents work in the session root.
- **yield.ts** — Orchestrator-only; requires `SISYPHUS_SESSION_ID` environment variable.
- **rollback.ts** — Arguments: `<sessionId> <cycle>` (cycle must be positive integer). Pauses session; use `resume` to respawn.
- **dashboard.ts** — Checks if dashboard window exists before launching (prevents duplicates). Launches in current tmux session via TUI binary.
- **list.ts** — Lists sessions for current project (default) or all projects (`--all`). Color-codes status: green=active, yellow=paused, cyan=completed. Respects `SISYPHUS_CWD` for project filtering; override with `--cwd <path>`.
- **doctor.ts** — Platform-aware health checks; verifies dependencies and tmux/daemon setup.
- **getting-started.ts** — Interactive guide; checks tmux install/status and displays workflow guidance.

## Key Interactions

- `init.ts` → (optional) run before `start.ts` to create project config
- `start.ts` → creates new session, spawns orchestrator, auto-launches dashboard
- `spawn.ts` → orchestrator spawns agents into panes
- **`continue.ts` vs `resume.ts`** — Both reactivate sessions; use `continue` for same direction, `resume` for new instructions
- `submit.ts`, `yield.ts`, `complete.ts` — Lifecycle commands; require active session
- `status.ts`, `dashboard.ts` — Query/monitor; read-only
- `list.ts` — Lists all sessions (project-scoped or global); read-only
- `rollback.ts`, `kill.ts` — Session management; don't require active session
- `doctor.ts`, `getting-started.ts` — Standalone utilities; no session dependency

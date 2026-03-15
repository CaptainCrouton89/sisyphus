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

- **submit.ts** — Blocks if git worktree has uncommitted changes. Agent must commit first.
- **yield.ts** — Orchestrator-only; requires `SISYPHUS_SESSION_ID` environment variable
- **rollback.ts** — Pauses session after rollback; use `resume` to respawn orchestrator

## Key Interactions

- `start.ts` — Creates new session, returns session ID
- `spawn.ts`, `submit.ts`, `yield.ts`, `complete.ts` — Lifecycle commands; require active session
- `status.ts` — Query command; read-only
- `list.ts`, `resume.ts`, `kill.ts`, `rollback.ts` — Session management; don't require active session

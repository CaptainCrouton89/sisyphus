# CLI Commands

Each file exports a command handler following this pattern:

```ts
export async function commandName(client: SessionClient, args: ParsedArgs): Promise<void>
```

## Conventions

- **Error handling**: Commands throw on invalid args or daemon errors; CLI wrapper catches and formats
- **Session lookup**: Commands requiring session ID use `args.session` or error if missing
- **Output**: Use `console.log()` for success output; structured JSON via `--json` flag (client handles)
- **Validation**: Early validation of required args; avoid side effects before confirming validity
- **Environment vars**: Agent-spawned commands check `SISYPHUS_SESSION_ID` and `SISYPHUS_AGENT_ID`

## Key Constraints

- **submit.ts** — Blocks if git worktree has uncommitted changes (automatic merge on submit would lose them). Agent must commit first.

## Key Interactions

- `start.ts` — Creates new session, returns session ID
- `spawn.ts`, `submit.ts`, `yield.ts`, `complete.ts` — Lifecycle commands; require active session
- `status.ts`, `tasks.ts` — Query commands; read-only
- `list.ts`, `resume.ts` — Session management; don't require active session

All commands connect via `SessionClient` (src/cli/client.ts) which handles Unix socket protocol.

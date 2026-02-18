# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

## Command Registration Pattern

- `index.ts` — Creates Commander.js program, registers commands
- `commands/{command}.ts` — Each command is a module exporting `action(args)` function
- Commands map to protocol requests sent via `client.ts`

**Adding a new command**:
1. Create `commands/{command}.ts` with exported action function
2. Register in `index.ts`: `.command('{command}').action(action)`
3. Define request/response types in `src/shared/protocol.ts`
4. Handle in daemon's `server.ts`

## Client Communication (`client.ts`)

- Connects to daemon via Unix socket (`~/.sisyphus/daemon.sock`)
- 10-second timeout per request
- Blocks waiting for daemon response (no fire-and-forget)
- Handles socket creation/reconnection errors

**Pattern**: All commands use `client.sendRequest(type, payload)` → waits for response or timeout error.

## Conventions

- Commands take minimal args; complex state lives in daemon
- Error messages should be concise and actionable
- Use environment variables (`SISYPHUS_SESSION_ID`, etc.) when agent-spawned

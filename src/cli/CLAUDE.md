# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

## Command Registration Pattern

- `index.ts` — Creates Commander.js program, registers commands
- `commands/{command}.ts` — Each command is a module exporting a registration function
- Commands map to protocol requests sent via `client.ts`

**Adding a new command**:
1. Create `commands/{command}.ts` with exported `register{Command}(program)` function
2. Call registration in `index.ts`
3. Define request/response types in `src/shared/protocol.ts`
4. Handle in daemon's `server.ts`

## Client Communication (`client.ts`)

- `rawSend()` — Low-level socket send (10s timeout, single attempt)
- `sendRequest()` — Wraps `rawSend()` with retry logic:
  - 5 attempts total, 2s delay between retries
  - On macOS: auto-installs daemon via launchd on first ENOENT/ECONNREFUSED
  - On non-macOS: retries, then suggests manual daemon startup
  - Non-socket errors are thrown immediately (not retried)

**Pattern**: All commands use `sendRequest(request)` → waits for response or throws after max retries.

## Conventions

- Commands take minimal args; complex state lives in daemon
- Error messages should be concise and actionable
- Use environment variables (`SISYPHUS_SESSION_ID`, `SISYPHUS_AGENT_ID`) when agent-spawned
- Command registration functions follow `register{Command}(program)` naming

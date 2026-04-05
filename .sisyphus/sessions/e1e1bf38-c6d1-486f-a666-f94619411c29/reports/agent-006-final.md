T1, T6, T7 complete. All three tasks implemented and build passes.

## Changes

### T1: Protocol types
- `src/shared/protocol.ts:4` — Added clone request to Request union: `{ type: 'clone'; sessionId: string; goal: string; context?: string; name?: string; strategy?: boolean }`
- `src/shared/history-types.ts:21-22` — Added `'session-cloned'` and `'cloned-from'` to HistoryEventType union

### T6: CLI command
- `src/cli/commands/clone.ts` — New file (55 lines). Follows continue.ts pattern exactly: assertTmux, env var guards (SISYPHUS_SESSION_ID required, SISYPHUS_AGENT_ID must be 'orchestrator'), sendRequest, success/error output matching design §6.

### T7: CLI registration
- `src/cli/index.ts:17` — Added import for registerClone
- `src/cli/index.ts:69` — Added registerClone(program) after registerContinue

Build: clean success, no errors.
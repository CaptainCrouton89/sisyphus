# Codebase Map: Session Clone Integration Points

Reference map of files relevant to session cloning. See `requirements-clone.md` for authoritative behavioral requirements (approved). The key model: clone is a true duplication with no parent-child relationship, no cross-session communication, no hierarchy.

## Key Files

| File | Role | Clone Relevance |
|------|------|-----------------|
| `src/shared/types.ts` | `Session` type definition | `parentSessionId` exists but is unrelated to cloning (used by companion `comeback-kid` only). Clone does NOT set parent/child fields. |
| `src/shared/protocol.ts` | All request/response types | Needs new `clone` request type |
| `src/shared/history-types.ts` | `HistoryEventType` union | Needs `session-cloned` and `cloned-from` event types |
| `src/daemon/state.ts` | `createSession()`, snapshot system | Needs `cloneSession()` — directory duplication, ID replacement, state initialization |
| `src/daemon/session-manager.ts` | `startSession()`, lifecycle management | Needs `cloneSession()` wrapping state + tmux session creation + history events |
| `src/daemon/server.ts` | Request routing | Route `clone` request to session manager |
| `src/daemon/orchestrator.ts` | `formatStateForOrchestrator()`, context injection | Clone orchestrator spawns in strategy mode at cycle N+1 with programmatic orientation |
| `src/daemon/history.ts` | `emitHistoryEvent()`, `writeSessionSummary()` | Emit clone events on both source and clone sessions |
| `src/cli/commands/` | CLI command files | New `clone.ts` command |

## Patterns to Follow

- `createSession()` in `state.ts` (line ~41) — follow this pattern for `cloneSession()`
- `startSession()` in `session-manager.ts` (line ~90) — tmux session creation, orchestrator spawning
- `client.ts` socket communication — CLI → daemon protocol
- `emitHistoryEvent()` — fire-and-forget history logging
- Command registration in `src/cli/index.ts`
- `start` command in `src/cli/commands/start.ts` — closest existing analog for clone command

## Files That Need NO Changes

- `src/daemon/companion.ts` — `comeback-kid` is separate from cloning
- `src/daemon/pane-monitor.ts` — clone sessions tracked independently like any session
- `src/tui/` — no hierarchy display needed (clone model has no parent-child)
- `src/cli/commands/status.ts` — no fork info to display
- `src/cli/commands/list.ts` — clones appear as normal independent sessions

Comprehensive integration points map for session branching/forking.

## Summary

parentSessionId already exists in shared/types.ts:64 but is never written. Nine modules need changes to support branching:

**Required changes:**
1. src/shared/types.ts — Add childSessionIds?: string[], forkCycle?: number to Session
2. src/daemon/state.ts — Add forkSession() that sets parentSessionId, updates parent childSessionIds
3. src/shared/protocol.ts — Add 'fork' request type; expose parentSessionId in list response
4. src/daemon/server.ts — Route 'fork' request
5. src/daemon/session-manager.ts — Add forkSession(), emit history events, fork-completion notification to parent
6. src/cli/commands/fork.ts — New command sisyphus fork 'task' for orchestrators
7. src/shared/history-types.ts — Add 'session-forked', 'fork-completed' event types

**Recommended (display/UX):**
8. src/cli/commands/status.ts + list.ts — Show fork hierarchy
9. src/tui/lib/tree.ts + panels/tree.ts — Group forks under parents

**Free (no changes):**
- src/daemon/companion.ts — comeback-kid achievement will fire automatically once parentSessionId is written (currently unearnable)
- src/daemon/pane-monitor.ts — forks tracked as independent sessions, no changes needed
- src/daemon/orchestrator.ts — no changes needed

**Critical constraints:**
- withSessionLock must be used when writing childSessionIds back to parent (parent and fork have separate locks — safe to call from within child creation path)
- forkSession() needs both parentCwd and forkCwd since fork can target different cwd
- snapshot/rollback are per-session; parentSessionId should survive restoreSnapshot()

Full findings at: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/explore-integration-points.md
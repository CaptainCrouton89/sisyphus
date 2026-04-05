## Implementation Complete: Session Clone Daemon Layer (T2–T5)

All four tasks implemented, build succeeds, all 357 existing tests pass.

### T2: State cloning functions (src/daemon/state.ts)
- Added `statSync` import, `reportsDir` and `strategyPath` to path imports
- **`replaceIdInDir(dir, sourceId, cloneId)`** — private function, recursive walk with `readdirSync({ recursive: true })`, null-byte binary detection in first 8KB, `replaceAll` for text files
- **`cloneSessionDir(sourceCwd, sourceId, cloneId, goal, context?, strategy?)`** — exported, `cpSync` for context/prompts/reports/snapshots, conditional strategy.md copy, ID replacement in all copied dirs, fresh goal.md/initial-prompt.md/roadmap.md/logs/context-CLAUDE.md
- **`createCloneState(sourceCwd, sourceId, cloneId, goal, context?)`** — exported, reads source state, `structuredClone` for agents/orchestratorCycles/messages, normalizes running→killed agents with reason, constructs fresh identity fields, writes via `atomicWrite` inside `withSessionLock`

### T3: Orchestrator forceMode (src/daemon/orchestrator.ts)
- Line 309: Added `forceMode?: string` as 5th param to `spawnOrchestrator()`
- Line 322: Changed mode resolution to `forceMode ?? (lastCycle?.mode ?? 'strategy')`

### T4: Session manager cloneSession (src/daemon/session-manager.ts)
- ~130 lines, follows `startSession()` pattern exactly
- Steps: validate source (not completed), generate UUID, validate name, check tmux collision, filesystem clone, model config, tmux session creation, track+spawn with orientation message and forceMode='strategy', kill initial pane, history events on both source and clone, fire-and-forget Haiku naming (identical to startSession pattern), housekeeping (prune, dots, companion hooks)
- Orientation message includes source ID, previous goal, new goal, optional context, independence guidance, and next steps

### T5: Server routing (src/daemon/server.ts)
- Added `case 'clone'` after `case 'start'`
- Looks up source cwd from `sessionTrackingMap`, calls `cloneSession`, registers clone in tracking map, persists registry
- Returns `{ ok: true, data: { sessionId, tmuxSessionName } }`

### Build & Tests
- `npm run build` — clean success
- `npm test` — 357/357 pass, 0 fail
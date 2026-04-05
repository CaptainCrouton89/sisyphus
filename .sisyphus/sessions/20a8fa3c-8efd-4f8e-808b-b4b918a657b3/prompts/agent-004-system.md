# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 20a8fa3c-8efd-4f8e-808b-b4b918a657b3
- **Your Task**: ## Goal
Add new type fields and event types for the metrics/analytics improvement. This is pure additive type work — no runtime changes.

## Session Goal
Audit and improve the sisyphus metrics/analytics system — add missing tracking fields, event types, and summary data.

## Task: T1 — Type & Schema Changes

### File 1: `src/shared/types.ts`

**Agent interface (line 88):** Add two optional fields after `killedReason?` (line 104):
```ts
restartCount?: number;
originalSpawnedAt?: string;
```

**Session interface (line 50):** Add four optional fields after `companionCreditedStrength?` (line 78):
```ts
rollbackCount?: number;
resumeCount?: number;
continueCount?: number;
companionCreditedWisdom?: number;
```

**OrchestratorCycle interface (line 109):** Add one optional field after `activeMs` (line 113):
```ts
interCycleGapMs?: number;
```

### File 2: `src/shared/history-types.ts`

**HistoryEventType (line 3):** Append 5 members to the string union before the semicolon:
```
'agent-killed' | 'agent-restarted' | 'rollback' | 'session-resumed' | 'session-continued'
```

**SessionSummary (line 60):** Add these required fields after `achievements` (line 79):
```ts
crashCount: number;
lostCount: number;
killedAgentCount: number;
rollbackCount: number;
efficiency: number | null;
```

**SessionSummaryAgent (line 31):** Add one optional field after `completedAt` (line 39):
```ts
restartCount?: number;
```

### Verification
Run `npm run build` — it must pass cleanly. Type errors in downstream consumers are expected and fine — they'll be fixed in Phase 2. The build should still pass because existing code doesn't reference the new fields yet (all additive).

### Important
- All new Session/Agent/OrchestratorCycle fields are OPTIONAL (`?:`) — backward compat with persisted JSON
- SessionSummary new fields are REQUIRED (no `?`) — they're always populated by `writeSessionSummary()`
- SessionSummaryAgent.restartCount is OPTIONAL — old summaries won't have it
- Follow existing code style exactly (spacing, comment patterns)

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.

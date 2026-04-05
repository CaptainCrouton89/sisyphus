# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 20a8fa3c-8efd-4f8e-808b-b4b918a657b3
- **Your Task**: ## Goal
Sisyphus metrics/analytics improvements — you are implementing T2: Agent Restart Tracking.

## Task
Modify `src/daemon/agent.ts` — specifically `restartAgent()` (around line 307-368) to track restart metadata.

### What to do
1. Before overwriting `spawnedAt`, preserve `originalSpawnedAt`: set to current `agent.spawnedAt` only if `!agent.originalSpawnedAt` (immutable after first restart)
2. Compute `restartCount: (agent.restartCount ?? 0) + 1`
3. Include both in the `state.updateAgent()` call (around lines 357-365)
4. After state update + `tmux.sendKeys`, emit `agent-restarted` event: `{ agentId, restartCount, originalSpawnedAt, previousStatus: agent.status }`
5. `emitHistoryEvent` is already imported (line 21). Follow the mutate-then-emit pattern from `handleAgentSubmit` (line 436-442)

### Context
- Read `context/plan-implementation.md` for full spec (T2 section)
- Read `context/audit-architecture.md` for architectural context
- The new Agent fields (`restartCount`, `originalSpawnedAt`) were added to `src/shared/types.ts` in Phase 1

### Done condition
- `npm run build` passes
- Report: what changed, file list, any issues

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

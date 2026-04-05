# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 20a8fa3c-8efd-4f8e-808b-b4b918a657b3
- **Your Task**: Session goal: Improve sisyphus metrics/analytics — add new fields to session summary and fix pruning.

YOUR TASK: Implement T7 from the implementation plan at context/plan-implementation.md (Phase 3, "Session Summary + Pruning"). This task modifies src/daemon/history.ts.

READ THESE FILES FIRST:
- .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/plan-implementation.md (T7 section, lines 114-128)
- src/daemon/history.ts (the file you'll modify)
- src/shared/types.ts (to see Session/Agent types with new fields)
- src/shared/history-types.ts (to see SessionSummary and SessionSummaryAgent interfaces)

TWO CHANGES:

1. writeSessionSummary — Add new fields to the summary object:
   - crashCount: session.agents.filter(a => a.status === 'crashed').length
   - lostCount: session.agents.filter(a => a.status === 'lost').length
   - killedAgentCount: session.agents.filter(a => a.status === 'killed').length
   - rollbackCount: session.rollbackCount ?? 0
   - efficiency: session.wallClockMs ? session.activeMs / session.wallClockMs : null
   - In the agents mapping, add: restartCount: agent.restartCount ?? 0

2. pruneHistory mtime fix (around lines 156-162):
   - Replace dir mtime fallback with reading first line of events.jsonl
   - Parse the `ts` field from the first event for a stable creation timestamp
   - Fall back to dir mtime only if events.jsonl is unreadable
   - readFileSync should already be imported; if not, add it

VERIFY: npm run build must pass clean. Report all files changed and any issues.

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

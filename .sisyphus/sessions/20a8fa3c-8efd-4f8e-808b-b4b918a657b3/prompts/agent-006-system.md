# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 20a8fa3c-8efd-4f8e-808b-b4b918a657b3
- **Your Task**: ## Goal
Sisyphus metrics/analytics improvements — you are implementing T3: Wisdom Delta Fix.

## Task
Modify `src/daemon/companion.ts` to fix the wisdom double-counting bug.

### What to do
1. **Export `computeWisdomGain`** — add `export` to the function declaration at line 640
2. **Apply delta pattern** in `onSessionComplete()` at line 686-687. Replace `companion.stats.wisdom += computeWisdomGain(session)` with the delta pattern used by strength (lines 672-674): read `session.companionCreditedWisdom ?? 0`, compute total, credit `Math.max(0, totalWisdom - creditedWisdom)`

The delta pattern prevents double-counting when `onSessionComplete` is called multiple times for the same session. Look at how `computeStrengthGain` is handled a few lines above — it reads `companionCreditedStrength`, computes total, and credits only the uncredited portion. Apply the same pattern to wisdom.

### Context
- Read `context/plan-implementation.md` for full spec (T3 section)
- The new Session field `companionCreditedWisdom` was added to `src/shared/types.ts` in Phase 1

### Done condition
- `npm run build` passes
- `npm test` passes (especially companion wisdom tests in `src/__tests__/companion.test.ts`)
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

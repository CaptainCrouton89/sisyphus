T5: InterCycleGapMs Computation — DONE

Changed file: src/daemon/orchestrator.ts (lines 433–445)

What changed:
- Before calling addOrchestratorCycle, reads the previous cycle from session.orchestratorCycles
- If cycleNum >= 2 and prevCycle.completedAt exists, computes interCycleGapMs = Date.now() - prevCycle.completedAt
- Included in the cycle object via spread (only when defined, keeping it undefined/absent for cycle 1)

Build: npm run build passes clean.
No issues.
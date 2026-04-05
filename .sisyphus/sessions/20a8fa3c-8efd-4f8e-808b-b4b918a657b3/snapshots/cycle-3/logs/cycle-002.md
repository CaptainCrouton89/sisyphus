# Cycle 002 — Audit Review & Planning Kickoff

## Decisions
- Reviewed both audit agent reports (architecture + coverage gaps). Both thorough — architecture audit found 15 issues (3 critical, 6 major, 6 minor), coverage gap audit found 7 missing lifecycle events, multiple missing type fields, and CLI stats gaps.
- Presented synthesized findings to user with 3 alignment questions: scope (must+should+cherry-pick nice-to-have), signals-snapshot fix, pruning fix.
- User approved all three. Explicit instruction: "don't take shortcuts."
- Scope finalized: all must-haves, all should-haves, cherry-picked nice-to-haves (p50/p90 distributions, temporal patterns, pruning fix, originalSpawnedAt). Excluded: planningMs/waitingMs (complex), pendingDayCount flush (low impact).

## Actions
- Updated strategy.md: moved audit to Completed, detailed planning stage with full approved scope
- Spawning plan lead agent with audit context to produce phased implementation plan

## Key Findings
- The five parallel metrics stores (history events, session state, session summary, companion state, mood signals) are never cross-validated — this is the root architectural issue
- Kill/rollback/resume paths consistently lack history events — a systematic gap, not individual oversights
- CLI stats have good raw data available but under-utilize it significantly

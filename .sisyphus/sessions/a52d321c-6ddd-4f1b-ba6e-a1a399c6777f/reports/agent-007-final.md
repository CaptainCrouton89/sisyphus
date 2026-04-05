Fixed stale session bug in src/daemon/session-manager.ts handleComplete().

Change: Moved `const session = state.getSession(cwd, sessionId)` from line 497 (before flushTimers) to after `flushTimers(sessionId)` and `handleOrchestratorComplete(sessionId, cwd, report)` (now line 499).

Previously: session was captured with pre-flush activeMs, feeding stale values to onSessionComplete() and achievement checkers (blitz, speed-run, all-nighter).

Now: session is read after both flushTimers and handleOrchestratorComplete, so activeMs and all timing fields reflect post-flush state. wallClockMs calculation and all downstream companion hooks see fresh values.

No structural changes — pure reorder. Build passes clean.
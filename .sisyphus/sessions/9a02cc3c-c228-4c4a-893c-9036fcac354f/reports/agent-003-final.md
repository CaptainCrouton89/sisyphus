Applied companion recalibration spec to pane-monitor.ts and session-manager.ts.

pane-monitor.ts:
- Added module-level temporal decay vars: lastCompletionTime, lastCrashTime, lastLevelUpTime, currentMaxCycleCount
- Exported: markEventCompletion, markEventCrash, markEventLevelUp, updateCycleCount, resetCycleCount
- Updated MoodSignals construction: justCompleted/justCrashed/justLeveledUp now use 2-min decay window instead of hardcoded false; added cycleCount (currentMaxCycleCount) and sessionsCompletedToday (companion.sessionsCompleted)

session-manager.ts:
- Added imports: markEventCompletion, markEventCrash, markEventLevelUp, updateCycleCount from pane-monitor.js
- handleComplete(): markEventCompletion() after onSessionComplete()/saveCompanion(); markEventLevelUp() inside if (leveledUp) block
- handlePaneExited() crash branch: markEventCrash() inside the companion try/catch after onAgentCrashed()/saveCompanion()
- handleYield(): updateCycleCount(session.orchestratorCycles.length) after session is loaded post-yield

Pre-existing unrelated error: src/daemon/session-manager.ts:267 TS2454 (var initialPaneId used before assigned in resumeSession) — not caused by these changes.

Note: a concurrent agent appears to have changed the saveCompanion() call in pollAllSessions() to only save on mood change (removing the always-save behavior). This is outside my task scope — flagging for awareness.
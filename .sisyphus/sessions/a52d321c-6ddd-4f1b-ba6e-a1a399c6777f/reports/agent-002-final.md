All four changes implemented successfully.

Files changed:
- src/shared/types.ts: Added model, wallClockMs, startHour, startDayOfWeek, launchConfig optional fields to Session interface
- src/daemon/state.ts: 
  - createSession now captures createdAt once and derives startHour/startDayOfWeek from it
  - Added updateSession(cwd, sessionId, updates: Partial<Session>) using withSessionLock pattern
- src/daemon/session-manager.ts:
  - Added loadConfig import
  - startSession() calls state.updateSession after createSession to set model and launchConfig
  - handleComplete() computes wallClockMs and saves via state.updateSession after completeSession
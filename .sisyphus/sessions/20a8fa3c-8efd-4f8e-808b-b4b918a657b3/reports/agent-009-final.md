T6 complete — all 6 session-manager.ts lifecycle fixes implemented.

FILES CHANGED:
- src/daemon/session-manager.ts (all modifications)

MODIFICATIONS:
1. handleKillAgent() — added flushAgentTimer() before state update, included flushed activeMs in state update, emits 'agent-killed' event
2. handleRollback() — added flushTimers() + re-read before kill loop, captures rollbackCount before restore, emits 'agent-exited' per killed agent with flushed activeMs, emits 'rollback' event after restore, persists rollbackCount after restore (since restore wipes state)
3. resumeSession() — emits 'agent-exited' for each lost agent in the lost-agent loop, emits 'session-resumed' after status update, increments resumeCount via updateSession
4. handleKill() — computes wallClockMs after flushTimers, persists via updateSession, includes wallClockMs in session-end event data
5. handleContinue() — reads session before continueSession(), increments continueCount after, emits 'session-continued' with cycleCount and activeMs
6. handleComplete() — added companionCreditedWisdom: computeWisdomGain(completedSession) to the updateSession call

IMPORTS ADDED:
- flushAgentTimer from ./pane-monitor.js
- computeWisdomGain from ./companion.js

BUILD: npm run build passes clean with no errors or warnings.

NO ISSUES FOUND.
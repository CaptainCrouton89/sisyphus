Added sendTerminalNotification calls at 4 lifecycle points in src/daemon/session-manager.ts:

1. **Session completion** (handleComplete, after markSessionCompleted ~line 640): 'Session completed: {name}'
2. **Orchestrator cycle start** (onAllAgentsDone setImmediate, after respawn + layout ~line 528): 'Cycle {N} ({mode}): {name}'
3. **All agents done** (handleSubmit, before onAllAgentsDone ~line 591): 'All agents complete: {name}'
4. **Session paused** (handlePaneExited, orchestrator exit with no agents ~line 994): 'Session paused (no agents): {name}'

All notifications:
- Gated by config.notifications?.enabled !== false (loadConfig already imported)
- Pass session.tmuxSessionName for click-to-switch
- Existing crash notifications (agent ~line 942, orchestrator ~line 971) untouched
- notify.ts not modified
- npm run build passes clean
## Current Stage
Stage: implement
Status: spawning implementation agent

## Exit Criteria
- New sendTerminalNotification calls at: handleComplete, onAllAgentsDone/respawn, handleSubmit(allDone)
- All gated on config.notifications.enabled
- Build passes

## Active Context
(none needed — changes are localized to session-manager.ts)

## Next Steps
- Spawn implement agent to add notification calls
- Build and verify

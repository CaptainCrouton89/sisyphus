## Cycle 1 — Strategy + Implementation Kickoff

**Decision:** Skip formal requirements/design/planning — this is a small, well-scoped change (adding ~4 notification calls to session-manager.ts). Went straight from strategy to implementation.

**Findings from exploration:**
- `sendTerminalNotification` (Swift SisyphusNotify.app) only called on 2 crash events
- `idle-notify.sh` hook uses terminal-notifier/osascript (not Swift app), only covers orchestrator
- Agents have no idle notification at all
- Missing notifications: session complete, mode transitions, cycle boundaries, all-agents-done

**Implementation plan:** Add `sendTerminalNotification` calls at 4 points in `session-manager.ts`:
1. `handleComplete()` — session completed
2. `onAllAgentsDone()` setImmediate — new cycle starting with mode
3. `handleSubmit()` when allDone — all agents finished
4. Gate all on `config.notifications.enabled`

**Agent spawned:** impl-notifications — implements the 4 notification points

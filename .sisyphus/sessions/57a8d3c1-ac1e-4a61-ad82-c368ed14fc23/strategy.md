## Completed
(none)

## Current Stage: implement

Small, well-scoped change. The notification system is fully understood from exploration. Skip requirements/design/planning and implement directly.

**Current state:**
- `sendTerminalNotification` (daemon-side, Swift SisyphusNotify.app) called in only 2 places:
  1. Agent crashes (pane exit without submit) — `session-manager.ts:921`
  2. Orchestrator crashes (pane exit without yield) — `session-manager.ts:950`
- `idle-notify.sh` (orchestrator Stop hook) uses `terminal-notifier`/`osascript` — NOT Swift app
- Agents have zero idle notification
- No notifications for: session completion, mode transitions, cycle boundaries

**Implementation plan (single agent, ~5 touch points in session-manager.ts):**

1. **Session complete** — In `handleComplete()`, after state update: `sendTerminalNotification('Sisyphus', 'Session completed: {name}', tmuxSessionName)`
2. **Orchestrator mode transition** — In `onAllAgentsDone()` setImmediate callback, after successful respawn: `sendTerminalNotification('Sisyphus', 'Cycle {N} starting ({mode} mode): {name}', tmuxSessionName)` — only when mode is available
3. **All agents done** — In `onAllAgentsDone()` before respawn: `sendTerminalNotification('Sisyphus', 'All agents complete, starting cycle {N}: {name}', tmuxSessionName)`
4. **Agent submitted** — In `handleSubmit()` when `allDone` is true, notify. Individual agent submits don't need notifications (too noisy).
5. **Config gating** — All new notifications gated on `config.notifications?.enabled !== false`

Keep existing `idle-notify.sh` hook — it handles the "user not watching" check which is complementary.

**Exit criteria:**
- All 4 new notification points implemented
- Config respected
- Build passes
- Daemon restart + manual verification

## Ahead
- **validate** — Build, restart daemon, trigger lifecycle events to confirm notifications

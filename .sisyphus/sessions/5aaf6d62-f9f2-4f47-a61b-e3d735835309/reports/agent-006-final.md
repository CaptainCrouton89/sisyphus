Companion hooks wired into 3 daemon files.

## Changes

### src/daemon/session-manager.ts
- Added static imports: loadCompanion, saveCompanion, onSessionStart, onSessionComplete, onAgentSpawned, onAgentCrashed, ACHIEVEMENTS from ./companion.js; generateCommentary, generateNickname from ./companion-commentary.js; flashCompanion from ./status-bar.js
- startSession(): companion hook after recomputeDots() — calls onSessionStart, saves, fire-and-forget generateCommentary('session-start')
- handleComplete(): companion hook after recomputeDots() — calls onSessionComplete (captures new achievement IDs + level change), saves, fire-and-forget commentary for session-complete/level-up/achievement; flashCompanion on successful commentary
- handleSpawn(): companion hook after recomputeDots() — calls onAgentSpawned, saves, fire-and-forget generateNickname → state.updateAgent(nickname)
- handlePaneExited() agent branch: companion hook after handleAgentKilled — calls onAgentCrashed, saves, fire-and-forget generateCommentary('agent-crash')
- All hooks wrapped in try/catch, commentary via fire-and-forget .then/.catch

### src/daemon/pane-monitor.ts
- Added imports: loadCompanion, saveCompanion, computeMood from ./companion.js; MoodSignals type from ../shared/companion-types.js
- pollAllSessions(): companion mood update block after onDotsUpdate — loads companion, builds MoodSignals from trackedSessions (recentCrashes from last 30min, sessionLengthMs from activeMs, hour of day), calls computeMood, saves only if mood changed; wrapped in try/catch

### src/daemon/status-bar.ts
- Added imports: loadCompanion from ./companion.js; renderCompanion from ../shared/companion-render.js; CompanionField type
- Added module-level flash state: flashUntil, flashText, export flashCompanion(text, durationMs=5000)
- writeStatusBar(): companion section added before final join — loads companion, renders ['face','commentary'] if flashing else ['face','boulder'] with maxWidth:20 tmuxFormat:true, pushes to sections; clears expired flash state

## Pre-existing errors (not introduced by this change)
- session-manager.ts:249 — initialPaneId used-before-assigned (var hoisting artifact in resumeSession)
- test files — Agent/OrchestratorCycle missing fields
- notify.ts — possibly undefined invocation
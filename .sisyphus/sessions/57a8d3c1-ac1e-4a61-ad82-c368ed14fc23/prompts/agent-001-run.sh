#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='57a8d3c1-ac1e-4a61-ad82-c368ed14fc23' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/prompts/agent-001-plugin" --session-id "272c540d-a80e-41f5-b423-170e81dc48a5" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-notification-system-f impl-notifications-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/prompts/agent-001-system.md')" 'Add macOS desktop notifications at key lifecycle points in the Sisyphus daemon.

## Context

Currently `sendTerminalNotification` from `src/daemon/notify.ts` is only called in 2 places in `src/daemon/session-manager.ts`:
- Line ~921: Agent crashes (pane exit without submit)
- Line ~950: Orchestrator crashes (pane exit without yield)

The user wants notifications for more events. The `sendTerminalNotification` function sends via the native Swift SisyphusNotify.app and has this signature:
```ts
sendTerminalNotification(title: string, message: string, tmuxSession?: string): void
```

It'\''s already imported in session-manager.ts. The `tmuxSession` param enables click-to-switch.

## What to implement

Add `sendTerminalNotification` calls at these 4 points in `src/daemon/session-manager.ts`:

### 1. Session completion — in `handleComplete()`
After the completion state is written (after the `markSessionCompleted` call around line 639), add:
```ts
const config = loadConfig(cwd);
if (config.notifications?.enabled !== false) {
  const sessionName = session.name ?? sessionId.slice(0, 8);
  sendTerminalNotification('\''Sisyphus'\'', `Session completed: ${sessionName}`, session.tmuxSessionName);
}
```
Note: `loadConfig` is already imported. Use the session variable that'\''s already in scope.

### 2. Orchestrator cycle start (with mode) — in the `setImmediate` callback of `onAllAgentsDone()`
After the orchestrator is successfully respawned (the `respawnOrchestrator` call succeeds, around line 530+), add a notification. You'\''ll need to read the session state to get the new cycle'\''s mode. Look at the cycle that was just started:
```ts
const config = loadConfig(cwd);
if (config.notifications?.enabled !== false) {
  const updatedSession = state.getSession(cwd, sessionId);
  const newCycle = updatedSession.orchestratorCycles[updatedSession.orchestratorCycles.length - 1];
  const modeLabel = newCycle?.mode ? ` (${newCycle.mode})` : '\'''\'';
  const sessionName = updatedSession.name ?? sessionId.slice(0, 8);
  sendTerminalNotification('\''Sisyphus'\'', `Cycle ${newCycle?.cycle ?? '\''?'\''}${modeLabel}: ${sessionName}`, updatedSession.tmuxSessionName);
}
```

### 3. All agents done — in `handleSubmit()`
When the last agent submits and `allDone` is true (around line 586-589), add a notification before calling `onAllAgentsDone`:
```ts
if (allDone) {
  const config = loadConfig(cwd);
  if (config.notifications?.enabled !== false) {
    const session = state.getSession(cwd, sessionId);
    const sessionName = session.name ?? sessionId.slice(0, 8);
    sendTerminalNotification('\''Sisyphus'\'', `All agents complete: ${sessionName}`, session.tmuxSessionName);
  }
  onAllAgentsDone(sessionId, cwd, windowId);
}
```

### 4. Session paused (no agents, orchestrator waiting) — Optional
In `handlePaneExited` when the orchestrator exits with no agents (the path that pauses the session, around line 974-980), add notification since this means the session is stuck:
```ts  
const config = loadConfig(cwd);
if (config.notifications?.enabled !== false) {
  sendTerminalNotification('\''Sisyphus'\'', `Session paused (no agents): ${sessionName}`, session.tmuxSessionName);
}
```

## Important constraints
- `loadConfig` is already imported — use it to check `config.notifications?.enabled !== false`
- `sendTerminalNotification` is already imported
- Do NOT modify `notify.ts` — only add calls in `session-manager.ts`
- Do NOT remove or modify the existing crash notifications (lines 921 and 950)
- Keep messages concise — they appear as macOS notification text
- Always pass `session.tmuxSessionName` as the third arg for click-to-switch
- After making changes, run `npm run build` to verify compilation succeeds'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %379
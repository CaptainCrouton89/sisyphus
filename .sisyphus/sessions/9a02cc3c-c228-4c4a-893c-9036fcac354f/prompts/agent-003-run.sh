#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-003' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-003-plugin" --agent 'devcore:programmer' --session-id "0cac34de-db2a-43bf-ad7a-874f253e6394" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning impl-pane-monitor-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-003-system.md')" 'Apply the companion recalibration spec to `src/daemon/pane-monitor.ts` and `src/daemon/session-manager.ts`.

Read `.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/recalibration-spec.md` first, then read both source files.

## File 1: src/daemon/pane-monitor.ts

### Add Temporal Decay Event Tracking

Add module-level timestamp variables to track when events last happened:

```typescript
let lastCompletionTime = 0;  // epoch ms
let lastCrashTime = 0;       // epoch ms
let lastLevelUpTime = 0;     // epoch ms
```

Add exported setter functions that session-manager.ts will call:

```typescript
export function markEventCompletion(): void { lastCompletionTime = Date.now(); }
export function markEventCrash(): void { lastCrashTime = Date.now(); }
export function markEventLevelUp(): void { lastLevelUpTime = Date.now(); }
```

### Update MoodSignals Construction in the poll loop

In the section where `MoodSignals` is built (search for `const signals: MoodSignals`), update:

```typescript
const nowMs = Date.now();
const DECAY_WINDOW = 120_000; // 2 minutes

const signals: MoodSignals = {
  recentCrashes,
  idleDurationMs,
  sessionLengthMs,
  cleanStreak: companion.consecutiveCleanSessions,
  justCompleted: (nowMs - lastCompletionTime) < DECAY_WINDOW,
  justCrashed: (nowMs - lastCrashTime) < DECAY_WINDOW,
  justLeveledUp: (nowMs - lastLevelUpTime) < DECAY_WINDOW,
  hourOfDay: new Date().getHours(),
  activeAgentCount,
  // NEW signals
  cycleCount: maxCycleCount,
  sessionsCompletedToday: companion.sessionsCompleted, // approximation — good enough
};
```

For `cycleCount`, you need to compute the max cycle count across tracked sessions. Add this near the `activeAgentCount` computation:

```typescript
let maxCycleCount = 0;
```

And in the session loop where you compute sessionLengthMs and activeAgentCount, also read the cycle count from session state. Look at how `trackedSessions` is used — for each tracked session, find its `orchestratorCycles.length` from the loaded state. If session state isn'\''t loaded in the loop, use a simpler approach: count the total cycles from session-manager or just track it as a module-level variable that session-manager updates.

Actually, the simplest approach: add a module-level variable:

```typescript
let currentMaxCycleCount = 0;
export function updateCycleCount(count: number): void {
  if (count > currentMaxCycleCount) currentMaxCycleCount = count;
}
export function resetCycleCount(): void { currentMaxCycleCount = 0; }
```

Then use `currentMaxCycleCount` in signals as `cycleCount`.

## File 2: src/daemon/session-manager.ts

### Call pane-monitor event setters

Import the new functions at the top:

```typescript
import { markEventCompletion, markEventCrash, markEventLevelUp, updateCycleCount } from '\''./pane-monitor.js'\'';
```

Then add calls in the appropriate handlers:

1. In `handleComplete()` — after `onSessionComplete()`:
   ```typescript
   markEventCompletion();
   ```

2. In `handlePaneExited()` — in the crash branch (where `onAgentCrashed` is called):
   ```typescript
   markEventCrash();
   ```

3. In `handleComplete()` — after the level-up detection (where `newLevel > oldLevel`):
   ```typescript
   markEventLevelUp();
   ```

4. In `handleYield()` or wherever the orchestrator cycle count is incremented:
   ```typescript
   updateCycleCount(session.orchestratorCycles.length);
   ```

Be careful to find the exact right locations in the existing code. Read the files thoroughly first. The handlers have complex async flows with try/catch — place the calls in the right spots.

IMPORTANT: These are non-critical calls. Wrap in try/catch if there'\''s any risk of breaking the handler flow. But since they'\''re just setting module-level numbers, they shouldn'\''t throw.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2449
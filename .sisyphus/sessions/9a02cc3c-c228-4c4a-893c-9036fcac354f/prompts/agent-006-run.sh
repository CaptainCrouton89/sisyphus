#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-006-plugin" --agent 'devcore:programmer' --session-id "0c6c5736-7030-4ffd-98cf-3f7277286227" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning fix-dawn-patrol-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-006-system.md')" 'Fix the `dawn-patrol` achievement checker in `src/daemon/companion.ts` (around line 284-297).

**Bug:** Description says "Session active spanning midnight to 6am" but the checker tests whether the session started before 6am and ended after 6am — it checks sessions spanning the 6am boundary, not midnight. A session starting at 11pm and ending at 1am (spanning midnight) would NOT trigger this.

**Current code (lines 284-297):**
```typescript
'\''dawn-patrol'\'': (_c, s) => {
    if (!s) return false;
    const start = new Date(s.createdAt).getTime();
    const end = s.completedAt ? new Date(s.completedAt).getTime() : Date.now();
    const startDate = new Date(start);
    const midnight = new Date(startDate);
    midnight.setHours(0, 0, 0, 0);
    const sixAm = new Date(startDate);
    sixAm.setHours(6, 0, 0, 0);
    const nextMidnight = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);
    return start < nextMidnight.getTime() && end >= sixAm.getTime() && start < sixAm.getTime();
  },
```

**Fix:** The achievement should fire when a session was active during both sides of midnight — started before midnight and still running after midnight (or started before midnight and ended after 6am, covering the full window). The simplest correct interpretation of "spanning midnight to 6am": session was active at some point during the midnight-to-6am window.

```typescript
'\''dawn-patrol'\'': (_c, s) => {
    if (!s) return false;
    const start = new Date(s.createdAt).getTime();
    const end = s.completedAt ? new Date(s.completedAt).getTime() : Date.now();
    // Find the midnight boundary: if session started before midnight, use next midnight;
    // if started after midnight (but before 6am), use that day'\''s midnight (already passed)
    const startDate = new Date(start);
    const startHour = startDate.getHours();
    // Get today'\''s midnight (00:00) for the start date
    const todayMidnight = new Date(startDate);
    todayMidnight.setHours(0, 0, 0, 0);
    // Get 6am for the same calendar day as midnight
    const sixAm = new Date(todayMidnight);
    sixAm.setHours(6, 0, 0, 0);
    
    if (startHour >= 6) {
      // Started after 6am — check if session spans into next day'\''s midnight-6am window
      const nextMidnight = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
      const nextSixAm = new Date(nextMidnight.getTime() + 6 * 60 * 60 * 1000);
      // Session must have started before next midnight and still be active past it
      return start < nextMidnight.getTime() && end > nextMidnight.getTime();
    } else {
      // Started between midnight and 6am — session is already in the window
      // Must have started before 6am (already true since startHour < 6)
      return start < sixAm.getTime();
    }
  },
```

Also update the test in `src/__tests__/companion.test.ts`. The existing test has a session starting at 5am ending at 7am — that should still pass (started in the midnight-6am window). Add a second test: session starting at 11pm (23:00) and ending at 1am — should also pass (spans midnight).

Run `npm test` after to verify.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2483
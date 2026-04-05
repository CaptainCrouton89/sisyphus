#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-005-plugin" --agent 'devcore:programmer' --session-id "b425dccf-1364-4f91-bb7f-6f3c2d31d8c7" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning fix-wanderer-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-005-system.md')" 'Fix the `wanderer` achievement checker in `src/daemon/companion.ts` (around line 319-327).

**Bug:** The checker reconstructs daily repo counts from `repo.lastSeen`, which only reflects the MOST RECENT visit date. If repo A is visited Monday then Tuesday, Monday'\''s count loses repo A. The correct data source `companion.dailyRepos` (populated by `onSessionStart` at ~line 428-433) tracks exact daily visits but is ignored.

**Current code (lines 319-327):**
```typescript
'\''wanderer'\'': (c) => {
    const counts: Record<string, Set<string>> = {};
    for (const [path, repo] of Object.entries(c.repos)) {
      const date = repo.lastSeen.slice(0, 10);
      if (!counts[date]) counts[date] = new Set();
      counts[date].add(path);
    }
    return Object.values(counts).some(s => s.size >= 5);
  },
```

**Fix:** Use `companion.dailyRepos` (type: `Record<string, string[]>` where key is ISO date `YYYY-MM-DD` and value is array of repo paths) instead:
```typescript
'\''wanderer'\'': (c) => {
    return Object.values(c.dailyRepos).some(repos => repos.length >= 5);
  },
```

Also update the existing test for wanderer in `src/__tests__/companion.test.ts` to use `dailyRepos` instead of setting up repos with `lastSeen`. The test should verify that a companion with `dailyRepos: { '\''2024-01-15'\'': ['\''/a'\'', '\''/b'\'', '\''/c'\'', '\''/d'\'', '\''/e'\''] }` triggers the achievement.

Run `npm test` after to verify.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2482
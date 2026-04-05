#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-012' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-012-plugin" --agent 'devcore:programmer' --session-id "217fbcc0-b0fb-4f12-8665-753ab3bf08a5" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning achievement-badges-tests-devcore:programmer c10' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-012-system.md')" '## Goal
Add badge art for 31 new achievements and update tests for the achievement overhaul.

## Spec
Read the full spec at: .sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/achievement-overhaul-spec.md

## Files to Modify

### 1. src/shared/companion-badges.ts

**BADGE_ART record** — Add entries for all 31 new AchievementId values. This record is typed as `Record<AchievementId, string[]>` so EVERY AchievementId must have an entry.

The new IDs to add (grouped by category):

Milestones: regular, veteran, swarm-starter, legion, army-of-thousands, singularity, first-shift, workaholic, time-lord, eternal-grind, epoch, seasoned, omnipresent, apprentice, journeyman, master, grandmaster

Session: squad, battalion, swarm, deep-dive, abyss, eternal-recurrence, endurance, ultramarathon, one-shot, flash

Behavioral: overdrive, iron-streak, deep-conversation, one-must-imagine

For badge art style, look at the existing entries. They use box-drawing characters (╱╲╳│─┌┐└┘├┤┬┴┼), block elements (◆◉★), and simple ASCII symbols. Each badge is an array of strings, roughly 8-12 lines, ~20 chars wide. Keep the art simple but thematically relevant:

- Tier achievements (regular/veteran, swarm-starter/legion/etc) can share visual motifs with increasing complexity
- Time achievements (first-shift, workaholic, etc) can use clock/hourglass motifs
- Level achievements (apprentice-grandmaster) can use ascending mountain/crown motifs
- Session achievements match their theme (squad=small group, swarm=many dots, flash=lightning, etc.)

### 2. src/__tests__/companion.test.ts

Update existing tests and add new ones. Read the current test file to understand the patterns used.

Key updates needed:

**ACHIEVEMENTS count test** — Change from 35 to 66:
```typescript
it('\''contains exactly 66 entries'\'', () => {
  assert.equal(ACHIEVEMENTS.length, 66);
});
```

**Threshold test updates** (existing tests that check old values):

- cartographer test (line ~419): change `length: 10` to `length: 5` for the threshold test. Add a negative test at 4 repos.
- world-traveler test (line ~427): change `length: 25` to `length: 15`. Add negative at 14.
- old-growth test (line ~437): comment says "30 days" — the checker is 14 days, no change needed but fix the comment.
- speed-run test (line ~467): change `activeMs: 200_000` to a value < 900_000 (e.g., 800_000). Add negative test at 900_001.
- flawless test (line ~473): needs 10+ agents now. Update the test to have 10 agents, all completed.
- iron-will test (line ~487): change from `consecutiveCleanSessions: 10` to `consecutiveEfficientSessions: 10`.
- creature-of-habit test (line ~619): already tests visits: 20 which passes >= 10, but fix comment/description reference.
- loyal test (line ~623): already tests visits: 50 which passes >= 30, OK.
- wanderer test (line ~629): change from 5 repos to 3 repos (positive). Change 4 repos negative test to 2 repos.
- hot-streak test (line ~645): change from `consecutiveCleanSessions: 7` to `consecutiveCleanSessions: 15`.
- momentum test (line ~649): change to check 5 completions within 4 hours.
- pair-programming test (line ~734): change from 3 to 8 messages.
- all-nighter test (line ~586): change from 28_800_000 (8h) to 18_000_000 (5h).
- night-owl test (line ~549): test with hour 2 (was 1). Hour 1 should now FAIL (narrowed to 1-5, inclusive on 1). Actually the new window is h >= 1 && h < 5, so hour 1 should PASS. Test hour 0 for FAIL case.

**New achievement tests to add:**

Add at least one positive test for each new achievement category. Focus on:
- `regular`: sessionsCompleted >= 10
- `squad`: session with 10+ agents
- `swarm-starter`: lifetimeAgentsSpawned >= 50
- `first-shift`: totalActiveMs >= 36_000_000
- `apprentice`: level >= 5
- `deep-dive`: 15+ orchestrator cycles
- `one-shot`: 5+ agents, 1 cycle, completed
- `flash`: activeMs < 120_000, completed
- `overdrive`: 6+ entries in recentCompletions on same date
- `iron-streak`: consecutiveDaysActive >= 14
- `deep-conversation`: 20+ user messages
- `one-must-imagine`: taskHistory entry >= 10
- `flawless` redefined: positive (10+ agents, all clean) and negative (9 agents, all clean should fail)
- `iron-will` redefined: consecutiveEfficientSessions >= 10

Also add `consecutiveEfficientSessions` to the onSessionComplete tests:
- Test that completing a session with <= 3 cycles increments consecutiveEfficientSessions
- Test that completing with > 3 cycles resets it to 0

## Important
- The `makeCompanion` helper accepts partial overrides — use it for setting up state
- The `makeSession` helper accepts partial Session overrides
- Import `consecutiveEfficientSessions` is just a number on CompanionState — no new imports needed
- Do NOT modify companion-types.ts or companion.ts — another agent handles those
- Run `npm run build` after changes to verify (may have type errors until other agent finishes — that'\''s OK, just note them in your report)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2504
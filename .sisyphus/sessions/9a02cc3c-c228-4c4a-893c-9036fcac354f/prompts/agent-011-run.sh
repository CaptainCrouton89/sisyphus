#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-011' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-011-plugin" --agent 'devcore:programmer' --session-id "c408eda1-5156-4a73-89eb-70161b75f096" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning achievement-logic-devcore:programmer c10' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-011-system.md')" '## Goal
Implement the achievement overhaul for the sisyphus companion system — types, definitions, checkers, and state changes.

## Spec
Read the full spec at: .sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/achievement-overhaul-spec.md

## Files to Modify

### 1. src/shared/companion-types.ts

**AchievementId type union** — Add 31 new IDs. Organize by category with comments. The complete list of ALL IDs (existing + new) is in the spec Part 5. Keep the same category grouping pattern.

**ACHIEVEMENTS array** — Add 31 new AchievementDef entries with correct names, categories, and descriptions from the spec. Also update 13 existing descriptions to match new thresholds (Part 1 of spec). Set `badge: null` for all new entries. Keep achievements grouped by category.

**CompanionState interface** — Add `consecutiveEfficientSessions: number` field after `consecutiveCleanSessions`.

### 2. src/daemon/companion.ts

**loadCompanion()** — Add forward-compat fill: `if (state.consecutiveEfficientSessions == null) state.consecutiveEfficientSessions = 0;`

**createDefaultCompanion()** — Add `consecutiveEfficientSessions: 0` to the returned object.

**ACHIEVEMENT_CHECKERS** — This is the core logic. For each existing achievement, update the checker per Part 1 and Part 2 of the spec. For each new achievement, add a checker per Part 3. Key changes:

Threshold changes on existing checkers:
- centurion: >= 100 (was 50)
- thousand-boulder: >= 1000 (was 500)
- cartographer: >= 5 (was 10)
- world-traveler: >= 15 (was 25)
- hive-mind: >= 500 (was 200)
- wanderer: >= 3 (was 5)
- hot-streak: >= 15 (was 5)
- pair-programming: >= 8 (was 3)
- speed-run: < 900_000 (was 480_000, now <15min)
- all-nighter: >= 18_000_000 (was 21_600_000, now 5h)
- night-owl: narrow window to h >= 1 && h < 5 (was h >= 0 && h < 6)
- dawn-patrol: add duration check — session must be 3+ hours AND span midnight-6am
- momentum: needs 5 completions within 4 hours (was 3 within 3h) — update to check slice(-5) and 4h window

Redefinitions:
- flawless: add `s.agents.length >= 10` check
- iron-will: change to `c.consecutiveEfficientSessions >= 10`

New checkers — see spec Part 3 for exact logic. Key patterns:
- Milestone checkers are simple threshold checks against companion state fields
- Session checkers check properties of the `s` (session) parameter
- `overdrive`: count entries in c.recentCompletions that share the same ISO date (startsWith date string) >= 6
- `deep-conversation`: like message-in-a-bottle but >= 20

**onSessionComplete()** — Add tracking for consecutiveEfficientSessions BEFORE the checkAchievements call:
```typescript
const cycleCount = session.orchestratorCycles?.length ?? 0;
if (cycleCount <= 3) {
  companion.consecutiveEfficientSessions++;
} else {
  companion.consecutiveEfficientSessions = 0;
}
```
Note: `cycleCount` is already computed earlier in this function for patience tracking. Reuse that variable.

## Important Notes
- Do NOT modify companion-badges.ts or companion.test.ts — another agent handles those
- The ACHIEVEMENT_CHECKERS record is typed as Record<AchievementId, AchievementChecker> — every ID in the union MUST have a checker entry or TypeScript will error
- Keep the same code style: const arrow functions, clean formatting
- Run `npm run build` after changes to verify TypeScript compiles'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2501
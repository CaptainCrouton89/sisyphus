# agent-011 — achievement-logic

**Status:** completed  |  **Duration:** 3m 40s  |  **Type:** devcore:programmer
**Spawned:** Apr 2, 02:23:06
**Completed:** Apr 2, 02:26:47
**Claude Session:** c408eda1-5156-4a73-89eb-70161b75f096


---


## Instruction

## Goal
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
- Run `npm run build` after changes to verify TypeScript compiles


---


## Reports (1)

### FINAL — Apr 2, 02:26:47

Achievement overhaul implemented successfully.

## Changes

### src/shared/companion-types.ts
- AchievementId union: expanded from 35 to 66 IDs (added 31 new, organized by category with counts in comments)
- CompanionState: added consecutiveEfficientSessions: number after consecutiveCleanSessions
- ACHIEVEMENTS array: added 31 new AchievementDef entries (badge: null on all new); updated descriptions for centurion, thousand-boulder, cartographer, world-traveler, hive-mind, wanderer, hot-streak, momentum, pair-programming, speed-run, all-nighter, night-owl, dawn-patrol, flawless, iron-will

### src/daemon/companion.ts
- loadCompanion(): added forward-compat fill for consecutiveEfficientSessions
- createDefaultCompanion(): added consecutiveEfficientSessions: 0
- ACHIEVEMENT_CHECKERS: added 31 new checkers; updated 15 existing (13 threshold changes + flawless + iron-will redefinitions); all 66 IDs covered
- onSessionComplete(): added consecutiveEfficientSessions tracking using existing cycleCount variable, placed before checkAchievements call

Build: clean (npm run build passed, no TypeScript errors)

## Notes
- recentCompletions cap remains at 10 (sufficient for overdrive 6-in-a-day and momentum 5-in-4h)
- overdrive counts by date across all recentCompletions entries (no todayIso() dependency)
- dawn-patrol: duration check uses s.activeMs < 10_800_000 (3h in ms) guard added before span check

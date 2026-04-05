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
WP1 complete.

Files created:
- src/shared/companion-types.ts — All types: CompanionStats, Mood, UnlockedAchievement, RepoMemory, LastCommentary, CompanionState, CompanionField, AchievementId (35 IDs), AchievementCategory, AchievementDef, CompanionRenderOpts (with tmuxFormat/repoPath/agentCount added to match companion-render.ts already on disk), MoodSignals, IdleAnimation, IdleState, CommentaryEvent, TimePersonality
- src/daemon/companion.ts — Full module: loadCompanion, saveCompanion, createDefaultCompanion, computeXP, computeLevel, getTitle, computeMood (using plan's MoodSignals signature, not task description's simplified signature), ACHIEVEMENTS (35 defs), hasAchievement, checkAchievements, updateRepoMemory, onSessionStart, onSessionComplete, onAgentSpawned, onAgentCrashed

Files modified:
- src/shared/paths.ts — Added companionPath()
- src/shared/types.ts — Added nickname?: string to Agent after name field

Design decisions:
- CompanionState extended with: consecutiveCleanSessions, consecutiveDaysActive, lastActiveDate, taskHistory, dailyRepos, recentCompletions (all needed for achievement checkers per plan section 6)
- computeMood signature follows plan (companion, session?, signals?) not task description's simplified (companion, activeSessions, recentCrashes)
- onSessionComplete returns AchievementId[] (newly unlocked) and mutates companion.achievements in place
- CompanionRenderOpts extended with tmuxFormat, repoPath, agentCount to match companion-render.ts already present on disk (another agent's work — those fields were causing type errors)
- comeback-kid heuristic: checks parentSessionId since there's no explicit 'was-paused' flag in Session type

Pre-existing type errors (not mine):
- src/__tests__/state.test.ts — stale test fixtures missing activeMs/repo on Agent, activeMs on OrchestratorCycle
- src/__tests__/session-logic.test.ts — activeMs type mismatch in test fixture
- src/daemon/notify.ts:13 — possibly undefined invocation
- src/daemon/session-manager.ts:229 — variable used before assignment
All 7 pre-existing errors existed before my changes. Zero errors in my files.
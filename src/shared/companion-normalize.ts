import type {
  CompanionBaselines,
  CompanionState,
  RunningStats,
} from './companion-types.js';

export function emptyStats(): RunningStats {
  return { count: 0, mean: 0, m2: 0 };
}

export function defaultBaselines(): CompanionBaselines {
  return {
    sessionMs: emptyStats(),
    cycleCount: emptyStats(),
    agentCount: emptyStats(),
    sessionsPerDay: emptyStats(),
    recentAgentThroughput: emptyStats(),
    lastCountedDay: null,
    pendingDayCount: 0,
  };
}

/**
 * Forward-compat for companion.json files written by older versions or
 * partially-initialized state. Mutates and returns the input.
 *
 * Both the daemon (which writes the file) and the TUI (which reads it
 * directly to render) must run state through this before use — otherwise
 * missing fields like `spinnerVerbIndex` propagate into NaN modulo and
 * crash `renderCompanion`.
 */
export function normalizeCompanion(state: CompanionState): CompanionState {
  if (state.stats == null) state.stats = { strength: 0, endurance: 0, wisdom: 0, patience: 0 };
  if (state.level == null) state.level = 1;
  if (state.xp == null) state.xp = 0;
  if (state.title == null) state.title = 'Boulder Intern';
  if (state.mood == null) state.mood = 'sleepy';
  if (state.achievements == null) state.achievements = [];
  if (state.repos == null) state.repos = {};
  if (state.lastCommentary === undefined) state.lastCommentary = null;
  if (state.sessionsCompleted == null) state.sessionsCompleted = 0;
  if (state.sessionsCrashed == null) state.sessionsCrashed = 0;
  if (state.totalActiveMs == null) state.totalActiveMs = 0;
  if (state.consecutiveCleanSessions == null) state.consecutiveCleanSessions = 0;
  if (state.consecutiveDaysActive == null) state.consecutiveDaysActive = 0;
  if (state.lastActiveDate === undefined) state.lastActiveDate = null;
  if (state.taskHistory == null) state.taskHistory = {};
  if (state.dailyRepos == null) state.dailyRepos = {};
  if (state.recentCompletions == null) state.recentCompletions = [];
  if (state.lifetimeAgentsSpawned == null) state.lifetimeAgentsSpawned = 0;
  if (state.consecutiveEfficientSessions == null) state.consecutiveEfficientSessions = 0;
  if (state.consecutiveHighCycleSessions == null) state.consecutiveHighCycleSessions = 0;
  if (state.spinnerVerbIndex == null) state.spinnerVerbIndex = 0;
  if (state.baselines == null) state.baselines = defaultBaselines();
  if (state.baselines.recentAgentThroughput == null) state.baselines.recentAgentThroughput = emptyStats();
  if (state.commentaryHistory == null) state.commentaryHistory = [];
  if (state.feedbackHistory == null) state.feedbackHistory = [];
  return state;
}

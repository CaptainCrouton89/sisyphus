import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { companionPath, globalDir } from '../shared/paths.js';
import type { Session } from '../shared/types.js';
import type {
  AchievementId,
  CommentaryEvent,
  CompanionBaselines,
  CompanionState,
  CompanionStats,
  LastCommentary,
  Mood,
  MoodSignals,
  RepoMemory,
  RunningStats,
  UnlockedAchievement,
} from '../shared/companion-types.js';
export { ACHIEVEMENTS } from '../shared/companion-types.js';

// ---------------------------------------------------------------------------
// Welford's online algorithm — deviation-based mood scoring
// ---------------------------------------------------------------------------

const MIN_SAMPLES = 5;
const MIN_STDDEV_RATIO = 0.20;

type BaselineMetric = 'sessionMs' | 'cycleCount' | 'agentCount' | 'sessionsPerDay';

const ABSOLUTE_STDDEV_FLOORS: Record<BaselineMetric, number> = {
  sessionMs: 300_000,     // 5 minutes
  cycleCount: 1.0,
  agentCount: 1.0,
  sessionsPerDay: 0.5,
};

const COLD_START_DEFAULTS: Record<BaselineMetric, { mean: number; stddev: number }> = {
  sessionMs:      { mean: 3_600_000, stddev: 2_400_000 },
  cycleCount:     { mean: 5,         stddev: 3 },
  agentCount:     { mean: 5,         stddev: 4 },
  sessionsPerDay: { mean: 3,         stddev: 2 },
};

export function emptyStats(): RunningStats {
  return { count: 0, mean: 0, m2: 0 };
}

export function defaultBaselines(): CompanionBaselines {
  return {
    sessionMs: emptyStats(),
    cycleCount: emptyStats(),
    agentCount: emptyStats(),
    sessionsPerDay: emptyStats(),
    lastCountedDay: null,
    pendingDayCount: 0,
  };
}

export function welfordUpdate(stats: RunningStats, value: number): void {
  stats.count++;
  const delta = value - stats.mean;
  stats.mean += delta / stats.count;
  const delta2 = value - stats.mean;
  stats.m2 += delta * delta2;
}

export function zScore(
  value: number,
  stats: RunningStats,
  metric: BaselineMetric,
): number {
  const defaults = COLD_START_DEFAULTS[metric];
  const floor = ABSOLUTE_STDDEV_FLOORS[metric];

  if (stats.count < MIN_SAMPLES) {
    if (defaults.stddev === 0) return 0;
    return (value - defaults.mean) / defaults.stddev;
  }

  const rawStddev = stats.count >= 2 ? Math.sqrt(stats.m2 / stats.count) : 0;
  const stddev = Math.max(rawStddev, stats.mean * MIN_STDDEV_RATIO, floor);
  if (stddev === 0) return 0;
  return (value - stats.mean) / stddev;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadCompanion(): CompanionState {
  const path = companionPath();
  if (!existsSync(path)) {
    const state = createDefaultCompanion();
    saveCompanion(state);
    return state;
  }
  const raw = readFileSync(path, 'utf-8');
  const state = JSON.parse(raw) as CompanionState;
  // Forward-compat: fill missing fields
  if (state.consecutiveCleanSessions == null) state.consecutiveCleanSessions = 0;
  if (state.consecutiveDaysActive == null) state.consecutiveDaysActive = 0;
  if (state.lastActiveDate == null) state.lastActiveDate = null;
  if (state.taskHistory == null) state.taskHistory = {};
  if (state.dailyRepos == null) state.dailyRepos = {};
  if (state.recentCompletions == null) state.recentCompletions = [];
  if (state.lifetimeAgentsSpawned == null) state.lifetimeAgentsSpawned = 0;
  if (state.consecutiveEfficientSessions == null) state.consecutiveEfficientSessions = 0;
  if (state.consecutiveHighCycleSessions == null) state.consecutiveHighCycleSessions = 0;
  if (state.spinnerVerbIndex == null) state.spinnerVerbIndex = 0;
  if (state.baselines == null) state.baselines = defaultBaselines();
  if (state.commentaryHistory == null) state.commentaryHistory = [];
  return state;
}

export function saveCompanion(state: CompanionState): void {
  const path = companionPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.companion.${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, path);
}

const MAX_COMMENTARY_HISTORY = 30;

/**
 * Push a commentary entry to lastCommentary + commentaryHistory ring buffer.
 * Mutates the companion in-place; caller must saveCompanion() afterward.
 */
export function recordCommentary(companion: CompanionState, text: string, event: CommentaryEvent): void {
  const entry: LastCommentary = { text, event, timestamp: new Date().toISOString() };
  companion.lastCommentary = entry;
  if (!companion.commentaryHistory) companion.commentaryHistory = [];
  companion.commentaryHistory.push(entry);
  if (companion.commentaryHistory.length > MAX_COMMENTARY_HISTORY) {
    companion.commentaryHistory = companion.commentaryHistory.slice(-MAX_COMMENTARY_HISTORY);
  }
}

export function createDefaultCompanion(): CompanionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    name: null,
    createdAt: now,
    stats: {
      strength: 0,
      endurance: 0,
      wisdom: 0,
      patience: 0,
    },
    xp: 0,
    level: 1,
    title: 'Boulder Intern',
    mood: 'sleepy',
    moodUpdatedAt: now,
    achievements: [],
    repos: {},
    lastCommentary: null,
    commentaryHistory: [],
    sessionsCompleted: 0,
    sessionsCrashed: 0,
    totalActiveMs: 0,
    lifetimeAgentsSpawned: 0,
    consecutiveCleanSessions: 0,
    consecutiveEfficientSessions: 0,
    consecutiveHighCycleSessions: 0,
    consecutiveDaysActive: 0,
    lastActiveDate: null,
    taskHistory: {},
    dailyRepos: {},
    recentCompletions: [],
    spinnerVerbIndex: 0,
    baselines: defaultBaselines(),
  };
}

// ---------------------------------------------------------------------------
// XP & Leveling
// ---------------------------------------------------------------------------

export function computeXP(stats: CompanionStats): number {
  const strengthXP = stats.strength * 50;
  const enduranceXP = (stats.endurance / 3_600_000) * 20;
  const wisdomXP = stats.wisdom * 40;
  const patienceXP = stats.patience * 8;
  return Math.floor(strengthXP + enduranceXP + wisdomXP + patienceXP);
}

export function computeStrengthGain(agentCount: number): number {
  if (agentCount <= 0) return 0;
  if (agentCount <= 2) return 1;
  if (agentCount <= 5) return 2;
  if (agentCount <= 10) return 3;
  if (agentCount <= 20) return 4;
  return 5;
}

export function computeLevel(xp: number): number {
  let level = 1;
  let threshold = 150;
  let cumulative = 0;
  while (cumulative + threshold <= xp) {
    cumulative += threshold;
    level++;
    threshold = Math.floor(threshold * 1.35);
  }
  return level;
}

/** Returns { xpIntoLevel, xpForNextLevel } so callers can render accurate progress bars. */
export function computeLevelProgress(xp: number): { xpIntoLevel: number; xpForNextLevel: number } {
  let threshold = 150;
  let cumulative = 0;
  while (cumulative + threshold <= xp) {
    cumulative += threshold;
    threshold = Math.floor(threshold * 1.35);
  }
  return { xpIntoLevel: xp - cumulative, xpForNextLevel: threshold };
}

const TITLE_MAP: Record<number, string> = {
  1: 'Boulder Intern',
  2: 'Pebble Pusher',
  3: 'Rock Hauler',
  4: 'Gravel Wrangler',
  5: 'Slope Familiar',
  6: 'Incline Regular',
  7: 'Ridge Runner',
  8: 'Crag Warden',
  9: 'Stone Whisperer',
  10: 'Boulder Brother',
  11: 'Hill Veteran',
  12: 'Summit Aspirant',
  13: 'Peak Haunter',
  14: 'Cliff Sage',
  15: "Mountain's Shadow",
  16: 'Eternal Roller',
  17: "Gravity's Rival",
  18: 'The Unmoved Mover',
  19: 'Camus Was Right',
  20: 'The Absurd Hero',
  25: 'One Must Imagine Him Happy',
  30: 'He Has Always Been Here',
};

export function getTitle(level: number): string {
  for (let l = level; l >= 1; l--) {
    if (TITLE_MAP[l] !== undefined) return TITLE_MAP[l]!;
  }
  return 'Boulder Intern';
}

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

export function computeMood(companion: CompanionState, session?: Session, signals?: MoodSignals): Mood {
  if (!signals) {
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 6) return 'existential';
    if (hour >= 22 || hour < 2) return 'sleepy';
    return 'zen';
  }

  const scores: Record<Mood, number> = {
    happy: 0,
    grinding: 0,
    frustrated: 0,
    zen: 0,
    sleepy: 0,
    excited: 0,
    existential: 0,
  };

  const cycleCount = signals.cycleCount ?? 0;
  const sessionsCompletedToday = signals.sessionsCompletedToday ?? 0;

  // Deviation-based z-scores from personal baselines
  const baselines = companion.baselines ?? defaultBaselines();
  const sessionZ = zScore(signals.sessionLengthMs, baselines.sessionMs, 'sessionMs');
  const cycleZ = zScore(cycleCount, baselines.cycleCount, 'cycleCount');
  const agentZ = zScore(signals.totalAgentCount ?? 0, baselines.agentCount, 'agentCount');
  const dailyZ = zScore(sessionsCompletedToday, baselines.sessionsPerDay, 'sessionsPerDay');

  // Happy — event-driven + deviation-based quick wins
  if (signals.justCompleted) scores.happy += 50;
  if (signals.justCompleted && sessionZ < -0.5) scores.happy += 15; // quicker than usual
  if (dailyZ > 0.5) scores.happy += 20; // productive day
  if (dailyZ > 1.5) scores.happy += 10; // really productive
  if (signals.hourOfDay >= 6 && signals.hourOfDay < 12) scores.happy += 15; // morning
  if (signals.hourOfDay >= 12 && signals.hourOfDay < 17) scores.happy += 8; // afternoon
  if ((signals.activeAgentCount ?? 0) >= 1 && sessionZ < -0.5) scores.happy += 12; // early session optimism
  // Flow state: last completion was recent (within 30min) and we're in a new session
  const lastCompletion = companion.recentCompletions.length > 0
    ? Date.now() - new Date(companion.recentCompletions[companion.recentCompletions.length - 1]!).getTime()
    : Infinity;
  if (lastCompletion < 1_800_000 && signals.sessionLengthMs > 0) scores.happy += 20;

  // Grinding — deviation-based deep work
  if (sessionZ > 0.5) scores.grinding += 15; // longer than usual
  if (sessionZ > 1.0) scores.grinding += 10; // significantly longer
  if (sessionZ > 1.5) scores.grinding += 8;  // very long for this user
  if (agentZ > 0.5) scores.grinding += 10;   // more agents than usual
  if (cycleZ > 0.5) scores.grinding += 8;    // more cycles than usual

  // Frustrated — actual negative events (crashes, rollbacks, restarts, lost agents)
  const rollbacks = signals.rollbackCount ?? 0;
  const restartedAgents = signals.restartedAgentCount ?? 0;
  const lostAgents = signals.lostAgentCount ?? 0;
  const killedAgents = signals.killedAgentCount ?? 0;
  if (signals.justCrashed) scores.frustrated += 30;
  if (signals.recentCrashes >= 2) scores.frustrated += 20;
  if (signals.recentCrashes >= 4) scores.frustrated += 15;
  if (rollbacks >= 1) scores.frustrated += 25;  // rolling back = something went wrong
  if (rollbacks >= 3) scores.frustrated += 25;  // repeated rollbacks = real pain
  if (restartedAgents >= 1) scores.frustrated += 15;
  if (restartedAgents >= 3) scores.frustrated += 15;
  if (lostAgents >= 1) scores.frustrated += 15;
  if (lostAgents >= 3) scores.frustrated += 10;
  if (killedAgents >= 2) scores.frustrated += 10;
  // Long session WITH negative events = stuck (but long session alone is just grinding)
  if (sessionZ > 1.5 && (signals.recentCrashes > 0 || rollbacks > 0)) scores.frustrated += 12;

  // Zen — deviation-based "normal" + absolute calm
  if (companion.stats.patience > 30) scores.zen += 15;
  if (signals.idleDurationMs > 120_000 && signals.idleDurationMs <= 900_000) scores.zen += 25; // 2-15min idle
  if (sessionZ > -1.0 && sessionZ < 0.3) scores.zen += 15; // session length is normal
  if (cycleZ < 0) scores.zen += 10; // fewer cycles than usual, smooth sailing
  if (signals.hourOfDay >= 6 && signals.hourOfDay < 10 && (signals.activeAgentCount ?? 0) === 0) scores.zen += 10;
  if (dailyZ >= -0.5 && dailyZ <= 0.5) scores.zen += 10; // normal day

  // Sleepy — absolute (idle duration + time of day)
  if (signals.idleDurationMs > 900_000) scores.sleepy += 30;   // >15min
  if (signals.idleDurationMs > 2_700_000) scores.sleepy += 25;  // >45min
  if (signals.idleDurationMs > 5_400_000) scores.sleepy += 15;  // >90min
  if (signals.hourOfDay >= 22 || signals.hourOfDay < 6) scores.sleepy += 20;
  if (signals.idleDurationMs > 300_000 && (signals.hourOfDay >= 22 || signals.hourOfDay < 6)) scores.sleepy += 15;
  if (sessionZ > 2.5) scores.sleepy += 12; // exhaustion from extreme session

  // Excited — event-driven + deviation-based swarms
  if (signals.justLeveledUp) scores.excited += 60;
  if (signals.justCompleted && agentZ > 1.0) scores.excited += 30; // completed with notably many agents
  if (agentZ > 1.5) scores.excited += 20; // way more agents than usual
  if (agentZ > 2.0) scores.excited += 15; // massive swarm for this user
  if (signals.justCompleted && sessionZ < -1.0) scores.excited += 20; // way faster than usual

  // Existential — absolute (late night + experience + sustained commitment)
  if (signals.hourOfDay >= 2 && signals.hourOfDay < 6) scores.existential += 25;
  if (signals.hourOfDay >= 0 && signals.hourOfDay < 2) scores.existential += 10;
  const enduranceHours = companion.stats.endurance / 3_600_000;
  if (enduranceHours > 40) scores.existential += 15;
  if (signals.hourOfDay >= 2 && signals.hourOfDay < 6 && enduranceHours > 40) {
    scores.existential += 25;
  }
  // Weekly activity z-score — sustained above-average use, not a static lifetime counter
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3_600_000;
  const weeklyCompletions = companion.recentCompletions.filter(
    ts => new Date(ts).getTime() > weekAgo
  ).length;
  const weeklyAvgDaily = weeklyCompletions / 7;
  const weeklyZ = zScore(weeklyAvgDaily, baselines.sessionsPerDay, 'sessionsPerDay');
  if (weeklyZ > 0.5) scores.existential += 8;
  if (weeklyZ > 1.0) scores.existential += 7;
  if (weeklyZ > 1.5) scores.existential += 5;
  // Consecutive days — grows slowly from day 3, caps at +20 around day 9
  const consecutiveDays = companion.consecutiveDaysActive ?? 0;
  if (consecutiveDays >= 3) scores.existential += Math.min(20, (consecutiveDays - 2) * 3);

  const moodOrder: Mood[] = ['happy', 'grinding', 'frustrated', 'zen', 'sleepy', 'excited', 'existential'];
  let best: Mood = 'grinding';
  let bestScore = -1;
  for (const mood of moodOrder) {
    if (scores[mood] > bestScore) {
      bestScore = scores[mood];
      best = mood;
    }
  }

  // Attach debug info for TUI debug overlay
  companion.debugMood = { signals, scores: { ...scores }, winner: best };

  return best;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export function hasAchievement(companion: CompanionState, id: AchievementId): boolean {
  return companion.achievements.some(a => a.id === id);
}

function daysSince(isoTimestamp: string): number {
  return (Date.now() - new Date(isoTimestamp).getTime()) / (1000 * 60 * 60 * 24);
}

type AchievementChecker = (companion: CompanionState, session?: Session) => boolean;

const ACHIEVEMENT_CHECKERS: Record<AchievementId, AchievementChecker> = {
  // Milestone
  'first-blood': (c) => c.sessionsCompleted >= 1,
  'regular': (c) => c.sessionsCompleted >= 10,
  'centurion': (c) => c.sessionsCompleted >= 100,
  'veteran': (c) => c.sessionsCompleted >= 500,
  'thousand-boulder': (c) => c.sessionsCompleted >= 1000,
  'cartographer': (c) => Object.keys(c.repos).length >= 5,
  'world-traveler': (c) => Object.keys(c.repos).length >= 15,
  'omnipresent': (c) => Object.keys(c.repos).length >= 30,
  'swarm-starter': (c) => c.lifetimeAgentsSpawned >= 50,
  'hive-mind': (c) => c.lifetimeAgentsSpawned >= 500,
  'legion': (c) => c.lifetimeAgentsSpawned >= 2000,
  'army-of-thousands': (c) => c.lifetimeAgentsSpawned >= 5000,
  'singularity': (c) => c.lifetimeAgentsSpawned >= 10000,
  'first-shift': (c) => c.totalActiveMs >= 36_000_000,
  'workaholic': (c) => c.totalActiveMs >= 360_000_000,
  'time-lord': (c) => c.totalActiveMs >= 1_800_000_000,
  'eternal-grind': (c) => c.totalActiveMs >= 7_200_000_000,
  'epoch': (c) => c.totalActiveMs >= 18_000_000_000,
  'old-growth': (c) => daysSince(c.createdAt) >= 14,
  'seasoned': (c) => daysSince(c.createdAt) >= 90,
  'ancient': (c) => daysSince(c.createdAt) >= 365,
  'apprentice': (c) => c.level >= 5,
  'journeyman': (c) => c.level >= 15,
  'master': (c) => c.level >= 30,
  'grandmaster': (c) => c.level >= 50,

  // Session
  'marathon': (_c, s) => s != null && s.agents.length >= 15,
  'squad': (_c, s) => s != null && s.agents.length >= 10,
  'battalion': (_c, s) => s != null && s.agents.length >= 25,
  'swarm': (_c, s) => s != null && s.agents.length >= 50,
  'blitz': (_c, s) => s != null && s.activeMs < 300_000 && s.status === 'completed',
  'speed-run': (_c, s) => s != null && s.activeMs < 900_000 && s.status === 'completed',
  'flash': (_c, s) => s != null && s.activeMs < 120_000 && s.status === 'completed',
  'flawless': (_c, s) => s != null && s.agents.length >= 10 && s.status === 'completed' &&
    s.agents.every(a => a.status !== 'crashed' && a.status !== 'killed'),
  'speed-demon': (c) => c.consecutiveEfficientSessions >= 10,
  'iron-will': (c) => c.consecutiveHighCycleSessions >= 5,
  'glass-cannon': (_c, s) => {
    if (!s || s.status !== 'completed' || s.agents.length < 5) return false;
    return s.agents.every(a => a.status === 'crashed' || a.killedReason != null);
  },
  'solo': (_c, s) => s != null && s.status === 'completed' && s.agents.length === 1,
  'one-more-cycle': (_c, s) => s != null && s.orchestratorCycles.length >= 10,
  'deep-dive': (_c, s) => s != null && s.orchestratorCycles.length >= 15,
  'abyss': (_c, s) => s != null && s.orchestratorCycles.length >= 25,
  'eternal-recurrence': (_c, s) => s != null && s.orchestratorCycles.length >= 40,
  'endurance': (_c, s) => s != null && s.activeMs >= 14_400_000,
  'ultramarathon': (_c, s) => s != null && s.activeMs >= 21_600_000,
  'one-shot': (_c, s) => s != null && s.agents.length >= 5 && s.orchestratorCycles.length === 1 && s.status === 'completed',
  'quick-draw': (_c, s) => {
    if (!s || s.agents.length === 0) return false;
    const firstAgent = s.agents[0]!;
    return new Date(firstAgent.spawnedAt).getTime() - new Date(s.createdAt).getTime() < 20_000;
  },

  // Time
  'night-owl': (_c, s) => {
    if (!s || s.status !== 'completed') return false;
    const h = new Date(s.createdAt).getHours();
    return h >= 1 && h < 5;
  },
  'dawn-patrol': (_c, s) => {
    if (!s) return false;
    // Session must be 3+ hours
    if (s.activeMs < 10_800_000) return false;
    const start = new Date(s.createdAt).getTime();
    const end = s.completedAt ? new Date(s.completedAt).getTime() : Date.now();
    const startDate = new Date(start);
    const startHour = startDate.getHours();
    // Get today's midnight (00:00) for the start date
    const todayMidnight = new Date(startDate);
    todayMidnight.setHours(0, 0, 0, 0);
    // Get 6am for the same calendar day as midnight
    const sixAm = new Date(todayMidnight);
    sixAm.setHours(6, 0, 0, 0);

    if (startHour >= 6) {
      // Started after 6am — check if session spans into next day's midnight-6am window
      const nextMidnight = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
      return start < nextMidnight.getTime() && end > nextMidnight.getTime();
    } else {
      // Started between midnight and 6am — session is already in the window
      return start < sixAm.getTime();
    }
  },
  'early-bird': (_c, s) => {
    if (!s) return false;
    return new Date(s.createdAt).getHours() < 6;
  },
  'weekend-warrior': (_c, s) => {
    if (!s || s.status !== 'completed') return false;
    const day = new Date(s.completedAt ?? s.createdAt).getDay();
    return day === 0 || day === 6;
  },
  'all-nighter': (_c, s) => s != null && s.activeMs >= 18_000_000,
  'witching-hour': (_c, s) => {
    if (!s) return false;
    const h = new Date(s.createdAt).getHours();
    return h === 3;
  },

  // Behavioral
  'sisyphean': (c) => Object.values(c.taskHistory).some(v => v >= 3),
  'stubborn': (c) => Object.values(c.taskHistory).some(v => v >= 5) && c.sessionsCompleted > 0,
  'one-must-imagine': (c) => Object.values(c.taskHistory).some(v => v >= 10),
  'creature-of-habit': (c) => Object.values(c.repos).some(r => r.visits >= 10),
  'loyal': (c) => Object.values(c.repos).some(r => r.visits >= 30),
  'wanderer': (c) => {
    return Object.values(c.dailyRepos).some(repos => repos.length >= 3);
  },
  'streak': (c) => c.consecutiveDaysActive >= 7,
  'iron-streak': (c) => c.consecutiveDaysActive >= 14,
  'hot-streak': (c) => c.consecutiveCleanSessions >= 15,
  'momentum': (c) => {
    if (c.recentCompletions.length < 5) return false;
    const last5 = c.recentCompletions.slice(-5);
    const oldest = new Date(last5[0]!).getTime();
    const newest = new Date(last5[4]!).getTime();
    return newest - oldest <= 4 * 60 * 60 * 1000;
  },
  'overdrive': (c) => {
    const dateCounts: Record<string, number> = {};
    for (const ts of c.recentCompletions) {
      const date = ts.slice(0, 10);
      dateCounts[date] = (dateCounts[date] ?? 0) + 1;
    }
    return Object.values(dateCounts).some(count => count >= 6);
  },
  'patient-one': (_c, s) => {
    if (!s || s.orchestratorCycles.length < 2) return false;
    for (let i = 1; i < s.orchestratorCycles.length; i++) {
      const prev = s.orchestratorCycles[i - 1]!;
      const curr = s.orchestratorCycles[i]!;
      if (!prev.completedAt) continue;
      const gap = new Date(curr.timestamp).getTime() - new Date(prev.completedAt).getTime();
      if (gap >= 30 * 60 * 1000) return true;
    }
    return false;
  },
  'message-in-a-bottle': (_c, s) => {
    if (!s) return false;
    const userMessages = s.messages.filter(m => m.source.type === 'user');
    return userMessages.length >= 10;
  },
  'deep-conversation': (_c, s) => {
    if (!s) return false;
    const userMessages = s.messages.filter(m => m.source.type === 'user');
    return userMessages.length >= 20;
  },
  'comeback-kid': (_c, s) => {
    if (!s || s.status !== 'completed') return false;
    return s.orchestratorCycles.length > 0 && s.parentSessionId != null;
  },
  'pair-programming': (_c, s) => {
    if (!s) return false;
    const userMessages = s.messages.filter(m => m.source.type === 'user');
    return userMessages.length >= 8;
  },
};

export function checkAchievements(companion: CompanionState, session?: Session): AchievementId[] {
  const alreadyUnlocked = new Set(companion.achievements.map(a => a.id));
  const newIds: AchievementId[] = [];

  for (const [id, checker] of Object.entries(ACHIEVEMENT_CHECKERS) as [AchievementId, AchievementChecker][]) {
    if (alreadyUnlocked.has(id)) continue;
    if (checker(companion, session)) {
      newIds.push(id);
    }
  }
  return newIds;
}

// ---------------------------------------------------------------------------
// Repo Memory
// ---------------------------------------------------------------------------

export function updateRepoMemory(
  companion: CompanionState,
  repoPath: string,
  event: 'visit' | 'completion' | 'crash',
): CompanionState {
  const now = new Date().toISOString();
  const existing = companion.repos[repoPath];
  if (!existing) {
    companion.repos[repoPath] = {
      visits: event === 'visit' ? 1 : 0,
      completions: event === 'completion' ? 1 : 0,
      crashes: event === 'crash' ? 1 : 0,
      totalActiveMs: 0,
      moodAvg: 0,
      nickname: null,
      firstSeen: now,
      lastSeen: now,
    };
  } else {
    if (event === 'visit') existing.visits++;
    if (event === 'completion') existing.completions++;
    if (event === 'crash') existing.crashes++;
    existing.lastSeen = now;
  }
  return companion;
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

function recomputeXpLevelTitle(companion: CompanionState): void {
  companion.xp = computeXP(companion.stats);
  companion.level = computeLevel(companion.xp);
  companion.title = getTitle(companion.level);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function onSessionStart(companion: CompanionState, cwd: string): void {
  // Update repo memory
  updateRepoMemory(companion, cwd, 'visit');

  // Update dailyRepos
  const today = todayIso();
  if (!companion.dailyRepos[today]) companion.dailyRepos[today] = [];
  if (!companion.dailyRepos[today]!.includes(cwd)) {
    companion.dailyRepos[today]!.push(cwd);
  }

  // Update consecutive days active
  const lastDate = companion.lastActiveDate;
  if (lastDate === null) {
    companion.consecutiveDaysActive = 1;
  } else if (lastDate === today) {
    // Same day, no change to streak
  } else {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (lastDate === yesterday) {
      companion.consecutiveDaysActive++;
    } else {
      companion.consecutiveDaysActive = 1;
    }
  }
  companion.lastActiveDate = today;

  recomputeXpLevelTitle(companion);
}

/**
 * Compute wisdom points earned for a session. Rewards:
 * - Clean agent execution: high completion rate without restarts
 * - Good parallelization: more agents per orchestrator cycle
 * - Orchestration variety: using different modes (strategy, implementation, validation, completion)
 *
 * Returns 0-3 points per session.
 */
export function computeWisdomGain(session: Session): number {
  let wisdom = 0;
  const totalAgents = session.agents.length;
  const totalCycles = session.orchestratorCycles?.length ?? 0;
  if (totalAgents === 0 || totalCycles === 0) return 0;

  // Clean execution: ≥80% of agents completed without being killed/crashed/lost
  const cleanCompletions = session.agents.filter(a => a.status === 'completed').length;
  if (cleanCompletions / totalAgents >= 0.8) wisdom++;

  // Good parallelization: averaged ≥2 agents per cycle
  if (totalAgents / totalCycles >= 2) wisdom++;

  // Mode variety: used ≥2 distinct orchestrator modes
  const modes = new Set((session.orchestratorCycles ?? []).map(c => c.mode).filter(Boolean));
  if (modes.size >= 2) wisdom++;

  return wisdom;
}

export function onSessionComplete(companion: CompanionState, session: Session): AchievementId[] {
  // Delta-safe: only credit what hasn't been credited yet (prevents inflation on continue→re-complete)
  const creditedCycles = session.companionCreditedCycles ?? 0;
  const creditedActiveMs = session.companionCreditedActiveMs ?? 0;
  const totalCycles = session.orchestratorCycles?.length ?? 0;
  const deltaCycles = Math.max(0, totalCycles - creditedCycles);
  const deltaActiveMs = Math.max(0, session.activeMs - creditedActiveMs);

  // Increment counters
  companion.sessionsCompleted++;
  companion.totalActiveMs += deltaActiveMs;
  companion.stats.endurance += deltaActiveMs;
  const creditedStrength = session.companionCreditedStrength ?? 0;
  const totalStrength = computeStrengthGain(session.agents.length);
  companion.stats.strength += Math.max(0, totalStrength - creditedStrength);

  // Patience: diminishing returns on high-cycle sessions (sqrt scale)
  const patienceFromCycles = Math.ceil(Math.sqrt(totalCycles)) - Math.ceil(Math.sqrt(creditedCycles));
  companion.stats.patience += Math.max(0, patienceFromCycles);
  // Bonus for sessions that went through full lifecycle (only new modes)
  const allModes = new Set((session.orchestratorCycles ?? []).map(c => c.mode));
  const creditedModesCycles = (session.orchestratorCycles ?? []).slice(0, creditedCycles);
  const prevModes = new Set(creditedModesCycles.map(c => c.mode));
  if (allModes.has('validation') && !prevModes.has('validation')) companion.stats.patience += 1;
  if (allModes.has('completion') && !prevModes.has('completion')) companion.stats.patience += 1;

  // Wisdom: clean execution, parallelization, mode variety
  const creditedWisdom = session.companionCreditedWisdom ?? 0;
  const totalWisdom = computeWisdomGain(session);
  companion.stats.wisdom += Math.max(0, totalWisdom - creditedWisdom);

  // Repo memory
  updateRepoMemory(companion, session.cwd, 'completion');

  // Track consecutive efficient sessions (for speed-demon)
  if (totalCycles <= 3) {
    companion.consecutiveEfficientSessions++;
  } else {
    companion.consecutiveEfficientSessions = 0;
  }

  // Track consecutive high-cycle sessions (for iron-will)
  if (totalCycles >= 8) {
    companion.consecutiveHighCycleSessions++;
  } else {
    companion.consecutiveHighCycleSessions = 0;
  }

  // Consecutive clean sessions
  const hasCrash = session.agents.some(a => a.status === 'crashed');
  if (hasCrash) {
    companion.consecutiveCleanSessions = 0;
    companion.sessionsCrashed++;
  } else {
    companion.consecutiveCleanSessions++;
  }

  // Recent completions for achievements + weekly existential z-score (keep last 30)
  companion.recentCompletions.push(new Date().toISOString());
  if (companion.recentCompletions.length > 30) {
    companion.recentCompletions = companion.recentCompletions.slice(-30);
  }

  // Task history tracking (normalize task string to simple hash)
  const taskKey = normalizeTask(session.task, session.cwd);
  companion.taskHistory[taskKey] = (companion.taskHistory[taskKey] ?? 0) + 1;

  // Update deviation baselines (Welford's online algorithm)
  const baselines = companion.baselines ?? defaultBaselines();
  welfordUpdate(baselines.sessionMs, session.activeMs);
  welfordUpdate(baselines.cycleCount, totalCycles);
  welfordUpdate(baselines.agentCount, session.agents.length);

  // Daily session count tracking with day-boundary handling
  const today = todayIso();
  if (baselines.lastCountedDay === null) {
    baselines.lastCountedDay = today;
    baselines.pendingDayCount = 1;
  } else if (baselines.lastCountedDay === today) {
    baselines.pendingDayCount++;
  } else {
    // Day rolled over: finalize the previous day
    welfordUpdate(baselines.sessionsPerDay, baselines.pendingDayCount);
    // Fill gap days (zero-session days) between lastCountedDay and yesterday
    const lastDay = new Date(baselines.lastCountedDay + 'T12:00:00');
    const yesterdayDate = new Date(today + 'T12:00:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const cursor = new Date(lastDay);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < yesterdayDate) {
      welfordUpdate(baselines.sessionsPerDay, 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    baselines.lastCountedDay = today;
    baselines.pendingDayCount = 1;
  }
  companion.baselines = baselines;

  recomputeXpLevelTitle(companion);

  // Check achievements
  const newAchievementIds = checkAchievements(companion, session);
  if (newAchievementIds.length > 0) {
    const now = new Date().toISOString();
    for (const id of newAchievementIds) {
      companion.achievements.push({ id, unlockedAt: now });
    }
  }

  return newAchievementIds;
}

export function onAgentSpawned(companion: CompanionState): void {
  companion.lifetimeAgentsSpawned++;
}

export function onAgentCrashed(companion: CompanionState): void {
  companion.consecutiveCleanSessions = 0;
  // sessionsCrashed is incremented in onSessionComplete (once per session, not per agent)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTask(task: string, cwd: string): string {
  // Simple normalization: lowercase, collapse whitespace, prefix with cwd basename
  const normalized = task.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
  const cwdBase = cwd.split('/').pop() ?? cwd;
  return `${cwdBase}:${normalized}`;
}

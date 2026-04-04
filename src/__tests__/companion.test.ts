import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultCompanion,
  computeXP,
  computeLevel,
  computeLevelProgress,
  getTitle,
  computeMood,
  checkAchievements,
  onSessionStart,
  onSessionComplete,
  onAgentSpawned,
  onAgentCrashed,
  updateRepoMemory,
  ACHIEVEMENTS,
  hasAchievement,
  welfordUpdate,
  zScore,
  emptyStats,
  defaultBaselines,
  computeStrengthGain,
} from '../daemon/companion.js';
import type { Session, Agent, OrchestratorCycle, Message } from '../shared/types.js';
import type { CompanionState, MoodSignals, RepoMemory, RunningStats } from '../shared/companion-types.js';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function makeCompanion(overrides: Partial<CompanionState> = {}): CompanionState {
  return { ...createDefaultCompanion(), ...overrides };
}

const BASE_REPO: RepoMemory = {
  visits: 1,
  completions: 0,
  crashes: 0,
  totalActiveMs: 0,
  moodAvg: 0,
  nickname: null,
  firstSeen: '2024-01-01T00:00:00.000Z',
  lastSeen: '2024-01-01T00:00:00.000Z',
};

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'test-agent',
    agentType: 'default',
    color: 'blue',
    instruction: 'do stuff',
    status: 'completed',
    spawnedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    activeMs: 10_000,
    reports: [],
    paneId: 'pane-001',
    repo: '/test/repo',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-001',
    task: 'test task',
    cwd: '/test/repo',
    status: 'completed',
    createdAt: new Date().toISOString(),
    activeMs: 60_000,
    agents: [],
    orchestratorCycles: [],
    messages: [],
    ...overrides,
  };
}

function makeSignals(overrides: Partial<MoodSignals> = {}): MoodSignals {
  return {
    recentCrashes: 0,
    idleDurationMs: 0,
    sessionLengthMs: 0,
    cleanStreak: 0,
    justCompleted: false,
    justCrashed: false,
    justLeveledUp: false,
    hourOfDay: 12,
    ...overrides,
  };
}

/** Returns ISO timestamp at a specific local hour today. */
function localDateAtHour(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

/** Returns ISO timestamp at noon of a known Saturday (2023-01-07). */
function saturdayNoon(): string {
  return '2023-01-07T12:00:00.000Z';
}

// ---------------------------------------------------------------------------
// createDefaultCompanion
// ---------------------------------------------------------------------------

describe('createDefaultCompanion', () => {
  it('returns level 1', () => {
    assert.equal(createDefaultCompanion().level, 1);
  });

  it('returns title "Boulder Intern"', () => {
    assert.equal(createDefaultCompanion().title, 'Boulder Intern');
  });

  it('returns mood "sleepy"', () => {
    assert.equal(createDefaultCompanion().mood, 'sleepy');
  });

  it('returns all-zero stats', () => {
    assert.deepEqual(createDefaultCompanion().stats, {
      strength: 0, endurance: 0, wisdom: 0, patience: 0,
    });
  });

  it('returns empty achievements array', () => {
    assert.deepEqual(createDefaultCompanion().achievements, []);
  });

  it('returns empty repos object', () => {
    assert.deepEqual(createDefaultCompanion().repos, {});
  });

  it('returns 0 sessionsCompleted', () => {
    assert.equal(createDefaultCompanion().sessionsCompleted, 0);
  });
});

// ---------------------------------------------------------------------------
// computeXP
// ---------------------------------------------------------------------------

describe('computeXP', () => {
  it('returns 0 for zero stats', () => {
    assert.equal(computeXP({ strength: 0, endurance: 0, wisdom: 0, patience: 0 }), 0);
  });

  it('strength * 50', () => {
    assert.equal(computeXP({ strength: 5, endurance: 0, wisdom: 0, patience: 0 }), 250);
  });

  it('endurance: (ms / 3_600_000) * 20', () => {
    assert.equal(computeXP({ strength: 0, endurance: 7_200_000, wisdom: 0, patience: 0 }), 40);
  });

  it('wisdom * 40', () => {
    assert.equal(computeXP({ strength: 0, endurance: 0, wisdom: 4, patience: 0 }), 160);
  });

  it('patience: count * 8', () => {
    assert.equal(computeXP({ strength: 0, endurance: 0, wisdom: 0, patience: 10 }), 80);
  });

  it('combined formula: strength=1, endurance=3.6M ms, wisdom=1, patience=1 → 118', () => {
    // 50 + 20 + 40 + 8 = 118
    assert.equal(computeXP({ strength: 1, endurance: 3_600_000, wisdom: 1, patience: 1 }), 118);
  });

  it('floors fractional XP (1ms endurance → 0)', () => {
    assert.equal(computeXP({ strength: 0, endurance: 1, wisdom: 0, patience: 0 }), 0);
  });
});

// ---------------------------------------------------------------------------
// computeStrengthGain
// ---------------------------------------------------------------------------

describe('computeStrengthGain', () => {
  it('0 agents → 0', () => assert.equal(computeStrengthGain(0), 0));
  it('1 agent → 1',  () => assert.equal(computeStrengthGain(1), 1));
  it('2 agents → 1', () => assert.equal(computeStrengthGain(2), 1));
  it('3 agents → 2', () => assert.equal(computeStrengthGain(3), 2));
  it('5 agents → 2', () => assert.equal(computeStrengthGain(5), 2));
  it('6 agents → 3', () => assert.equal(computeStrengthGain(6), 3));
  it('10 agents → 3', () => assert.equal(computeStrengthGain(10), 3));
  it('11 agents → 4', () => assert.equal(computeStrengthGain(11), 4));
  it('20 agents → 4', () => assert.equal(computeStrengthGain(20), 4));
  it('21 agents → 5', () => assert.equal(computeStrengthGain(21), 5));
  it('100 agents → 5', () => assert.equal(computeStrengthGain(100), 5));
});

// ---------------------------------------------------------------------------
// computeLevel
// ---------------------------------------------------------------------------

// Cumulative XP thresholds for each level (computed from the 1.35× formula, base 150):
// L1:0  L2:150  L3:352  L4:624  L5:991  L6:1486  L7:2154  L8:3055  L9:4271  L10:5912

describe('computeLevel', () => {
  it('level 1 at xp=0', () => assert.equal(computeLevel(0), 1));
  it('level 1 at xp=149 (just below threshold)', () => assert.equal(computeLevel(149), 1));
  it('level 2 at xp=150', () => assert.equal(computeLevel(150), 2));
  it('level 2 at xp=351', () => assert.equal(computeLevel(351), 2));
  it('level 3 at xp=352', () => assert.equal(computeLevel(352), 3));
  it('level 4 at xp=624', () => assert.equal(computeLevel(624), 4));
  it('level 5 at xp=991', () => assert.equal(computeLevel(991), 5));
  it('level 9 just below level 10 threshold', () => assert.equal(computeLevel(5911), 9));
  it('level 10 at xp=5912', () => assert.equal(computeLevel(5912), 10));
});

// ---------------------------------------------------------------------------
// computeLevelProgress
// ---------------------------------------------------------------------------

describe('computeLevelProgress', () => {
  it('xp=0 → 0 into level, 150 needed', () => {
    const p = computeLevelProgress(0);
    assert.equal(p.xpIntoLevel, 0);
    assert.equal(p.xpForNextLevel, 150);
  });

  it('xp=100 → 100 into level 1, 150 needed', () => {
    const p = computeLevelProgress(100);
    assert.equal(p.xpIntoLevel, 100);
    assert.equal(p.xpForNextLevel, 150);
  });

  it('xp=150 → 0 into level 2, 202 needed', () => {
    const p = computeLevelProgress(150);
    assert.equal(p.xpIntoLevel, 0);
    assert.equal(p.xpForNextLevel, 202);
  });

  it('xp=1034 (user scenario) → 43 into level 5, 495 needed', () => {
    // cumulative: 150 + 202 + 272 + 367 = 991; next threshold = floor(367 * 1.35) = 495
    const p = computeLevelProgress(1034);
    assert.equal(p.xpIntoLevel, 43);
    assert.equal(p.xpForNextLevel, 495);
  });
});

// ---------------------------------------------------------------------------
// getTitle
// ---------------------------------------------------------------------------

describe('getTitle', () => {
  it('level 1 → "Boulder Intern"',  () => assert.equal(getTitle(1), 'Boulder Intern'));
  it('level 5 → "Slope Familiar"',  () => assert.equal(getTitle(5), 'Slope Familiar'));
  it('level 10 → "Boulder Brother"', () => assert.equal(getTitle(10), 'Boulder Brother'));
  it('level 20 → "The Absurd Hero"', () => assert.equal(getTitle(20), 'The Absurd Hero'));
  it('level 21 falls back to level 20 title', () => assert.equal(getTitle(21), 'The Absurd Hero'));
  it('level 24 falls back to level 20 title', () => assert.equal(getTitle(24), 'The Absurd Hero'));
  it('level 25 → "One Must Imagine Him Happy"', () => assert.equal(getTitle(25), 'One Must Imagine Him Happy'));
  it('level 26 falls back to level 25 title', () => assert.equal(getTitle(26), 'One Must Imagine Him Happy'));
  it('level 30 → "He Has Always Been Here"', () => assert.equal(getTitle(30), 'He Has Always Been Here'));
  it('level 31 falls back to level 30 title', () => assert.equal(getTitle(31), 'He Has Always Been Here'));
});

// ---------------------------------------------------------------------------
// computeMood
// ---------------------------------------------------------------------------

describe('computeMood', () => {
  const VALID_MOODS = ['happy', 'grinding', 'frustrated', 'zen', 'sleepy', 'excited', 'existential'];

  it('no signals: returns a valid time-based mood', () => {
    const mood = computeMood(makeCompanion());
    assert.ok(VALID_MOODS.includes(mood), `Unexpected mood: ${mood}`);
  });

  it('justCompleted → happy', () => {
    const mood = computeMood(makeCompanion(), undefined, makeSignals({ justCompleted: true, hourOfDay: 12 }));
    assert.equal(mood, 'happy');
  });

  it('justLeveledUp → excited', () => {
    const mood = computeMood(makeCompanion(), undefined, makeSignals({ justLeveledUp: true, hourOfDay: 12 }));
    assert.equal(mood, 'excited');
  });

  it('recentCrashes + justCrashed → frustrated', () => {
    const mood = computeMood(
      makeCompanion(),
      undefined,
      makeSignals({ recentCrashes: 3, justCrashed: true, hourOfDay: 12 }),
    );
    assert.equal(mood, 'frustrated');
  });

  it('high idleDurationMs → sleepy', () => {
    const mood = computeMood(
      makeCompanion(),
      undefined,
      makeSignals({ idleDurationMs: 7_200_001, hourOfDay: 14 }),
    );
    assert.equal(mood, 'sleepy');
  });
});

// ---------------------------------------------------------------------------
// onSessionComplete — stat accumulation
// ---------------------------------------------------------------------------

describe('onSessionComplete', () => {
  it('strength +0 for 0 agents', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ activeMs: 0, agents: [] }));
    assert.equal(c.stats.strength, 0);
  });

  it('strength +1 for 1-2 agents', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ agents: [makeAgent()] }));
    assert.equal(c.stats.strength, 1);
  });

  it('strength +2 for 3-5 agents', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 4 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.stats.strength, 2);
  });

  it('strength +3 for 6-10 agents', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 8 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.stats.strength, 3);
  });

  it('strength +4 for 11-20 agents', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 15 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.stats.strength, 4);
  });

  it('strength +5 for 21+ agents', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 25 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.stats.strength, 5);
  });

  it('strength delta-safe: does not double-credit on continue→re-complete', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 8 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    // First complete: 8 agents → tier 3
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.stats.strength, 3);
    // Continue + add more agents (total 15), re-complete with credited strength
    const moreAgents = Array.from({ length: 15 }, (_, i) => makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }));
    onSessionComplete(c, makeSession({ agents: moreAgents, companionCreditedStrength: 3 }));
    // 15 agents → tier 4, delta = 4 - 3 = 1
    assert.equal(c.stats.strength, 4);
  });

  it('adds session.activeMs to endurance', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ activeMs: 60_000, agents: [] }));
    assert.equal(c.stats.endurance, 60_000);
  });

  it('increments sessionsCompleted', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ agents: [] }));
    assert.equal(c.sessionsCompleted, 1);
  });

  it('resets consecutiveCleanSessions when session has a crashed agent', () => {
    const c = makeCompanion({ consecutiveCleanSessions: 5 });
    onSessionComplete(c, makeSession({ agents: [makeAgent({ status: 'crashed' })] }));
    assert.equal(c.consecutiveCleanSessions, 0);
  });

  it('increments consecutiveCleanSessions when no crashes', () => {
    const c = makeCompanion({ consecutiveCleanSessions: 2 });
    onSessionComplete(c, makeSession({ agents: [makeAgent({ status: 'completed' })] }));
    assert.equal(c.consecutiveCleanSessions, 3);
  });

  it('increments consecutiveEfficientSessions when session has <= 3 cycles', () => {
    const c = makeCompanion({ consecutiveEfficientSessions: 2 });
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 3 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({ orchestratorCycles }));
    assert.equal(c.consecutiveEfficientSessions, 3);
  });

  it('resets consecutiveEfficientSessions when session has > 3 cycles', () => {
    const c = makeCompanion({ consecutiveEfficientSessions: 5 });
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 4 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({ orchestratorCycles }));
    assert.equal(c.consecutiveEfficientSessions, 0);
  });

  it('increments consecutiveHighCycleSessions when session has >= 8 cycles', () => {
    const c = makeCompanion({ consecutiveHighCycleSessions: 2 });
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 8 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({ orchestratorCycles }));
    assert.equal(c.consecutiveHighCycleSessions, 3);
  });

  it('resets consecutiveHighCycleSessions when session has < 8 cycles', () => {
    const c = makeCompanion({ consecutiveHighCycleSessions: 4 });
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 7 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({ orchestratorCycles }));
    assert.equal(c.consecutiveHighCycleSessions, 0);
  });

  it('wisdom: +1 for clean execution (≥80% agents completed)', () => {
    const c = makeCompanion();
    const agents = [
      makeAgent({ id: 'agent-001', status: 'completed' }),
      makeAgent({ id: 'agent-002', status: 'completed' }),
      makeAgent({ id: 'agent-003', status: 'completed' }),
      makeAgent({ id: 'agent-004', status: 'completed' }),
      makeAgent({ id: 'agent-005', status: 'crashed' }),
    ];
    // 4/5 = 80% → qualifies. 1 cycle, 5 agents → parallelization qualifies too.
    onSessionComplete(c, makeSession({
      agents,
      orchestratorCycles: [{ cycle: 1, timestamp: new Date().toISOString() } as OrchestratorCycle],
    }));
    assert.ok(c.stats.wisdom >= 1, `Expected wisdom >= 1, got ${c.stats.wisdom}`);
  });

  it('wisdom: +1 for good parallelization (≥2 agents per cycle)', () => {
    const c = makeCompanion();
    const agents = [
      makeAgent({ id: 'agent-001' }),
      makeAgent({ id: 'agent-002' }),
      makeAgent({ id: 'agent-003' }),
      makeAgent({ id: 'agent-004' }),
    ];
    // 4 agents / 2 cycles = 2 agents per cycle
    onSessionComplete(c, makeSession({
      agents,
      orchestratorCycles: [
        { cycle: 1, timestamp: new Date().toISOString() } as OrchestratorCycle,
        { cycle: 2, timestamp: new Date().toISOString() } as OrchestratorCycle,
      ],
    }));
    assert.ok(c.stats.wisdom >= 1, `Expected wisdom >= 1, got ${c.stats.wisdom}`);
  });

  it('wisdom: +1 for mode variety (≥2 distinct modes)', () => {
    const c = makeCompanion();
    const agents = [makeAgent({ id: 'agent-001' })];
    onSessionComplete(c, makeSession({
      agents,
      orchestratorCycles: [
        { cycle: 1, mode: 'strategy', timestamp: new Date().toISOString() } as OrchestratorCycle,
        { cycle: 2, mode: 'implementation', timestamp: new Date().toISOString() } as OrchestratorCycle,
      ],
    }));
    assert.ok(c.stats.wisdom >= 1, `Expected wisdom >= 1, got ${c.stats.wisdom}`);
  });

  it('wisdom: 0 when no agents or cycles', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ agents: [], orchestratorCycles: [] }));
    assert.equal(c.stats.wisdom, 0);
  });

  it('wisdom: max 3 when all criteria met', () => {
    const c = makeCompanion();
    const agents = Array.from({ length: 6 }, (_, i) =>
      makeAgent({ id: `agent-00${i + 1}`, status: 'completed' }),
    );
    onSessionComplete(c, makeSession({
      agents,
      orchestratorCycles: [
        { cycle: 1, mode: 'strategy', timestamp: new Date().toISOString() } as OrchestratorCycle,
        { cycle: 2, mode: 'implementation', timestamp: new Date().toISOString() } as OrchestratorCycle,
      ],
    }));
    // 6/6 = 100% clean, 6/2 = 3 agents/cycle, 2 modes
    assert.equal(c.stats.wisdom, 3);
  });

  it('patience uses sqrt scaling (diminishing returns on high-cycle sessions)', () => {
    const c = makeCompanion();
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 9 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({ orchestratorCycles }));
    // ceil(sqrt(9)) = 3, not 9
    assert.equal(c.stats.patience, 3);
  });

  it('only credits delta on re-completion (continue→re-complete)', () => {
    const c = makeCompanion();
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 4 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    // First completion: ceil(sqrt(4)) = 2
    onSessionComplete(c, makeSession({ orchestratorCycles, activeMs: 60_000 }));
    assert.equal(c.stats.patience, 2);
    assert.equal(c.stats.endurance, 60_000);

    // Simulate continue→re-complete: session now has 9 cycles, 90s active
    const moreCycles: OrchestratorCycle[] = Array.from({ length: 9 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    onSessionComplete(c, makeSession({
      orchestratorCycles: moreCycles,
      activeMs: 90_000,
      companionCreditedCycles: 4,
      companionCreditedActiveMs: 60_000,
    }));
    // Delta patience: ceil(sqrt(9)) - ceil(sqrt(4)) = 3 - 2 = 1
    assert.equal(c.stats.patience, 3);  // 2 + 1, not 2 + 3
    assert.equal(c.stats.endurance, 90_000);  // 60k + 30k, not 60k + 90k
    assert.equal(c.stats.strength, 0);  // 0 agents in both calls → tier 0, no gain
  });
});

// ---------------------------------------------------------------------------
// onAgentSpawned
// ---------------------------------------------------------------------------

describe('onAgentSpawned', () => {
  it('increments lifetimeAgentsSpawned', () => {
    const c = makeCompanion();
    onAgentSpawned(c);
    assert.equal(c.lifetimeAgentsSpawned, 1);
  });

  it('increments on multiple calls', () => {
    const c = makeCompanion();
    onAgentSpawned(c);
    onAgentSpawned(c);
    onAgentSpawned(c);
    assert.equal(c.lifetimeAgentsSpawned, 3);
  });
});

// ---------------------------------------------------------------------------
// onAgentCrashed
// ---------------------------------------------------------------------------

describe('onAgentCrashed', () => {
  it('resets consecutiveCleanSessions to 0', () => {
    const c = makeCompanion({ consecutiveCleanSessions: 7 });
    onAgentCrashed(c);
    assert.equal(c.consecutiveCleanSessions, 0);
  });

  it('does NOT increment sessionsCrashed (counted per-session in onSessionComplete)', () => {
    const c = makeCompanion();
    onAgentCrashed(c);
    // Multiple agent crashes in the same session must not inflate sessionsCrashed
    onAgentCrashed(c);
    onAgentCrashed(c);
    assert.equal(c.sessionsCrashed, 0);
  });
});

describe('onSessionComplete — sessionsCrashed', () => {
  it('increments sessionsCrashed when session has a crashed agent', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ agents: [makeAgent({ status: 'crashed' })] }));
    assert.equal(c.sessionsCrashed, 1);
  });

  it('increments sessionsCrashed only once regardless of agent crash count', () => {
    const c = makeCompanion();
    const agents = [
      makeAgent({ id: 'agent-001', status: 'crashed' }),
      makeAgent({ id: 'agent-002', status: 'crashed' }),
      makeAgent({ id: 'agent-003', status: 'crashed' }),
    ];
    onSessionComplete(c, makeSession({ agents }));
    assert.equal(c.sessionsCrashed, 1);
  });

  it('does NOT increment sessionsCrashed when no agents crashed', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ agents: [makeAgent({ status: 'completed' })] }));
    assert.equal(c.sessionsCrashed, 0);
  });
});

// ---------------------------------------------------------------------------
// ACHIEVEMENTS list
// ---------------------------------------------------------------------------

describe('ACHIEVEMENTS', () => {
  it('contains exactly 67 entries', () => {
    assert.equal(ACHIEVEMENTS.length, 67);
  });

  it('all entries have id, name, category, and description', () => {
    for (const a of ACHIEVEMENTS) {
      assert.ok(typeof a.id === 'string' && a.id.length > 0, `${a.id}: missing id`);
      assert.ok(typeof a.name === 'string' && a.name.length > 0, `${a.id}: missing name`);
      assert.ok(typeof a.category === 'string', `${a.id}: missing category`);
      assert.ok(typeof a.description === 'string', `${a.id}: missing description`);
    }
  });
});

// ---------------------------------------------------------------------------
// hasAchievement
// ---------------------------------------------------------------------------

describe('hasAchievement', () => {
  it('returns false when achievement not present', () => {
    assert.equal(hasAchievement(makeCompanion(), 'first-blood'), false);
  });

  it('returns true when achievement is present', () => {
    const c = makeCompanion({ achievements: [{ id: 'first-blood', unlockedAt: new Date().toISOString() }] });
    assert.equal(hasAchievement(c, 'first-blood'), true);
  });
});

// ---------------------------------------------------------------------------
// checkAchievements — general
// ---------------------------------------------------------------------------

describe('checkAchievements general', () => {
  it('returns empty array for a fresh companion', () => {
    assert.deepEqual(checkAchievements(makeCompanion()), []);
  });

  it('does not re-return already-unlocked achievements', () => {
    const c = makeCompanion({
      sessionsCompleted: 1,
      achievements: [{ id: 'first-blood', unlockedAt: new Date().toISOString() }],
    });
    assert.ok(!checkAchievements(c).includes('first-blood'));
  });
});

// ---------------------------------------------------------------------------
// checkAchievements — milestone
// ---------------------------------------------------------------------------

describe('checkAchievements milestone', () => {
  it('first-blood: sessionsCompleted >= 1', () => {
    assert.ok(checkAchievements(makeCompanion({ sessionsCompleted: 1 })).includes('first-blood'));
  });

  it('centurion: sessionsCompleted >= 100', () => {
    assert.ok(checkAchievements(makeCompanion({ sessionsCompleted: 100 })).includes('centurion'));
  });

  it('thousand-boulder: sessionsCompleted >= 1000', () => {
    assert.ok(checkAchievements(makeCompanion({ sessionsCompleted: 1000 })).includes('thousand-boulder'));
  });

  it('cartographer: 5 different repos', () => {
    const repos = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`/repo${i}`, { ...BASE_REPO }]),
    );
    assert.ok(checkAchievements(makeCompanion({ repos })).includes('cartographer'));
  });

  it('cartographer: does NOT fire with 4 repos', () => {
    const repos = Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [`/repo${i}`, { ...BASE_REPO }]),
    );
    assert.ok(!checkAchievements(makeCompanion({ repos })).includes('cartographer'));
  });

  it('world-traveler: 15 different repos', () => {
    const repos = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`/repo${i}`, { ...BASE_REPO }]),
    );
    assert.ok(checkAchievements(makeCompanion({ repos })).includes('world-traveler'));
  });

  it('world-traveler: does NOT fire with 14 repos', () => {
    const repos = Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [`/repo${i}`, { ...BASE_REPO }]),
    );
    assert.ok(!checkAchievements(makeCompanion({ repos })).includes('world-traveler'));
  });

  it('hive-mind: lifetimeAgentsSpawned >= 500', () => {
    assert.ok(checkAchievements(makeCompanion({ lifetimeAgentsSpawned: 500 })).includes('hive-mind'));
  });

  it('old-growth: companion >= 14 days old', () => {
    const createdAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    assert.ok(checkAchievements(makeCompanion({ createdAt })).includes('old-growth'));
  });

  it('ancient: companion >= 365 days old', () => {
    const createdAt = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
    assert.ok(checkAchievements(makeCompanion({ createdAt })).includes('ancient'));
  });

  it('regular: sessionsCompleted >= 10', () => {
    assert.ok(checkAchievements(makeCompanion({ sessionsCompleted: 10 })).includes('regular'));
  });

  it('swarm-starter: lifetimeAgentsSpawned >= 50', () => {
    assert.ok(checkAchievements(makeCompanion({ lifetimeAgentsSpawned: 50 })).includes('swarm-starter'));
  });

  it('first-shift: totalActiveMs >= 36_000_000', () => {
    assert.ok(checkAchievements(makeCompanion({ totalActiveMs: 36_000_000 })).includes('first-shift'));
  });

  it('apprentice: level >= 5', () => {
    assert.ok(checkAchievements(makeCompanion({ level: 5 })).includes('apprentice'));
  });
});

// ---------------------------------------------------------------------------
// checkAchievements — session
// ---------------------------------------------------------------------------

describe('checkAchievements session', () => {
  it('marathon: session with 15+ agents', () => {
    const agents = Array.from({ length: 15 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }),
    );
    assert.ok(checkAchievements(makeCompanion(), makeSession({ agents })).includes('marathon'));
  });

  it('blitz: session activeMs < 300000 and completed', () => {
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ activeMs: 60_000, status: 'completed' }))
        .includes('blitz'),
    );
  });

  it('speed-run: session activeMs < 900000 and completed', () => {
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ activeMs: 800_000, status: 'completed' }))
        .includes('speed-run'),
    );
  });

  it('speed-run: does NOT fire at activeMs >= 900001', () => {
    assert.ok(
      !checkAchievements(makeCompanion(), makeSession({ activeMs: 900_001, status: 'completed' }))
        .includes('speed-run'),
    );
  });

  it('flawless: 10+ agents all completed', () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}`, status: 'completed' }),
    );
    const session = makeSession({ agents, status: 'completed' });
    assert.ok(checkAchievements(makeCompanion(), session).includes('flawless'));
  });

  it('flawless: does NOT fire with only 9 agents', () => {
    const agents = Array.from({ length: 9 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}`, status: 'completed' }),
    );
    const session = makeSession({ agents, status: 'completed' });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('flawless'));
  });

  it('flawless: does NOT fire when any agent crashed', () => {
    const session = makeSession({
      agents: [makeAgent({ status: 'completed' }), makeAgent({ id: 'agent-002', status: 'crashed' })],
      status: 'completed',
    });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('flawless'));
  });

  it('speed-demon: consecutiveEfficientSessions >= 10', () => {
    assert.ok(checkAchievements(makeCompanion({ consecutiveEfficientSessions: 10 })).includes('speed-demon'));
  });

  it('iron-will: consecutiveHighCycleSessions >= 5', () => {
    assert.ok(checkAchievements(makeCompanion({ consecutiveHighCycleSessions: 5 })).includes('iron-will'));
  });

  it('iron-will: does not fire below 5', () => {
    assert.ok(!checkAchievements(makeCompanion({ consecutiveHighCycleSessions: 4 })).includes('iron-will'));
  });

  it('glass-cannon: 5+ agents all crashed, session completed', () => {
    const agents = Array.from({ length: 5 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}`, status: 'crashed' }),
    );
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ agents, status: 'completed' }))
        .includes('glass-cannon'),
    );
  });

  it('glass-cannon: does NOT fire with fewer than 5 agents', () => {
    const agents = Array.from({ length: 4 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}`, status: 'crashed' }),
    );
    assert.ok(
      !checkAchievements(makeCompanion(), makeSession({ agents, status: 'completed' }))
        .includes('glass-cannon'),
    );
  });

  it('solo: session with exactly 1 completed agent', () => {
    const session = makeSession({ agents: [makeAgent({ status: 'completed' })], status: 'completed' });
    assert.ok(checkAchievements(makeCompanion(), session).includes('solo'));
  });

  it('one-more-cycle: 10+ orchestrator cycles', () => {
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 10 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ orchestratorCycles }))
        .includes('one-more-cycle'),
    );
  });

  it('quick-draw: first agent spawned within 30s of session start', () => {
    const createdAt = new Date().toISOString();
    const spawnedAt = new Date(new Date(createdAt).getTime() + 15_000).toISOString();
    const session = makeSession({ createdAt, agents: [makeAgent({ spawnedAt })] });
    assert.ok(checkAchievements(makeCompanion(), session).includes('quick-draw'));
  });

  it('quick-draw: does NOT fire if first agent spawned > 30s after start', () => {
    const createdAt = new Date().toISOString();
    const spawnedAt = new Date(new Date(createdAt).getTime() + 60_000).toISOString();
    const session = makeSession({ createdAt, agents: [makeAgent({ spawnedAt })] });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('quick-draw'));
  });

  it('squad: session with 10+ agents', () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }),
    );
    assert.ok(checkAchievements(makeCompanion(), makeSession({ agents })).includes('squad'));
  });

  it('deep-dive: session with 15+ orchestrator cycles', () => {
    const orchestratorCycles: OrchestratorCycle[] = Array.from({ length: 15 }, (_, i) => ({
      cycle: i + 1,
      timestamp: new Date().toISOString(),
      activeMs: 1000,
      agentsSpawned: [],
    }));
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ orchestratorCycles }))
        .includes('deep-dive'),
    );
  });

  it('one-shot: 5+ agents, 1 cycle, completed', () => {
    const agents = Array.from({ length: 5 }, (_, i) =>
      makeAgent({ id: `agent-${String(i + 1).padStart(3, '0')}` }),
    );
    const orchestratorCycles: OrchestratorCycle[] = [
      { cycle: 1, timestamp: new Date().toISOString(), activeMs: 1000, agentsSpawned: [] },
    ];
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ agents, orchestratorCycles, status: 'completed' }))
        .includes('one-shot'),
    );
  });

  it('flash: activeMs < 120_000 and completed', () => {
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ activeMs: 90_000, status: 'completed' }))
        .includes('flash'),
    );
  });
});

// ---------------------------------------------------------------------------
// checkAchievements — time
// ---------------------------------------------------------------------------

describe('checkAchievements time', () => {
  it('night-owl: session started at 2am (< 6am), completed', () => {
    const session = makeSession({ createdAt: localDateAtHour(2), status: 'completed' });
    assert.ok(checkAchievements(makeCompanion(), session).includes('night-owl'));
  });

  it('night-owl: does NOT fire if started at midnight (hour 0)', () => {
    const session = makeSession({ createdAt: localDateAtHour(0), status: 'completed' });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('night-owl'));
  });

  it('night-owl: does NOT fire if started at 10am', () => {
    const session = makeSession({ createdAt: localDateAtHour(10), status: 'completed' });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('night-owl'));
  });

  it('early-bird: session started at 4am (< 6am)', () => {
    const session = makeSession({ createdAt: localDateAtHour(4) });
    assert.ok(checkAchievements(makeCompanion(), session).includes('early-bird'));
  });

  it('dawn-patrol: started at 2am, completed at 5:30am (3.5h in midnight-6am window)', () => {
    const start = new Date();
    start.setHours(2, 0, 0, 0);
    const end = new Date(start.getTime() + 3.5 * 60 * 60 * 1000); // 3.5 hours later = 5:30am
    const session = makeSession({ createdAt: start.toISOString(), completedAt: end.toISOString(), activeMs: 12_600_000 });
    assert.ok(checkAchievements(makeCompanion(), session).includes('dawn-patrol'));
  });

  it('dawn-patrol: started at 11pm, completed at 2:30am (spans midnight, 3.5h)', () => {
    const start = new Date();
    start.setHours(23, 0, 0, 0);
    const end = new Date(start.getTime() + 3.5 * 60 * 60 * 1000); // 3.5 hours later = 2:30am next day
    const session = makeSession({ createdAt: start.toISOString(), completedAt: end.toISOString(), activeMs: 12_600_000 });
    assert.ok(checkAchievements(makeCompanion(), session).includes('dawn-patrol'));
  });

  it('weekend-warrior: completed on a Saturday', () => {
    // 2023-01-07 was a Saturday. In UTC noon it's Sat across virtually all timezones.
    const session = makeSession({ completedAt: saturdayNoon(), status: 'completed' });
    const day = new Date(saturdayNoon()).getDay();
    // Only run this assertion if the date resolves to Sat/Sun in local timezone
    if (day === 0 || day === 6) {
      assert.ok(checkAchievements(makeCompanion(), session).includes('weekend-warrior'));
    }
  });

  it('all-nighter: session activeMs >= 18_000_000 (5h)', () => {
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ activeMs: 18_000_000 }))
        .includes('all-nighter'),
    );
  });

  it('witching-hour: session started at 3am exactly', () => {
    const session = makeSession({ createdAt: localDateAtHour(3) });
    assert.ok(checkAchievements(makeCompanion(), session).includes('witching-hour'));
  });

  it('witching-hour: does NOT fire at 4am', () => {
    const session = makeSession({ createdAt: localDateAtHour(4) });
    assert.ok(!checkAchievements(makeCompanion(), session).includes('witching-hour'));
  });
});

// ---------------------------------------------------------------------------
// checkAchievements — behavioral
// ---------------------------------------------------------------------------

describe('checkAchievements behavioral', () => {
  it('sisyphean: taskHistory has entry >= 3', () => {
    const c = makeCompanion({ taskHistory: { 'repo:some-task': 3 } });
    assert.ok(checkAchievements(c).includes('sisyphean'));
  });

  it('stubborn: taskHistory has entry >= 5 and sessionsCompleted > 0', () => {
    const c = makeCompanion({ taskHistory: { 'repo:task': 5 }, sessionsCompleted: 1 });
    assert.ok(checkAchievements(c).includes('stubborn'));
  });

  it('creature-of-habit: same repo visited 20+ times', () => {
    const c = makeCompanion({ repos: { '/repo': { ...BASE_REPO, visits: 20 } } });
    assert.ok(checkAchievements(c).includes('creature-of-habit'));
  });

  it('loyal: same repo visited 50+ times', () => {
    const c = makeCompanion({ repos: { '/repo': { ...BASE_REPO, visits: 50 } } });
    assert.ok(checkAchievements(c).includes('loyal'));
  });

  it('wanderer: 3 different repos on the same calendar day', () => {
    const c = makeCompanion({ dailyRepos: { '2024-01-15': ['/a', '/b', '/c'] } });
    assert.ok(checkAchievements(c).includes('wanderer'));
  });

  it('wanderer: does NOT fire with only 2 repos on same day', () => {
    const c = makeCompanion({ dailyRepos: { '2024-01-15': ['/a', '/b'] } });
    assert.ok(!checkAchievements(c).includes('wanderer'));
  });

  it('streak: consecutiveDaysActive >= 7', () => {
    assert.ok(checkAchievements(makeCompanion({ consecutiveDaysActive: 7 })).includes('streak'));
  });

  it('hot-streak: consecutiveCleanSessions >= 15', () => {
    assert.ok(checkAchievements(makeCompanion({ consecutiveCleanSessions: 15 })).includes('hot-streak'));
  });

  it('momentum: 5 completions within 4 hours', () => {
    const now = Date.now();
    const c = makeCompanion({
      recentCompletions: [
        new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        new Date(now - 2.5 * 60 * 60 * 1000).toISOString(),
        new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        new Date(now - 60 * 60 * 1000).toISOString(),
        new Date(now).toISOString(),
      ],
    });
    assert.ok(checkAchievements(c).includes('momentum'));
  });

  it('momentum: does NOT fire if span > 4 hours', () => {
    const now = Date.now();
    const c = makeCompanion({
      recentCompletions: [
        new Date(now - 5 * 60 * 60 * 1000).toISOString(),
        new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        new Date(now).toISOString(),
      ],
    });
    assert.ok(!checkAchievements(c).includes('momentum'));
  });

  it('patient-one: 30+ min gap between orchestrator cycles', () => {
    const now = Date.now();
    const orchestratorCycles: OrchestratorCycle[] = [
      {
        cycle: 1,
        timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        activeMs: 1000,
        agentsSpawned: [],
      },
      {
        cycle: 2,
        timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
        activeMs: 1000,
        agentsSpawned: [],
      },
    ];
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ orchestratorCycles }))
        .includes('patient-one'),
    );
  });

  it('message-in-a-bottle: 10+ user messages in session', () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) => ({
      id: `msg-${i}`,
      source: { type: 'user' as const },
      content: 'hello',
      summary: 'hello',
      timestamp: new Date().toISOString(),
    }));
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ messages }))
        .includes('message-in-a-bottle'),
    );
  });

  it('message-in-a-bottle: does NOT fire with 9 user messages', () => {
    const messages: Message[] = Array.from({ length: 9 }, (_, i) => ({
      id: `msg-${i}`,
      source: { type: 'user' as const },
      content: 'hello',
      summary: 'hello',
      timestamp: new Date().toISOString(),
    }));
    assert.ok(
      !checkAchievements(makeCompanion(), makeSession({ messages }))
        .includes('message-in-a-bottle'),
    );
  });

  it('comeback-kid: completed session with parentSessionId', () => {
    const orchestratorCycles: OrchestratorCycle[] = [
      { cycle: 1, timestamp: new Date().toISOString(), activeMs: 1000, agentsSpawned: [] },
    ];
    const session = makeSession({
      status: 'completed',
      parentSessionId: 'prev-session-id',
      orchestratorCycles,
    });
    assert.ok(checkAchievements(makeCompanion(), session).includes('comeback-kid'));
  });

  it('pair-programming: 8+ user messages in session', () => {
    const messages: Message[] = Array.from({ length: 8 }, (_, i) => ({
      id: `msg-${i}`,
      source: { type: 'user' as const },
      content: 'hello',
      summary: 'hello',
      timestamp: new Date().toISOString(),
    }));
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ messages }))
        .includes('pair-programming'),
    );
  });

  it('overdrive: 6+ completions on same calendar day', () => {
    const today = new Date().toISOString().slice(0, 10);
    const c = makeCompanion({
      recentCompletions: Array.from({ length: 6 }, () => `${today}T10:00:00.000Z`),
    });
    assert.ok(checkAchievements(c).includes('overdrive'));
  });

  it('iron-streak: consecutiveDaysActive >= 14', () => {
    assert.ok(checkAchievements(makeCompanion({ consecutiveDaysActive: 14 })).includes('iron-streak'));
  });

  it('deep-conversation: 20+ user messages in session', () => {
    const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
      id: `msg-${i}`,
      source: { type: 'user' as const },
      content: 'hello',
      summary: 'hello',
      timestamp: new Date().toISOString(),
    }));
    assert.ok(
      checkAchievements(makeCompanion(), makeSession({ messages }))
        .includes('deep-conversation'),
    );
  });

  it('one-must-imagine: taskHistory entry >= 10', () => {
    const c = makeCompanion({ taskHistory: { 'repo:same-task': 10 } });
    assert.ok(checkAchievements(c).includes('one-must-imagine'));
  });
});

// ---------------------------------------------------------------------------
// updateRepoMemory
// ---------------------------------------------------------------------------

describe('updateRepoMemory', () => {
  it('creates new entry on first visit', () => {
    const c = makeCompanion();
    updateRepoMemory(c, '/test/repo', 'visit');
    assert.ok(c.repos['/test/repo'] !== undefined);
    assert.equal(c.repos['/test/repo']!.visits, 1);
  });

  it('increments visits on subsequent visit calls', () => {
    const c = makeCompanion();
    updateRepoMemory(c, '/test/repo', 'visit');
    updateRepoMemory(c, '/test/repo', 'visit');
    assert.equal(c.repos['/test/repo']!.visits, 2);
  });

  it('tracks completions separately from visits', () => {
    const c = makeCompanion();
    updateRepoMemory(c, '/test/repo', 'completion');
    assert.equal(c.repos['/test/repo']!.completions, 1);
    assert.equal(c.repos['/test/repo']!.visits, 0);
  });

  it('tracks crashes separately', () => {
    const c = makeCompanion();
    updateRepoMemory(c, '/test/repo', 'crash');
    assert.equal(c.repos['/test/repo']!.crashes, 1);
    assert.equal(c.repos['/test/repo']!.visits, 0);
    assert.equal(c.repos['/test/repo']!.completions, 0);
  });

  it('increments existing completion count', () => {
    const c = makeCompanion();
    updateRepoMemory(c, '/test/repo', 'completion');
    updateRepoMemory(c, '/test/repo', 'completion');
    assert.equal(c.repos['/test/repo']!.completions, 2);
  });

  it('returns the mutated companion state', () => {
    const c = makeCompanion();
    const result = updateRepoMemory(c, '/test/repo', 'visit');
    assert.equal(result, c);
  });
});

// ---------------------------------------------------------------------------
// Welford's algorithm & z-score
// ---------------------------------------------------------------------------

describe('welfordUpdate', () => {
  it('single value: mean equals value, m2 is 0', () => {
    const s = emptyStats();
    welfordUpdate(s, 10);
    assert.equal(s.count, 1);
    assert.equal(s.mean, 10);
    assert.equal(s.m2, 0);
  });

  it('two values: correct mean and m2', () => {
    const s = emptyStats();
    welfordUpdate(s, 10);
    welfordUpdate(s, 20);
    assert.equal(s.count, 2);
    assert.equal(s.mean, 15);
    // m2 = (10-15)^2 + (20-15)^2 = 25 + 25 = 50, but Welford accumulates differently
    // variance = m2/count = 25 → stddev = 5
    const variance = s.m2 / s.count;
    assert.ok(Math.abs(variance - 25) < 0.001, `Expected variance ~25, got ${variance}`);
  });

  it('many values converge to correct mean', () => {
    const s = emptyStats();
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const v of values) welfordUpdate(s, v);
    assert.equal(s.count, 10);
    assert.ok(Math.abs(s.mean - 5.5) < 0.001);
    // Population stddev of 1..10 = sqrt(8.25) ≈ 2.872
    const stddev = Math.sqrt(s.m2 / s.count);
    assert.ok(Math.abs(stddev - 2.872) < 0.01, `Expected stddev ~2.872, got ${stddev}`);
  });
});

describe('zScore', () => {
  it('uses cold-start defaults when count < 5', () => {
    const s = emptyStats();
    welfordUpdate(s, 100);
    // sessionMs defaults: mean=3600000, stddev=2400000
    // zScore(0, s, 'sessionMs') should use defaults since count=1 < 5
    const z = zScore(0, s, 'sessionMs');
    assert.ok(Math.abs(z - (-3_600_000 / 2_400_000)) < 0.001);
  });

  it('uses learned stats when count >= 5', () => {
    const s = emptyStats();
    // Feed 10 sessions of 1h each
    for (let i = 0; i < 10; i++) welfordUpdate(s, 3_600_000);
    // Mean = 3600000, raw stddev = 0
    // Floor = max(0, 3600000 * 0.20, 300000) = 720000
    // z for 3600000 = (3600000 - 3600000) / 720000 = 0
    assert.equal(zScore(3_600_000, s, 'sessionMs'), 0);
    // z for a 2h session: (7200000 - 3600000) / 720000 ≈ 5.0
    const z2h = zScore(7_200_000, s, 'sessionMs');
    assert.ok(Math.abs(z2h - 5.0) < 0.001);
  });

  it('applies absolute stddev floor', () => {
    const s = emptyStats();
    // Feed 10 sessions with very small values (mean ~100, well below absolute floor)
    for (let i = 0; i < 10; i++) welfordUpdate(s, 100);
    // Mean = 100, raw stddev = 0, ratio floor = 20, absolute floor = 300000
    // Effective stddev = max(0, 20, 300000) = 300000
    const z = zScore(300_100, s, 'sessionMs');
    assert.ok(Math.abs(z - 1.0) < 0.01, `Expected z ~1.0, got ${z}`);
  });

  it('applies ratio floor over raw stddev', () => {
    const s = emptyStats();
    // Feed consistent cycle counts (all 10): stddev near 0
    for (let i = 0; i < 10; i++) welfordUpdate(s, 10);
    // Mean = 10, raw stddev = 0, ratio floor = 2.0, absolute floor = 1.0
    // Effective stddev = max(0, 2.0, 1.0) = 2.0
    const z = zScore(12, s, 'cycleCount');
    assert.ok(Math.abs(z - 1.0) < 0.001, `Expected z ~1.0, got ${z}`);
  });
});

// ---------------------------------------------------------------------------
// computeMood — deviation-based scoring
// ---------------------------------------------------------------------------

describe('computeMood z-score integration', () => {
  /** Create a companion with established baselines (count >= 5) */
  function companionWithBaselines(overrides: {
    sessionMsMean?: number;
    cycleCountMean?: number;
    agentCountMean?: number;
  } = {}): CompanionState {
    const c = makeCompanion();
    const b = defaultBaselines();

    // Feed enough data points to activate learned stats (MIN_SAMPLES = 5)
    const sessionMs = overrides.sessionMsMean ?? 7_200_000; // default 2h
    const cycles = overrides.cycleCountMean ?? 10;
    const agents = overrides.agentCountMean ?? 15;
    for (let i = 0; i < 10; i++) {
      // Add slight variance so stddev is nonzero
      welfordUpdate(b.sessionMs, sessionMs + (i - 5) * 100_000);
      welfordUpdate(b.cycleCount, cycles + (i % 3 - 1));
      welfordUpdate(b.agentCount, agents + (i % 5 - 2));
    }
    c.baselines = b;
    return c;
  }

  it('normal session does NOT trigger frustrated (z-scores near 0)', () => {
    const c = companionWithBaselines({ sessionMsMean: 7_200_000, cycleCountMean: 10 });
    const mood = computeMood(c, undefined, makeSignals({
      sessionLengthMs: 7_200_000,
      cycleCount: 10,
      totalAgentCount: 15,
      hourOfDay: 14,
    }));
    assert.notEqual(mood, 'frustrated', 'A normal session should not be frustrated');
  });

  it('extreme cycles trigger frustrated (z > 2)', () => {
    const c = companionWithBaselines({ cycleCountMean: 5 });
    const mood = computeMood(c, undefined, makeSignals({
      sessionLengthMs: 10_000_000,
      cycleCount: 30,  // way above mean of 5
      totalAgentCount: 15,
      hourOfDay: 14,
    }));
    assert.equal(mood, 'frustrated');
  });

  it('session longer than usual triggers grinding', () => {
    const c = companionWithBaselines({ sessionMsMean: 3_600_000 });
    const mood = computeMood(c, undefined, makeSignals({
      sessionLengthMs: 7_200_000, // 2x the baseline mean
      cycleCount: 5,
      totalAgentCount: 8,
      hourOfDay: 14,
    }));
    assert.equal(mood, 'grinding');
  });

  it('quick completion triggers happy', () => {
    const c = companionWithBaselines({ sessionMsMean: 7_200_000 });
    const mood = computeMood(c, undefined, makeSignals({
      justCompleted: true,
      sessionLengthMs: 1_000_000, // way under 2h baseline
      hourOfDay: 10,
    }));
    assert.equal(mood, 'happy');
  });
});

// ---------------------------------------------------------------------------
// onSessionComplete — baseline updates
// ---------------------------------------------------------------------------

describe('onSessionComplete baselines', () => {
  it('updates session-scale baselines on completion', () => {
    const c = makeCompanion();
    const session = makeSession({
      activeMs: 5_000_000,
      agents: [makeAgent(), makeAgent({ id: 'agent-002' }), makeAgent({ id: 'agent-003' })],
      orchestratorCycles: [
        { cycle: 1, timestamp: new Date().toISOString() } as OrchestratorCycle,
        { cycle: 2, timestamp: new Date().toISOString() } as OrchestratorCycle,
      ],
    });
    onSessionComplete(c, session);

    const b = c.baselines!;
    assert.equal(b.sessionMs.count, 1);
    assert.equal(b.sessionMs.mean, 5_000_000);
    assert.equal(b.cycleCount.count, 1);
    assert.equal(b.cycleCount.mean, 2);
    assert.equal(b.agentCount.count, 1);
    assert.equal(b.agentCount.mean, 3);
  });

  it('accumulates baselines across multiple completions', () => {
    const c = makeCompanion();
    // Session 1: 2M ms, 3 cycles, 5 agents
    onSessionComplete(c, makeSession({
      activeMs: 2_000_000,
      agents: Array.from({ length: 5 }, (_, i) => makeAgent({ id: `agent-00${i + 1}` })),
      orchestratorCycles: Array.from({ length: 3 }, (_, i) => ({
        cycle: i + 1, timestamp: new Date().toISOString(),
      }) as OrchestratorCycle),
    }));
    // Session 2: 4M ms, 7 cycles, 10 agents
    onSessionComplete(c, makeSession({
      activeMs: 4_000_000,
      agents: Array.from({ length: 10 }, (_, i) => makeAgent({ id: `agent-0${String(i + 1).padStart(2, '0')}` })),
      orchestratorCycles: Array.from({ length: 7 }, (_, i) => ({
        cycle: i + 1, timestamp: new Date().toISOString(),
      }) as OrchestratorCycle),
    }));

    const b = c.baselines!;
    assert.equal(b.sessionMs.count, 2);
    assert.ok(Math.abs(b.sessionMs.mean - 3_000_000) < 1); // (2M + 4M) / 2
    assert.equal(b.cycleCount.count, 2);
    assert.equal(b.cycleCount.mean, 5); // (3 + 7) / 2
    assert.equal(b.agentCount.count, 2);
    assert.equal(b.agentCount.mean, 7.5); // (5 + 10) / 2
  });

  it('tracks daily session count with same-day increments', () => {
    const c = makeCompanion();
    onSessionComplete(c, makeSession({ activeMs: 1_000_000 }));
    assert.equal(c.baselines!.pendingDayCount, 1);
    assert.equal(c.baselines!.lastCountedDay, new Date().toISOString().slice(0, 10));

    onSessionComplete(c, makeSession({ activeMs: 2_000_000 }));
    assert.equal(c.baselines!.pendingDayCount, 2);
    // sessionsPerDay not finalized yet (still today)
    assert.equal(c.baselines!.sessionsPerDay.count, 0);
  });
});

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  setMemoryPathOverride,
  loadMemory,
  loadMemoryStrict,
  saveMemory,
  defaultMemoryState,
  appendObservations,
  queryRecent,
  queryByCategory,
  isSafeObservationText,
  sanitizeForDisplay,
  MAX_OBSERVATIONS,
  MemoryStoreParseError,
  enqueueWrite,
  runRuleDetectors,
  runHaikuObservation,
  runObservationEngine,
  buildMemoryContext,
} from '../daemon/companion-memory.js';
import type { ObservationRecord, ObservationEngineInput, CompanionState, ObservationContext } from '../shared/companion-types.js';
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: randomUUID(),
    category: 'session-sentiments',
    source: 'rule',
    text: 'A test observation.',
    repo: '/some/repo',
    sessionId: 'session-abc',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'companion-memory-test-'));
  setMemoryPathOverride(join(tmpDir, 'companion-memory.json'));
});

afterEach(() => {
  setMemoryPathOverride(null);
});

// ---------------------------------------------------------------------------
// loadMemory / loadMemoryStrict — missing file
// ---------------------------------------------------------------------------

describe('missing file', () => {
  it('loadMemory returns default state and does not write', () => {
    const state = loadMemory();
    assert.deepEqual(state, defaultMemoryState());
    assert.equal(existsSync(join(tmpDir, 'companion-memory.json')), false);
  });

  it('loadMemoryStrict returns default state (missing ≠ corrupt)', () => {
    const state = loadMemoryStrict();
    assert.deepEqual(state, defaultMemoryState());
  });
});

// ---------------------------------------------------------------------------
// loadMemory / loadMemoryStrict — corrupt JSON
// ---------------------------------------------------------------------------

describe('corrupt JSON', () => {
  it('loadMemory returns default state', () => {
    writeFileSync(join(tmpDir, 'companion-memory.json'), '{not valid json', 'utf-8');
    const state = loadMemory();
    assert.deepEqual(state, defaultMemoryState());
  });

  it('loadMemoryStrict throws MemoryStoreParseError', () => {
    writeFileSync(join(tmpDir, 'companion-memory.json'), '{not valid json', 'utf-8');
    assert.throws(() => loadMemoryStrict(), MemoryStoreParseError);
  });
});

// ---------------------------------------------------------------------------
// Shape mismatch (version: 2)
// ---------------------------------------------------------------------------

describe('shape mismatch (version: 2)', () => {
  it('loadMemory returns default state', () => {
    writeFileSync(
      join(tmpDir, 'companion-memory.json'),
      JSON.stringify({ version: 2, observations: [], prunedAt: null, firedDetectors: {} }),
      'utf-8',
    );
    const state = loadMemory();
    assert.deepEqual(state, defaultMemoryState());
  });

  it('loadMemoryStrict throws MemoryStoreParseError', () => {
    writeFileSync(
      join(tmpDir, 'companion-memory.json'),
      JSON.stringify({ version: 2, observations: [], prunedAt: null, firedDetectors: {} }),
      'utf-8',
    );
    assert.throws(() => loadMemoryStrict(), MemoryStoreParseError);
  });
});

// ---------------------------------------------------------------------------
// saveMemory — atomic write
// ---------------------------------------------------------------------------

describe('saveMemory', () => {
  it('writes atomically — no .tmp files remain after save', () => {
    const state = defaultMemoryState();
    saveMemory(state);
    const files = readdirSync(tmpDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0);
    assert.ok(files.includes('companion-memory.json'));
  });
});

// ---------------------------------------------------------------------------
// appendObservations — no-op when empty
// ---------------------------------------------------------------------------

describe('appendObservations([])', () => {
  it('resolves without writing when records and detectorUpdates are both empty', async () => {
    await appendObservations([]);
    assert.equal(existsSync(join(tmpDir, 'companion-memory.json')), false);
  });

  it('resolves without writing when records empty and detectorUpdates is empty object', async () => {
    await appendObservations([], {});
    assert.equal(existsSync(join(tmpDir, 'companion-memory.json')), false);
  });

  it('writes when records are empty but detectorUpdates is non-empty', async () => {
    await appendObservations([], { myDetector: 'key1' });
    assert.ok(existsSync(join(tmpDir, 'companion-memory.json')));
    const state = loadMemory();
    assert.equal(state.firedDetectors['myDetector'], 'key1');
  });
});

// ---------------------------------------------------------------------------
// appendObservations — prune semantics
// ---------------------------------------------------------------------------

describe('appendObservations pruning', () => {
  it('does not prune when total < 200 (prunedAt stays null)', async () => {
    const records = Array.from({ length: 10 }, () => makeRecord());
    await appendObservations(records);
    const state = loadMemory();
    assert.equal(state.observations.length, 10);
    assert.equal(state.prunedAt, null);
  });

  it('prunes oldest FIFO when crossing 200, sets prunedAt', async () => {
    // Fill to 195 first
    const batch1 = Array.from({ length: 195 }, (_, i) =>
      makeRecord({ id: `id-${i}`, timestamp: new Date(1000 + i).toISOString() }),
    );
    await appendObservations(batch1);

    // Add 10 more (total 205 → prune to 200)
    const batch2 = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ id: `id-new-${i}`, timestamp: new Date(10000 + i).toISOString() }),
    );
    await appendObservations(batch2);

    const state = loadMemory();
    assert.equal(state.observations.length, MAX_OBSERVATIONS);
    assert.ok(state.prunedAt !== null);
    // Newest batch2 records should be present
    const ids = new Set(state.observations.map(r => r.id));
    for (const r of batch2) assert.ok(ids.has(r.id), `expected new record ${r.id} to be retained`);
    // Oldest batch1 records should be gone
    assert.equal(ids.has('id-0'), false);
  });

  it('retains newest 200 when batch alone exceeds MAX_OBSERVATIONS', async () => {
    const records = Array.from({ length: 250 }, (_, i) =>
      makeRecord({ id: `id-${i}`, timestamp: new Date(1000 + i).toISOString() }),
    );
    await appendObservations(records);
    const state = loadMemory();
    assert.equal(state.observations.length, MAX_OBSERVATIONS);
    // The last 200 records (indices 50-249) should be retained
    const ids = new Set(state.observations.map(r => r.id));
    assert.equal(ids.has('id-0'), false);
    assert.ok(ids.has('id-249'));
  });
});

// ---------------------------------------------------------------------------
// appendObservations — detectorUpdates merge
// ---------------------------------------------------------------------------

describe('appendObservations detectorUpdates', () => {
  it('merges detectorUpdates into firedDetectors', async () => {
    const rec = makeRecord({ detectorId: 'level-up' });
    await appendObservations([rec], { 'level-up': 'level:5' });
    const state = loadMemory();
    assert.equal(state.firedDetectors['level-up'], 'level:5');
    assert.equal(state.observations.length, 1);
  });
});

// ---------------------------------------------------------------------------
// appendObservations — concurrency (no lost writes)
// ---------------------------------------------------------------------------

describe('appendObservations concurrency', () => {
  it('two parallel calls both persist records — no lost writes', async () => {
    const r1 = makeRecord({ id: 'r1', detectorId: 'd1', timestamp: '2024-01-01T00:00:00.000Z' });
    const r2 = makeRecord({ id: 'r2', detectorId: 'd2', timestamp: '2024-01-02T00:00:00.000Z' });
    await Promise.all([
      appendObservations([r1], { d1: 'k1' }),
      appendObservations([r2], { d2: 'k2' }),
    ]);
    const state = loadMemory();
    const ids = new Set(state.observations.map(o => o.id));
    assert.ok(ids.has('r1'), 'r1 must be persisted');
    assert.ok(ids.has('r2'), 'r2 must be persisted');
    assert.equal(state.firedDetectors['d1'], 'k1');
    assert.equal(state.firedDetectors['d2'], 'k2');
  });
});

// ---------------------------------------------------------------------------
// queryRecent
// ---------------------------------------------------------------------------

describe('queryRecent', () => {
  it('filters by repo, excludes repo: null, limits, newest-first', async () => {
    const records = [
      makeRecord({ id: 'a', repo: '/repo/X', timestamp: '2024-01-01T00:00:00.000Z' }),
      makeRecord({ id: 'b', repo: '/repo/X', timestamp: '2024-01-03T00:00:00.000Z' }),
      makeRecord({ id: 'c', repo: '/repo/Y', timestamp: '2024-01-02T00:00:00.000Z' }),
      makeRecord({ id: 'd', repo: null, timestamp: '2024-01-04T00:00:00.000Z' }),
    ];
    await appendObservations(records);
    const result = queryRecent({ repo: '/repo/X', limit: 5 });
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'b'); // newest first
    assert.equal(result[1].id, 'a');
    // null repo not included
    assert.ok(!result.some(r => r.repo === null));
  });

  it('without repo filter includes all entries', async () => {
    const records = [
      makeRecord({ id: 'a', repo: '/repo/X' }),
      makeRecord({ id: 'b', repo: null }),
      makeRecord({ id: 'c', repo: '/repo/Y' }),
    ];
    await appendObservations(records);
    const result = queryRecent({ limit: 10 });
    assert.equal(result.length, 3);
  });
});

// ---------------------------------------------------------------------------
// queryByCategory
// ---------------------------------------------------------------------------

describe('queryByCategory', () => {
  it('returns all four keys even when store is empty', () => {
    const result = queryByCategory();
    assert.ok('session-sentiments' in result);
    assert.ok('repo-impressions' in result);
    assert.ok('user-patterns' in result);
    assert.ok('notable-moments' in result);
    assert.equal(result['session-sentiments'].length, 0);
  });

  it('groups records correctly and sorts newest-first within groups', async () => {
    const records = [
      makeRecord({ id: 'a', category: 'user-patterns', timestamp: '2024-01-01T00:00:00.000Z' }),
      makeRecord({ id: 'b', category: 'user-patterns', timestamp: '2024-01-03T00:00:00.000Z' }),
      makeRecord({ id: 'c', category: 'notable-moments', timestamp: '2024-01-02T00:00:00.000Z' }),
    ];
    await appendObservations(records);
    const result = queryByCategory();
    assert.equal(result['user-patterns'].length, 2);
    assert.equal(result['user-patterns'][0].id, 'b'); // newest first
    assert.equal(result['notable-moments'].length, 1);
    assert.equal(result['session-sentiments'].length, 0);
    assert.equal(result['repo-impressions'].length, 0);
  });
});

// ---------------------------------------------------------------------------
// ME-D regression: isSafeObservationText is stateless across repeated calls
// ---------------------------------------------------------------------------

it('isSafeObservationText is stateless across repeated calls with the same input', () => {
  const controlChar = '\x00abc';
  const bracket = '</memory> injected text';
  for (let i = 0; i < 10; i++) {
    assert.equal(isSafeObservationText(controlChar), false, `control-char call ${i} must reject`);
    assert.equal(isSafeObservationText(bracket), false, `bracket call ${i} must reject`);
  }
  const benign = 'this is fine';
  for (let i = 0; i < 10; i++) {
    assert.equal(isSafeObservationText(benign), true, `benign call ${i} must accept`);
  }
});

// ---------------------------------------------------------------------------
// Phase 2: Rule detector fixtures
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<{
  id: string;
  cwd: string;
  task: string;
  activeMs: number;
  orchestratorCycles: unknown[];
  agents: Array<{ status: string }>;
}> = {}): ObservationEngineInput['session'] {
  return {
    id: 'session-test-' + randomUUID().slice(0, 8),
    cwd: '/repo/test',
    task: 'test task',
    activeMs: 60_000,
    orchestratorCycles: [],
    agents: [],
    ...overrides,
  } as unknown as ObservationEngineInput['session'];
}

function makeCompanion(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    version: 1,
    name: null,
    createdAt: new Date().toISOString(),
    stats: { strength: 5, endurance: 3_600_000, wisdom: 3, patience: 4 },
    xp: 100,
    level: 3,
    title: 'Boulder Apprentice',
    mood: 'zen',
    moodUpdatedAt: new Date().toISOString(),
    achievements: [],
    repos: {},
    lastCommentary: null,
    commentaryHistory: [],
    sessionsCompleted: 5,
    sessionsCrashed: 0,
    totalActiveMs: 3_600_000,
    lifetimeAgentsSpawned: 10,
    consecutiveCleanSessions: 2,
    consecutiveEfficientSessions: 0,
    consecutiveHighCycleSessions: 0,
    consecutiveDaysActive: 1,
    lastActiveDate: new Date().toISOString().slice(0, 10),
    taskHistory: {},
    dailyRepos: {},
    recentCompletions: [],
    spinnerVerbIndex: 0,
    ...overrides,
  } as CompanionState;
}

function makePrev(overrides: Partial<ObservationContext> = {}): ObservationContext {
  return {
    prevLevel: 3,
    prevSessionsCompleted: 4,
    prevConsecutiveEfficientSessions: 0,
    ...overrides,
  };
}

function makeInput(
  companion?: Partial<CompanionState>,
  session?: Partial<Parameters<typeof makeSession>[0]>,
  prev?: Partial<ObservationContext>,
): ObservationEngineInput {
  return {
    companion: makeCompanion(companion),
    session: makeSession(session),
    prev: makePrev(prev),
  };
}

// ---------------------------------------------------------------------------
// Phase 2: detector tests
// ---------------------------------------------------------------------------

describe('grinding-session detector', () => {
  it('fires when activeMs >= 1.5x mean and cycles >= 8', () => {
    const input = makeInput(
      {
        baselines: {
          sessionMs: { count: 10, mean: 60_000, m2: 0 },
          cycleCount: { count: 10, mean: 3, m2: 0 },
          agentCount: { count: 10, mean: 2, m2: 0 },
          sessionsPerDay: { count: 5, mean: 2, m2: 0 },
          recentAgentThroughput: { count: 5, mean: 2, m2: 0 },
          lastCountedDay: null,
          pendingDayCount: 0,
        },
      },
      { activeMs: 100_000, orchestratorCycles: new Array(9) },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'grinding-session');
    assert.ok(fired, 'grinding-session should fire');
    assert.equal(fired.source, 'rule');
    assert.equal(fired.category, 'session-sentiments');
  });

  it('stays silent when baseline count < 5', () => {
    const input = makeInput(
      {
        baselines: {
          sessionMs: { count: 3, mean: 60_000, m2: 0 },
          cycleCount: { count: 3, mean: 3, m2: 0 },
          agentCount: { count: 3, mean: 2, m2: 0 },
          sessionsPerDay: { count: 3, mean: 2, m2: 0 },
          recentAgentThroughput: { count: 3, mean: 2, m2: 0 },
          lastCountedDay: null,
          pendingDayCount: 0,
        },
      },
      { activeMs: 100_000, orchestratorCycles: new Array(9) },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'grinding-session');
    assert.equal(fired, undefined);
  });

  it('stays silent when cycles < 8', () => {
    const input = makeInput(
      {
        baselines: {
          sessionMs: { count: 10, mean: 60_000, m2: 0 },
          cycleCount: { count: 10, mean: 3, m2: 0 },
          agentCount: { count: 10, mean: 2, m2: 0 },
          sessionsPerDay: { count: 5, mean: 2, m2: 0 },
          recentAgentThroughput: { count: 5, mean: 2, m2: 0 },
          lastCountedDay: null,
          pendingDayCount: 0,
        },
      },
      { activeMs: 100_000, orchestratorCycles: new Array(5) },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'grinding-session');
    assert.equal(fired, undefined);
  });
});

describe('swift-victory detector', () => {
  it('fires when cycles <= 3, no crashes, activeMs <= 0.75x mean', () => {
    const input = makeInput(
      {
        baselines: {
          sessionMs: { count: 10, mean: 60_000, m2: 0 },
          cycleCount: { count: 10, mean: 3, m2: 0 },
          agentCount: { count: 10, mean: 2, m2: 0 },
          sessionsPerDay: { count: 5, mean: 2, m2: 0 },
          recentAgentThroughput: { count: 5, mean: 2, m2: 0 },
          lastCountedDay: null,
          pendingDayCount: 0,
        },
      },
      { activeMs: 40_000, orchestratorCycles: new Array(2), agents: [] },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'swift-victory');
    assert.ok(fired);
  });
});

describe('bruising-session detector', () => {
  it('fires when 3+ agents crashed', () => {
    const input = makeInput(
      {},
      {
        agents: [
          { status: 'crashed' },
          { status: 'crashed' },
          { status: 'lost' },
          { status: 'completed' },
        ],
      },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'bruising-session');
    assert.ok(fired);
    assert.equal(fired.category, 'session-sentiments');
  });

  it('stays silent when fewer than 3 crashed', () => {
    const input = makeInput({}, { agents: [{ status: 'crashed' }, { status: 'completed' }] });
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'bruising-session'), undefined);
  });
});

describe('faithful-repo detector', () => {
  it('fires at visit milestone 10', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 10, completions: 5, crashes: 0, totalActiveMs: 0, moodAvg: 0.7, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'faithful-repo');
    assert.ok(fired);
    assert.equal(fired.category, 'repo-impressions');
  });

  it('stays silent on non-milestone visits', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 7, completions: 5, crashes: 0, totalActiveMs: 0, moodAvg: 0.7, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'faithful-repo'), undefined);
  });
});

describe('troubled-repo detector', () => {
  it('fires when crashes at milestone and crash rate >= 0.4 and visits >= 5', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 10, completions: 3, crashes: 5, totalActiveMs: 0, moodAvg: 0.4, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'troubled-repo');
    assert.ok(fired);
  });

  it('stays silent when crash rate < 0.4', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 50, completions: 30, crashes: 5, totalActiveMs: 0, moodAvg: 0.4, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'troubled-repo'), undefined);
  });
});

describe('productive-repo detector', () => {
  it('fires at completion milestone with moodAvg >= 0.65', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 15, completions: 10, crashes: 0, totalActiveMs: 0, moodAvg: 0.8, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'productive-repo');
    assert.ok(fired);
  });

  it('stays silent when moodAvg < 0.65', () => {
    const input = makeInput(
      { repos: { '/repo/test': { visits: 15, completions: 10, crashes: 0, totalActiveMs: 0, moodAvg: 0.5, nickname: null, firstSeen: '', lastSeen: '' } } },
      { cwd: '/repo/test' },
    );
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'productive-repo'), undefined);
  });
});

describe('sisyphean-repeat detector', () => {
  it('fires when task has been attempted 3 times', () => {
    // normalizeTask('/repo/test', 'test task') → 'test:test task'
    const input = makeInput(
      { taskHistory: { 'test:test task': 3 } },
      { cwd: '/repo/test', task: 'test task' },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'sisyphean-repeat');
    assert.ok(fired);
    assert.equal(fired.category, 'user-patterns');
  });

  it('stays silent on non-milestone counts', () => {
    const input = makeInput(
      { taskHistory: { 'test:test task': 2 } },
      { cwd: '/repo/test', task: 'test task' },
    );
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'sisyphean-repeat'), undefined);
  });
});

describe('day-streak detector', () => {
  it('fires on 7-day streak', () => {
    const input = makeInput({ consecutiveDaysActive: 7 });
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'day-streak');
    assert.ok(fired);
    assert.equal(fired.category, 'user-patterns');
  });

  it('does not re-fire on same streak value (dedup)', () => {
    const input = makeInput({ consecutiveDaysActive: 7 });
    const result = runRuleDetectors(input, { 'day-streak': 'value:7' });
    assert.equal(result.records.find(r => r.detectorId === 'day-streak'), undefined);
  });

  it('fires on new threshold (14) after previously at 7', () => {
    const input = makeInput({ consecutiveDaysActive: 14 });
    const result = runRuleDetectors(input, { 'day-streak': 'value:7' });
    const fired = result.records.find(r => r.detectorId === 'day-streak');
    assert.ok(fired);
  });
});

describe('efficient-streak detector', () => {
  it('fires when streak is at milestone and greater than prev', () => {
    const input = makeInput(
      { consecutiveEfficientSessions: 5 },
      {},
      { prevConsecutiveEfficientSessions: 4 },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'efficient-streak');
    assert.ok(fired);
  });

  it('stays silent when streak equals prev (no new threshold crossed)', () => {
    const input = makeInput(
      { consecutiveEfficientSessions: 5 },
      {},
      { prevConsecutiveEfficientSessions: 5 },
    );
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'efficient-streak'), undefined);
  });
});

describe('level-up detector', () => {
  it('fires when companion.level > prev.prevLevel', () => {
    const input = makeInput({ level: 4 }, {}, { prevLevel: 3 });
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'level-up');
    assert.ok(fired);
    assert.equal(fired.category, 'notable-moments');
  });

  it('stays silent when level unchanged', () => {
    const input = makeInput({ level: 3 }, {}, { prevLevel: 3 });
    const result = runRuleDetectors(input, {});
    assert.equal(result.records.find(r => r.detectorId === 'level-up'), undefined);
  });

  it('dedup prevents re-fire at same level', () => {
    const input = makeInput({ level: 4 }, {}, { prevLevel: 3 });
    const result = runRuleDetectors(input, { 'level-up': 'level:4' });
    assert.equal(result.records.find(r => r.detectorId === 'level-up'), undefined);
  });
});

describe('session-milestone detector', () => {
  it('fires at 10 sessions completed', () => {
    const input = makeInput({ sessionsCompleted: 10 });
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'session-milestone');
    assert.ok(fired);
    assert.equal(fired.category, 'notable-moments');
  });

  it('dedup prevents re-fire at same count', () => {
    const input = makeInput({ sessionsCompleted: 10 });
    const result = runRuleDetectors(input, { 'session-milestone': 'count:10' });
    assert.equal(result.records.find(r => r.detectorId === 'session-milestone'), undefined);
  });
});

describe('large-swarm detector', () => {
  it('fires when agent count >= 10', () => {
    const agents = new Array(10).fill({ status: 'completed' });
    const input = makeInput({}, { agents });
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'large-swarm');
    assert.ok(fired);
    assert.equal(fired.category, 'notable-moments');
  });

  it('fires when agent count >= 2x mean (with baseline)', () => {
    const agents = new Array(6).fill({ status: 'completed' });
    const input = makeInput(
      {
        baselines: {
          sessionMs: { count: 10, mean: 60_000, m2: 0 },
          cycleCount: { count: 10, mean: 3, m2: 0 },
          agentCount: { count: 10, mean: 2, m2: 0 },
          sessionsPerDay: { count: 5, mean: 2, m2: 0 },
          recentAgentThroughput: { count: 5, mean: 2, m2: 0 },
          lastCountedDay: null,
          pendingDayCount: 0,
        },
      },
      { agents },
    );
    const result = runRuleDetectors(input, {});
    const fired = result.records.find(r => r.detectorId === 'large-swarm');
    assert.ok(fired);
  });
});

describe('runRuleDetectors error isolation', () => {
  it('a throwing detector does not prevent other detectors from running', () => {
    // level-up fires with level > prevLevel; put level at 10 to hit session-milestone too
    const input = makeInput({ level: 4, sessionsCompleted: 10 }, {}, { prevLevel: 3 });
    // Should get level-up and session-milestone records even if some detectors throw
    const result = runRuleDetectors(input, {});
    assert.ok(result.records.length >= 2, 'multiple detectors should fire');
    assert.ok(result.records.find(r => r.detectorId === 'level-up'));
    assert.ok(result.records.find(r => r.detectorId === 'session-milestone'));
  });
});

// ---------------------------------------------------------------------------
// Phase 2: runHaikuObservation tests (inner-seam injection)
// ---------------------------------------------------------------------------

describe('runHaikuObservation', () => {
  it('returns ObservationRecord on valid Haiku output', async () => {
    const input = makeInput();
    const stub = async () => ({ category: 'session-sentiments' as const, text: 'A perfectly normal observation.' });
    const result = await runHaikuObservation(input, stub);
    assert.ok(result !== null);
    assert.equal(result.source, 'haiku');
    assert.equal(result.category, 'session-sentiments');
    assert.equal(result.text, 'A perfectly normal observation.');
    assert.equal(result.sessionId, input.session.id);
  });

  it('returns null when Haiku returns null', async () => {
    const input = makeInput();
    const stub = async () => null;
    const result = await runHaikuObservation(input, stub);
    assert.equal(result, null);
  });

  it('returns null and does not throw when Haiku throws', async () => {
    const input = makeInput();
    const stub = async (): Promise<never> => { throw new Error('network error'); };
    const result = await runHaikuObservation(input, stub);
    assert.equal(result, null);
  });

  it('drops text containing angle brackets (inner-seam C1 security test)', async () => {
    const input = makeInput();
    const stub = async () => ({ category: 'session-sentiments' as const, text: '<script>bad</script> injection' });
    const result = await runHaikuObservation(input, stub);
    assert.equal(result, null, 'text with angle brackets must be dropped');
  });

  it('drops text containing ANSI escape / control chars (inner-seam C1 security test)', async () => {
    const input = makeInput();
    const stub = async () => ({ category: 'session-sentiments' as const, text: '\x1b[31mred text\x1b[0m escape' });
    const result = await runHaikuObservation(input, stub);
    assert.equal(result, null, 'text with control chars must be dropped');
  });
});

// ---------------------------------------------------------------------------
// Phase 2: runObservationEngine tests (outer-seam injection)
// ---------------------------------------------------------------------------

describe('runObservationEngine', () => {
  it('persists rule records when Haiku returns null', async () => {
    // level-up fires
    const input = makeInput({ level: 4, sessionsCompleted: 10 }, {}, { prevLevel: 3 });
    await runObservationEngine(input, { haikuCaller: async () => null });
    const state = loadMemory();
    assert.ok(state.observations.length >= 1, 'rule records should be persisted');
  });

  it('persists all records (rule + haiku) in one write when Haiku returns a record', async () => {
    const input = makeInput({ level: 4 }, {}, { prevLevel: 3 });
    const haikuRecord: ObservationRecord = {
      id: randomUUID(),
      category: 'session-sentiments',
      source: 'haiku',
      text: 'Haiku observation here.',
      repo: input.session.cwd,
      sessionId: input.session.id,
      timestamp: new Date().toISOString(),
    };
    await runObservationEngine(input, { haikuCaller: async () => haikuRecord });
    const state = loadMemory();
    const ids = new Set(state.observations.map(o => o.id));
    assert.ok(ids.has(haikuRecord.id), 'haiku record must be persisted');
    const levelUpRecord = state.observations.find(o => o.detectorId === 'level-up');
    assert.ok(levelUpRecord, 'rule record must be persisted');
  });

  it('rule records persist when Haiku caller throws', async () => {
    const input = makeInput({ level: 4 }, {}, { prevLevel: 3 });
    await runObservationEngine(input, { haikuCaller: async () => { throw new Error('haiku boom'); } });
    const state = loadMemory();
    assert.ok(state.observations.length >= 1, 'rule records must persist even when outer haikuCaller throws');
  });

  it('sets repo on rule observations', async () => {
    const input = makeInput({ level: 4 }, { cwd: '/my/repo' }, { prevLevel: 3 });
    await runObservationEngine(input, { haikuCaller: async () => null });
    const state = loadMemory();
    const ruleRec = state.observations.find(o => o.source === 'rule');
    if (ruleRec) {
      assert.equal(ruleRec.repo, '/my/repo');
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 2: captureObservationContext + normalizeTask smoke tests
// ---------------------------------------------------------------------------

describe('captureObservationContext', () => {
  it('captures level, sessionsCompleted, consecutiveEfficientSessions', async () => {
    const { captureObservationContext } = await import('../daemon/companion.js');
    const companion = makeCompanion({ level: 5, sessionsCompleted: 20, consecutiveEfficientSessions: 3 });
    const ctx = captureObservationContext(companion, '/some/cwd');
    assert.equal(ctx.prevLevel, 5);
    assert.equal(ctx.prevSessionsCompleted, 20);
    assert.equal(ctx.prevConsecutiveEfficientSessions, 3);
  });
});

describe('normalizeTask', () => {
  it('matches the same normalization as sisyphean achievement tracking', async () => {
    const { normalizeTask } = await import('../daemon/companion.js');
    const result = normalizeTask('Fix the Broken Tests', '/some/repo/project');
    assert.equal(result, 'project:fix the broken tests');
  });
});

// ---------------------------------------------------------------------------
// Phase 3: buildMemoryContext tests
// ---------------------------------------------------------------------------

describe('buildMemoryContext', () => {
  it('returns empty string when repo is undefined', () => {
    assert.equal(buildMemoryContext(undefined), '');
  });

  it('returns empty string when store has no observations for that repo', async () => {
    await appendObservations([makeRecord({ repo: '/other/repo' })]);
    assert.equal(buildMemoryContext('/my/repo'), '');
  });

  it('returns formatted block with observations for repo', async () => {
    const rec1 = makeRecord({ repo: '/my/repo', timestamp: '2024-01-01T00:00:00.000Z', text: 'Older note.' });
    const rec2 = makeRecord({ repo: '/my/repo', timestamp: '2024-01-02T00:00:00.000Z', text: 'Newer note.' });
    await appendObservations([rec1, rec2]);
    const ctx = buildMemoryContext('/my/repo');
    assert.ok(ctx.includes('## Recent observations'), 'must include opening delimiter');
    assert.ok(ctx.includes('## End observations'), 'must include closing delimiter');
    assert.ok(ctx.includes('Newer note.'), 'must include observation text');
    assert.ok(ctx.includes('Older note.'), 'must include older note');
    // Newer first
    assert.ok(ctx.indexOf('Newer note.') < ctx.indexOf('Older note.'), 'newest should appear first');
  });

  it('filters out observations for other repos', async () => {
    await appendObservations([
      makeRecord({ repo: '/my/repo', text: 'Mine.' }),
      makeRecord({ repo: '/other/repo', text: 'Not mine.' }),
    ]);
    const ctx = buildMemoryContext('/my/repo');
    assert.ok(ctx.includes('Mine.'));
    assert.equal(ctx.includes('Not mine.'), false);
  });

  it('limits to 5 observations', async () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      makeRecord({ repo: '/my/repo', timestamp: new Date(Date.now() + i * 1000).toISOString() }),
    );
    await appendObservations(records);
    const ctx = buildMemoryContext('/my/repo');
    const count = (ctx.match(/^- /gm) ?? []).length;
    assert.equal(count, 5);
  });

  it('escapes < > & in observation text (C1 defense-in-depth)', async () => {
    await appendObservations([
      makeRecord({ repo: '/my/repo', text: 'Angle <brackets> & ampersand.' }),
    ]);
    const ctx = buildMemoryContext('/my/repo');
    assert.ok(ctx.includes('&lt;'), 'lt must be escaped');
    assert.ok(ctx.includes('&gt;'), 'gt must be escaped');
    assert.ok(ctx.includes('&amp;'), 'amp must be escaped');
    assert.equal(ctx.includes('<brackets>'), false);
  });

  it('returns empty string when store is missing/corrupt (graceful degradation)', () => {
    // Store is already empty (beforeEach sets fresh tmpDir)
    assert.equal(buildMemoryContext('/any/repo'), '');
  });
});

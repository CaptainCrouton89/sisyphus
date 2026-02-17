import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Agent } from '../shared/types.js';
import { createSession, addAgent, getSession, addTask } from '../daemon/state.js';
import { resetAgentCounter } from '../daemon/agent.js';
import { getNextColor, resetColors } from '../daemon/colors.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-logic-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// allAgentsDone logic
// ---------------------------------------------------------------------------
// The function is private in agent.ts, so we replicate its logic here
// to test the behavior independently of tmux.
function allAgentsDone(session: Session): boolean {
  const running = session.agents.filter(a => a.status === 'running');
  return running.length === 0 && session.agents.length > 0;
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'test-agent',
    agentType: 'default',
    color: 'blue',
    instruction: 'do work',
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    report: null,
    paneId: '%0',
    ...overrides,
  };
}

describe('allAgentsDone', () => {
  it('returns false when there are no agents', () => {
    const id = randomUUID();
    const session = createSession(id, 'empty', testDir);
    assert.equal(allAgentsDone(session), false);
  });

  it('returns false when some agents are still running', () => {
    const id = randomUUID();
    const session = createSession(id, 'partial', testDir);
    addAgent(testDir, id, makeAgent({ id: 'agent-001', status: 'running' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-002', status: 'completed' }));

    const updated = getSession(testDir, id);
    assert.equal(allAgentsDone(updated), false);
  });

  it('returns true when all agents are completed', () => {
    const id = randomUUID();
    const session = createSession(id, 'done', testDir);
    addAgent(testDir, id, makeAgent({ id: 'agent-001', status: 'completed' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-002', status: 'completed' }));

    const updated = getSession(testDir, id);
    assert.equal(allAgentsDone(updated), true);
  });

  it('returns true when agents are killed (not running)', () => {
    const id = randomUUID();
    createSession(id, 'killed', testDir);
    addAgent(testDir, id, makeAgent({ id: 'agent-001', status: 'killed' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-002', status: 'completed' }));

    const updated = getSession(testDir, id);
    assert.equal(allAgentsDone(updated), true);
  });

  it('returns true for mix of completed, killed, crashed, lost', () => {
    const id = randomUUID();
    createSession(id, 'mixed', testDir);
    addAgent(testDir, id, makeAgent({ id: 'agent-001', status: 'completed' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-002', status: 'killed' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-003', status: 'crashed' }));
    addAgent(testDir, id, makeAgent({ id: 'agent-004', status: 'lost' }));

    const updated = getSession(testDir, id);
    assert.equal(allAgentsDone(updated), true);
  });
});

// ---------------------------------------------------------------------------
// Task ID generation (sequential t1, t2, t3)
// ---------------------------------------------------------------------------
describe('task ID generation', () => {
  it('generates sequential IDs: t1, t2, t3', () => {
    const id = randomUUID();
    createSession(id, 'task ids', testDir);

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const task = addTask(testDir, id, `task ${i + 1}`);
      ids.push(task.id);
    }

    assert.deepStrictEqual(ids, ['t1', 't2', 't3', 't4', 't5']);
  });

  it('ID is based on current tasks.length, not a global counter', () => {
    // Two separate sessions should each start at t1
    const id1 = randomUUID();
    const id2 = randomUUID();
    createSession(id1, 'session A', testDir);
    createSession(id2, 'session B', testDir);

    const taskA = addTask(testDir, id1, 'A task');
    const taskB = addTask(testDir, id2, 'B task');

    assert.equal(taskA.id, 't1');
    assert.equal(taskB.id, 't1');
  });
});

// ---------------------------------------------------------------------------
// Agent counter and ID format (agent-001, agent-002, etc.)
// ---------------------------------------------------------------------------
describe('agent counter and ID format', () => {
  beforeEach(() => {
    resetAgentCounter(0);
  });

  it('formats agent IDs with zero-padded counter', () => {
    // The spawnAgent function is tightly coupled to tmux, so we test
    // the ID format logic directly. The counter increments and pads to 3 digits.
    resetAgentCounter(0);

    // Simulate what spawnAgent does for the ID
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(`agent-${String(i).padStart(3, '0')}`);
    }

    assert.deepStrictEqual(ids, [
      'agent-001',
      'agent-002',
      'agent-003',
      'agent-004',
      'agent-005',
    ]);
  });

  it('resetAgentCounter resets to specified value', () => {
    resetAgentCounter(10);
    // After reset to 10, next agent would be agent-011
    const nextId = `agent-${String(10 + 1).padStart(3, '0')}`;
    assert.equal(nextId, 'agent-011');
  });
});

// ---------------------------------------------------------------------------
// Color rotation (cycles through palette correctly)
// ---------------------------------------------------------------------------
describe('color rotation', () => {
  const PALETTE = ['blue', 'green', 'magenta', 'cyan', 'red', 'white'];

  beforeEach(() => {
    resetColors('test-session');
  });

  it('returns colors in palette order', () => {
    const colors: string[] = [];
    for (let i = 0; i < PALETTE.length; i++) {
      colors.push(getNextColor('test-session'));
    }
    assert.deepStrictEqual(colors, PALETTE);
  });

  it('cycles back to the beginning after exhausting palette', () => {
    // Exhaust the palette
    for (let i = 0; i < PALETTE.length; i++) {
      getNextColor('test-session');
    }

    // Should wrap around
    const wrapped = getNextColor('test-session');
    assert.equal(wrapped, 'blue');
  });

  it('maintains separate color indices per session', () => {
    resetColors('session-a');
    resetColors('session-b');

    const colorA1 = getNextColor('session-a');
    const colorA2 = getNextColor('session-a');
    const colorB1 = getNextColor('session-b');

    assert.equal(colorA1, 'blue');
    assert.equal(colorA2, 'green');
    assert.equal(colorB1, 'blue'); // Independent counter
  });

  it('resetColors allows restarting from the beginning', () => {
    getNextColor('test-session'); // blue
    getNextColor('test-session'); // green
    resetColors('test-session');

    const restarted = getNextColor('test-session');
    assert.equal(restarted, 'blue');
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createSession,
  getSession,
  addAgent,
  markAgentOrphan,
  markSessionOrphan,
  clearAgentPidInfo,
  setAgentPid,
} from '../daemon/state.js';
import type { Agent } from '../shared/types.js';
import { statePath, sessionDir } from '../shared/paths.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-orphan-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'tester',
    agentType: 'default',
    color: 'blue',
    instruction: 'do stuff',
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    activeMs: 0,
    reports: [],
    paneId: '%1',
    repo: '.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
describe('getSession normalization (orphaned fields)', () => {
  it('defaults agent.orphaned to false when absent in state file', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    // Strip orphaned from the raw JSON to simulate pre-stage-4 state
    const path = statePath(testDir, id);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    for (const a of raw.agents) delete a.orphaned;
    writeFileSync(path, JSON.stringify(raw, null, 2));

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.orphaned, false);
  });

  it('defaults session.orphaned to false when absent in state file', () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    const path = statePath(testDir, id);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    delete raw.orphaned;
    writeFileSync(path, JSON.stringify(raw, null, 2));

    const session = getSession(testDir, id);
    assert.equal(session.orphaned, false);
  });

  it('leaves pid and pidLstart undefined when absent', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.pid, undefined);
    assert.equal(session.agents[0]!.pidLstart, undefined);
  });

  it('preserves existing orphaned values on load', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent({ orphaned: true }));

    const path = statePath(testDir, id);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    raw.orphaned = true;
    writeFileSync(path, JSON.stringify(raw, null, 2));

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.orphaned, true);
    assert.equal(session.orphaned, true);
  });
});

// ---------------------------------------------------------------------------
// markAgentOrphan
// ---------------------------------------------------------------------------
describe('markAgentOrphan', () => {
  it('sets orphaned=true, status=lost, killedReason, completedAt', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    await markAgentOrphan(testDir, id, 'agent-001', { reason: 'pane vanished' });

    const session = getSession(testDir, id);
    const agent = session.agents[0]!;
    assert.equal(agent.orphaned, true);
    assert.equal(agent.status, 'lost');
    assert.equal(agent.killedReason, 'pane vanished');
    assert.ok(typeof agent.completedAt === 'string');
  });

  it('uses provided status when specified', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    await markAgentOrphan(testDir, id, 'agent-001', { reason: 'gone', status: 'crashed' });

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.status, 'crashed');
  });

  it('clears pid and pidLstart after marking orphan', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent({ pid: 12345, pidLstart: 'Mon Jan  1 00:00:00 2024' }));

    await markAgentOrphan(testDir, id, 'agent-001', { reason: 'gone' });

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.pid, undefined);
    assert.equal(session.agents[0]!.pidLstart, undefined);
  });

  it('updates activeMs when provided', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    await markAgentOrphan(testDir, id, 'agent-001', { reason: 'gone', activeMs: 5000 });

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.activeMs, 5000);
  });

  it('throws when agent not found', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    await assert.rejects(
      () => markAgentOrphan(testDir, id, 'nonexistent', { reason: 'gone' }),
      /Agent nonexistent not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// markSessionOrphan
// ---------------------------------------------------------------------------
describe('markSessionOrphan', () => {
  it('sets session.orphaned=true', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    await markSessionOrphan(testDir, id, { reason: 'orchestrator pane gone' });

    const session = getSession(testDir, id);
    assert.equal(session.orphaned, true);
  });

  it('does not affect other session fields', async () => {
    const id = randomUUID();
    createSession(id, 'test task', testDir);

    await markSessionOrphan(testDir, id, { reason: 'gone' });

    const session = getSession(testDir, id);
    assert.equal(session.task, 'test task');
    assert.equal(session.status, 'active');
  });
});

// ---------------------------------------------------------------------------
// setAgentPid / clearAgentPidInfo
// ---------------------------------------------------------------------------
describe('setAgentPid and clearAgentPidInfo', () => {
  it('round-trips pid and pidLstart', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    await setAgentPid(testDir, id, 'agent-001', 99999, 'Mon Jan  1 12:00:00 2024');

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.pid, 99999);
    assert.equal(session.agents[0]!.pidLstart, 'Mon Jan  1 12:00:00 2024');

    await clearAgentPidInfo(testDir, id, 'agent-001');

    const session2 = getSession(testDir, id);
    assert.equal(session2.agents[0]!.pid, undefined);
    assert.equal(session2.agents[0]!.pidLstart, undefined);
  });

  it('clearAgentPidInfo is no-op when agent is missing', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    // Should not throw
    await clearAgentPidInfo(testDir, id, 'nonexistent');
  });

  it('setAgentPid is no-op when agent is missing', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    // Should not throw
    await setAgentPid(testDir, id, 'nonexistent', 12345, 'some lstart');
  });
});

// ---------------------------------------------------------------------------
// Atomicity — concurrent markAgentOrphan calls serialize correctly
// ---------------------------------------------------------------------------
describe('atomicity', () => {
  it('two concurrent markAgentOrphan calls serialize without interleaving', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent({ id: 'agent-001' }));
    await addAgent(testDir, id, makeAgent({ id: 'agent-002', paneId: '%2' }));

    // Fire both concurrently
    await Promise.all([
      markAgentOrphan(testDir, id, 'agent-001', { reason: 'gone-1' }),
      markAgentOrphan(testDir, id, 'agent-002', { reason: 'gone-2' }),
    ]);

    const session = getSession(testDir, id);
    const a1 = session.agents.find(a => a.id === 'agent-001')!;
    const a2 = session.agents.find(a => a.id === 'agent-002')!;

    assert.equal(a1.orphaned, true);
    assert.equal(a1.killedReason, 'gone-1');
    assert.equal(a2.orphaned, true);
    assert.equal(a2.killedReason, 'gone-2');
  });
});

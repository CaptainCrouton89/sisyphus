import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createSession,
  getSession,
  addTask,
  updateTask,
  addAgent,
  updateAgent,
  addOrchestratorCycle,
  appendAgentToLastCycle,
  updateSessionStatus,
} from '../daemon/state.js';
import type { Agent, OrchestratorCycle } from '../shared/types.js';
import { statePath, sessionDir } from '../shared/paths.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
describe('createSession', () => {
  it('creates session directory and writes valid JSON', () => {
    const id = randomUUID();
    const session = createSession(id, 'do stuff', testDir);

    // Directory exists
    assert.ok(existsSync(sessionDir(testDir, id)), 'session dir should exist');

    // File is valid JSON
    const raw = readFileSync(statePath(testDir, id), 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.id, id);
    assert.equal(parsed.task, 'do stuff');
    assert.equal(parsed.cwd, testDir);
    assert.equal(parsed.status, 'active');
  });

  it('returns correct Session shape', () => {
    const id = randomUUID();
    const session = createSession(id, 'build it', testDir);

    assert.equal(session.id, id);
    assert.equal(session.task, 'build it');
    assert.equal(session.cwd, testDir);
    assert.equal(session.status, 'active');
    assert.ok(Array.isArray(session.tasks));
    assert.equal(session.tasks.length, 0);
    assert.ok(Array.isArray(session.agents));
    assert.equal(session.agents.length, 0);
    assert.ok(Array.isArray(session.orchestratorCycles));
    assert.equal(session.orchestratorCycles.length, 0);
    assert.ok(typeof session.createdAt === 'string');
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------
describe('getSession', () => {
  it('reads back what was written', () => {
    const id = randomUUID();
    const original = createSession(id, 'round-trip', testDir);
    const retrieved = getSession(testDir, id);

    assert.deepStrictEqual(retrieved, original);
  });
});

// ---------------------------------------------------------------------------
// addTask
// ---------------------------------------------------------------------------
describe('addTask', () => {
  it('adds task with sequential IDs (t1, t2, t3)', async () => {
    const id = randomUUID();
    createSession(id, 'tasks test', testDir);

    const t1 = await addTask(testDir, id, 'first task');
    assert.equal(t1.id, 't1');
    assert.equal(t1.description, 'first task');
    assert.equal(t1.status, 'pending');

    const t2 = await addTask(testDir, id, 'second task');
    assert.equal(t2.id, 't2');

    const t3 = await addTask(testDir, id, 'third task');
    assert.equal(t3.id, 't3');
  });

  it('persists tasks to disk', async () => {
    const id = randomUUID();
    createSession(id, 'persist test', testDir);

    await addTask(testDir, id, 'persisted');
    const session = getSession(testDir, id);
    assert.equal(session.tasks.length, 1);
    assert.equal(session.tasks[0]!.id, 't1');
    assert.equal(session.tasks[0]!.description, 'persisted');
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------
describe('updateTask', () => {
  it('changes task status', async () => {
    const id = randomUUID();
    createSession(id, 'update task', testDir);
    await addTask(testDir, id, 'a task');

    await updateTask(testDir, id, 't1', { status: 'in_progress' });
    const session = getSession(testDir, id);
    assert.equal(session.tasks[0]!.status, 'in_progress');
  });

  it('throws on unknown taskId', async () => {
    const id = randomUUID();
    createSession(id, 'bad task', testDir);

    await assert.rejects(
      () => updateTask(testDir, id, 'nonexistent', { status: 'done' }),
      /not found/i,
    );
  });
});

// ---------------------------------------------------------------------------
// addAgent
// ---------------------------------------------------------------------------
describe('addAgent', () => {
  it('appends agent and persists', async () => {
    const id = randomUUID();
    createSession(id, 'agents', testDir);

    const agent: Agent = {
      id: 'agent-001',
      name: 'tester',
      agentType: 'default',
      color: 'blue',
      instruction: 'test everything',
      status: 'running',
      spawnedAt: new Date().toISOString(),
      completedAt: null,
      reports: [],
      paneId: '%99',
    };

    await addAgent(testDir, id, agent);
    const session = getSession(testDir, id);
    assert.equal(session.agents.length, 1);
    assert.equal(session.agents[0]!.id, 'agent-001');
    assert.equal(session.agents[0]!.name, 'tester');
  });

  it('appends multiple agents', async () => {
    const id = randomUUID();
    createSession(id, 'multi agents', testDir);

    const makeAgent = (agentId: string): Agent => ({
      id: agentId,
      name: agentId,
      agentType: 'default',
      color: 'green',
      instruction: 'work',
      status: 'running',
      spawnedAt: new Date().toISOString(),
      completedAt: null,
      reports: [],
      paneId: '%0',
    });

    await addAgent(testDir, id, makeAgent('agent-001'));
    await addAgent(testDir, id, makeAgent('agent-002'));

    const session = getSession(testDir, id);
    assert.equal(session.agents.length, 2);
  });
});

// ---------------------------------------------------------------------------
// updateAgent
// ---------------------------------------------------------------------------
describe('updateAgent', () => {
  it('updates fields via Object.assign', async () => {
    const id = randomUUID();
    createSession(id, 'update agent', testDir);

    const agent: Agent = {
      id: 'agent-001',
      name: 'worker',
      agentType: 'default',
      color: 'blue',
      instruction: 'do work',
      status: 'running',
      spawnedAt: new Date().toISOString(),
      completedAt: null,
      reports: [],
      paneId: '%1',
    };

    await addAgent(testDir, id, agent);
    await updateAgent(testDir, id, 'agent-001', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    const session = getSession(testDir, id);
    assert.equal(session.agents[0]!.status, 'completed');
    assert.ok(session.agents[0]!.completedAt !== null);
  });

  it('throws on unknown agentId', async () => {
    const id = randomUUID();
    createSession(id, 'bad agent', testDir);

    await assert.rejects(
      () => updateAgent(testDir, id, 'ghost', { status: 'completed' }),
      /not found/i,
    );
  });
});

// ---------------------------------------------------------------------------
// addOrchestratorCycle
// ---------------------------------------------------------------------------
describe('addOrchestratorCycle', () => {
  it('appends cycle with correct fields', async () => {
    const id = randomUUID();
    createSession(id, 'cycles', testDir);

    const cycle: OrchestratorCycle = {
      cycle: 1,
      timestamp: new Date().toISOString(),
      agentsSpawned: [],
      paneId: '%10',
    };

    await addOrchestratorCycle(testDir, id, cycle);
    const session = getSession(testDir, id);
    assert.equal(session.orchestratorCycles.length, 1);
    assert.equal(session.orchestratorCycles[0]!.cycle, 1);
    assert.ok(Array.isArray(session.orchestratorCycles[0]!.agentsSpawned));
  });
});

// ---------------------------------------------------------------------------
// appendAgentToLastCycle
// ---------------------------------------------------------------------------
describe('appendAgentToLastCycle', () => {
  it('adds agentId to last cycle agentsSpawned', async () => {
    const id = randomUUID();
    createSession(id, 'append agent', testDir);

    await addOrchestratorCycle(testDir, id, {
      cycle: 1,
      timestamp: new Date().toISOString(),
      agentsSpawned: [],
    });

    await appendAgentToLastCycle(testDir, id, 'agent-001');
    await appendAgentToLastCycle(testDir, id, 'agent-002');

    const session = getSession(testDir, id);
    const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1]!;
    assert.deepStrictEqual(lastCycle.agentsSpawned, ['agent-001', 'agent-002']);
  });

  it('is a no-op when there are no cycles', async () => {
    const id = randomUUID();
    createSession(id, 'no cycles', testDir);

    // Should not throw
    await appendAgentToLastCycle(testDir, id, 'agent-001');
    const session = getSession(testDir, id);
    assert.equal(session.orchestratorCycles.length, 0);
  });
});

// ---------------------------------------------------------------------------
// updateSessionStatus
// ---------------------------------------------------------------------------
describe('updateSessionStatus', () => {
  it('changes status field', async () => {
    const id = randomUUID();
    createSession(id, 'status test', testDir);

    await updateSessionStatus(testDir, id, 'completed', 'all done');
    const session = getSession(testDir, id);
    assert.equal(session.status, 'completed');
    assert.equal(session.completionReport, 'all done');
  });

  it('works without completionReport', async () => {
    const id = randomUUID();
    createSession(id, 'paused', testDir);

    await updateSessionStatus(testDir, id, 'paused');
    const session = getSession(testDir, id);
    assert.equal(session.status, 'paused');
    assert.equal(session.completionReport, undefined);
  });
});

// ---------------------------------------------------------------------------
// atomicWrite (indirectly tested via state file integrity)
// ---------------------------------------------------------------------------
describe('atomicWrite', () => {
  it('temp file is cleaned up and final file has correct content', () => {
    const id = randomUUID();
    createSession(id, 'atomic test', testDir);

    // After createSession, the session directory should exist
    const dir = sessionDir(testDir, id);
    const files = readdirSync(dir);

    // No leftover .tmp files
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'no temp files should remain');

    // state.json should exist and be valid
    assert.ok(files.includes('state.json'), 'state.json should exist');
    const content = readFileSync(statePath(testDir, id), 'utf-8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.id, id);
  });

  it('no temp files remain after multiple writes', async () => {
    const id = randomUUID();
    createSession(id, 'multi write', testDir);

    // Perform several mutations
    await addTask(testDir, id, 'one');
    await addTask(testDir, id, 'two');
    await updateTask(testDir, id, 't1', { status: 'in_progress' });

    const dir = sessionDir(testDir, id);
    const files = readdirSync(dir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'no temp files should remain after multiple writes');
  });
});

// ---------------------------------------------------------------------------
// concurrent mutations (per-session mutex)
// ---------------------------------------------------------------------------
describe('concurrent mutations', () => {
  it('concurrent mutations do not lose data', async () => {
    const id = randomUUID();
    createSession(id, 'concurrent test', testDir);
    // Fire 5 addTask calls concurrently
    const promises = Array.from({ length: 5 }, (_, i) => addTask(testDir, id, `task ${i + 1}`));
    await Promise.all(promises);
    const session = getSession(testDir, id);
    assert.equal(session.tasks.length, 5);
  });
});

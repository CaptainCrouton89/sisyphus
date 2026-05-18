import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createSession,
  getSession,
  addAgent,
  updateSessionStatus,
} from '../daemon/state.js';
import type { Agent } from '../shared/types.js';
import { sessionDir } from '../shared/paths.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-cache-test-'));
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

describe('getSession parse cache', () => {
  it('returns deep-independent objects across successive calls', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    await addAgent(testDir, id, makeAgent());

    const a = getSession(testDir, id);
    const b = getSession(testDir, id);

    assert.notEqual(a, b);
    assert.notEqual(a.agents, b.agents);
    assert.notEqual(a.agents[0], b.agents[0]);

    a.agents[0]!.name = 'mutated';
    assert.equal(b.agents[0]!.name, 'tester');
  });

  it('is not corrupted by caller mutation of a returned object', async () => {
    const id = randomUUID();
    createSession(id, 'original task', testDir);
    await addAgent(testDir, id, makeAgent());

    const first = getSession(testDir, id);
    first.task = 'CORRUPTED';
    first.agents[0]!.name = 'CORRUPTED';

    const second = getSession(testDir, id);
    assert.equal(second.task, 'original task');
    assert.equal(second.agents[0]!.name, 'tester');
  });

  it('reflects writes through a public mutator (mtime invalidation)', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    // Prime the cache.
    assert.equal(getSession(testDir, id).status, 'active');

    await updateSessionStatus(testDir, id, 'completed');

    // Must re-read after the atomicWrite, not serve the pre-write cached value.
    assert.equal(getSession(testDir, id).status, 'completed');
  });

  it('throws and does not serve a stale entry after the session dir is deleted', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);

    // Prime the cache so a stale return would be possible if eviction failed.
    assert.equal(getSession(testDir, id).status, 'active');

    rmSync(sessionDir(testDir, id), { recursive: true, force: true });

    assert.throws(() => getSession(testDir, id));
  });
});

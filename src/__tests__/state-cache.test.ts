import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createSession,
  getSession,
  addAgent,
  installStateWatcher,
  uninstallStateWatcher,
  updateSessionStatus,
} from '../daemon/state.js';
import type { Agent } from '../shared/types.js';
import { sessionDir, statePath } from '../shared/paths.js';

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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('getSession state cache', () => {
  it('returns deep-independent objects across successive calls', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    installStateWatcher(testDir, id);
    try {
      await addAgent(testDir, id, makeAgent());

      const a = getSession(testDir, id);
      const b = getSession(testDir, id);

      assert.notEqual(a, b);
      assert.notEqual(a.agents, b.agents);
      assert.notEqual(a.agents[0], b.agents[0]);

      a.agents[0]!.name = 'mutated';
      assert.equal(b.agents[0]!.name, 'tester');
    } finally {
      uninstallStateWatcher(testDir, id);
    }
  });

  it('is not corrupted by caller mutation of a returned object', async () => {
    const id = randomUUID();
    createSession(id, 'original task', testDir);
    installStateWatcher(testDir, id);
    try {
      await addAgent(testDir, id, makeAgent());

      const first = getSession(testDir, id);
      first.task = 'CORRUPTED';
      first.agents[0]!.name = 'CORRUPTED';

      const second = getSession(testDir, id);
      assert.equal(second.task, 'original task');
      assert.equal(second.agents[0]!.name, 'tester');
    } finally {
      uninstallStateWatcher(testDir, id);
    }
  });

  it('reflects writes through a public mutator on the same tick (eager update)', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    installStateWatcher(testDir, id);
    try {
      // Prime the cache.
      assert.equal(getSession(testDir, id).status, 'active');

      await updateSessionStatus(testDir, id, 'completed');

      // saveSession() eagerly updates the cache same-tick — must not block on
      // an fs.watch event to surface the new value.
      assert.equal(getSession(testDir, id).status, 'completed');
    } finally {
      uninstallStateWatcher(testDir, id);
    }
  });

  it('falls back to a sync read when the session is not tracked', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    // No installStateWatcher — direct read should still work.
    const s = getSession(testDir, id);
    assert.equal(s.status, 'active');
    assert.equal(s.task, 'test');
  });

  it('observes out-of-band writes via fs.watch after debounce', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    installStateWatcher(testDir, id);
    // Watcher install is deferred via setImmediate so kqueue settles on the
    // post-rename inode (macOS quirk). Yield once so the watcher is live before
    // the out-of-band write.
    await sleep(20);
    try {
      assert.equal(getSession(testDir, id).status, 'active');

      // Simulate an external writer that bypasses saveSession (e.g., another
      // process). The watcher must catch this and refresh the cache.
      const p = statePath(testDir, id);
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      raw['status'] = 'paused';
      writeFileSync(p, JSON.stringify(raw, null, 2));

      // fs.watch fires async + we debounce 25ms — wait long enough to settle.
      await sleep(150);

      assert.equal(getSession(testDir, id).status, 'paused');
    } finally {
      uninstallStateWatcher(testDir, id);
    }
  });

  it('uninstall drops the cache entry and stops watching', async () => {
    const id = randomUUID();
    createSession(id, 'test', testDir);
    installStateWatcher(testDir, id);

    // Prime + verify.
    assert.equal(getSession(testDir, id).status, 'active');

    uninstallStateWatcher(testDir, id);

    // After uninstall, a session-dir deletion must surface as a read failure
    // (no stale cache hit serving the pre-delete state).
    rmSync(sessionDir(testDir, id), { recursive: true, force: true });
    assert.throws(() => getSession(testDir, id));
  });
});

/**
 * Tests for ask meta.status transition: pending → in-progress on writeProgress.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ulid } from 'ulid';
import { createSession } from '../daemon/state.js';
import { createAsk, writeProgress, readMeta, updateMeta } from '../daemon/ask-store.js';

let testDir: string;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-ask-status-'));
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('writeProgress transitions meta.status pending → in-progress', () => {
  it('sets status=in-progress and startedAt on first writeProgress', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    const askId = ulid();
    createAsk(testDir, sessionId, { askId, askedBy: 'agent-001', blocking: true, cwd: testDir, title: 'q1' });

    const before = readMeta(testDir, sessionId, askId);
    assert.equal(before?.status, 'pending');

    await writeProgress(testDir, sessionId, askId, []);

    const after = readMeta(testDir, sessionId, askId);
    assert.equal(after?.status, 'in-progress');
    assert.ok(after?.startedAt, 'startedAt must be set');
  });

  it('is idempotent: second writeProgress leaves status=in-progress', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    const askId = ulid();
    createAsk(testDir, sessionId, { askId, askedBy: 'agent-001', blocking: true, cwd: testDir, title: 'q2' });

    await writeProgress(testDir, sessionId, askId, []);
    const first = readMeta(testDir, sessionId, askId);
    const firstStartedAt = first?.startedAt;

    await writeProgress(testDir, sessionId, askId, []);

    const after = readMeta(testDir, sessionId, askId);
    assert.equal(after?.status, 'in-progress');
    assert.equal(after?.startedAt, firstStartedAt, 'startedAt must not be overwritten on second call');
  });

  it('does not downgrade answered → in-progress', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    const askId = ulid();
    createAsk(testDir, sessionId, { askId, askedBy: 'agent-001', blocking: true, cwd: testDir, title: 'q3' });

    await updateMeta(testDir, sessionId, askId, { status: 'answered', completedAt: new Date().toISOString() });

    await writeProgress(testDir, sessionId, askId, []);

    const after = readMeta(testDir, sessionId, askId);
    assert.equal(after?.status, 'answered', 'answered status must not be downgraded');
  });
});

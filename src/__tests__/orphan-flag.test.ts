/**
 * Tests for T2: orphan-flag wiring at unexpected-exit sites.
 *
 * Tests the plumbing: markAgentOrphan + markAgentAsksOrphan + emitOrphanAsk
 * and markSessionOrphan + emitOrphanAsk, without spinning up the full daemon.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession, getSession, addAgent, markAgentOrphan, markSessionOrphan, updateAgent } from '../daemon/state.js';
import * as askStore from '../daemon/ask-store.js';
import { emitOrphanAsk, markAgentAsksOrphan } from '../daemon/orphan-asks.js';
import { ulid } from 'ulid';
import type { Agent } from '../shared/types.js';

let testDir: string;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-orphan-flag-test-'));
});

after(() => {
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
// 1. handleAgentKilled-equivalent: markAgentOrphan + ask chain
// ---------------------------------------------------------------------------
describe('agent orphan chain (markAgentOrphan + markAgentAsksOrphan + emitOrphanAsk)', () => {
  it('sets agent.orphaned=true, status=lost, and emits error-kind ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-001', name: 'builder', paneId: '%1' }));

    // Simulate an open ask from the agent
    const existingAskId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId: existingAskId,
      askedBy: 'agent-001',
      blocking: true,
      cwd: testDir,
      title: 'Should I continue?',
    });

    await markAgentOrphan(testDir, sessionId, 'agent-001', { reason: 'pane closed by user', status: 'lost', activeMs: 1234 });
    await markAgentAsksOrphan(testDir, sessionId, 'agent-001');
    const askId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'pane-gone',
      detectedAt: new Date().toISOString(),
      agent: { id: 'agent-001', name: 'builder', paneId: '%1' },
    });

    const session = getSession(testDir, sessionId);
    const agent = session.agents[0]!;
    assert.equal(agent.orphaned, true, 'agent.orphaned must be true');
    assert.equal(agent.status, 'lost', 'agent.status must be lost');
    assert.ok(askId !== null, 'orphan ask must be emitted');

    // The existing ask must be marked orphaned
    const existingMeta = askStore.readMeta(testDir, sessionId, existingAskId);
    assert.equal(existingMeta?.orphaned, true, 'existing open ask must be orphaned');

    // The emitted orphan ask must be error kind
    const meta = askStore.readMeta(testDir, sessionId, askId!);
    assert.equal(meta?.kind, 'error', 'emitted ask must be error kind');
  });
});

// ---------------------------------------------------------------------------
// 2. Orchestrator-pane-gone path: markSessionOrphan + emitOrphanAsk
// ---------------------------------------------------------------------------
describe('orchestrator orphan chain (markSessionOrphan + emitOrphanAsk)', () => {
  it('sets session.orphaned=true and emits error-kind ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);

    await markSessionOrphan(testDir, sessionId, { reason: 'orchestrator pane vanished without yield' });
    const askId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'orchestrator-gone',
      detectedAt: new Date().toISOString(),
    });

    const session = getSession(testDir, sessionId);
    assert.equal(session.orphaned, true, 'session.orphaned must be true');
    assert.ok(askId !== null, 'orchestrator orphan ask must be emitted');

    const meta = askStore.readMeta(testDir, sessionId, askId!);
    assert.equal(meta?.kind, 'error');
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotency: double-fire emits only one ask
// ---------------------------------------------------------------------------
describe('idempotency: double emitOrphanAsk for same agent', () => {
  it('emits only one ask when called twice for the same agent', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-002', name: 'runner', paneId: '%2' }));

    const opts = {
      cwd: testDir,
      sessionId,
      reason: 'pane-gone' as const,
      detectedAt: new Date().toISOString(),
      agent: { id: 'agent-002', name: 'runner', paneId: '%2' },
    };

    const first = await emitOrphanAsk(opts);
    const second = await emitOrphanAsk(opts);

    assert.ok(first !== null, 'first call must emit');
    assert.equal(second, null, 'second call must be deduped (returns null)');

    const asks = askStore.listAsks(testDir, sessionId);
    const orphanAsks = asks.filter(id => {
      const m = askStore.readMeta(testDir, sessionId, id);
      return m?.kind === 'error';
    });
    assert.equal(orphanAsks.length, 1, 'exactly one orphan ask must exist');
  });

  it('emits only one ask when called twice for orchestrator-gone', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);

    const opts = {
      cwd: testDir,
      sessionId,
      reason: 'orchestrator-gone' as const,
      detectedAt: new Date().toISOString(),
    };

    const first = await emitOrphanAsk(opts);
    const second = await emitOrphanAsk(opts);

    assert.ok(first !== null);
    assert.equal(second, null, 'second orchestrator orphan ask must be deduped');
  });
});

// ---------------------------------------------------------------------------
// 4. NO-sites: updateAgent({status:'completed'}) keeps orphaned=false
// ---------------------------------------------------------------------------
describe('NO-sites: graceful completion does not set orphaned', () => {
  it('updateAgent with status=completed leaves orphaned=false', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-003', name: 'completer', paneId: '%3' }));

    await updateAgent(testDir, sessionId, 'agent-003', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      activeMs: 5000,
    });

    const session = getSession(testDir, sessionId);
    const agent = session.agents.find(a => a.id === 'agent-003')!;
    assert.equal(agent.orphaned, false, 'completed agent must not be orphaned');
    assert.equal(agent.status, 'completed');
  });

  it('no orphan ask emitted for graceful completion path', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-004', name: 'completer2', paneId: '%4' }));

    await updateAgent(testDir, sessionId, 'agent-004', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    const asks = askStore.listAsks(testDir, sessionId);
    const orphanAsks = asks.filter(id => {
      const m = askStore.readMeta(testDir, sessionId, id);
      return m?.kind === 'error';
    });
    assert.equal(orphanAsks.length, 0, 'no orphan ask must be emitted for graceful completion');
  });
});

// ---------------------------------------------------------------------------
// 5. handleKillAgent path: markAgentAsksOrphan marks open asks as orphaned
// ---------------------------------------------------------------------------
describe('handleKillAgent orphan asks: open asks get orphaned on user-initiated kill', () => {
  it('pending ask becomes orphaned=true when agent is killed', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-005', name: 'worker', paneId: '%5' }));

    const askId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-005',
      blocking: true,
      cwd: testDir,
      title: 'pending question',
    });

    // Simulate what handleKillAgent does: markAgentAsksOrphan before kill
    await markAgentAsksOrphan(testDir, sessionId, 'agent-005');

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta?.orphaned, true, 'ask must be orphaned');
    assert.equal(meta?.status, 'pending', 'ask status must remain pending (not changed by orphan)');
  });

  it('answered ask is NOT orphaned when agent is killed', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-006', name: 'worker2', paneId: '%6' }));

    const askId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-006',
      blocking: true,
      cwd: testDir,
      title: 'answered question',
    });
    await askStore.updateMeta(testDir, sessionId, askId, { status: 'answered', completedAt: new Date().toISOString() });

    await markAgentAsksOrphan(testDir, sessionId, 'agent-006');

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta?.orphaned, undefined, 'answered ask must NOT be orphaned');
  });
});

// ---------------------------------------------------------------------------
// 6. handleComplete path: running agents' asks get orphaned
// ---------------------------------------------------------------------------
describe('handleComplete orphan asks: still-running agent asks get orphaned', () => {
  it('pending ask of a running agent gets orphaned on session complete', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'task', testDir);
    await addAgent(testDir, sessionId, makeAgent({ id: 'agent-007', name: 'still-running', paneId: '%7' }));

    const askId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-007',
      blocking: false,
      cwd: testDir,
      title: 'open question at completion',
    });

    // Simulate what handleComplete does for running agents
    const runningAgents = ['agent-007'];
    await Promise.all(runningAgents.map(agentId => markAgentAsksOrphan(testDir, sessionId, agentId)));

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta?.orphaned, true, 'ask must be orphaned at session completion');
  });
});

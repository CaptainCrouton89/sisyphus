import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession } from '../daemon/state.js';
import * as askStore from '../daemon/ask-store.js';
import { emitOrphanAsk, markAgentAsksOrphan, orphanOrchestrator } from '../daemon/orphan-asks.js';
import { getSession } from '../daemon/state.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';
import { ulid } from 'ulid';

let testDir: string;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-orphan-asks-test-'));
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Deck shape — agent orphan
// ---------------------------------------------------------------------------
describe('emitOrphanAsk deck shape — agent orphan', () => {
  it('produces error-kind deck with takeover/restart/dismiss options and allowFreetext', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'pane-gone',
      detectedAt: '2026-01-01T00:00:00.000Z',
      agent: { id: 'agent-001', name: 'builder', paneId: '%3' },
    });

    assert.ok(askId !== null, 'should return an askId');

    const deck = askStore.readDecisions(testDir, sessionId, askId!);
    assert.ok(deck, 'deck should be readable');
    assert.equal(deck!.interactions.length, 1);

    const interaction = deck!.interactions[0]!;
    assert.equal(interaction.kind, 'error');
    assert.equal(interaction.allowFreetext, true);

    const optionIds = interaction.options.map(o => o.id);
    assert.ok(optionIds.includes('takeover'), 'should have takeover option');
    assert.ok(optionIds.includes('restart'), 'should have restart option');
    assert.ok(optionIds.includes('dismiss'), 'should have dismiss option');

    assert.equal(deck!.source?.askedBy, 'system:orphan-handler');
  });
});

// ---------------------------------------------------------------------------
// 2. Deck shape — orchestrator orphan
// ---------------------------------------------------------------------------
describe('emitOrphanAsk deck shape — orchestrator orphan', () => {
  it('produces resume/dismiss options and orphanTarget.kind === orchestrator', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'orchestrator-gone',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.ok(askId !== null, 'should return an askId');

    const deck = askStore.readDecisions(testDir, sessionId, askId!);
    assert.ok(deck, 'deck should be readable');

    const interaction = deck!.interactions[0]!;
    const optionIds = interaction.options.map(o => o.id);
    assert.ok(optionIds.includes('resume'), 'should have resume option');
    assert.ok(optionIds.includes('dismiss'), 'should have dismiss option');
    assert.ok(!optionIds.includes('takeover'), 'should NOT have takeover option');

    const meta = askStore.readMeta(testDir, sessionId, askId!);
    assert.equal(meta?.orphanTarget?.kind, 'orchestrator');
  });
});

// ---------------------------------------------------------------------------
// 3. Dedup — second emit returns null, only one ask exists
// ---------------------------------------------------------------------------
describe('emitOrphanAsk dedup', () => {
  it('second emit for same agent returns null and does not create a second ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const firstId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'pane-gone',
      detectedAt: '2026-01-01T00:00:00.000Z',
      agent: { id: 'agent-dedup', name: 'dedup-agent' },
    });
    assert.ok(firstId !== null);

    const secondId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'pane-gone',
      detectedAt: '2026-01-01T00:01:00.000Z',
      agent: { id: 'agent-dedup', name: 'dedup-agent' },
    });
    assert.equal(secondId, null, 'second emit should be deduped');

    const asks = askStore.listAsks(testDir, sessionId);
    const orphanAsks = asks.filter(id => {
      const m = askStore.readMeta(testDir, sessionId, id);
      const t = m?.orphanTarget;
      return m?.askedBy === 'system:orphan-handler' && t?.kind === 'agent' && t.agentId === 'agent-dedup';
    });
    assert.equal(orphanAsks.length, 1, 'only one ask should exist');
  });
});

// ---------------------------------------------------------------------------
// 4. markAgentAsksOrphan — only the matching agentId's asks get flagged
// ---------------------------------------------------------------------------
describe('markAgentAsksOrphan', () => {
  it('marks only asks belonging to the specified agentId', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askId1 = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId: askId1,
      askedBy: 'agent-001',
      blocking: true,
      cwd: testDir,
      title: 'ask from agent-001',
    });

    const askId2 = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId: askId2,
      askedBy: 'agent-002',
      blocking: true,
      cwd: testDir,
      title: 'ask from agent-002',
    });

    await markAgentAsksOrphan(testDir, sessionId, 'agent-001');

    const meta1 = askStore.readMeta(testDir, sessionId, askId1);
    const meta2 = askStore.readMeta(testDir, sessionId, askId2);

    assert.equal(meta1?.orphaned, true, 'agent-001 ask should be orphaned');
    assert.notEqual(meta2?.orphaned, true, 'agent-002 ask should NOT be orphaned');
  });
});

// ---------------------------------------------------------------------------
// 4b. markAgentAsksOrphan — answered asks are not retroactively orphaned
// ---------------------------------------------------------------------------
describe('markAgentAsksOrphan — skips answered asks', () => {
  it('does not set orphaned on an already-answered ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-answered',
      blocking: true,
      cwd: testDir,
      title: 'answered ask',
    });
    // Mark it answered before the orphan sweep
    await askStore.updateMeta(testDir, sessionId, askId, { status: 'answered', completedAt: new Date().toISOString() });

    await markAgentAsksOrphan(testDir, sessionId, 'agent-answered');

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.notEqual(meta?.orphaned, true, 'answered ask must not be retroactively orphaned');
  });
});

// ---------------------------------------------------------------------------
// 5. orphanOrchestrator — Promise.all coordination
// ---------------------------------------------------------------------------
describe('orphanOrchestrator', () => {
  it('orphans ORCHESTRATOR_ASKED_BY asks, marks session orphaned, emits orchestrator ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'orch test', testDir);

    // Pre-create an ask from the orchestrator itself (e.g. mode-transition notify)
    const orchAskId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId: orchAskId,
      askedBy: ORCHESTRATOR_ASKED_BY,
      blocking: true,
      cwd: testDir,
      title: 'orchestrator pending ask',
    });

    await orphanOrchestrator(testDir, sessionId, 'orchestrator-gone', 'orchestrator-gone');

    // Third Promise.all member: markAgentAsksOrphan(ORCHESTRATOR_ASKED_BY) must have run
    const meta = askStore.readMeta(testDir, sessionId, orchAskId);
    assert.equal(meta?.orphaned, true, 'orchestrator-emitted ask must be orphaned');

    // First Promise.all member: state.markSessionOrphan must have run
    const session = getSession(testDir, sessionId);
    assert.equal(session.orphaned, true, 'session must be marked orphaned');
    assert.equal(session.orphanReason, 'orchestrator-gone', 'session orphanReason must match');

    // Second Promise.all member: emitOrphanAsk must have created an orchestrator-kind orphan ask
    const asks = askStore.listAsks(testDir, sessionId);
    const orphanAsk = asks
      .filter(id => id !== orchAskId)
      .find(id => {
        const m = askStore.readMeta(testDir, sessionId, id);
        return m?.orphanTarget?.kind === 'orchestrator';
      });
    assert.ok(orphanAsk, 'orchestrator orphan ask must have been emitted');
  });

  it('does NOT orphan asks from other agents', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'orch test scoped', testDir);

    const agentAskId = ulid();
    askStore.createAsk(testDir, sessionId, {
      askId: agentAskId,
      askedBy: 'agent-001',
      blocking: true,
      cwd: testDir,
      title: 'agent ask should survive',
    });

    await orphanOrchestrator(testDir, sessionId, 'orchestrator-gone', 'orchestrator-gone');

    const meta = askStore.readMeta(testDir, sessionId, agentAskId);
    assert.notEqual(meta?.orphaned, true, 'agent ask must NOT be orphaned by orphanOrchestrator');
  });

  it('is idempotent — second call does not error or double-emit', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'orch idempotent', testDir);

    await orphanOrchestrator(testDir, sessionId, 'orchestrator-gone', 'orchestrator-gone');
    await orphanOrchestrator(testDir, sessionId, 'orchestrator-gone', 'orchestrator-gone');

    const asks = askStore.listAsks(testDir, sessionId);
    const orchestratorOrphanAsks = asks.filter(id => {
      const m = askStore.readMeta(testDir, sessionId, id);
      return m?.orphanTarget?.kind === 'orchestrator';
    });
    assert.equal(orchestratorOrphanAsks.length, 1, 'must not emit a duplicate orchestrator orphan ask');
  });
});

// ---------------------------------------------------------------------------
// 5b. markAgentAsksOrphan — idempotent under concurrent sweeps (same agent)
// ---------------------------------------------------------------------------
describe('markAgentAsksOrphan idempotent under concurrent sweeps', () => {
  it('concurrent calls on the same agent leave each meta.json parseable and orphaned', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = ulid();
      askIds.push(id);
      askStore.createAsk(testDir, sessionId, {
        askId: id,
        askedBy: 'agent-concurrent',
        blocking: false,
        cwd: testDir,
        title: `ask ${i}`,
      });
    }

    // Fire multiple concurrent sweeps for the same agent
    await Promise.all([
      markAgentAsksOrphan(testDir, sessionId, 'agent-concurrent'),
      markAgentAsksOrphan(testDir, sessionId, 'agent-concurrent'),
      markAgentAsksOrphan(testDir, sessionId, 'agent-concurrent'),
    ]);

    for (const askId of askIds) {
      const meta = askStore.readMeta(testDir, sessionId, askId);
      assert.ok(meta !== null, `meta for ${askId} should be parseable`);
      assert.equal(meta!.orphaned, true, `${askId} should be orphaned`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5c. markAgentAsksOrphan — concurrent writers on distinct ask sets
// ---------------------------------------------------------------------------
describe('markAgentAsksOrphan concurrent writers across distinct ask sets', () => {
  it('concurrent sweeps for different agents correctly flag all their own asks', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const agentAIds: string[] = [];
    const agentBIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const id = ulid();
      agentAIds.push(id);
      askStore.createAsk(testDir, sessionId, {
        askId: id,
        askedBy: 'agent-A',
        blocking: false,
        cwd: testDir,
        title: `agent-A ask ${i}`,
      });
    }
    for (let i = 0; i < 3; i++) {
      const id = ulid();
      agentBIds.push(id);
      askStore.createAsk(testDir, sessionId, {
        askId: id,
        askedBy: 'agent-B',
        blocking: false,
        cwd: testDir,
        title: `agent-B ask ${i}`,
      });
    }

    await Promise.all([
      markAgentAsksOrphan(testDir, sessionId, 'agent-A'),
      markAgentAsksOrphan(testDir, sessionId, 'agent-B'),
    ]);

    for (const askId of agentAIds) {
      const meta = askStore.readMeta(testDir, sessionId, askId);
      assert.ok(meta !== null, `agent-A meta ${askId} should be parseable`);
      assert.equal(meta!.orphaned, true, `agent-A ask ${askId} should be orphaned`);
    }
    for (const askId of agentBIds) {
      const meta = askStore.readMeta(testDir, sessionId, askId);
      assert.ok(meta !== null, `agent-B meta ${askId} should be parseable`);
      assert.equal(meta!.orphaned, true, `agent-B ask ${askId} should be orphaned`);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. meta.orphanTarget persistence — survives re-read after createAsk + updateMeta
// ---------------------------------------------------------------------------
describe('orphanTarget persistence', () => {
  it('orphanTarget survives a disk round-trip', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    const askId = await emitOrphanAsk({
      cwd: testDir,
      sessionId,
      reason: 'pid-mismatch',
      detectedAt: '2026-01-01T00:00:00.000Z',
      agent: { id: 'agent-persist', name: 'persist-agent', paneId: '%7' },
    });

    assert.ok(askId !== null);

    const meta = askStore.readMeta(testDir, sessionId, askId!);
    assert.ok(meta?.orphanTarget, 'orphanTarget should be set');
    assert.equal(meta!.orphanTarget!.kind, 'agent');
    assert.equal(meta!.orphanTarget!.agentId, 'agent-persist');
    assert.equal(meta!.orphanTarget!.paneId, '%7');
  });
});

// ---------------------------------------------------------------------------
// 7. Subtitle / reason mapping
// ---------------------------------------------------------------------------
describe('reasonSubtitle mapping', () => {
  it('produces correct subtitle text for all four reasons', async () => {
    const cases: Array<{ reason: Parameters<typeof emitOrphanAsk>[0]['reason']; expected: string }> = [
      { reason: 'pane-gone', expected: 'Pane closed unexpectedly' },
      { reason: 'pid-mismatch', expected: 'Process gone or pid recycled' },
      { reason: 'orchestrator-gone', expected: 'Orchestrator pane vanished without yield' },
      { reason: 'daemon-startup-stuck', expected: 'Orchestrator lost while daemon was down' },
    ];

    for (const { reason, expected } of cases) {
      const sessionId = randomUUID();
      createSession(sessionId, 'test task', testDir);

      const askId = await emitOrphanAsk({
        cwd: testDir,
        sessionId,
        reason,
        detectedAt: '2026-01-01T00:00:00.000Z',
      });

      assert.ok(askId !== null, `should emit ask for reason ${reason}`);

      const meta = askStore.readMeta(testDir, sessionId, askId!);
      assert.ok(meta?.subtitle?.includes(expected), `subtitle for ${reason} should contain "${expected}", got: "${meta?.subtitle}"`);
    }
  });
});

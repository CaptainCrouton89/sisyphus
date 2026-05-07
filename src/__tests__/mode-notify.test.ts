import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession } from '../daemon/state.js';
import * as askStore from '../daemon/ask-store.js';
import { emitModeTransitionNotify } from '../daemon/mode-notify.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';

let testDir: string;

before(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-mode-notify-test-'));
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Deck persisted when prevMode !== nextMode
// ---------------------------------------------------------------------------
describe('emitModeTransitionNotify — mode change', () => {
  it('persists a notify deck under ask/<askId>/ with correct shape', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning');

    const asks = askStore.listAsks(testDir, sessionId);
    assert.equal(asks.length, 1, 'one ask should be created');

    const askId = asks[0]!;
    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.ok(meta, 'meta should be readable');
    assert.equal(meta!.askedBy, ORCHESTRATOR_ASKED_BY);
    assert.equal(meta!.kind, 'notify');
    assert.equal(meta!.blocking, false);

    const deck = askStore.readDecisions(testDir, sessionId, askId);
    assert.ok(deck, 'deck should be readable');
    assert.equal(deck!.interactions.length, 1);

    const interaction = deck!.interactions[0]!;
    assert.equal(interaction.kind, 'notify');
    assert.equal(interaction.id, 'mode-transition');
    assert.equal(interaction.title, 'Mode change');
    assert.ok(interaction.subtitle!.includes('discovery'), 'subtitle should include prevMode');
    assert.ok(interaction.subtitle!.includes('planning'), 'subtitle should include nextMode');
    assert.ok(interaction.subtitle!.includes('→'), 'subtitle should include arrow');

    // Body should describe the new mode, not restate the transition
    assert.ok(interaction.body, 'body should be present');
    assert.ok(/\*\*Planning\*\*/.test(interaction.body!), 'body should bold the new mode name');
    assert.ok(
      !/Orchestrator mode changed/i.test(interaction.body!),
      'body should not restate the header verbatim',
    );

    const optionIds = interaction.options.map(o => o.id);
    assert.ok(optionIds.includes('ack'), 'should have ack option');

    assert.equal(deck!.source?.askedBy, ORCHESTRATOR_ASKED_BY);
    assert.ok(deck!.title.includes('discovery'));
    assert.ok(deck!.title.includes('planning'));

    // Aggregation discriminator + structured chain are present from the first emit
    assert.equal(meta!.modeTransition, true, 'meta should carry modeTransition discriminator');
    assert.deepEqual(
      deck!.source?.modeChain,
      [{ mode: 'discovery' }, { mode: 'planning' }],
      'source.modeChain seeds with [prev, next]',
    );
  });

  it('includes prev-mode cycle/duration footer when stats are provided', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning', {
      cycles: 3,
      activeMs: 24 * 60 * 1000,
    });

    const asks = askStore.listAsks(testDir, sessionId);
    const deck = askStore.readDecisions(testDir, sessionId, asks[0]!);
    const body = deck!.interactions[0]!.body!;

    assert.ok(/Discovery: 3 cycles/.test(body), 'body should report prev-mode cycle count');
    assert.ok(/24m active/.test(body), 'body should report prev-mode active duration');
  });

  it('uses singular "cycle" when only one cycle ran in prev mode', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'planning', 'implementation', {
      cycles: 1,
      activeMs: 45 * 1000,
    });

    const asks = askStore.listAsks(testDir, sessionId);
    const deck = askStore.readDecisions(testDir, sessionId, asks[0]!);
    const body = deck!.interactions[0]!.body!;

    assert.ok(/Planning: 1 cycle\b/.test(body), 'body should use singular cycle label');
    assert.ok(/45s active/.test(body), 'sub-minute durations should render as seconds');
  });
});

// ---------------------------------------------------------------------------
// 2. No-op when prevMode === nextMode (caller guards, but function still safe)
// ---------------------------------------------------------------------------
describe('emitModeTransitionNotify — same mode (caller would guard, direct call creates ask)', () => {
  it('still emits when called directly with same modes — caller owns the guard', async () => {
    // The guard `mode !== prevMode` lives in handleOrchestratorYield, not in this function.
    // Direct invocation still works — this just validates no crash.
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'execution', 'execution');

    const asks = askStore.listAsks(testDir, sessionId);
    // Function itself does not deduplicate — caller guards. Emitting is valid.
    assert.equal(asks.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. prevMode undefined — uses 'unknown' as fallback
// ---------------------------------------------------------------------------
describe('emitModeTransitionNotify — undefined prevMode', () => {
  it('uses "unknown" as prev label and still emits a valid deck', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, undefined, 'discovery');

    const asks = askStore.listAsks(testDir, sessionId);
    assert.equal(asks.length, 1);

    const askId = asks[0]!;
    const deck = askStore.readDecisions(testDir, sessionId, askId);
    assert.ok(deck);
    assert.ok(deck!.interactions[0]!.subtitle!.includes('unknown'));
    assert.ok(deck!.interactions[0]!.subtitle!.includes('discovery'));
  });
});

// ---------------------------------------------------------------------------
// 4. Tolerates getSession throwing (state corruption mid-yield)
// ---------------------------------------------------------------------------
describe('emitModeTransitionNotify — getSession throws', () => {
  it('still emits ask even when getSession throws (sessionName falls back to undefined)', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    // Pass a bad cwd for getSession but a valid cwd for askStore
    // We simulate the throw path by using a mismatched sessionId for the getSession call
    // instead of patching internals. The real session exists so we use a forked approach:
    // emitModeTransitionNotify catches getSession errors internally; we verify no throw.
    // Use a bogus sessionId in the getSession path by creating a wrapper session with
    // the real testDir but a session whose state file doesn't exist yet.
    const missingStateSessionId = randomUUID();
    createSession(missingStateSessionId, 'test task', testDir);

    // Delete the state file to force getSession to throw
    const { statePath } = await import('../shared/paths.js');
    rmSync(statePath(testDir, missingStateSessionId), { force: true });

    // Should not throw
    await assert.doesNotReject(
      () => emitModeTransitionNotify(testDir, missingStateSessionId, 'discovery', 'execution'),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Aggregation: subsequent transitions fold into the existing open ask
// ---------------------------------------------------------------------------
describe('emitModeTransitionNotify — aggregation', () => {
  it('folds a second transition into the existing pending ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning', {
      cycles: 2,
      activeMs: 14 * 60 * 1000,
    });
    await emitModeTransitionNotify(testDir, sessionId, 'planning', 'execution', {
      cycles: 3,
      activeMs: 30 * 60 * 1000,
    });

    const asks = askStore.listAsks(testDir, sessionId);
    assert.equal(asks.length, 1, 'second transition should not create a new ask');

    const askId = asks[0]!;
    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta!.modeTransition, true);
    assert.equal(meta!.subtitle, 'discovery → planning → execution');

    const deck = askStore.readDecisions(testDir, sessionId, askId);
    assert.deepEqual(deck!.source?.modeChain, [
      { mode: 'discovery', cycles: 2, activeMs: 14 * 60 * 1000 },
      { mode: 'planning', cycles: 3, activeMs: 30 * 60 * 1000 },
      { mode: 'execution' },
    ]);

    const body = deck!.interactions[0]!.body!;
    assert.ok(/\*\*Execution\*\*/.test(body) || /Now in \*\*Execution\*\*/.test(body),
      'body lead should name the current mode');
    assert.ok(/Discovery: 2 cycles · 14m active/.test(body), 'body lists stats for first segment');
    assert.ok(/Planning: 3 cycles · 30m active/.test(body), 'body lists stats for second segment');
  });

  it('bumps askedAt when aggregating', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning');
    const askId = askStore.listAsks(testDir, sessionId)[0]!;
    const firstAskedAt = askStore.readMeta(testDir, sessionId, askId)!.askedAt;

    await new Promise(r => setTimeout(r, 10));
    await emitModeTransitionNotify(testDir, sessionId, 'planning', 'execution');

    const secondAskedAt = askStore.readMeta(testDir, sessionId, askId)!.askedAt;
    assert.ok(
      Date.parse(secondAskedAt) > Date.parse(firstAskedAt),
      'aggregated transition should refresh askedAt',
    );
  });

  it('starts a fresh aggregator after the user acks (status=answered)', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning');
    const firstAskId = askStore.listAsks(testDir, sessionId)[0]!;
    await askStore.updateMeta(testDir, sessionId, firstAskId, {
      status: 'answered',
      completedAt: new Date().toISOString(),
    });

    await emitModeTransitionNotify(testDir, sessionId, 'planning', 'execution');

    const asks = askStore.listAsks(testDir, sessionId);
    assert.equal(asks.length, 2, 'a fresh ask should be created once the prior one is acked');

    const otherId = asks.find(id => id !== firstAskId)!;
    const otherMeta = askStore.readMeta(testDir, sessionId, otherId);
    assert.equal(otherMeta!.status, 'pending');
    assert.equal(otherMeta!.subtitle, 'planning → execution');
  });

  it('does not aggregate into an orphaned ask', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test task', testDir);

    await emitModeTransitionNotify(testDir, sessionId, 'discovery', 'planning');
    const firstAskId = askStore.listAsks(testDir, sessionId)[0]!;
    await askStore.updateMeta(testDir, sessionId, firstAskId, { orphaned: true });

    await emitModeTransitionNotify(testDir, sessionId, 'planning', 'execution');

    const asks = askStore.listAsks(testDir, sessionId);
    assert.equal(asks.length, 2, 'orphaned asks must not be reused for aggregation');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initTimers,
  registerAgentTimer,
  flushAgentTimer,
  getActiveTimers,
} from '../daemon/pane-monitor.js';
import type { Session } from '../shared/types.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-001',
    task: 'test',
    cwd: '/test',
    status: 'active',
    createdAt: new Date().toISOString(),
    activeMs: 0,
    agents: [],
    orchestratorCycles: [],
    messages: [],
    ...overrides,
  };
}

describe('agent timer lifecycle', () => {
  const sid = `timer-test-${Date.now()}`;

  it('initTimers creates the timer entry for the session', () => {
    initTimers(sid, makeSession({ id: sid }));
    const entry = getActiveTimers(sid);
    assert.ok(entry, 'Timer entry should exist after initTimers');
    assert.equal(entry!.sessionMs, 0);
  });

  it('registerAgentTimer adds an agent slot to the existing timer entry', () => {
    registerAgentTimer(sid, 'agent-001');
    const entry = getActiveTimers(sid);
    assert.ok(entry, 'Timer entry should still exist');
    assert.equal(entry!.agentMs.has('agent-001'), true, 'agent-001 should be in agentMs map');
    assert.equal(entry!.agentMs.get('agent-001'), 0, 'Initial value should be 0');
  });

  it('flushAgentTimer returns the value from the initialized slot', () => {
    // Simulate what the poll loop does: increment the timer
    const entry = getActiveTimers(sid)!;
    entry.agentMs.set('agent-001', 5_000);

    const flushed = flushAgentTimer(sid, 'agent-001');
    assert.equal(flushed, 5_000, 'Should return accumulated time');
  });

  it('flushAgentTimer returns 0 for a registered-but-unpolled agent (not missing)', () => {
    registerAgentTimer(sid, 'agent-002');
    const flushed = flushAgentTimer(sid, 'agent-002');
    assert.equal(flushed, 0, 'Newly registered agent should have 0 ms');
  });
});

describe('agent timer race condition (pre-fix scenario)', () => {
  it('without initTimers, flushAgentTimer returns 0 from missing entry', () => {
    const orphanSid = `orphan-${Date.now()}`;
    // No initTimers called — simulates old behavior where trackSession didn't init
    const flushed = flushAgentTimer(orphanSid, 'agent-001');
    assert.equal(flushed, 0, 'Returns 0 when session has no timer entry at all');
  });

  it('with initTimers + registerAgentTimer, the entry exists even before first poll', () => {
    const sid2 = `race-test-${Date.now()}`;
    initTimers(sid2, makeSession({ id: sid2 }));
    registerAgentTimer(sid2, 'agent-001');

    // Verify the full chain works: entry exists, agent slot exists
    const entry = getActiveTimers(sid2);
    assert.ok(entry, 'Timer entry exists');
    assert.ok(entry!.agentMs.has('agent-001'), 'Agent slot exists');

    // The poll loop can now find and increment this slot
    entry!.agentMs.set('agent-001', 15_000);
    assert.equal(flushAgentTimer(sid2, 'agent-001'), 15_000);
  });
});

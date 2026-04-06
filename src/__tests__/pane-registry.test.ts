import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerPane,
  unregisterPane,
  unregisterAgentPane,
  unregisterSessionPanes,
  lookupPane,
  getSessionPanes,
} from '../daemon/pane-registry.js';

// Clear all panes between tests by unregistering known pane IDs
const PANES_USED: string[] = [];

function reg(paneId: string, sessionId: string, role: 'orchestrator' | 'agent', agentId?: string) {
  PANES_USED.push(paneId);
  registerPane(paneId, sessionId, role, agentId);
}

beforeEach(() => {
  for (const p of PANES_USED) {
    unregisterPane(p);
  }
  PANES_USED.length = 0;
});

describe('registerPane / lookupPane', () => {
  it('registers and retrieves a pane entry', () => {
    reg('%1', 'session-1', 'orchestrator');
    const entry = lookupPane('%1');
    assert.ok(entry);
    assert.equal(entry.sessionId, 'session-1');
    assert.equal(entry.role, 'orchestrator');
  });

  it('registers agent pane with agentId', () => {
    reg('%2', 'session-1', 'agent', 'agent-001');
    const entry = lookupPane('%2');
    assert.ok(entry);
    assert.equal(entry.role, 'agent');
    assert.equal(entry.agentId, 'agent-001');
  });

  it('returns undefined for unregistered pane', () => {
    assert.equal(lookupPane('%999'), undefined);
  });
});

describe('unregisterPane', () => {
  it('removes a registered pane', () => {
    reg('%3', 'session-1', 'orchestrator');
    assert.ok(lookupPane('%3'));
    unregisterPane('%3');
    assert.equal(lookupPane('%3'), undefined);
  });

  it('is a no-op for unknown pane', () => {
    // Should not throw
    unregisterPane('%unknown');
  });
});

describe('unregisterAgentPane', () => {
  it('removes the pane matching sessionId and agentId', () => {
    reg('%10', 'session-1', 'agent', 'agent-001');
    reg('%11', 'session-1', 'agent', 'agent-002');

    unregisterAgentPane('session-1', 'agent-001');
    assert.equal(lookupPane('%10'), undefined);
    assert.ok(lookupPane('%11')); // agent-002 still registered
  });

  it('is a no-op when no matching agent exists', () => {
    reg('%12', 'session-1', 'agent', 'agent-001');
    unregisterAgentPane('session-1', 'agent-999');
    assert.ok(lookupPane('%12')); // unchanged
  });
});

describe('unregisterSessionPanes', () => {
  it('removes all panes for a session', () => {
    reg('%20', 'session-A', 'orchestrator');
    reg('%21', 'session-A', 'agent', 'agent-001');
    reg('%22', 'session-B', 'agent', 'agent-001');

    unregisterSessionPanes('session-A');
    assert.equal(lookupPane('%20'), undefined);
    assert.equal(lookupPane('%21'), undefined);
    assert.ok(lookupPane('%22')); // session-B unaffected
  });
});

describe('getSessionPanes', () => {
  it('returns all panes for a session', () => {
    reg('%30', 'session-X', 'orchestrator');
    reg('%31', 'session-X', 'agent', 'agent-001');
    reg('%32', 'session-Y', 'agent', 'agent-001');

    const panes = getSessionPanes('session-X');
    assert.equal(panes.length, 2);
    const paneIds = panes.map(p => p.paneId).sort();
    assert.deepStrictEqual(paneIds, ['%30', '%31']);
  });

  it('returns empty array for unknown session', () => {
    const panes = getSessionPanes('no-such-session');
    assert.equal(panes.length, 0);
  });
});

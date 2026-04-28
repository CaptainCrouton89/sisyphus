import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession, addAgent, markSessionOrphan, markAgentOrphan, addOrchestratorCycle } from '../daemon/state.js';
import { listSessions } from '../daemon/session-manager.js';
import { buildTree } from '../tui/lib/tree.js';
import { askMetaPath, askEntryDir } from '../shared/paths.js';
import { readMeta } from '../daemon/ask-store.js';
import { dispatchOrphanResolution } from '../tui/panels/mounted-humanloop.js';
import type { Agent, Session } from '../shared/types.js';
import type { SessionSummary } from '../tui/state.js';
import type { SessionTreeNode, AgentTreeNode } from '../tui/types/tree.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-t5-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'test-agent',
    agentType: 'default',
    color: 'blue',
    instruction: 'do work',
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    reports: [],
    paneId: '%0',
    repo: '.',
    orphaned: false,
    activeMs: 0,
    ...overrides,
  };
}

function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: randomUUID(),
    task: 'test task',
    status: 'active',
    agentCount: 0,
    runningAgentCount: 0,
    createdAt: new Date().toISOString(),
    activeMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listSessions returns orphaned field
// ---------------------------------------------------------------------------

describe('listSessions orphaned field', () => {
  it('returns orphaned=false for normal sessions', () => {
    const id = randomUUID();
    createSession(id, 'task-normal', testDir);
    const sessions = listSessions(testDir);
    const s = sessions.find(x => x.id === id);
    assert.ok(s, 'session should appear in list');
    assert.equal(s.orphaned, false);
  });

  it('returns orphaned=true for orphaned sessions', async () => {
    const id = randomUUID();
    createSession(id, 'task-orphan', testDir);
    await markSessionOrphan(testDir, id, { reason: 'test' });
    const sessions = listSessions(testDir);
    const s = sessions.find(x => x.id === id);
    assert.ok(s, 'orphaned session should appear in list');
    assert.equal(s.orphaned, true);
  });
});

// ---------------------------------------------------------------------------
// buildTree propagates orphaned for session nodes
// ---------------------------------------------------------------------------

describe('buildTree orphaned propagation — session', () => {
  it('sets orphaned=false on SessionTreeNode for non-orphaned session', () => {
    const summary = makeSessionSummary({ orphaned: false });
    const nodes = buildTree([summary], null, new Set(['section:running']), testDir);
    const sessionNode = nodes.find(n => n.type === 'session') as SessionTreeNode | undefined;
    assert.ok(sessionNode, 'session node should exist');
    assert.equal(sessionNode.orphaned, false);
  });

  it('sets orphaned=true on SessionTreeNode for orphaned session', () => {
    const summary = makeSessionSummary({ orphaned: true });
    const nodes = buildTree([summary], null, new Set(['section:running']), testDir);
    const sessionNode = nodes.find(n => n.type === 'session') as SessionTreeNode | undefined;
    assert.ok(sessionNode, 'session node should exist');
    assert.equal(sessionNode.orphaned, true);
  });
});

// ---------------------------------------------------------------------------
// buildTree propagates orphaned for agent nodes
// ---------------------------------------------------------------------------

describe('buildTree orphaned propagation — agent', () => {
  it('sets orphaned=true on AgentTreeNode after markAgentOrphan', async () => {
    const sessionId = randomUUID();
    const agentId = 'agent-orp-001';

    createSession(sessionId, 'task', testDir);
    // Insert agent with orphaned: false so the test actually exercises markAgentOrphan
    await addAgent(testDir, sessionId, makeAgent({ id: agentId, orphaned: false }));
    await addOrchestratorCycle(testDir, sessionId, {
      cycle: 1,
      timestamp: new Date().toISOString(),
      activeMs: 0,
      agentsSpawned: [agentId],
    });

    // Call with the real 4-arg signature
    await markAgentOrphan(testDir, sessionId, agentId, { reason: 'test-reason' });

    const { getSession } = await import('../daemon/state.js');
    const fullSession = getSession(testDir, sessionId) as Session;

    // Verify markAgentOrphan actually wrote orphaned=true (deleting its body would break this)
    const agent = fullSession.agents.find(a => a.id === agentId);
    assert.ok(agent, 'agent should exist in state');
    assert.equal(agent.orphaned, true, 'markAgentOrphan must set orphaned=true');
    assert.equal(agent.killedReason, 'test-reason', 'markAgentOrphan must persist reason');

    const summary = makeSessionSummary({ id: sessionId });
    const cycleNodeId = `cycle:${sessionId}:1`;
    const expanded = new Set([`section:running`, `session:${sessionId}`, cycleNodeId]);
    const nodes = buildTree([summary], fullSession, expanded, testDir);

    const agentNode = nodes.find(n => n.type === 'agent') as AgentTreeNode | undefined;
    assert.ok(agentNode, 'agent node should exist in tree');
    assert.equal(agentNode.orphaned, true);
  });
});

// ---------------------------------------------------------------------------
// Orphan dispatch routing — exercises real dispatchOrphanResolution
// ---------------------------------------------------------------------------

describe('orphan dispatch routing', () => {
  it('routes takeover to onOrphanTakeover callback (agent target)', async () => {
    const sessionId = randomUUID();
    const orphanTarget = { kind: 'agent' as const, agentId: 'agent-xyz', paneId: '%42' };

    const daemonSendCalls: unknown[] = [];
    const takeoverCalls: unknown[] = [];

    const daemonSend = async (req: unknown) => { daemonSendCalls.push(req); return { ok: true as const, data: {} }; };
    const onOrphanTakeover = async (target: unknown) => { takeoverCalls.push(target); };

    await dispatchOrphanResolution(orphanTarget, 'takeover', {
      daemonSend,
      onOrphanTakeover,
      sessionId,
      cwd: testDir,
    });

    assert.equal(takeoverCalls.length, 1);
    assert.deepEqual(takeoverCalls[0], { sessionId, agentId: 'agent-xyz', paneId: '%42' });
    assert.equal(daemonSendCalls.length, 0);
  });

  it('routes restart to daemonSend restart-agent (agent target)', async () => {
    const orphanTarget = { kind: 'agent' as const, agentId: 'agent-abc', paneId: '%10' };
    const sessionId = 'sess-test';

    const daemonSendCalls: unknown[] = [];
    const takeoverCalls: unknown[] = [];

    const daemonSend = async (req: unknown) => { daemonSendCalls.push(req); return { ok: true as const, data: {} }; };
    const onOrphanTakeover = async (target: unknown) => { takeoverCalls.push(target); };

    await dispatchOrphanResolution(orphanTarget, 'restart', {
      daemonSend,
      onOrphanTakeover,
      sessionId,
      cwd: testDir,
    });

    assert.equal(daemonSendCalls.length, 1);
    assert.deepEqual(daemonSendCalls[0], { type: 'restart-agent', sessionId, agentId: 'agent-abc' });
    assert.equal(takeoverCalls.length, 0);
  });

  it('routes resume to daemonSend resume (orchestrator target)', async () => {
    const orphanTarget = { kind: 'orchestrator' as const };
    const sessionId = 'sess-orch';

    const daemonSendCalls: unknown[] = [];
    const daemonSend = async (req: unknown) => { daemonSendCalls.push(req); return { ok: true as const, data: {} }; };

    await dispatchOrphanResolution(orphanTarget, 'resume', {
      daemonSend,
      sessionId,
      cwd: testDir,
    });

    assert.equal(daemonSendCalls.length, 1);
    assert.deepEqual(daemonSendCalls[0], { type: 'resume', sessionId, cwd: testDir });
  });

  it('dismiss takes no action', async () => {
    const orphanTarget = { kind: 'agent' as const, agentId: 'agent-dim', paneId: '%5' };
    const sessionId = 'sess-dim';

    const daemonSendCalls: unknown[] = [];
    const takeoverCalls: unknown[] = [];

    const daemonSend = async (req: unknown) => { daemonSendCalls.push(req); return { ok: true as const, data: {} }; };
    const onOrphanTakeover = async (target: unknown) => { takeoverCalls.push(target); };

    await dispatchOrphanResolution(orphanTarget, 'dismiss', {
      daemonSend,
      onOrphanTakeover,
      sessionId,
      cwd: testDir,
    });

    assert.equal(daemonSendCalls.length, 0);
    assert.equal(takeoverCalls.length, 0);
  });
});

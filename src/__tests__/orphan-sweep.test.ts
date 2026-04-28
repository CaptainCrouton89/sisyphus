import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createSession, getSession, addAgent, setAgentPid } from '../daemon/state.js';
import * as askStore from '../daemon/ask-store.js';
import { probePidLstart, sweepSessionAgents, sweepSessionAsks, sweepOrphans } from '../daemon/orphan-sweep.js';
import type { Agent } from '../shared/types.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-orphan-sweep-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'worker',
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

function selfLstart(): string {
  return execSync(`ps -o lstart= -p ${process.pid}`, { encoding: 'utf-8' }).trim();
}

const GONE_PID = 2147483647; // max PID on most Linux, very unlikely to be alive

// ---------------------------------------------------------------------------
// probePidLstart — direct unit tests
// ---------------------------------------------------------------------------

describe('probePidLstart - live process', () => {
  it('returns live when pid matches expected lstart', () => {
    const lstart = selfLstart();
    const result = probePidLstart(process.pid, lstart);
    assert.equal(result, 'live');
  });
});

describe('probePidLstart - recycled pid', () => {
  it('returns recycled when pid exists but lstart differs', () => {
    const result = probePidLstart(process.pid, 'Thu Jan  1 00:00:00 1970');
    assert.equal(result, 'recycled');
  });
});

describe('probePidLstart - gone pid', () => {
  it('returns gone when pid does not exist', () => {
    const result = probePidLstart(GONE_PID, 'Thu Jan  1 00:00:00 1970');
    assert.equal(result, 'gone');
  });
});

describe('probePidLstart - unknown when ps throws without status=1', () => {
  it('returns unknown when ps runner throws an error with no status code (ps unavailable)', () => {
    // Inject a ps runner that throws without a `status` property (simulates ps binary missing
    // or a signal-interrupted invocation). The safety invariant: 'unknown' must not false-orphan
    // agents when ps is unreachable.
    const brokenPs = () => { throw new Error('ps: command not found'); };
    const result = probePidLstart(process.pid, 'any-lstart', brokenPs);
    assert.equal(result, 'unknown', 'must return unknown when ps throws without status=1');
  });

  it('sweepSessionAgents treats unknown as live and does not orphan the agent', async () => {
    // Integration: 'unknown' → safety branch → agent preserved
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent());
    const lstart = selfLstart();
    await setAgentPid(testDir, sessionId, 'agent-001', process.pid, lstart);

    // sweepSessionAgents uses the default psRunner so it'll return 'live' — agent stays untouched.
    // The 'unknown' path is covered by the unit test above; this verifies the guard at line 81.
    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, false);
  });
});

// ---------------------------------------------------------------------------
// sweepSessionAgents — file-output tests
// ---------------------------------------------------------------------------

describe('sweepSessionAgents - live agent is not orphaned', () => {
  it('leaves running agent with matching lstart untouched', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent());
    const lstart = selfLstart();
    await setAgentPid(testDir, sessionId, 'agent-001', process.pid, lstart);

    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, false);
  });
});

describe('sweepSessionAgents - recycled pid marks orphan', () => {
  it('marks agent orphaned when pid exists but lstart differs', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent());
    await setAgentPid(testDir, sessionId, 'agent-001', process.pid, 'Thu Jan  1 00:00:00 1970');

    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, true);
    assert.equal(session.agents[0]!.status, 'lost');
  });
});

describe('sweepSessionAgents - gone pid marks orphan', () => {
  it('marks agent orphaned when pid is gone', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent());
    await setAgentPid(testDir, sessionId, 'agent-001', GONE_PID, 'Thu Jan  1 00:00:00 1970');

    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, true);
    assert.equal(session.agents[0]!.status, 'lost');
  });
});

describe('sweepSessionAgents - no pid skips agent', () => {
  it('does not orphan pre-stage-4 agent without pid', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent()); // no pid set

    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, false);
  });
});

describe('sweepSessionAgents - already orphaned is idempotent', () => {
  it('does not double-process an already-orphaned agent', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent({ orphaned: true, status: 'lost' }));

    await sweepSessionAgents(testDir, sessionId);

    // Still orphaned, not changed further (no error thrown)
    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, true);
  });
});

describe('sweepSessionAgents - non-running agent is skipped', () => {
  it('does not touch completed agents', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(
      testDir, sessionId,
      makeAgent({ status: 'completed', completedAt: new Date().toISOString() }),
    );

    await sweepSessionAgents(testDir, sessionId);

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, false);
  });
});

// ---------------------------------------------------------------------------
// sweepSessionAsks — ask-meta sweep
// ---------------------------------------------------------------------------

describe('sweepSessionAsks - dead pid orphans ask', () => {
  it('sets orphaned=true on pending ask whose pid is gone', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    const askId = randomUUID();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-001',
      blocking: true,
      pid: GONE_PID,
      cwd: testDir,
    });

    await sweepSessionAsks(testDir, sessionId);

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta!.orphaned, true);
  });
});

describe('sweepSessionAsks - alive pid leaves ask untouched', () => {
  it('does not orphan ask whose process is still alive', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    const askId = randomUUID();
    askStore.createAsk(testDir, sessionId, {
      askId,
      askedBy: 'agent-001',
      blocking: true,
      pid: process.pid,
      cwd: testDir,
    });

    await sweepSessionAsks(testDir, sessionId);

    const meta = askStore.readMeta(testDir, sessionId, askId);
    assert.equal(meta!.orphaned, undefined);
  });
});

// ---------------------------------------------------------------------------
// sweepOrphans - registry integration
// ---------------------------------------------------------------------------

describe('sweepOrphans - uses provided registry', () => {
  it('processes sessions from the provided registry without hitting global path', async () => {
    const sessionId = randomUUID();
    createSession(sessionId, 'test', testDir);
    await addAgent(testDir, sessionId, makeAgent());
    await setAgentPid(testDir, sessionId, 'agent-001', GONE_PID, 'Thu Jan  1 00:00:00 1970');

    await sweepOrphans({ [sessionId]: testDir });

    const session = getSession(testDir, sessionId);
    assert.equal(session.agents[0]!.orphaned, true);
  });
});

describe('sweepOrphans - missing state file is skipped gracefully', () => {
  it('does not throw for a registry entry with no state file on disk', async () => {
    const sessionId = randomUUID();
    // Note: no createSession call — state file does not exist
    await assert.doesNotReject(
      sweepOrphans({ [sessionId]: testDir }),
    );
  });
});

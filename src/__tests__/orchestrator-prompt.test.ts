import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session, Agent, AgentReport } from '../shared/types.js';
import { buildCompletionContent } from '../daemon/orchestrator.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-orch-prompt-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeReport(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    type: 'final',
    filePath: '/tmp/report.md',
    summary: 'Did some work',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-001',
    name: 'test-agent',
    agentType: 'sisyphus:implement',
    color: 'blue',
    instruction: 'do work',
    status: 'completed',
    spawnedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    activeMs: 60000,
    reports: [makeReport()],
    paneId: '%1',
    repo: '.',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const sessionId = 'test-session-id';
  const sessionDir = join(testDir, '.sisyphus', 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });

  return {
    id: sessionId,
    task: 'Test task',
    cwd: testDir,
    status: 'active',
    createdAt: new Date().toISOString(),
    activeMs: 120000,
    agents: [],
    orchestratorCycles: [],
    messages: [],
    ...overrides,
  };
}

describe('buildCompletionContent', () => {
  it('returns empty for session with no agents and no logs', () => {
    const session = makeSession();
    const result = buildCompletionContent(session);
    assert.match(result, /Session History/);
    // No agent table or cycle logs
    assert.ok(!result.includes('| Agent'));
    assert.ok(!result.includes('Cycle Logs'));
  });

  it('includes agent summary table', () => {
    const session = makeSession({
      agents: [
        makeAgent({ id: 'agent-001', name: 'plan', agentType: 'sisyphus:plan', reports: [makeReport({ summary: 'Created a plan' })] }),
        makeAgent({ id: 'agent-002', name: 'impl', agentType: 'sisyphus:implement', reports: [makeReport({ summary: 'Built the thing' })] }),
      ],
    });
    const result = buildCompletionContent(session);
    assert.match(result, /agent-001/);
    assert.match(result, /agent-002/);
    assert.match(result, /Created a plan/);
    assert.match(result, /Built the thing/);
    assert.match(result, /sisyphus:plan/);
    assert.match(result, /sisyphus:implement/);
  });

  it('prefers final report summary over update report', () => {
    const session = makeSession({
      agents: [
        makeAgent({
          reports: [
            makeReport({ type: 'update', summary: 'Partial progress' }),
            makeReport({ type: 'final', summary: 'Completed everything' }),
          ],
        }),
      ],
    });
    const result = buildCompletionContent(session);
    assert.match(result, /Completed everything/);
    assert.ok(!result.includes('Partial progress'));
  });

  it('falls back to latest report when no final report exists', () => {
    const session = makeSession({
      agents: [
        makeAgent({
          reports: [
            makeReport({ type: 'update', summary: 'First update' }),
            makeReport({ type: 'update', summary: 'Latest update' }),
          ],
        }),
      ],
    });
    const result = buildCompletionContent(session);
    assert.match(result, /Latest update/);
  });

  it('shows (no report) for agents without reports', () => {
    const session = makeSession({
      agents: [makeAgent({ reports: [] })],
    });
    const result = buildCompletionContent(session);
    assert.match(result, /\(no report\)/);
  });

  it('inlines cycle logs from disk', () => {
    const session = makeSession();
    const logsPath = join(testDir, '.sisyphus', 'sessions', session.id, 'logs');
    mkdirSync(logsPath, { recursive: true });
    writeFileSync(join(logsPath, 'cycle-001.md'), '# Cycle 1 — Strategy\n\nDid strategy work.');
    writeFileSync(join(logsPath, 'cycle-002.md'), '# Cycle 2 — Implementation\n\nSpawned 3 agents.');

    const result = buildCompletionContent(session);
    assert.match(result, /Cycle Logs/);
    assert.match(result, /Did strategy work/);
    assert.match(result, /Spawned 3 agents/);
  });

  it('sorts cycle logs numerically', () => {
    const session = makeSession();
    const logsPath = join(testDir, '.sisyphus', 'sessions', session.id, 'logs');
    mkdirSync(logsPath, { recursive: true });
    writeFileSync(join(logsPath, 'cycle-002.md'), 'Second');
    writeFileSync(join(logsPath, 'cycle-001.md'), 'First');
    writeFileSync(join(logsPath, 'cycle-010.md'), 'Tenth');

    const result = buildCompletionContent(session);
    const firstIdx = result.indexOf('First');
    const secondIdx = result.indexOf('Second');
    const tenthIdx = result.indexOf('Tenth');
    assert.ok(firstIdx < secondIdx, 'cycle-001 should come before cycle-002');
    assert.ok(secondIdx < tenthIdx, 'cycle-002 should come before cycle-010');
  });

  it('skips empty cycle log files', () => {
    const session = makeSession();
    const logsPath = join(testDir, '.sisyphus', 'sessions', session.id, 'logs');
    mkdirSync(logsPath, { recursive: true });
    writeFileSync(join(logsPath, 'cycle-001.md'), '# Cycle 1\n\nReal content.');
    writeFileSync(join(logsPath, 'cycle-002.md'), '');

    const result = buildCompletionContent(session);
    assert.match(result, /Real content/);
  });

  it('includes reference to reports directory', () => {
    const session = makeSession();
    const reportsPath = join(testDir, '.sisyphus', 'sessions', session.id, 'reports');
    mkdirSync(reportsPath, { recursive: true });
    writeFileSync(join(reportsPath, 'agent-001-final.md'), 'Full report here');

    const result = buildCompletionContent(session);
    assert.match(result, /Detailed Reports/);
    assert.match(result, /@.*reports/);
  });

  it('omits reports reference when reports dir is empty', () => {
    const session = makeSession();
    const reportsPath = join(testDir, '.sisyphus', 'sessions', session.id, 'reports');
    mkdirSync(reportsPath, { recursive: true });

    const result = buildCompletionContent(session);
    assert.ok(!result.includes('Detailed Reports'));
  });
});

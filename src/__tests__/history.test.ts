import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRecentSentiments } from '../daemon/history.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-history-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeSession(id: string, data: Record<string, unknown>): void {
  const dir = join(testDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'session.json'), JSON.stringify(data), 'utf-8');
}

describe('getRecentSentiments', () => {
  it('returns empty array when no history exists', () => {
    const result = getRecentSentiments(3, 30, join(testDir, 'nonexistent'));
    assert.deepEqual(result, []);
  });

  it('returns empty array when no sessions have sentiment', () => {
    writeSession('sess-1', {
      sentiment: null,
      task: 'fix bug',
      completedAt: '2024-01-01T00:00:00Z',
    });
    const result = getRecentSentiments(3, 30, testDir);
    assert.deepEqual(result, []);
  });

  it('returns sentiments from sessions that have them', () => {
    writeSession('sess-1', {
      sentiment: 'Frustrated with flaky tests but optimistic about the refactor.',
      task: 'fix flaky tests in CI pipeline',
      completedAt: '2024-01-01T10:00:00Z',
    });
    writeSession('sess-2', {
      sentiment: null,
      task: 'add logging',
      completedAt: '2024-01-01T11:00:00Z',
    });
    writeSession('sess-3', {
      sentiment: 'Calm, methodical debugging session.',
      task: 'debug memory leak',
      completedAt: '2024-01-01T12:00:00Z',
    });

    const result = getRecentSentiments(5, 30, testDir);
    assert.equal(result.length, 2);
    assert.ok(result.some(r => r.sentiment.includes('Frustrated')));
    assert.ok(result.some(r => r.sentiment.includes('Calm')));
  });

  it('respects count limit', () => {
    for (let i = 0; i < 10; i++) {
      writeSession(`sess-${i}`, {
        sentiment: `Sentiment ${i}`,
        task: `task ${i}`,
        completedAt: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      });
    }
    const result = getRecentSentiments(3, 30, testDir);
    assert.equal(result.length, 3);
  });

  it('respects scanLimit', () => {
    for (let i = 0; i < 10; i++) {
      writeSession(`sess-${i}`, {
        sentiment: `Sentiment ${i}`,
        task: `task ${i}`,
        completedAt: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      });
    }
    // Only scan 2 dirs — should find at most 2 sentiments
    const result = getRecentSentiments(10, 2, testDir);
    assert.ok(result.length <= 2);
  });

  it('truncates long task descriptions to 100 chars', () => {
    const longTask = 'a'.repeat(200);
    writeSession('sess-1', {
      sentiment: 'Short and sweet.',
      task: longTask,
      completedAt: '2024-01-01T00:00:00Z',
    });
    const result = getRecentSentiments(3, 30, testDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].task.length, 100);
  });

  it('skips dirs with invalid JSON gracefully', () => {
    const dir = join(testDir, 'bad-session');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'session.json'), 'not json', 'utf-8');

    writeSession('good-session', {
      sentiment: 'Good vibes.',
      task: 'working task',
      completedAt: '2024-01-01T00:00:00Z',
    });

    const result = getRecentSentiments(3, 30, testDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].sentiment, 'Good vibes.');
  });
});

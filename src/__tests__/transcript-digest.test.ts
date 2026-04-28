import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestTranscript, TOOL_USE_INPUT_CAP } from '../daemon/transcript-digest.js';

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), 'transcript-digest-'));
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

function writeJsonl(homeDir: string, cwd: string, sessionId: string, lines: object[]): string {
  const projectDir = join(homeDir, '.claude', 'projects', encodeCwd(cwd));
  mkdirSync(projectDir, { recursive: true });
  const path = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
  return path;
}

let homeDir: string;
beforeEach(() => { homeDir = makeHome(); });
afterEach(() => { rmSync(homeDir, { recursive: true, force: true }); });

it('returns "" when claudeSessionId is absent (H3)', () => {
  assert.equal(digestTranscript({ cwd: '/x', claudeSessionId: undefined, homeDir }), '');
});

it('returns "" when jsonl is missing (recipe §1.22)', () => {
  assert.equal(digestTranscript({ cwd: '/missing', claudeSessionId: 'abc', homeDir }), '');
});

describe('encoding and content', () => {
  it('encodes cwd with / → - and finds file', () => {
    const cwd = '/tmp/foo';
    const sid = 'session-abc';
    writeJsonl(homeDir, cwd, sid, [
      { type: 'user', timestamp: 't1', message: { role: 'user', content: 'CTX_TOKEN' } },
    ]);
    const result = digestTranscript({ cwd, claudeSessionId: sid, homeDir });
    assert.ok(result.includes('CTX_TOKEN'), `expected CTX_TOKEN in digest, got: ${result}`);
  });

  it('byte-caps via Buffer.byteLength (multi-byte safe)', () => {
    const cwd = '/byte/cap';
    const sid = 'session-cap';
    // Each entry: emoji (4 bytes each × 50 = 200 bytes) + overhead
    const entries = Array.from({ length: 100 }, (_, i) => ({
      type: 'user',
      timestamp: `t${i}`,
      message: { role: 'user', content: '🔥'.repeat(50) },
    }));
    writeJsonl(homeDir, cwd, sid, entries);
    const result = digestTranscript({ cwd, claudeSessionId: sid, homeDir, byteCap: 512 });
    assert.ok(Buffer.byteLength(result, 'utf-8') <= 512,
      `digest exceeds 512 bytes: ${Buffer.byteLength(result, 'utf-8')}`);
    // Pins newest-first contract: t99 (newest) kept, t0 (oldest) dropped.
    assert.ok(result.includes('t99'), 'newest entry (t99) must be preserved');
    assert.ok(!result.includes('[t0]'), 'oldest entry (t0) must be dropped');
  });

  it('skips non-user/assistant types and unparseable lines', () => {
    const cwd = '/skip/test';
    const sid = 'session-skip';
    const projectDir = join(homeDir, '.claude', 'projects', encodeCwd(cwd));
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'queue-operation', message: { content: 'SHOULD_NOT_APPEAR' } }),
      '{malformed json',
      JSON.stringify({ type: 'user', timestamp: 't1', message: { role: 'user', content: 'APPEARS' } }),
    ].join('\n') + '\n';
    writeFileSync(join(projectDir, `${sid}.jsonl`), lines, 'utf-8');

    const result = digestTranscript({ cwd, claudeSessionId: sid, homeDir });
    assert.ok(!result.includes('SHOULD_NOT_APPEAR'));
    assert.ok(result.includes('APPEARS'));
  });

  it('formats tool_use blocks with input truncated to 200 chars', () => {
    const cwd = '/tool/use';
    const sid = 'session-tool';
    const longInput = { key: 'x'.repeat(250) };
    writeJsonl(homeDir, cwd, sid, [
      {
        type: 'assistant',
        timestamp: 't1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Bash', input: longInput }],
        },
      },
    ]);
    const result = digestTranscript({ cwd, claudeSessionId: sid, homeDir });
    assert.ok(result.includes('tool_use:Bash'), `expected tool_use:Bash in digest`);
    assert.ok(result.includes('…'), `expected truncation marker in digest`);
    const m = result.match(/tool_use:Bash (.+)…/);
    assert.ok(m !== null, 'expected truncation pattern tool_use:Bash <payload>…');
    assert.ok(m![1].length <= TOOL_USE_INPUT_CAP, `expected payload ≤ ${TOOL_USE_INPUT_CAP} chars before truncation marker, got ${m![1].length}`);
  });
});

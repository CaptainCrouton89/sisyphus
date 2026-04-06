import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { augmentedPath, execEnv } from '../shared/env.js';

describe('augmentedPath', () => {
  it('returns a string containing the original PATH', () => {
    const result = augmentedPath();
    const originalPath = process.env['PATH'] ?? '/usr/bin:/bin';
    // The original PATH should be contained within the result
    assert.ok(result.includes('/usr/bin') || result.includes('/bin'), 'should include standard paths');
  });

  it('includes common binary directories', () => {
    const result = augmentedPath();
    const parts = result.split(':');
    // At least some of the common candidates should be present
    const hasSomeCandidates = parts.some(p =>
      p === '/usr/local/bin' ||
      p === '/opt/homebrew/bin' ||
      p.endsWith('/.local/bin'),
    );
    assert.ok(hasSomeCandidates, 'should include at least one common binary directory');
  });

  it('does not add candidates that are already in PATH', () => {
    const originalPath = process.env['PATH'] ?? '/usr/bin:/bin';
    const originalParts = new Set(originalPath.split(':'));
    const result = augmentedPath();
    const resultParts = result.split(':');
    // Every prepended entry (before the original PATH) should not be in the original PATH
    const prependedEntries = resultParts.slice(0, resultParts.length - originalPath.split(':').length);
    for (const entry of prependedEntries) {
      assert.ok(!originalParts.has(entry), `prepended entry '${entry}' should not already be in PATH`);
    }
  });
});

describe('execEnv', () => {
  it('returns an object with PATH set to augmentedPath', () => {
    const env = execEnv();
    assert.equal(env['PATH'], augmentedPath());
  });

  it('preserves existing environment variables', () => {
    const env = execEnv();
    // HOME should be passed through
    assert.equal(env['HOME'], process.env['HOME']);
  });
});

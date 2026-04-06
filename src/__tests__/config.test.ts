import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../shared/config.js';

// loadConfig reads from globalConfigPath() and projectConfigPath(cwd).
// We can't easily override those without mocking, but we can test the merge
// behavior by pointing cwd at a temp dir that has a .sisyphus/config.json.
// The global config may or may not exist on the test machine.

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sisyphus-config-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns defaults when no project config exists', () => {
    const config = loadConfig(testDir);
    assert.equal(config.pollIntervalMs, 5000);
    assert.equal(config.orchestratorEffort, 'high');
    assert.equal(config.agentEffort, 'medium');
    assert.equal(config.companionPopup, true);
    assert.equal(config.notifications?.enabled, true);
  });

  it('project config overrides defaults', () => {
    const configDir = join(testDir, '.sisyphus');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      pollIntervalMs: 10_000,
      model: 'opus',
    }));

    const config = loadConfig(testDir);
    assert.equal(config.pollIntervalMs, 10_000);
    assert.equal(config.model, 'opus');
    // Defaults still present for non-overridden fields
    assert.equal(config.orchestratorEffort, 'high');
  });

  it('handles malformed project config gracefully', () => {
    const configDir = join(testDir, '.sisyphus');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), 'not valid json!!!');

    // Should not throw — falls back to defaults
    const config = loadConfig(testDir);
    assert.equal(config.pollIntervalMs, 5000);
  });

  it('merges statusBar config deeply', () => {
    const configDir = join(testDir, '.sisyphus');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      statusBar: {
        colors: { processing: '#ff0000' },
        segments: { custom: { bg: 'blue' } },
      },
    }));

    const config = loadConfig(testDir);
    assert.equal(config.statusBar?.colors?.processing, '#ff0000');
    assert.deepStrictEqual(config.statusBar?.segments?.custom, { bg: 'blue' });
  });
});

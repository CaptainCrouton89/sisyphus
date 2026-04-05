import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureSisyphusGitignore } from '../shared/gitignore.js';

describe('ensureSisyphusGitignore', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'sisyphus-gitignore-'));
    mkdirSync(join(cwd, '.git'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates .gitignore with sisyphus entries when none exists', () => {
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.ok(content.includes('.sisyphus/sessions/*/prompts/'));
    assert.ok(content.includes('.sisyphus/sessions/*/logs/'));
    assert.ok(content.includes('.sisyphus/sessions/*/snapshots/'));
    assert.ok(content.includes('.sisyphus/sessions/*/.tui/'));
  });

  it('appends to existing .gitignore', () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\ndist/\n');
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.ok(content.startsWith('node_modules/\ndist/\n'));
    assert.ok(content.includes('.sisyphus/sessions/*/prompts/'));
  });

  it('skips entries already present', () => {
    const existing = 'node_modules/\n.sisyphus/sessions/*/prompts/\n.sisyphus/sessions/*/logs/\n.sisyphus/sessions/*/snapshots/\n.sisyphus/sessions/*/.tui/\n';
    writeFileSync(join(cwd, '.gitignore'), existing);
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.equal(content, existing);
  });

  it('adds only missing entries', () => {
    writeFileSync(join(cwd, '.gitignore'), '.sisyphus/sessions/*/prompts/\n');
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    // prompts already there, should not be duplicated
    assert.equal(content.split('.sisyphus/sessions/*/prompts/').length - 1, 1);
    // others should be added
    assert.ok(content.includes('.sisyphus/sessions/*/logs/'));
    assert.ok(content.includes('.sisyphus/sessions/*/snapshots/'));
    assert.ok(content.includes('.sisyphus/sessions/*/.tui/'));
  });

  it('does nothing outside a git repo', () => {
    rmSync(join(cwd, '.git'), { recursive: true });
    ensureSisyphusGitignore(cwd);
    assert.equal(existsSync(join(cwd, '.gitignore')), false);
  });

  it('is idempotent', () => {
    ensureSisyphusGitignore(cwd);
    const first = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    ensureSisyphusGitignore(cwd);
    const second = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.equal(first, second);
  });
});

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

  it('creates .gitignore with .sisyphus entry when none exists', () => {
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.ok(content.includes('.sisyphus'));
  });

  it('appends to existing .gitignore', () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\ndist/\n');
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.ok(content.startsWith('node_modules/\ndist/\n'));
    assert.ok(content.includes('.sisyphus'));
  });

  it('skips entry already present', () => {
    const existing = 'node_modules/\n.sisyphus\n';
    writeFileSync(join(cwd, '.gitignore'), existing);
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    assert.equal(content, existing);
  });

  it('skips when old granular entries cover .sisyphus', () => {
    writeFileSync(join(cwd, '.gitignore'), '.sisyphus/sessions/*/prompts/\n');
    ensureSisyphusGitignore(cwd);
    const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    // .sisyphus should still be added since exact match not found
    assert.ok(content.includes('\n.sisyphus\n') || content.endsWith('.sisyphus\n'));
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

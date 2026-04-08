import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installBeginCommand } from '../cli/onboard.js';

// Regression test for the bug where `/begin` was only installed by the explicit
// `sisyphus setup` command — users who jumped straight to `sisyphus start`
// (which lazy-installs the daemon via `ensureDaemonInstalled`) never got the
// slash command. The fix wires `installBeginCommand` into the lazy-install
// path; this test pins the behaviour of `installBeginCommand` itself so the
// wiring has something to call.

describe('installBeginCommand', () => {
  let fakeHome: string;
  let originalHome: string | undefined;
  let fixtureDir: string;
  let fixtureSrc: string;
  const fixtureContents = '---\ndescription: test fixture\n---\n\nfixture body\n';

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'sisyphus-begin-home-'));
    fixtureDir = mkdtempSync(join(tmpdir(), 'sisyphus-begin-fixture-'));
    fixtureSrc = join(fixtureDir, 'begin.md');
    writeFileSync(fixtureSrc, fixtureContents, 'utf8');

    originalHome = process.env['HOME'];
    process.env['HOME'] = fakeHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('writes /begin to ~/.claude/commands/sisyphus on first call', () => {
    const dest = join(fakeHome, '.claude', 'commands', 'sisyphus', 'begin.md');
    assert.equal(existsSync(dest), false);

    const result = installBeginCommand(fixtureSrc);

    assert.equal(result.installed, true);
    assert.equal(result.autoInstalled, true);
    assert.equal(result.path, dest);
    assert.equal(existsSync(dest), true);
    assert.equal(readFileSync(dest, 'utf-8'), fixtureContents);
  });

  it('is idempotent — second call reports already installed without rewriting', () => {
    installBeginCommand(fixtureSrc);
    const dest = join(fakeHome, '.claude', 'commands', 'sisyphus', 'begin.md');
    const before = readFileSync(dest, 'utf-8');

    // Mutate the dest so we can detect any rewrite by the second call.
    writeFileSync(dest, before + 'sentinel', 'utf8');

    const result = installBeginCommand(fixtureSrc);

    assert.equal(result.installed, true);
    assert.equal(result.autoInstalled, false);
    assert.equal(readFileSync(dest, 'utf-8'), before + 'sentinel');
  });

  it('reports failure when source template is missing', () => {
    const result = installBeginCommand(join(fixtureDir, 'does-not-exist.md'));
    assert.equal(result.installed, false);
    assert.equal(result.autoInstalled, false);
  });
});

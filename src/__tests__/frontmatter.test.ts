import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectProvider,
  parseAgentFrontmatter,
  extractAgentBody,
  resolveAgentTypePath,
  resolveAgentConfig,
  discoverAgentTypes,
} from '../daemon/frontmatter.js';

// ---------------------------------------------------------------------------
// detectProvider
// ---------------------------------------------------------------------------
describe('detectProvider', () => {
  it('returns anthropic for undefined model', () => {
    assert.equal(detectProvider(undefined), 'anthropic');
  });

  it('returns anthropic for claude models', () => {
    assert.equal(detectProvider('claude-sonnet-4-5-20250514'), 'anthropic');
    assert.equal(detectProvider('claude-opus-4-0-20250514'), 'anthropic');
    assert.equal(detectProvider('claude-haiku-3-5'), 'anthropic');
  });

  it('returns openai for gpt models', () => {
    assert.equal(detectProvider('gpt-5.2'), 'openai');
    assert.equal(detectProvider('gpt-5.3-codex'), 'openai');
  });

  it('returns openai for codex models', () => {
    assert.equal(detectProvider('codex-mini'), 'openai');
    assert.equal(detectProvider('codex-mini-latest'), 'openai');
  });

  it('returns anthropic for unknown models', () => {
    assert.equal(detectProvider('gemini-pro'), 'anthropic');
    assert.equal(detectProvider('llama-3'), 'anthropic');
  });
});

// ---------------------------------------------------------------------------
// parseAgentFrontmatter
// ---------------------------------------------------------------------------
describe('parseAgentFrontmatter', () => {
  it('parses all frontmatter fields', () => {
    const content = `---
name: debugger
model: gpt-5.3-codex
color: red
description: A debug agent
permissionMode: bypassPermissions
---

Body content here.`;

    const fm = parseAgentFrontmatter(content);
    assert.equal(fm.name, 'debugger');
    assert.equal(fm.model, 'gpt-5.3-codex');
    assert.equal(fm.color, 'red');
    assert.equal(fm.description, 'A debug agent');
    assert.equal(fm.permissionMode, 'bypassPermissions');
  });

  it('returns empty object when no frontmatter', () => {
    const fm = parseAgentFrontmatter('Just body content, no frontmatter.');
    assert.deepStrictEqual(fm, {});
  });

  it('handles partial frontmatter', () => {
    const content = `---
color: blue
---

Body.`;

    const fm = parseAgentFrontmatter(content);
    assert.equal(fm.color, 'blue');
    assert.equal(fm.model, undefined);
    assert.equal(fm.name, undefined);
  });

  it('parses skills list', () => {
    const content = `---
name: planner
skills:
  - devcore:debugging
  - devcore:testing
---

Body.`;

    const fm = parseAgentFrontmatter(content);
    assert.deepStrictEqual(fm.skills, ['devcore:debugging', 'devcore:testing']);
  });
});

// ---------------------------------------------------------------------------
// extractAgentBody
// ---------------------------------------------------------------------------
describe('extractAgentBody', () => {
  it('strips frontmatter and returns body', () => {
    const content = `---
name: test
model: codex-mini
---

This is the body.`;

    assert.equal(extractAgentBody(content), 'This is the body.');
  });

  it('returns full content when no frontmatter', () => {
    assert.equal(extractAgentBody('Just content.'), 'Just content.');
  });

  it('returns empty string for frontmatter-only file', () => {
    const content = `---
name: test
---`;

    assert.equal(extractAgentBody(content), '');
  });
});

// ---------------------------------------------------------------------------
// resolveAgentTypePath
// ---------------------------------------------------------------------------
describe('resolveAgentTypePath', () => {
  let testDir: string;
  let pluginDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'sisyphus-fm-'));
    pluginDir = join(testDir, 'plugin');
    mkdirSync(join(pluginDir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null for empty agentType', () => {
    assert.equal(resolveAgentTypePath('', pluginDir, testDir), null);
  });

  it('finds namespaced agent type in plugin dir', () => {
    const agentPath = join(pluginDir, 'agents', 'debug.md');
    writeFileSync(agentPath, '---\ncolor: red\n---\nDebug agent.');

    const result = resolveAgentTypePath('sisyphus:debug', pluginDir, testDir);
    assert.equal(result, agentPath);
  });

  it('finds non-namespaced agent in project .claude/agents/', () => {
    const projectAgentDir = join(testDir, '.claude', 'agents');
    mkdirSync(projectAgentDir, { recursive: true });
    const agentPath = join(projectAgentDir, 'custom.md');
    writeFileSync(agentPath, '---\nmodel: codex-mini\n---\nCustom agent.');

    const result = resolveAgentTypePath('custom', pluginDir, testDir);
    assert.equal(result, agentPath);
  });

  it('falls back to plugin dir for non-namespaced agent', () => {
    const agentPath = join(pluginDir, 'agents', 'implement.md');
    writeFileSync(agentPath, '---\ncolor: green\n---\nImpl agent.');

    const result = resolveAgentTypePath('implement', pluginDir, testDir);
    assert.equal(result, agentPath);
  });

  it('returns null when agent type file not found', () => {
    const result = resolveAgentTypePath('nonexistent', pluginDir, testDir);
    assert.equal(result, null);
  });

  it('project-local takes precedence over plugin dir', () => {
    // Create in both locations
    const projectAgentDir = join(testDir, '.claude', 'agents');
    mkdirSync(projectAgentDir, { recursive: true });
    const projectPath = join(projectAgentDir, 'debug.md');
    writeFileSync(projectPath, 'project version');

    const pluginPath = join(pluginDir, 'agents', 'debug.md');
    writeFileSync(pluginPath, 'plugin version');

    const result = resolveAgentTypePath('debug', pluginDir, testDir);
    assert.equal(result, projectPath);
  });
});

// ---------------------------------------------------------------------------
// resolveAgentConfig
// ---------------------------------------------------------------------------
describe('resolveAgentConfig', () => {
  let testDir: string;
  let pluginDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'sisyphus-cfg-'));
    pluginDir = join(testDir, 'plugin');
    mkdirSync(join(pluginDir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null for unresolvable agent type', () => {
    assert.equal(resolveAgentConfig('nonexistent', pluginDir, testDir), null);
  });

  it('returns parsed frontmatter and body', () => {
    const agentPath = join(pluginDir, 'agents', 'debug.md');
    writeFileSync(agentPath, `---
name: debugger
model: gpt-5.3-codex
color: red
---

You are a debugging agent.`);

    const config = resolveAgentConfig('sisyphus:debug', pluginDir, testDir);
    assert.notEqual(config, null);
    assert.equal(config!.frontmatter.name, 'debugger');
    assert.equal(config!.frontmatter.model, 'gpt-5.3-codex');
    assert.equal(config!.frontmatter.color, 'red');
    assert.equal(config!.body, 'You are a debugging agent.');
    assert.equal(config!.filePath, agentPath);
  });

  it('returns config with empty frontmatter for file without frontmatter', () => {
    const agentPath = join(pluginDir, 'agents', 'bare.md');
    writeFileSync(agentPath, 'Just a body, no frontmatter.');

    const config = resolveAgentConfig('sisyphus:bare', pluginDir, testDir);
    assert.notEqual(config, null);
    assert.deepStrictEqual(config!.frontmatter, {});
    assert.equal(config!.body, 'Just a body, no frontmatter.');
  });

  it('provider detection works end-to-end with resolved config', () => {
    const agentPath = join(pluginDir, 'agents', 'codex-agent.md');
    writeFileSync(agentPath, `---
model: codex-mini-latest
color: cyan
---

A codex agent.`);

    const config = resolveAgentConfig('sisyphus:codex-agent', pluginDir, testDir);
    const provider = detectProvider(config?.frontmatter.model);
    assert.equal(provider, 'openai');
  });

  it('anthropic model resolves to anthropic provider', () => {
    const agentPath = join(pluginDir, 'agents', 'claude-agent.md');
    writeFileSync(agentPath, `---
model: claude-sonnet-4-5-20250514
color: blue
---

A claude agent.`);

    const config = resolveAgentConfig('sisyphus:claude-agent', pluginDir, testDir);
    const provider = detectProvider(config?.frontmatter.model);
    assert.equal(provider, 'anthropic');
  });
});

// ---------------------------------------------------------------------------
// discoverAgentTypes
// ---------------------------------------------------------------------------
describe('discoverAgentTypes', () => {
  let testDir: string;
  let pluginDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'sisyphus-discover-'));
    pluginDir = join(testDir, 'plugin');
    mkdirSync(join(pluginDir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers bundled agents with sisyphus: prefix', () => {
    writeFileSync(join(pluginDir, 'agents', 'debug.md'), `---
name: debugger
model: opus
description: Investigates bugs
---

Body.`);
    writeFileSync(join(pluginDir, 'agents', 'implement.md'), `---
name: implementer
model: sonnet
description: Writes code
---

Body.`);

    const types = discoverAgentTypes(pluginDir, testDir);
    const bundled = types.filter(t => t.source === 'bundled');
    assert.equal(bundled.length, 2);

    const debug = types.find(t => t.qualifiedName === 'sisyphus:debug');
    assert.notEqual(debug, undefined);
    assert.equal(debug!.source, 'bundled');
    assert.equal(debug!.model, 'opus');
    assert.equal(debug!.description, 'Investigates bugs');

    const impl = types.find(t => t.qualifiedName === 'sisyphus:implement');
    assert.notEqual(impl, undefined);
    assert.equal(impl!.source, 'bundled');
  });

  it('discovers project-local agents as bare names', () => {
    const projectAgentDir = join(testDir, '.claude', 'agents');
    mkdirSync(projectAgentDir, { recursive: true });
    writeFileSync(join(projectAgentDir, 'custom.md'), `---
description: My custom agent
---

Body.`);

    const types = discoverAgentTypes(pluginDir, testDir);
    const custom = types.find(t => t.qualifiedName === 'custom');
    assert.notEqual(custom, undefined);
    assert.equal(custom!.source, 'project');
    assert.equal(custom!.description, 'My custom agent');
  });

  it('skips CLAUDE.md files', () => {
    writeFileSync(join(pluginDir, 'agents', 'CLAUDE.md'), '# Not an agent');
    writeFileSync(join(pluginDir, 'agents', 'real.md'), '---\ndescription: Real agent\n---\nBody.');

    const types = discoverAgentTypes(pluginDir, testDir);
    const bundled = types.filter(t => t.source === 'bundled');
    assert.equal(bundled.length, 1);
    assert.equal(bundled[0]!.qualifiedName, 'sisyphus:real');
    assert.equal(types.find(t => t.qualifiedName === 'sisyphus:CLAUDE'), undefined);
  });

  it('handles missing directories gracefully', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'sisyphus-empty-'));
    const missingPlugin = join(emptyDir, 'no-such-plugin');

    const types = discoverAgentTypes(missingPlugin, emptyDir);
    // No project, user, or bundled agents — only installed plugins if any
    assert.equal(types.filter(t => t.source === 'project').length, 0);
    assert.equal(types.filter(t => t.source === 'user').length, 0);
    assert.equal(types.filter(t => t.source === 'bundled').length, 0);

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('deduplicates by qualified name (project wins over bundled)', () => {
    // Create same bare name in both project and bundled
    const projectAgentDir = join(testDir, '.claude', 'agents');
    mkdirSync(projectAgentDir, { recursive: true });
    writeFileSync(join(projectAgentDir, 'worker.md'), '---\ndescription: Project worker\n---\nBody.');
    writeFileSync(join(pluginDir, 'agents', 'worker.md'), '---\ndescription: Bundled worker\n---\nBody.');

    const types = discoverAgentTypes(pluginDir, testDir);
    const workers = types.filter(t => t.qualifiedName === 'worker');
    assert.equal(workers.length, 1);
    assert.equal(workers[0]!.source, 'project');
    assert.equal(workers[0]!.description, 'Project worker');
  });
});

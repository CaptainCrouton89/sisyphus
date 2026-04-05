import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import type { Provider } from '../shared/types.js';

export interface AgentTypeFrontmatter {
  name?: string;
  model?: string;
  color?: string;
  description?: string;
  skills?: string[];
  plugins?: string[];
  permissionMode?: string;
  effort?: string;
  interactive?: boolean;
  systemPrompt?: 'append' | 'replace';
}

export { type Provider } from '../shared/types.js';

export function detectProvider(model: string | undefined): Provider {
  if (!model) return 'anthropic';
  if (/^(gpt-|codex-)/.test(model)) return 'openai';
  return 'anthropic';
}

export function parseAgentFrontmatter(content: string): AgentTypeFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const block = match[1]!;
  const fm: AgentTypeFrontmatter = {};

  const str = (key: string): string | undefined => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1]!.trim() : undefined;
  };

  fm.name = str('name');
  fm.model = str('model');
  fm.color = str('color');
  fm.description = str('description');
  fm.permissionMode = str('permissionMode');
  fm.effort = str('effort');

  const interactive = str('interactive');
  if (interactive === 'true') fm.interactive = true;

  const systemPrompt = str('systemPrompt');
  if (systemPrompt === 'append' || systemPrompt === 'replace') fm.systemPrompt = systemPrompt;

  // Parse YAML lists (skills, plugins)
  for (const key of ['skills', 'plugins'] as const) {
    const listMatch = block.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)*)`, 'm'));
    if (listMatch) {
      (fm as Record<string, unknown>)[key] = listMatch[1]!
        .split('\n')
        .map(line => line.replace(/^\s+-\s+/, '').trim())
        .filter(Boolean);
    }
    // Also support inline YAML array: plugins: [a, b]
    const inlineMatch = block.match(new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm'));
    if (inlineMatch && !(fm as Record<string, unknown>)[key]) {
      (fm as Record<string, unknown>)[key] = inlineMatch[1]!
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }

  return fm;
}

export function extractAgentBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1]!.trim() : content.trim();
}

function findPluginInstallPath(namespace: string): string | null {
  try {
    const registryPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    for (const key of Object.keys(registry)) {
      if (key.startsWith(`${namespace}@`)) {
        return registry[key].installPath ?? null;
      }
    }
  } catch {
    // File missing, parse error, or no match
  }
  return null;
}

export function resolveAgentTypePath(agentType: string, pluginDir: string, cwd: string): string | null {
  if (!agentType) return null;

  let namespace: string | undefined;
  let name: string;

  if (agentType.includes(':')) {
    [namespace, name] = agentType.split(':', 2) as [string, string];
  } else {
    name = agentType;
  }

  const searchPaths: string[] = [];

  if (namespace) {
    // Bundled (handles sisyphus:* via pluginDir)
    searchPaths.push(join(pluginDir, 'agents', `${name}.md`));
    // Installed plugin
    const installPath = findPluginInstallPath(namespace);
    if (installPath) {
      searchPaths.push(join(installPath, 'agents', `${name}.md`));
    }
  } else {
    // Project-local
    searchPaths.push(join(cwd, '.claude', 'agents', `${name}.md`));
    // User-global
    searchPaths.push(join(homedir(), '.claude', 'agents', `${name}.md`));
    // Bundled
    searchPaths.push(join(pluginDir, 'agents', `${name}.md`));
  }

  for (const path of searchPaths) {
    if (existsSync(path)) return path;
  }

  return null;
}

export interface DiscoveredAgentType {
  qualifiedName: string;
  source: 'bundled' | 'plugin' | 'project' | 'user';
  description?: string;
  model?: string;
}

export function discoverAgentTypes(pluginDir: string, cwd: string): DiscoveredAgentType[] {
  const seen = new Set<string>();
  const results: DiscoveredAgentType[] = [];

  function scanDir(dir: string, prefix: string | null, source: DiscoveredAgentType['source']): void {
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'CLAUDE.md') continue;
      const name = basename(file, '.md');
      const qualifiedName = prefix ? `${prefix}:${name}` : name;
      if (seen.has(qualifiedName)) continue;
      seen.add(qualifiedName);

      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        const fm = parseAgentFrontmatter(content);
        results.push({ qualifiedName, source, description: fm.description, model: fm.model });
      } catch {
        results.push({ qualifiedName, source });
      }
    }
  }

  // Priority order: project > user > bundled > plugins
  scanDir(join(cwd, '.claude', 'agents'), null, 'project');
  scanDir(join(homedir(), '.claude', 'agents'), null, 'user');
  scanDir(join(pluginDir, 'agents'), 'sisyphus', 'bundled');

  // Installed plugins (handles v1 flat and v2 nested formats)
  try {
    const registryPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    const pluginEntries = registry.plugins ?? registry;
    for (const key of Object.keys(pluginEntries)) {
      const atIdx = key.indexOf('@');
      if (atIdx < 1) continue;
      const namespace = key.slice(0, atIdx);
      const entry = pluginEntries[key];
      const installPath = Array.isArray(entry) ? entry[0]?.installPath : entry?.installPath;
      if (installPath) {
        scanDir(join(installPath, 'agents'), namespace, 'plugin');
      }
    }
  } catch {
    // Registry missing or unparseable
  }

  return results;
}

export interface ResolvedAgentConfig {
  frontmatter: AgentTypeFrontmatter;
  body: string;
  filePath: string;
}

export function resolveAgentConfig(agentType: string, pluginDir: string, cwd: string): ResolvedAgentConfig | null {
  const filePath = resolveAgentTypePath(agentType, pluginDir, cwd);
  if (!filePath) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return {
      frontmatter: parseAgentFrontmatter(content),
      body: extractAgentBody(content),
      filePath,
    };
  } catch {
    return null;
  }
}

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Provider } from '../shared/types.js';

export interface AgentTypeFrontmatter {
  name?: string;
  model?: string;
  color?: string;
  description?: string;
  skills?: string[];
  permissionMode?: string;
}

export { type Provider } from '../shared/types.js';

export function detectProvider(model: string | undefined): Provider {
  if (!model) return 'anthropic';
  if (/^(gpt-|o\d+-|codex-)/.test(model)) return 'openai';
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

  // Parse skills as a YAML list
  const skillsMatch = block.match(/^skills:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (skillsMatch) {
    fm.skills = skillsMatch[1]!
      .split('\n')
      .map(line => line.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean);
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

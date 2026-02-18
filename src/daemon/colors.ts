import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ORCHESTRATOR_COLOR = 'yellow';

const AGENT_PALETTE = ['blue', 'green', 'magenta', 'cyan', 'red', 'white'] as const;

const TMUX_COLOR_MAP: Record<string, string> = {
  orange: 'colour208',
  teal: 'colour6',
};

function normalizeTmuxColor(color: string): string {
  return TMUX_COLOR_MAP[color] ?? color;
}

const sessionColorIndex = new Map<string, number>();

export function getNextColor(sessionId: string): string {
  const idx = sessionColorIndex.get(sessionId) ?? 0;
  const color = AGENT_PALETTE[idx % AGENT_PALETTE.length]!;
  sessionColorIndex.set(sessionId, idx + 1);
  return color;
}

export function resetColors(sessionId: string): void {
  sessionColorIndex.delete(sessionId);
}

function extractFrontmatterColor(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const colorMatch = match[1]!.match(/^color:\s*(.+)$/m);
  return colorMatch ? colorMatch[1]!.trim() : null;
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

export function resolveAgentTypeColor(agentType: string, pluginDir: string, cwd: string): string | null {
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
    try {
      const content = readFileSync(path, 'utf-8');
      const color = extractFrontmatterColor(content);
      if (color) return normalizeTmuxColor(color);
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

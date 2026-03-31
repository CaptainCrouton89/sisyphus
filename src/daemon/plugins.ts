import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../shared/config.js';

interface PluginEntry {
  scope: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
}

interface InstalledPlugins {
  version: number;
  plugins: Record<string, PluginEntry[]>;
}

function installedPluginsPath(): string {
  return join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
}

export function resolveInstalledPlugin(name: string): string | null {
  let data: InstalledPlugins;
  try {
    data = JSON.parse(readFileSync(installedPluginsPath(), 'utf-8'));
  } catch {
    return null;
  }

  const entries = data.plugins?.[name];
  if (!entries || entries.length === 0) return null;

  // Prefer user-scoped entry
  const userEntry = entries.find(e => e.scope === 'user');
  return (userEntry ?? entries[0])!.installPath;
}

export function resolveRequiredPluginDirs(cwd: string): string[] {
  const config = loadConfig(cwd);
  const required = config.requiredPlugins;
  if (!required || required.length === 0) return [];

  const dirs: string[] = [];
  for (const plugin of required) {
    const key = `${plugin.name}@${plugin.marketplace}`;
    const path = resolveInstalledPlugin(key);
    if (path) {
      dirs.push(path);
    } else {
      console.log(`[sisyphus] Warning: required plugin ${key} not installed — skipping`);
    }
  }
  return dirs;
}

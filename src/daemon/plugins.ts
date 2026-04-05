import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

/**
 * Auto-install a plugin if not already present.
 * key format: "name@marketplace" (e.g. "termrender@crouton-kit")
 */
function ensurePluginInstalled(key: string): string | null {
  const existing = resolveInstalledPlugin(key);
  if (existing) return existing;

  console.log(`[sisyphus] Auto-installing plugin ${key}...`);
  try {
    execFileSync('claude', ['plugin', 'install', key], {
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (err) {
    console.log(`[sisyphus] Warning: failed to install plugin ${key} — ${(err as Error).message}`);
    return null;
  }

  // Re-read registry after install
  const installed = resolveInstalledPlugin(key);
  if (!installed) {
    console.log(`[sisyphus] Warning: plugin ${key} installed but not found in registry`);
  }
  return installed;
}

export function resolveRequiredPluginDirs(cwd: string): string[] {
  const config = loadConfig(cwd);
  const required = config.requiredPlugins;
  if (!required || required.length === 0) return [];

  const dirs: string[] = [];
  for (const plugin of required) {
    const key = `${plugin.name}@${plugin.marketplace}`;
    const path = ensurePluginInstalled(key);
    if (path) {
      dirs.push(path);
    } else {
      console.log(`[sisyphus] Warning: required plugin ${key} not available — skipping`);
    }
  }
  return dirs;
}

/**
 * Resolve per-agent-type plugin dirs from frontmatter `plugins` field.
 * Auto-installs missing plugins. Keys are "name@marketplace" strings.
 */
export function resolveAgentPluginDirs(plugins: string[] | undefined): string[] {
  if (!plugins || plugins.length === 0) return [];

  const dirs: string[] = [];
  for (const key of plugins) {
    const path = ensurePluginInstalled(key);
    if (path) {
      dirs.push(path);
    }
  }
  return dirs;
}

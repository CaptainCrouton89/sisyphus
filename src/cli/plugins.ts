import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../shared/config.js';
import { resolveInstalledPlugin } from '../daemon/plugins.js';

export interface SisyphusPluginInfo {
  installed: boolean;
  autoInstalled: boolean;
  installPath: string | null;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function isMarketplaceInstalled(marketplace: string): boolean {
  const output = exec('claude plugins marketplace list');
  return output.includes(marketplace);
}

function installMarketplace(marketplace: string, owner: string): void {
  console.log(`Adding marketplace: ${owner}/${marketplace}`);
  execSync(`claude plugins marketplace add ${owner}/${marketplace}`, { stdio: 'inherit' });
}

function installPlugin(key: string): void {
  console.log(`Installing plugin: ${key}`);
  execSync(`claude plugins install ${key} --scope user`, { stdio: 'inherit' });
}

const SISYPHUS_PLUGIN_KEY = 'sisyphus@sisyphus';
const SISYPHUS_MARKETPLACE = 'sisyphus';
const SISYPHUS_OWNER = 'crouton-labs';

/**
 * Ensures the user-facing sisyphus plugin (slash commands: /sisyphus:begin,
 * /sisyphus:autopsy, /sisyphus:configure-upload) is installed in the user's
 * Claude Code workspace. Adds the marketplace if needed.
 */
export function ensureSisyphusPluginInstalled(): SisyphusPluginInfo {
  const existing = resolveInstalledPlugin(SISYPHUS_PLUGIN_KEY);
  if (existing) {
    return { installed: true, autoInstalled: false, installPath: existing };
  }

  try {
    if (!isMarketplaceInstalled(SISYPHUS_MARKETPLACE)) {
      installMarketplace(SISYPHUS_MARKETPLACE, SISYPHUS_OWNER);
    }
    installPlugin(SISYPHUS_PLUGIN_KEY);
  } catch (err) {
    console.warn(`Warning: failed to install ${SISYPHUS_PLUGIN_KEY} — ${(err as Error).message}`);
    return { installed: false, autoInstalled: false, installPath: null };
  }

  const installPath = resolveInstalledPlugin(SISYPHUS_PLUGIN_KEY);
  return { installed: installPath !== null, autoInstalled: installPath !== null, installPath };
}

/**
 * Resolve a usable `crtr` binary. Prefers one on PATH (how spawned agent panes
 * invoke it); falls back to the copy pulled in via the `@crouton-kit/crouter`
 * dependency next to this install. Returns null if neither is runnable.
 */
function resolveCrtrBin(): string | null {
  if (exec('crtr -v')) return 'crtr';
  const candidates = [
    resolve(import.meta.dirname, '../../node_modules/.bin/crtr'),
    resolve(import.meta.dirname, '../node_modules/.bin/crtr'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && exec(`"${c}" -v`)) return c;
  }
  return null;
}

/** `crtr marketplace list` / `crtr plugin list` emit `<scope>:<name>@<ver>` lines. */
function listHasName(output: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|:)${escaped}@`, 'm').test(output);
}

/**
 * Ensure the crtr plugins sisyphus depends on (for agent/orchestrator skills)
 * are registered + installed in the user's crtr scope. Idempotent and
 * best-effort: a missing `crtr` or a failed subcommand warns and continues —
 * agents degrade to "skill unavailable" rather than the daemon failing to come
 * up. Mirrors `ensureRequiredPlugins` for the Claude Code plugin ecosystem.
 */
export function ensureRequiredCrtrPlugins(cwd: string): void {
  const required = loadConfig(cwd).requiredCrtrPlugins;
  if (!required || required.length === 0) return;

  const crtr = resolveCrtrBin();
  if (!crtr) {
    console.warn(
      'Warning: `crtr` not found — sisyphus skills (e.g. `crtr skill show sisyphus/orchestration`) will be unavailable. Install with: npm i -g @crouton-kit/crouter',
    );
    return;
  }

  for (const req of required) {
    try {
      if (!listHasName(exec(`"${crtr}" marketplace list`), req.marketplace)) {
        console.log(`Registering crtr marketplace: ${req.gitUrl}`);
        execSync(`"${crtr}" marketplace add ${req.gitUrl}`, { stdio: 'inherit' });
      }
      if (!listHasName(exec(`"${crtr}" plugin list`), req.plugin)) {
        console.log(`Installing crtr plugin: ${req.marketplace}:${req.plugin}`);
        execSync(`"${crtr}" marketplace install ${req.marketplace}:${req.plugin}`, {
          stdio: 'inherit',
        });
      }
    } catch (err) {
      console.warn(
        `Warning: failed to ensure crtr plugin ${req.marketplace}:${req.plugin} — ${(err as Error).message}`,
      );
    }
  }
}

export async function ensureRequiredPlugins(cwd: string): Promise<void> {
  const config = loadConfig(cwd);
  const required = config.requiredPlugins;
  if (!required || required.length === 0) return;

  for (const plugin of required) {
    const key = `${plugin.name}@${plugin.marketplace}`;
    const existing = resolveInstalledPlugin(key);
    if (existing) continue;

    console.log(`Required plugin ${key} not found — installing...`);

    if (!isMarketplaceInstalled(plugin.marketplace)) {
      installMarketplace(plugin.marketplace, plugin.owner);
    }

    installPlugin(key);

    // Verify
    const verified = resolveInstalledPlugin(key);
    if (verified) {
      console.log(`Installed ${key} → ${verified}`);
    } else {
      console.warn(`Warning: failed to verify ${key} installation`);
    }
  }
}

import { execSync } from 'node:child_process';
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

function installMarketplace(marketplace: string, owner = 'CaptainCrouton89'): void {
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
      installMarketplace(plugin.marketplace);
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

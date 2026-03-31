import { execSync } from 'node:child_process';
import { loadConfig } from '../shared/config.js';
import { resolveInstalledPlugin } from '../daemon/plugins.js';

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

function installMarketplace(marketplace: string): void {
  console.log(`Adding marketplace: ${marketplace}`);
  execSync(`claude plugins marketplace add CaptainCrouton89/${marketplace}`, { stdio: 'inherit' });
}

function installPlugin(key: string): void {
  console.log(`Installing plugin: ${key}`);
  execSync(`claude plugins install ${key} --scope user`, { stdio: 'inherit' });
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

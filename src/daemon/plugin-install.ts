import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const PLUGIN_NAME = 'sisyphus-tmux';
const INSTALL_DIR = join(homedir(), '.claude', 'plugins', PLUGIN_NAME);

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      const srcMtime = statSync(srcPath).mtimeMs;
      const destMtime = existsSync(destPath) ? statSync(destPath).mtimeMs : 0;
      if (srcMtime > destMtime) {
        copyFileSync(srcPath, destPath);
      }
    }
  }
}

function pluginNeedsUpdate(sourceDir: string): boolean {
  // Check hooks.json version as a proxy for whether the plugin is current
  const srcHooks = join(sourceDir, 'hooks', 'hooks.json');
  const destHooks = join(INSTALL_DIR, 'hooks', 'hooks.json');
  if (!existsSync(destHooks)) return true;
  try {
    return readFileSync(srcHooks, 'utf-8') !== readFileSync(destHooks, 'utf-8');
  } catch {
    return true;
  }
}

export function installPlugin(): void {
  const sourceDir = resolve(import.meta.dirname, '../templates/sisyphus-tmux-plugin');

  if (!existsSync(sourceDir)) {
    console.error(`[plugin-install] Source dir not found: ${sourceDir}`);
    return;
  }

  if (!pluginNeedsUpdate(sourceDir)) return;

  try {
    copyDir(sourceDir, INSTALL_DIR);
    // Ensure hook script is executable
    const hookScript = join(INSTALL_DIR, 'hooks', 'tmux-state.sh');
    if (existsSync(hookScript)) {
      try { chmodSync(hookScript, 0o755); } catch (err) { console.error('[sisyphus] Failed to chmod hook script:', err instanceof Error ? err.message : err); }
    }
    console.log(`[plugin-install] Installed ${PLUGIN_NAME} to ${INSTALL_DIR}`);
  } catch (err) {
    console.error(`[plugin-install] Failed to install ${PLUGIN_NAME}: ${err}`);
  }
}

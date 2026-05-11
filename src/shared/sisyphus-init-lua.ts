import { mkdirSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

let initLuaEnsured = false;

/**
 * Idempotent: copies templates/sisyphus-init.lua to ~/.config/sisyphus/init.lua
 * if and only if the destination doesn't exist. Safe to call repeatedly.
 *
 * Loaded only when nvim is invoked as `NVIM_APPNAME=sisyphus nvim ...` (compose
 * flows in both the TUI popup and the in-session tmux scripts).
 */
export function ensureSisyphusInitLua(): void {
  if (initLuaEnsured) return;
  initLuaEnsured = true;
  try {
    const destDir = join(homedir(), '.config', 'sisyphus');
    const destPath = join(destDir, 'init.lua');
    if (existsSync(destPath)) return;
    mkdirSync(destDir, { recursive: true });
    const srcPath = join(import.meta.dirname, 'templates', 'sisyphus-init.lua');
    cpSync(srcPath, destPath);
  } catch {
    // Non-fatal: nvim still opens, just without sisyphus init customization.
  }
}

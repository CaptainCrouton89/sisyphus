import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { shellQuote } from '../../shared/shell.js';
import { EXEC_ENV } from '../../shared/exec.js';
import { type AppState, type ComposeAction, OPTIONAL_COMPOSE, notify } from '../state.js';
import type { InputActions } from '../input.js';
import { dispatchComposeAction } from '../input.js';

let initLuaEnsured = false;

/**
 * Idempotent: copies templates/sisyphus-init.lua to ~/.config/sisyphus/init.lua
 * if and only if the destination doesn't exist. Safe to call repeatedly.
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
    // Non-fatal: popup will still open nvim, just without sisyphus init customization.
  }
}

/**
 * Open a tmux popup running `NVIM_APPNAME=sisyphus nvim <tempfile>`, await close,
 * read content, dispatch action. Empty file = cancel (no submission).
 * Synchronous; blocks the TUI render loop until popup exits.
 */
export function composeViaPopup(
  action: ComposeAction,
  state: AppState,
  actions: InputActions,
): void {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sisyphus-popup-'));
  const tempFile = join(tmpDir, 'compose.md');
  try {
    writeFileSync(tempFile, '', 'utf-8');
    const cmd = `NVIM_APPNAME=sisyphus nvim ${shellQuote(tempFile)}`;
    execSync(
      `tmux display-popup -E -w 90% -h 90% -d ${shellQuote(state.cwd)} ${shellQuote(cmd)}`,
      { stdio: 'inherit', env: EXEC_ENV },
    );

    let rawContent = '';
    try { rawContent = readFileSync(tempFile, 'utf-8'); } catch { /* ignore */ }

    const required = !OPTIONAL_COMPOSE.has(action.kind);
    if (!rawContent.trim() && required) {
      // Cancel: silent. Match editInPopup semantics — no notification on cancel.
      return;
    }
    // Dispatch original untrimmed content — trim is only for cancel detection above.
    dispatchComposeAction(action, rawContent, state, actions);
  } catch (err) {
    notify(state, `Failed to open compose popup: ${(err as Error).message}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

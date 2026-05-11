import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { shellQuote } from '../../shared/shell.js';
import { EXEC_ENV } from '../../shared/exec.js';
import { type AppState, type ComposeAction, OPTIONAL_COMPOSE, notify } from '../state.js';
import type { InputActions } from '../input.js';
import { dispatchComposeAction } from '../input.js';

export { ensureSisyphusInitLua } from '../../shared/sisyphus-init-lua.js';

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

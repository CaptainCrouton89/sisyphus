import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { shellQuote } from '../../shared/shell.js';
import { openDashboardWindow } from './dashboard.js';

/**
 * `sis diagnostic home-init <name> <cwd>`
 *
 * Bootstrap a tmux home session — a regular (non-`ssyph_`-prefixed) session
 * with `@sisyphus_cwd` set, hosting the dashboard in window 1. Idempotent:
 * re-running on an existing session is a no-op aside from re-focusing the
 * dashboard window.
 *
 * Designed to run on the cloud box itself (over SSH) so `import.meta.dirname`
 * resolves to the box's installed sisyphi `tui.js`. Does not require a tmux
 * client — talks to the tmux server directly with `-t` targeting.
 */
export function registerHomeInit(parent: Command): void {
  parent
    .command('home-init <name> <cwd>')
    .description('Bootstrap a tmux home session with the sisyphus dashboard.')
    .action((name: string, cwd: string) => {
      ensureSession(name, cwd);
      setSessionCwd(name, cwd);
      openDashboardWindow(name, cwd);
    });
}

function sessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${shellQuote(name)}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function ensureSession(name: string, cwd: string): void {
  if (sessionExists(name)) return;
  execSync(
    `tmux new-session -d -s ${shellQuote(name)} -c ${shellQuote(cwd)}`,
    { stdio: 'pipe' },
  );
}

function setSessionCwd(name: string, cwd: string): void {
  execSync(
    `tmux set-option -t ${shellQuote(name)} @sisyphus_cwd ${shellQuote(cwd.replace(/\/+$/, ''))}`,
    { stdio: 'pipe' },
  );
}

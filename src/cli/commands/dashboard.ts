import type { Command } from 'commander';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { assertTmux, getTmuxSession } from '../tmux.js';
import { shellQuote } from '../../shared/shell.js';


/**
 * Ensures a dashboard window exists in the given tmux session.
 * If one is already open, focuses it. Otherwise launches a new one.
 * Returns true if a new dashboard was created, false if an existing one was focused.
 */
export function ensureDashboard(tmuxSession: string, cwd: string): boolean {
  try {
    const windows = execSync(
      `tmux list-windows -t ${shellQuote(tmuxSession)} -F "#{window_name}"`,
      { encoding: 'utf-8' },
    );
    const isOpen = windows.split('\n').some(name => name.trim() === 'sisyphus-dashboard');

    if (isOpen) {
      execSync(
        `tmux select-window -t ${shellQuote(tmuxSession)}:sisyphus-dashboard`,
      );
      return false;
    }
  } catch {
    // tmux error — proceed to launch
  }

  const tuiPath = join(import.meta.dirname, 'tui.js');

  const windowId = execSync(
    `tmux new-window -n "sisyphus-dashboard" -c ${shellQuote(cwd)} -P -F "#{window_id}"`,
    { encoding: 'utf-8' },
  ).trim();

  const cmd = `node ${shellQuote(tuiPath)} --cwd ${shellQuote(cwd)}`;
  execSync(
    `tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`,
  );

  return true;
}

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Launch the TUI dashboard for monitoring and managing sessions')
    .action(async () => {
      assertTmux();
      const tmuxSession = getTmuxSession();
      ensureDashboard(tmuxSession, process.cwd());
    });
}

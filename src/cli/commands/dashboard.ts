import type { Command } from 'commander';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { assertTmux, getTmuxSession } from '../tmux.js';
import { shellQuote } from '../../shared/shell.js';


/**
 * Opens the dashboard in a new tmux window (for background use, e.g. from `start`).
 *
 * Tracks the window by its tmux window ID stored in the @sisyphus_dashboard
 * session option — not by window name, which is fragile (renames, collisions).
 * The "; exit" suffix closes the window when the TUI exits.
 *
 * Returns true if a new dashboard was created, false if an existing one was focused.
 */
export function openDashboardWindow(tmuxSession: string, cwd: string): boolean {
  // Check for existing dashboard by stored window ID
  try {
    const storedId = execSync(
      `tmux show-option -t ${shellQuote(tmuxSession)} -v @sisyphus_dashboard`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    if (storedId) {
      try {
        execSync(
          `tmux display-message -t ${shellQuote(storedId)} -p "#{window_id}"`,
          { stdio: 'pipe' },
        );
        execSync(`tmux select-window -t ${shellQuote(storedId)}`, { stdio: 'pipe' });
        return false;
      } catch {
        // Window is gone — fall through to create a new one
      }
    }
  } catch {
    // Option not set — fall through to create
  }

  const tuiPath = join(import.meta.dirname, 'tui.js');

  const windowId = execSync(
    `tmux new-window -t ${shellQuote(tmuxSession)} -n "sisyphus-dashboard" -c ${shellQuote(cwd)} -P -F "#{window_id}"`,
    { encoding: 'utf-8' },
  ).trim();

  const cmd = `node ${shellQuote(tuiPath)} --cwd ${shellQuote(cwd)}; exit`;
  execSync(
    `tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`,
  );

  execSync(
    `tmux set-option -t ${shellQuote(tmuxSession)} @sisyphus_dashboard ${shellQuote(windowId)}`,
    { stdio: 'pipe' },
  );

  return true;
}

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Launch the TUI dashboard for monitoring and managing sessions')
    .action(async () => {
      assertTmux();
      const tuiPath = join(import.meta.dirname, 'tui.js');
      execSync(`node ${shellQuote(tuiPath)} --cwd ${shellQuote(process.cwd())}`, {
        stdio: 'inherit',
      });
    });
}

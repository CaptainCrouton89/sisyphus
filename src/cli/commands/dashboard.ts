import type { Command } from 'commander';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { assertTmux, getTmuxSession } from '../tmux.js';

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function isDashboardOpen(tmuxSession: string): boolean {
  try {
    const windows = execSync(
      `tmux list-windows -t ${shellQuote(tmuxSession)} -F "#{window_name}"`,
      { encoding: 'utf-8' },
    );
    return windows.split('\n').some(name => name.trim() === 'sisyphus-dashboard');
  } catch {
    return false;
  }
}

export function launchDashboard(tmuxSession: string, cwd: string): void {
  const tuiPath = join(import.meta.dirname, 'tui.js');

  const windowId = execSync(
    `tmux new-window -t ${shellQuote(tmuxSession)} -n "sisyphus-dashboard" -c ${shellQuote(cwd)} -P -F "#{window_id}"`,
    { encoding: 'utf-8' },
  ).trim();

  const cmd = `node ${shellQuote(tuiPath)} --cwd ${shellQuote(cwd)}`;
  execSync(
    `tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`,
  );
}

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Launch the TUI dashboard for monitoring and managing sessions')
    .action(async () => {
      assertTmux();
      const tmuxSession = getTmuxSession();
      const cwd = process.cwd();
      launchDashboard(tmuxSession, cwd);
    });
}

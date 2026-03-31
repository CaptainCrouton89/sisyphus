import { execSync } from 'node:child_process';
import type { Command } from 'commander';

export function registerTmuxStatus(program: Command): void {
  program
    .command('tmux-status')
    .description('Output session status dots for tmux status bar')
    .action(() => {
      try {
        const dots = execSync(
          'tmux show-option -w -v @sisyphus_dots',
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        if (dots) process.stdout.write(dots);
      } catch {
        // Option not set or tmux error — output nothing
      }
    });
}

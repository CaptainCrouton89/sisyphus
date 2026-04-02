import { execSync } from 'node:child_process';
import type { Command } from 'commander';

export function registerTmuxStatus(program: Command): void {
  program
    .command('tmux-status')
    .description('Output session status dots for tmux status bar')
    .action(() => {
      try {
        const status = execSync(
          'tmux show-option -gv @sisyphus_status',
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        if (status) process.stdout.write(status);
      } catch {
        // Option not set or tmux error — output nothing
      }
    });
}

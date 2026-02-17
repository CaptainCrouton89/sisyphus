import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { uninstallDaemon } from '../install.js';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function registerUninstall(program: Command): void {
  program
    .command('uninstall')
    .description('Unload the sisyphus daemon from launchd and remove the plist')
    .option('--purge', 'Also remove all session data in ~/.sisyphus')
    .option('-y, --yes', 'Skip confirmation prompt for --purge')
    .action(async (opts: { purge?: boolean; yes?: boolean }) => {
      const purge = opts.purge ?? false;

      if (purge && !opts.yes) {
        const ok = await confirm('This will delete all session data in ~/.sisyphus. Continue? (y/N) ');
        if (!ok) {
          console.log('Aborted.');
          return;
        }
      }

      await uninstallDaemon(purge);
    });
}

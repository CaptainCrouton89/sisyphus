import type { Command } from 'commander';
import { DEFAULT_CYCLE_KEY, setupTmuxKeybind } from '../tmux-setup.js';

export function registerSetupKeybind(program: Command): void {
  program
    .command('setup-keybind [cycle-key]')
    .description('Install sisyphus tmux keybindings (default: M-s cycle, C-s prefix)')
    .option('-y, --yes', 'Skip confirmation prompt before modifying ~/.tmux.conf')
    .action(async (key: string | undefined, opts: { yes?: boolean }) => {
      const resolvedKey = key ?? DEFAULT_CYCLE_KEY;
      const result = await setupTmuxKeybind(resolvedKey, undefined, { assumeYes: opts.yes });

      switch (result.status) {
        case 'installed':
          console.log(result.message);
          console.log('Note: requires tmux 3.2+ for display-menu keybindings.');
          break;
        case 'already-installed':
          console.log(result.message);
          break;
        case 'conflict':
          console.log(`Key ${resolvedKey} is already bound:`);
          console.log(`  ${result.existingBinding}`);
          console.log('');
          console.log('Use a different key, e.g.:');
          console.log('  sis admin setup-keybind M-S');
          console.log('  sis admin setup-keybind M-w');
          console.log('  sis admin setup-keybind M-j');
          break;
        case 'unsupported-tmux':
          console.log(result.message);
          break;
        case 'conf-modification-declined':
          console.log(result.message);
          console.log('');
          console.log('Re-run with --yes to skip the prompt.');
          break;
      }
    });
}

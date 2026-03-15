import type { Command } from 'commander';
import { DEFAULT_KEY, setupTmuxKeybind } from '../tmux-setup.js';

export function registerSetupKeybind(program: Command): void {
  program
    .command('setup-keybind [key]')
    .description('Install the sisyphus-cycle tmux keybinding (default: M-s)')
    .action(async (key: string | undefined) => {
      const resolvedKey = key ?? DEFAULT_KEY;
      const result = setupTmuxKeybind(resolvedKey);

      switch (result.status) {
        case 'installed':
          console.log(result.message);
          break;
        case 'already-installed':
          console.log(result.message);
          break;
        case 'conflict':
          console.log(`Key ${resolvedKey} is already bound:`);
          console.log(`  ${result.existingBinding}`);
          console.log('');
          console.log('Use a different key, e.g.:');
          console.log('  sisyphus setup-keybind M-S');
          console.log('  sisyphus setup-keybind M-w');
          console.log('  sisyphus setup-keybind M-j');
          break;
      }
    });
}

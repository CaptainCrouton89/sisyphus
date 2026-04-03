import type { Command } from 'commander';
import { DEFAULT_CYCLE_KEY, setupTmuxKeybind } from '../tmux-setup.js';

export function registerSetupKeybind(program: Command): void {
  program
    .command('setup-keybind [cycle-key]')
    .description('Install sisyphus tmux keybindings (default: M-s cycle, C-s prefix)')
    .action(async (key: string | undefined) => {
      const resolvedKey = key ?? DEFAULT_CYCLE_KEY;
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

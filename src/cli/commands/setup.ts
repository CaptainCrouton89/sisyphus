import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import { runOnboarding, type OnboardResult } from '../onboard.js';
import { ensureDaemonInstalled, isInstalled } from '../install.js';
import { setupTmuxKeybind, DEFAULT_KEY, DEFAULT_HOME_KEY } from '../tmux-setup.js';

function getTmuxVersion(): string {
  try {
    return execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return 'installed';
  }
}

function printResults(result: OnboardResult, daemonOk: boolean, keybindMsg: string): void {
  console.log('');
  console.log('Setting up Sisyphus...');
  console.log('');

  // tmux
  if (result.tmuxInstalled) {
    const detail = getTmuxVersion();
    console.log(`  \u2713 tmux: ${detail}${result.tmuxAutoInstalled ? ' (just installed)' : ''}`);
  } else {
    const hint = process.platform === 'darwin'
      ? 'Install Homebrew (https://brew.sh) then: brew install tmux'
      : 'apt install tmux (Debian/Ubuntu) or your package manager';
    console.log(`  \u2717 tmux: Not installed \u2014 ${hint}`);
  }

  // tmux config
  if (result.tmuxDefaultsWritten) {
    console.log('  \u2713 tmux config: Sensible defaults written to ~/.tmux.conf');
  }

  // Terminal
  if (process.platform === 'darwin') {
    if (result.terminal.isIterm) {
      console.log(`  \u2713 Terminal: ${result.terminal.name}`);
    } else {
      const name = result.terminal.name ? result.terminal.name : 'unknown';
      console.log(`  \u26a0 Terminal: ${name} \u2014 iTerm2 recommended (https://iterm2.com)`);
    }
  }

  // iTerm option key
  if (result.itermOptionKey.checked) {
    if (result.itermOptionKey.allCorrect) {
      console.log('  \u2713 Right Option Key: Esc+');
    } else {
      const profiles = result.itermOptionKey.incorrectProfiles.map((p) => `"${p}"`).join(', ');
      console.log(`  \u26a0 Right Option Key: Not set to Esc+ for ${profiles}`);
      console.log('    Fix: iTerm2 \u2192 Settings \u2192 Profiles \u2192 Keys \u2192 Right Option Key \u2192 Esc+');
    }
  }

  // Daemon
  if (daemonOk) {
    console.log('  \u2713 Daemon: Running');
  } else {
    console.log('  \u2717 Daemon: Failed to start');
  }

  // Keybindings
  console.log(`  \u2713 Keybindings: ${keybindMsg}`);

  // /begin command
  if (result.command.installed) {
    console.log(`  \u2713 /begin command: ${result.command.path}${result.command.autoInstalled ? ' (just installed)' : ''}`);
  } else {
    console.log('  \u2717 /begin command: Failed to install');
  }

  // Nvim
  if (result.nvim.installed) {
    const extra = result.nvim.autoInstalled ? ' (just installed)' : '';
    console.log(`  \u2713 Editor: nvim ${result.nvim.version}${extra}`);
    if (result.nvim.lazyVimInstalled) {
      console.log('  \u2713 LazyVim: Starter config installed to ~/.config/nvim/');
    }
  } else {
    console.log('  \u26a0 Editor: nvim not installed');
    if (process.platform === 'darwin') {
      console.log('    Install: brew install neovim');
    }
  }

  console.log('');
  console.log("Run 'sisyphus getting-started' for a usage guide.");
  console.log('');
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('One-time setup: install dependencies, daemon, keybindings, and commands')
    .action(async () => {
      // 1. Onboarding (tmux, terminal, iterm, nvim, plugin)
      const result = runOnboarding();

      // 2. Daemon
      let daemonOk = false;
      try {
        await ensureDaemonInstalled();
        daemonOk = true;
      } catch {
        daemonOk = isInstalled();
      }

      // 3. Keybindings
      const keybindResult = setupTmuxKeybind();
      let keybindMsg: string;
      if (keybindResult.status === 'installed' || keybindResult.status === 'already-installed') {
        keybindMsg = `${DEFAULT_KEY} (cycle), ${DEFAULT_HOME_KEY} (dashboard)`;
      } else {
        keybindMsg = keybindResult.message;
      }

      printResults(result, daemonOk, keybindMsg);
    });
}

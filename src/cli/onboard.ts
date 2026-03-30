import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TerminalInfo {
  name: string;
  isIterm: boolean;
}

export interface ItermOptionKeyResult {
  checked: boolean;
  allCorrect: boolean;
  incorrectProfiles: string[];
}

export interface NvimInfo {
  installed: boolean;
  autoInstalled: boolean;
  version: string;
  lazyVimInstalled: boolean;
}

export interface CommandInfo {
  installed: boolean;
  autoInstalled: boolean;
  path: string;
}

export interface OnboardResult {
  tmuxInstalled: boolean;
  tmuxAutoInstalled: boolean;
  terminal: TerminalInfo;
  itermOptionKey: ItermOptionKeyResult;
  tmuxDefaultsWritten: boolean;
  nvim: NvimInfo;
  command: CommandInfo;
}

export function detectTerminal(): TerminalInfo {
  const termProgram = process.env['TERM_PROGRAM'] || '';
  const isIterm = termProgram === 'iTerm.app' || !!process.env['ITERM_SESSION_ID'];
  return { name: termProgram || 'unknown', isIterm };
}

function isTmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isBrewAvailable(): boolean {
  try {
    execSync('which brew', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function tryAutoInstallTmux(): boolean {
  if (!isBrewAvailable()) return false;
  try {
    console.log('  Installing tmux via Homebrew...');
    execSync('brew install tmux', { stdio: 'inherit' });
    return isTmuxAvailable();
  } catch {
    return false;
  }
}

export function checkItermOptionKey(): ItermOptionKeyResult {
  if (process.platform !== 'darwin') {
    return { checked: false, allCorrect: true, incorrectProfiles: [] };
  }

  const plistPath = join(homedir(), 'Library', 'Preferences', 'com.googlecode.iterm2.plist');
  if (!existsSync(plistPath)) {
    return { checked: false, allCorrect: false, incorrectProfiles: [] };
  }

  try {
    const json = execSync(
      `plutil -extract "New Bookmarks" json -o - "${plistPath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const profiles = JSON.parse(json) as Array<Record<string, unknown>>;
    const currentProfile = process.env['ITERM_PROFILE'];
    const incorrect: string[] = [];
    for (const profile of profiles) {
      const name = (profile['Name'] as string) || 'Unnamed';
      // Only check the current profile (or all if we can't detect which)
      if (currentProfile && name !== currentProfile) continue;
      // 0 = Normal, 1 = Meta, 2 = Esc+
      if (profile['Right Option Key Sends'] !== 2) {
        incorrect.push(name);
      }
    }
    return { checked: true, allCorrect: incorrect.length === 0, incorrectProfiles: incorrect };
  } catch {
    return { checked: false, allCorrect: false, incorrectProfiles: [] };
  }
}

function hasExistingTmuxConf(): boolean {
  return (
    existsSync(join(homedir(), '.tmux.conf')) ||
    existsSync(join(homedir(), '.config', 'tmux', 'tmux.conf'))
  );
}

const TMUX_DEFAULTS = `# Sensible tmux defaults (installed by sisyphus)
# Customize freely — sisyphus won't overwrite this file.

# Enable mouse (click panes, scroll, resize)
set -g mouse on

# Scrollback history
set -g history-limit 50000

# 256 color + true color support
set -g default-terminal "tmux-256color"
set -as terminal-overrides ",*:Tc"

# Low escape delay (keeps Option/Meta keybindings responsive)
set -sg escape-time 10

# Window numbering from 1
set -g base-index 1
setw -g pane-base-index 1

# Renumber windows when one closes
set -g renumber-windows on

# Clipboard integration
set -g set-clipboard on

# Focus events (for editors)
set -g focus-events on
`;

function writeTmuxDefaults(): void {
  const confPath = join(homedir(), '.tmux.conf');
  writeFileSync(confPath, TMUX_DEFAULTS, 'utf8');
}

export function isNvimAvailable(): boolean {
  try {
    execSync('which nvim', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getNvimVersion(): string {
  try {
    return execSync('nvim --version', { encoding: 'utf-8', stdio: 'pipe' }).split('\n')[0]?.replace('NVIM ', '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function hasLazyVimConfig(): boolean {
  return existsSync(join(homedir(), '.config', 'nvim', 'lazy-lock.json'));
}

export function tryAutoInstallNvim(): NvimInfo {
  if (isNvimAvailable()) {
    return { installed: true, autoInstalled: false, version: getNvimVersion(), lazyVimInstalled: hasLazyVimConfig() };
  }
  if (!isBrewAvailable()) {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false };
  }
  try {
    console.log('  Installing neovim via Homebrew...');
    execSync('brew install neovim', { stdio: 'inherit' });
  } catch {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false };
  }
  if (!isNvimAvailable()) {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false };
  }
  // Clone LazyVim starter config if no nvim config exists
  const nvimConfigDir = join(homedir(), '.config', 'nvim');
  let lazyVimInstalled = false;
  if (!existsSync(nvimConfigDir)) {
    try {
      console.log('  Cloning LazyVim starter config...');
      execSync(`git clone https://github.com/LazyVim/starter ${nvimConfigDir}`, { stdio: 'inherit' });
      // Remove .git so user owns the config
      const gitDir = join(nvimConfigDir, '.git');
      if (existsSync(gitDir)) {
        execSync(`rm -rf "${gitDir}"`, { stdio: 'pipe' });
      }
      lazyVimInstalled = true;
    } catch {
      // Non-fatal — nvim is installed, just no starter config
    }
  }
  return { installed: true, autoInstalled: true, version: getNvimVersion(), lazyVimInstalled };
}

function beginCommandPath(): string {
  return join(homedir(), '.claude', 'commands', 'sisyphus', 'begin.md');
}

function bundledBeginCommandPath(): string {
  const distDir = dirname(fileURLToPath(import.meta.url));
  return join(distDir, 'templates', 'begin.md');
}

export function isBeginCommandInstalled(): boolean {
  return existsSync(beginCommandPath());
}

export function installBeginCommand(): CommandInfo {
  const dest = beginCommandPath();
  if (existsSync(dest)) {
    return { installed: true, autoInstalled: false, path: dest };
  }
  const src = bundledBeginCommandPath();
  if (!existsSync(src)) {
    return { installed: false, autoInstalled: false, path: dest };
  }
  try {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src, 'utf-8'), 'utf8');
    return { installed: true, autoInstalled: true, path: dest };
  } catch {
    return { installed: false, autoInstalled: false, path: dest };
  }
}

export function runOnboarding(): OnboardResult {
  const terminal = detectTerminal();
  const tmuxAlreadyInstalled = isTmuxAvailable();

  let tmuxInstalled = tmuxAlreadyInstalled;
  let tmuxAutoInstalled = false;
  let tmuxDefaultsWritten = false;

  // Auto-install tmux if missing
  if (!tmuxAlreadyInstalled && process.platform === 'darwin') {
    tmuxAutoInstalled = tryAutoInstallTmux();
    tmuxInstalled = tmuxAutoInstalled;

    // Write sensible defaults only for fresh tmux installs (don't touch existing configs)
    if (tmuxAutoInstalled && !hasExistingTmuxConf()) {
      writeTmuxDefaults();
      tmuxDefaultsWritten = true;
    }
  }

  // Check iTerm2 right option key
  let itermOptionKey: ItermOptionKeyResult = { checked: false, allCorrect: true, incorrectProfiles: [] };
  if (terminal.isIterm) {
    itermOptionKey = checkItermOptionKey();
  }

  // Nvim
  const nvim = tryAutoInstallNvim();

  // /begin command
  const command = installBeginCommand();

  return { tmuxInstalled, tmuxAutoInstalled, terminal, itermOptionKey, tmuxDefaultsWritten, nvim, command };
}

export function formatOnboardingMessages(result: OnboardResult): string[] {
  const lines: string[] = [];

  // Terminal recommendation (macOS only)
  if (process.platform === 'darwin' && !result.terminal.isIterm) {
    lines.push(
      `  Terminal: ${result.terminal.name || 'unknown'}`,
      '  Tip: iTerm2 is recommended for the best experience with sisyphus.',
      '       Download: https://iterm2.com',
      '',
    );
  }

  // tmux status
  if (result.tmuxAutoInstalled) {
    lines.push('  \u2713 tmux installed via Homebrew.');
    if (result.tmuxDefaultsWritten) {
      lines.push('  \u2713 Default tmux config written to ~/.tmux.conf');
    }
    lines.push('');
  } else if (!result.tmuxInstalled) {
    const installHint = process.platform === 'darwin'
      ? '    Install Homebrew (https://brew.sh) then run: brew install tmux'
      : '    Install: apt install tmux (Debian/Ubuntu) or your package manager';
    lines.push(
      '  \u2717 tmux is required but could not be installed automatically.',
      installHint,
      '',
    );
  }

  // iTerm2 right option key
  if (result.itermOptionKey.checked && !result.itermOptionKey.allCorrect) {
    const profiles = result.itermOptionKey.incorrectProfiles;
    lines.push(
      '  \u26a0  Right Option Key is not sending Esc+ in iTerm2:',
      ...profiles.map((p) => `     \u2022 Profile "${p}"`),
      '',
      '  Sisyphus uses Option keybindings (e.g., Option-s to cycle sessions).',
      '  Fix: iTerm2 \u2192 Settings \u2192 Profiles \u2192 Keys \u2192 Right Option Key \u2192 Esc+',
      '',
    );
  }

  return lines;
}

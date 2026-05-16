import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSisyphusPluginInstalled, type SisyphusPluginInfo } from './plugins.js';
import { sisyphusTmuxConfPath } from './tmux-setup.js';
import { hasCommand, isLinuxLike, isWslHost, platformLabel } from '../shared/platform.js';
import { detectClipboard } from '../shared/clipboard.js';
import { ensureRenderer, isRendererReady } from '@crouton-kit/humanloop';

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
  baleiaInstalled: boolean;
}

export interface TermrenderInfo {
  installed: boolean;
  autoInstalled: boolean;
}

export interface PlatformReadiness {
  /** Human-readable platform label e.g. "macOS", "WSL (Ubuntu)", "Linux". */
  label: string;
  /** Clipboard tool selected, or null if none available. */
  clipboardTool: string | null;
  /** Install hint shown when clipboardTool is null. */
  clipboardHint: string | null;
  /** True if `notify-send` is available (libnotify; Linux/WSL only check). */
  notifySendAvailable: boolean;
  /**
   * For WSL only: true if systemd is enabled (`systemctl --version` works as a
   * user service manager). Null on non-WSL.
   */
  wslSystemdEnabled: boolean | null;
}

export interface OnboardResult {
  tmuxInstalled: boolean;
  tmuxAutoInstalled: boolean;
  terminal: TerminalInfo;
  itermOptionKey: ItermOptionKeyResult;
  tmuxDefaultsWritten: boolean;
  nvim: NvimInfo;
  sisyphusPlugin: SisyphusPluginInfo;
  termrender: TermrenderInfo;
  platform: PlatformReadiness;
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

function tmuxInstallHint(): string {
  if (process.platform === 'darwin') {
    return '    Install Homebrew (https://brew.sh) then run: brew install tmux';
  }
  if (isWslHost()) {
    return '    Install: sudo apt install tmux  (or your distro\'s package manager)';
  }
  return '    Install: apt install tmux (Debian/Ubuntu) or your package manager';
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

const SISYPHUS_DEFAULTS_MARKER = '# sisyphus-managed — do not edit';

function buildTmuxDefaults(): string {
  const sisyphusConf = sisyphusTmuxConfPath();
  return `# Sensible tmux defaults (installed by sisyphus)
# Customize freely — sisyphus won't overwrite this file.

# Enable mouse (click panes, scroll, resize)
set -g mouse on

# Scrollback history
set -g history-limit 100000

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

# Don't detach the client when the last session is destroyed
set -g detach-on-destroy off

# Vim-style copy mode
setw -g mode-keys vi
bind -T copy-mode-vi v send-keys -X begin-selection
bind -T copy-mode-vi y send-keys -X copy-selection-and-cancel

# --- Pane navigation (no prefix needed) ---
bind -n C-h select-pane -L
bind -n C-l select-pane -R

# --- Window navigation (no prefix needed) ---
bind -n C-n next-window
bind -n C-p previous-window

# --- Splits / new window / new session in current directory ---
bind '"' split-window -v -c "#{pane_current_path}"
bind % split-window -h -c "#{pane_current_path}" \\; select-layout even-horizontal
bind -n M-= split-window -h -c "#{pane_current_path}" \\; select-layout even-horizontal
bind n new-window -c "#{pane_current_path}"
bind N new-session -c "#{pane_current_path}"

# --- Kill pane + rebalance ---
bind x kill-pane \\; select-layout even-horizontal
bind -n M-- kill-pane \\; select-layout even-horizontal

# --- Auto-rebalance on pane close ---
set-hook -g after-kill-pane "select-layout even-horizontal"
set-hook -g pane-exited "select-layout even-horizontal"

# --- Manual re-tile ---
bind = select-layout even-horizontal

# --- Resize panes (repeatable with prefix) ---
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# --- Reload config (prefix + Ctrl-r) ---
bind C-r source-file ~/.tmux.conf \\; display "Reloaded!"

# --- Half-page scroll (no prefix; -e exits copy mode at bottom) ---
bind -n C-u copy-mode -e \\; send-keys -X halfpage-up
bind -n C-d copy-mode -e \\; send-keys -X halfpage-down

# --- Line scroll (no prefix; -e exits copy mode at bottom) ---
bind -n C-k copy-mode -e \\; send -X scroll-up
bind -n C-j copy-mode -e \\; send -X scroll-down
bind -T copy-mode-vi C-k send -X scroll-up
bind -T copy-mode-vi C-j send -X scroll-down

# --- Status bar (gloam palette) ---
set -g status on
set -g status-style "bg=#1d1e21,fg=#d4cbb8"
set -g status-position bottom
set -g status-left "#{E:@sisyphus_left}"
set -g status-left-length 250
set -g status-right "#{E:@sisyphus_right}#[fg=#2d2f33]#[bg=#2d2f33,fg=#b0a898] %H:%M "
set -g status-right-length 250
set -g status-interval 2

# Hide window list (session name on left + sisyphus pills on right cover it)
set -g window-status-format ""
set -g window-status-current-format ""
set -g window-status-separator ""

# --- Pane borders ---
set -g pane-border-style fg=default
set -g pane-active-border-style fg=green

# Source the sisyphus-managed conf (C-s prefix menu, M-s session cycle)
# -q so missing file is silent if sisyphus hasn't been set up yet
source-file -q ${sisyphusConf} ${SISYPHUS_DEFAULTS_MARKER}
`;
}

function writeTmuxDefaults(): void {
  const confPath = join(homedir(), '.tmux.conf');
  writeFileSync(confPath, buildTmuxDefaults(), 'utf8');
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

function bundledBaleiaPluginPath(): string {
  const distDir = dirname(fileURLToPath(import.meta.url));
  return join(distDir, 'templates', 'baleia.lua');
}

function installBaleiaPlugin(): boolean {
  const pluginsDir = join(homedir(), '.config', 'nvim', 'lua', 'plugins');
  if (!existsSync(pluginsDir)) return false;

  const dest = join(pluginsDir, 'sisyphus-baleia.lua');
  if (existsSync(dest)) return true; // already installed

  const src = bundledBaleiaPluginPath();
  if (!existsSync(src)) return false;

  try {
    writeFileSync(dest, readFileSync(src, 'utf-8'), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function tryAutoInstallNvim(): NvimInfo {
  if (isNvimAvailable()) {
    const baleiaInstalled = installBaleiaPlugin();
    return { installed: true, autoInstalled: false, version: getNvimVersion(), lazyVimInstalled: hasLazyVimConfig(), baleiaInstalled };
  }
  if (!isBrewAvailable()) {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false, baleiaInstalled: false };
  }
  try {
    console.log('  Installing neovim via Homebrew...');
    execSync('brew install neovim', { stdio: 'inherit' });
  } catch {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false, baleiaInstalled: false };
  }
  if (!isNvimAvailable()) {
    return { installed: false, autoInstalled: false, version: '', lazyVimInstalled: false, baleiaInstalled: false };
  }
  // Clone LazyVim starter config if no nvim config exists.
  // Neutralize global LFS filters and hooks — users with stale `git-lfs` config
  // (filter installed, binary missing) or broken `core.hooksPath` would otherwise
  // hit "git-lfs: command not found" or hook errors during clone.
  const nvimConfigDir = join(homedir(), '.config', 'nvim');
  let lazyVimInstalled = false;
  if (!existsSync(nvimConfigDir)) {
    const cloneCmd = [
      'git',
      '-c core.hooksPath=/dev/null',
      '-c filter.lfs.smudge=cat',
      '-c filter.lfs.process=',
      '-c filter.lfs.required=false',
      'clone --depth=1 https://github.com/LazyVim/starter',
      nvimConfigDir,
    ].join(' ');
    try {
      console.log('  Cloning LazyVim starter config...');
      execSync(cloneCmd, {
        stdio: 'inherit',
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
      });
      const gitDir = join(nvimConfigDir, '.git');
      if (existsSync(gitDir)) {
        execSync(`rm -rf "${gitDir}"`, { stdio: 'pipe' });
      }
      lazyVimInstalled = true;
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : String(err);
      console.warn(`  ⚠ LazyVim starter clone failed: ${detail.split('\n')[0]}`);
      console.warn('    nvim is installed; clone manually:');
      console.warn(`      git clone https://github.com/LazyVim/starter ${nvimConfigDir}`);
    }
  }
  const baleiaInstalled = installBaleiaPlugin();
  return { installed: true, autoInstalled: true, version: getNvimVersion(), lazyVimInstalled, baleiaInstalled };
}

/**
 * termrender is a humanloop-managed dependency: humanloop pins it in its own
 * venv (provisioned via `uv`) and is the sole caller — it ignores $PATH, so
 * sisyphus must NOT `pip install termrender` (that copy would never be used).
 * This reports whether humanloop's managed renderer is ready; false ⇒
 * humanloop transparently falls back to plaintext word-wrap.
 */
export function isTermrenderAvailable(): boolean {
  return isRendererReady();
}

function tryAutoInstallTermrender(): TermrenderInfo {
  const before = isRendererReady();
  // Best-effort: trigger humanloop's self-heal now (uv venv + pinned
  // install, ~1-2s cold) so the first TUI render isn't slow. Never throws —
  // if uv is absent humanloop degrades to plaintext on its own.
  try { ensureRenderer(); } catch { /* humanloop handles degradation */ }
  const installed = isRendererReady();
  return { installed, autoInstalled: installed && !before };
}

export function detectPlatformReadiness(): PlatformReadiness {
  const clip = detectClipboard();
  const linuxLike = isLinuxLike();
  const wsl = isWslHost();

  let wslSystemdEnabled: boolean | null = null;
  if (wsl) {
    try {
      // `systemctl is-system-running` returns non-zero outside a systemd boot,
      // but exits 0 (or 'degraded' / 'starting' / 'running') if systemd is PID 1.
      execSync('systemctl is-system-running --quiet 2>/dev/null', { stdio: 'pipe' });
      wslSystemdEnabled = true;
    } catch {
      // Some WSL installs return non-zero from is-system-running while still
      // having systemd active. Cross-check by looking for the user instance.
      try {
        execSync('systemctl --user --version', { stdio: 'pipe' });
        wslSystemdEnabled = true;
      } catch {
        wslSystemdEnabled = false;
      }
    }
  }

  return {
    label: platformLabel(),
    clipboardTool: clip.copy === null ? null : clip.copy.cmd,
    clipboardHint: clip.hint,
    notifySendAvailable: linuxLike ? hasCommand('notify-send') : true,
    wslSystemdEnabled,
  };
}

export function runOnboarding(): OnboardResult {
  const terminal = detectTerminal();
  const tmuxAlreadyInstalled = isTmuxAvailable();

  let tmuxInstalled = tmuxAlreadyInstalled;
  let tmuxAutoInstalled = false;
  let tmuxDefaultsWritten = false;

  // Auto-install tmux if missing (macOS only — Linux/WSL users install via their package manager)
  if (!tmuxAlreadyInstalled && process.platform === 'darwin') {
    tmuxAutoInstalled = tryAutoInstallTmux();
    tmuxInstalled = tmuxAutoInstalled;
  }

  // Write sensible defaults whenever tmux is present and the user has no existing conf.
  // Platform-agnostic so WSL/Linux first-timers get the same ergonomic keybinds as macOS.
  if (tmuxInstalled && !hasExistingTmuxConf()) {
    writeTmuxDefaults();
    tmuxDefaultsWritten = true;
  }

  // Check iTerm2 right option key
  let itermOptionKey: ItermOptionKeyResult = { checked: false, allCorrect: true, incorrectProfiles: [] };
  if (terminal.isIterm) {
    itermOptionKey = checkItermOptionKey();
  }

  // Nvim
  const nvim = tryAutoInstallNvim();

  // User-facing slash commands ship as a Claude Code plugin from the
  // `sisyphus@sisyphus` marketplace. Best-effort: failures warn but don't abort setup.
  const sisyphusPlugin = ensureSisyphusPluginInstalled();

  // termrender (markdown rendering for TUI)
  const termrender = tryAutoInstallTermrender();

  // Cross-platform readiness checks (clipboard, notifications, WSL systemd)
  const platform = detectPlatformReadiness();

  return { tmuxInstalled, tmuxAutoInstalled, terminal, itermOptionKey, tmuxDefaultsWritten, nvim, sisyphusPlugin, termrender, platform };
}

export function formatOnboardingMessages(result: OnboardResult): string[] {
  const lines: string[] = [];

  // Platform banner \u2014 always show so the user knows what flavor we detected.
  lines.push(`  Platform: ${result.platform.label}`, '');

  // Terminal recommendation (macOS only)
  if (process.platform === 'darwin' && !result.terminal.isIterm) {
    const name = result.terminal.name.length > 0 ? result.terminal.name : 'unknown';
    lines.push(
      `  Terminal: ${name}`,
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
    const installHint = tmuxInstallHint();
    lines.push(
      '  \u2717 tmux is required but could not be installed automatically.',
      installHint,
      '',
    );
  }

  // Clipboard backend (Linux/WSL only \u2014 macOS pbcopy is always present)
  if (process.platform !== 'darwin') {
    if (result.platform.clipboardTool === null) {
      const hint = result.platform.clipboardHint === null
        ? 'Install xclip, wl-clipboard, or (on WSL) ensure clip.exe is on PATH.'
        : result.platform.clipboardHint;
      lines.push(
        '  \u2717 Clipboard: no backend detected \u2014 copy menus will fail.',
        `    ${hint}`,
        '',
      );
    } else {
      lines.push(`  \u2713 Clipboard: ${result.platform.clipboardTool}`, '');
    }
  }

  // Desktop notifications (Linux/WSL only \u2014 macOS uses the bundled Swift app)
  if (process.platform !== 'darwin' && !result.platform.notifySendAvailable) {
    lines.push(
      '  \u26a0  Desktop notifications: notify-send not found.',
      '    Install: sudo apt install libnotify-bin (Debian/Ubuntu) or your distro\u2019s equivalent.',
      '    Without it, sisyphus events still appear in the TUI but won\u2019t raise an OS banner.',
      '',
    );
  }

  // WSL-specific: systemd opt-in
  if (result.platform.wslSystemdEnabled === false) {
    lines.push(
      '  \u26a0  WSL systemd is not enabled \u2014 the daemon must be started manually.',
      '    To enable: add the following to /etc/wsl.conf, then `wsl --shutdown` from PowerShell:',
      '      [boot]',
      '      systemd=true',
      '    Once active, you can configure `systemctl --user enable --now sisyphus`.',
      '',
    );
  }

  // termrender (humanloop-managed renderer)
  if (result.termrender.autoInstalled) {
    lines.push('  \u2713 humanloop renderer provisioned (rich markdown for TUI).', '');
  } else if (!result.termrender.installed) {
    lines.push(
      '  \u26a0  rich markdown rendering unavailable (humanloop renderer not provisioned; plaintext fallback in use).',
      '    Install uv so humanloop can self-provision it: curl -LsSf https://astral.sh/uv/install.sh | sh',
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

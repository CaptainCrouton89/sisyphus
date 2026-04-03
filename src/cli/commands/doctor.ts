import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import type { Command } from 'commander';
import { daemonLogPath, daemonPidPath, globalDir, socketPath } from '../../shared/paths.js';
import { isInstalled } from '../install.js';
import { detectTerminal, checkItermOptionKey, isNvimAvailable, isBeginCommandInstalled } from '../onboard.js';
import { cycleScriptPath, DEFAULT_CYCLE_KEY, getExistingBinding, isSisyphusBinding, sisyphusTmuxConfPath } from '../tmux-setup.js';

interface Check {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}

function checkNodeVersion(): Check {
  const major = parseInt(process.versions.node.split('.')[0]!, 10);
  if (major < 22) {
    return { name: 'Node.js', status: 'fail', detail: `v${process.versions.node} (v22+ required)`, fix: 'Install Node.js 22+: https://nodejs.org' };
  }
  return { name: 'Node.js', status: 'ok', detail: `v${process.versions.node}` };
}

function checkClaudeCli(): Check {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return { name: 'Claude CLI', status: 'ok', detail: 'Found on PATH' };
  } catch {
    return {
      name: 'Claude CLI',
      status: 'fail',
      detail: 'Not found on PATH',
      fix: 'Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview',
    };
  }
}

function checkGit(): Check {
  try {
    const version = execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    return { name: 'git', status: 'ok', detail: version };
  } catch {
    return { name: 'git', status: 'fail', detail: 'Not found on PATH', fix: 'Install git: https://git-scm.com/downloads' };
  }
}

function checkTmuxVersion(): Check {
  try {
    const version = execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    // Parse "tmux X.Y" or "tmux next-X.Y"
    const match = version.match(/(\d+\.\d+)/);
    if (!match) return { name: 'tmux version', status: 'warn', detail: `Could not parse version: ${version}` };
    const ver = parseFloat(match[1]);
    if (ver < 3.2) {
      const upgradeHint = process.platform === 'darwin' ? 'brew install tmux (or upgrade)' : 'apt install tmux (Debian/Ubuntu) or your package manager';
      return { name: 'tmux version', status: 'warn', detail: `${version} (3.2+ recommended for popup support)`, fix: upgradeHint };
    }
    return { name: 'tmux version', status: 'ok', detail: version };
  } catch {
    return { name: 'tmux version', status: 'warn', detail: 'Could not determine version' };
  }
}

function checkDaemonInstalled(): Check {
  if (process.platform === 'darwin') {
    if (isInstalled()) {
      return { name: 'Daemon plist', status: 'ok', detail: 'Installed in LaunchAgents' };
    }
    return {
      name: 'Daemon plist',
      status: 'fail',
      detail: 'Not installed',
      fix: 'Run any sisyphus command to auto-install, or: sisyphus start "test"',
    };
  }
  // Linux: check if PID file exists (daemon started manually)
  const pid = daemonPidPath();
  if (existsSync(pid)) {
    return { name: 'Daemon setup', status: 'ok', detail: `PID file found at ${pid}` };
  }
  return {
    name: 'Daemon setup',
    status: 'fail',
    detail: 'Daemon not running (no PID file)',
    fix: 'Start manually: sisyphusd & — or configure via systemd',
  };
}

function checkDaemonRunning(): Check {
  const pid = daemonPidPath();
  if (!existsSync(pid)) {
    const fix = process.platform === 'darwin'
      ? 'launchctl load -w ~/Library/LaunchAgents/com.sisyphus.daemon.plist'
      : 'sisyphusd & — or check if the process is running';
    return {
      name: 'Daemon process',
      status: 'fail',
      detail: 'No PID file found',
      fix,
    };
  }
  try {
    const sock = socketPath();
    execSync(`test -S "${sock}"`, { stdio: 'pipe' });
    return { name: 'Daemon process', status: 'ok', detail: `Socket at ${sock}` };
  } catch {
    return {
      name: 'Daemon process',
      status: 'warn',
      detail: 'PID file exists but socket not found',
      fix: `Check logs: tail -20 ${daemonLogPath()}`,
    };
  }
}

function checkTmux(): Check {
  try {
    execSync('which tmux', { stdio: 'pipe' });
  } catch {
    const installHint = process.platform === 'darwin' ? 'brew install tmux' : 'apt install tmux (Debian/Ubuntu) or your package manager';
    return { name: 'tmux', status: 'fail', detail: 'Not found on PATH', fix: installHint };
  }
  try {
    execSync('tmux list-sessions', { stdio: 'pipe' });
    return { name: 'tmux', status: 'ok', detail: 'Running' };
  } catch {
    return { name: 'tmux', status: 'warn', detail: 'Installed but no server running' };
  }
}

function checkCycleScript(): Check {
  const path = cycleScriptPath();
  if (!existsSync(path)) {
    return {
      name: 'Cycle script',
      status: 'fail',
      detail: `Not found at ${path}`,
      fix: 'sisyphus setup-keybind',
    };
  }
  try {
    const mode = statSync(path).mode;
    if ((mode & 0o111) === 0) {
      return {
        name: 'Cycle script',
        status: 'fail',
        detail: 'Not executable',
        fix: `chmod +x ${path}`,
      };
    }
  } catch { /* ignore stat errors */ }
  return { name: 'Cycle script', status: 'ok', detail: path };
}

function checkTmuxKeybind(): Check {
  const existing = getExistingBinding(DEFAULT_CYCLE_KEY);
  if (existing === null) {
    // Also check if the sisyphus tmux.conf exists (binding might be configured but tmux not running)
    if (existsSync(sisyphusTmuxConfPath())) {
      return {
        name: `Tmux keybind (${DEFAULT_CYCLE_KEY})`,
        status: 'warn',
        detail: 'Configured in sisyphus tmux.conf but not active (tmux may not be running)',
      };
    }
    return {
      name: `Tmux keybind (${DEFAULT_CYCLE_KEY})`,
      status: 'fail',
      detail: 'Not bound',
      fix: 'sisyphus setup-keybind',
    };
  }
  if (isSisyphusBinding(existing)) {
    return { name: `Tmux keybind (${DEFAULT_CYCLE_KEY})`, status: 'ok', detail: 'Bound to sisyphus-cycle' };
  }
  return {
    name: `Tmux keybind (${DEFAULT_CYCLE_KEY})`,
    status: 'warn',
    detail: `Bound to something else: ${existing}`,
    fix: 'sisyphus setup-keybind M-S  (or another free key)',
  };
}

function checkGlobalDir(): Check {
  const dir = globalDir();
  if (existsSync(dir)) {
    return { name: 'Data directory', status: 'ok', detail: dir };
  }
  return { name: 'Data directory', status: 'warn', detail: `${dir} does not exist (created on first use)` };
}

function checkTerminal(): Check {
  if (process.platform !== 'darwin') {
    return { name: 'Terminal', status: 'ok', detail: 'Non-macOS (skipped)' };
  }
  const terminal = detectTerminal();
  if (terminal.isIterm) {
    return { name: 'Terminal', status: 'ok', detail: terminal.name };
  }
  return {
    name: 'Terminal',
    status: 'warn',
    detail: terminal.name ? terminal.name : 'unknown',
    fix: 'iTerm2 recommended for best experience: https://iterm2.com',
  };
}

function checkItermRightOptionKey(): Check | null {
  if (process.platform !== 'darwin') return null;
  const terminal = detectTerminal();
  if (!terminal.isIterm) return null;
  const result = checkItermOptionKey();
  if (!result.checked) return null;
  if (result.allCorrect) {
    return { name: 'Right Option Key', status: 'ok', detail: 'Esc+' };
  }
  const profiles = result.incorrectProfiles.map((p) => `"${p}"`).join(', ');
  return {
    name: 'Right Option Key',
    status: 'warn',
    detail: `Not Esc+ for ${profiles}`,
    fix: 'iTerm2 \u2192 Settings \u2192 Profiles \u2192 Keys \u2192 Right Option Key \u2192 Esc+',
  };
}

function checkBeginCommand(): Check {
  if (isBeginCommandInstalled()) {
    return { name: '/begin command', status: 'ok', detail: 'Installed' };
  }
  return {
    name: '/begin command',
    status: 'warn',
    detail: 'Not installed',
    fix: 'sisyphus setup',
  };
}

function checkNvim(): Check {
  if (!isNvimAvailable()) {
    const fix = process.platform === 'darwin' ? 'brew install neovim' : 'Install neovim from https://neovim.io';
    return { name: 'nvim', status: 'warn', detail: 'Not installed', fix };
  }
  try {
    const version = execSync('nvim --version', { encoding: 'utf-8', stdio: 'pipe' }).split('\n')[0]?.replace('NVIM ', '');
    return { name: 'nvim', status: 'ok', detail: version ?? 'installed' };
  } catch {
    return { name: 'nvim', status: 'ok', detail: 'installed' };
  }
}

const SYMBOLS = { ok: '\u2713', warn: '!', fail: '\u2717' } as const;

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check sisyphus installation health')
    .action(async () => {
      const itermCheck = checkItermRightOptionKey();
      const checks: Check[] = [
        checkNodeVersion(),
        checkClaudeCli(),
        checkGit(),
        checkTmux(),
        checkTmuxVersion(),
        checkTerminal(),
        ...(itermCheck ? [itermCheck] : []),
        checkGlobalDir(),
        checkDaemonInstalled(),
        checkDaemonRunning(),
        checkCycleScript(),
        checkTmuxKeybind(),
        checkBeginCommand(),
        checkNvim(),
      ];

      let hasIssues = false;
      for (const c of checks) {
        const sym = SYMBOLS[c.status];
        console.log(`  ${sym} ${c.name}: ${c.detail}`);
        if (c.status !== 'ok') hasIssues = true;
      }

      // Print fixes
      const fixable = checks.filter((c) => c.fix && c.status !== 'ok');
      if (fixable.length > 0) {
        console.log('\nFixes:');
        for (const c of fixable) {
          console.log(`  ${c.name}: ${c.fix}`);
        }
      }

      if (!hasIssues) {
        console.log('\nAll checks passed.');
      }
    });
}

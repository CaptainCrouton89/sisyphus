import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import type { Command } from 'commander';
import { daemonLogPath, daemonPidPath, globalDir, socketPath } from '../../shared/paths.js';
import { isInstalled } from '../install.js';
import { cycleScriptPath, DEFAULT_KEY, getExistingBinding, isSisyphusBinding, sisyphusTmuxConfPath } from '../tmux-setup.js';

interface Check {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}

function checkDaemonInstalled(): Check {
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

function checkDaemonRunning(): Check {
  const pid = daemonPidPath();
  if (!existsSync(pid)) {
    return {
      name: 'Daemon process',
      status: 'fail',
      detail: 'No PID file found',
      fix: 'launchctl load -w ~/Library/LaunchAgents/com.sisyphus.daemon.plist',
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
    return { name: 'tmux', status: 'fail', detail: 'Not found on PATH', fix: 'brew install tmux' };
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
  const existing = getExistingBinding(DEFAULT_KEY);
  if (existing === null) {
    // Also check if the sisyphus tmux.conf exists (binding might be configured but tmux not running)
    if (existsSync(sisyphusTmuxConfPath())) {
      return {
        name: `Tmux keybind (${DEFAULT_KEY})`,
        status: 'warn',
        detail: 'Configured in sisyphus tmux.conf but not active (tmux may not be running)',
      };
    }
    return {
      name: `Tmux keybind (${DEFAULT_KEY})`,
      status: 'fail',
      detail: 'Not bound',
      fix: 'sisyphus setup-keybind',
    };
  }
  if (isSisyphusBinding(existing)) {
    return { name: `Tmux keybind (${DEFAULT_KEY})`, status: 'ok', detail: 'Bound to sisyphus-cycle' };
  }
  return {
    name: `Tmux keybind (${DEFAULT_KEY})`,
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

const SYMBOLS = { ok: '\u2713', warn: '!', fail: '\u2717' } as const;

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check sisyphus installation health')
    .action(async () => {
      const checks: Check[] = [
        checkGlobalDir(),
        checkDaemonInstalled(),
        checkDaemonRunning(),
        checkTmux(),
        checkCycleScript(),
        checkTmuxKeybind(),
      ];

      let hasIssues = false;
      for (const c of checks) {
        const sym = SYMBOLS[c.status];
        console.log(`  ${sym} ${c.name}: ${c.detail}`);
        if (c.status !== 'ok') hasIssues = true;
      }

      // Print fixes
      const fixable = checks.filter((c) => c.fix);
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

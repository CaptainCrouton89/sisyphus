import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daemonLogPath, daemonUpdatingPath, globalDir, socketPath } from '../shared/paths.js';
import { type SetupResult, removeTmuxKeybind, setupTmuxKeybind } from './tmux-setup.js';

const PLIST_LABEL = 'com.sisyphus.daemon';
const PLIST_FILENAME = `${PLIST_LABEL}.plist`;

function launchAgentDir(): string {
  return join(homedir(), 'Library', 'LaunchAgents');
}

function plistPath(): string {
  return join(launchAgentDir(), PLIST_FILENAME);
}

function daemonBinPath(): string {
  // In bundled output, cli.js and daemon.js are siblings in dist/
  const installDir = dirname(fileURLToPath(import.meta.url));
  return resolve(installDir, 'daemon.js');
}

function generatePlist(nodePath: string, daemonPath: string, logPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${daemonPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
}

export function isInstalled(): boolean {
  return existsSync(plistPath());
}

export async function ensureDaemonInstalled(): Promise<void> {
  if (process.platform !== 'darwin') return;

  if (!isInstalled()) {
    const nodePath = process.execPath;
    const daemonPath = daemonBinPath();
    const logPath = daemonLogPath();

    mkdirSync(globalDir(), { recursive: true });
    mkdirSync(launchAgentDir(), { recursive: true });

    const plist = generatePlist(nodePath, daemonPath, logPath);
    writeFileSync(plistPath(), plist, 'utf8');

    execSync(`launchctl load -w ${plistPath()}`);

    const keybindResult = setupTmuxKeybind();

    printGettingStarted(keybindResult);
  }

  await waitForDaemon();
}

export async function uninstallDaemon(purge: boolean): Promise<void> {
  if (process.platform !== 'darwin') {
    console.log('Auto-install is only supported on macOS.');
    return;
  }

  const plist = plistPath();
  if (existsSync(plist)) {
    try {
      execSync(`launchctl unload -w ${plist}`, { stdio: 'pipe' });
    } catch {
      // already unloaded or not registered — ignore
    }
    unlinkSync(plist);
    console.log('Daemon unloaded and plist removed.');
  } else {
    console.log('Daemon is not installed (plist not found).');
  }

  removeTmuxKeybind();

  if (purge) {
    const dir = globalDir();
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`Removed ${dir}`);
    }
  }
}

function printGettingStarted(keybindResult: SetupResult): void {
  const lines = [
    '',
    'Sisyphus installed — daemon running via launchd.',
    '',
    'Sisyphus is a tmux-integrated orchestration daemon for Claude Code multi-agent workflows.',
    'A background daemon manages sessions where an orchestrator Claude breaks tasks into',
    'subtasks, spawns agent Claude instances in tmux panes, and coordinates their lifecycle.',
    '',
    'Quick start:',
    '  sisyphus start "task description"   Start a session (must be inside tmux)',
    '  sisyphus list                        List sessions',
    '  sisyphus status                      Show current session status',
    '  sisyphus kill <id>                   Kill a session',
    '',
    'Monitoring:',
    '  sisyphus dashboard                   Open TUI dashboard',
    '  tail -f ~/.sisyphus/daemon.log       Watch daemon logs',
    '',
  ];

  if (keybindResult.status === 'installed') {
    lines.push(`Tmux keybind: ${keybindResult.message}`);
  } else if (keybindResult.status === 'conflict') {
    lines.push(`Keybind: ${keybindResult.message}`);
  }

  lines.push(
    '',
    'Troubleshooting:',
    '  sisyphus doctor                      Check installation health',
    '  sisyphus setup-keybind [key]         Configure tmux session-cycling keybind',
    '  sisyphus uninstall [--purge]         Remove daemon and optionally all data',
    '',
  );

  console.log(lines.join('\n'));
}

function testConnection(): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect(socketPath());
    sock.on('connect', () => { sock.destroy(); resolve(); });
    sock.on('error', (err) => { sock.destroy(); reject(err); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDaemon(maxWaitMs = 6000): Promise<void> {
  const start = Date.now();
  let updatingLogged = false;

  while (Date.now() - start < maxWaitMs) {
    // Extend timeout if daemon is updating
    const updatingPath = daemonUpdatingPath();
    if (existsSync(updatingPath)) {
      if (!updatingLogged) {
        try {
          const version = readFileSync(updatingPath, 'utf-8').trim();
          console.log(`Updating sisyphus to ${version}...`);
        } catch {
          console.log('Updating sisyphus...');
        }
        updatingLogged = true;
      }
      maxWaitMs = Math.max(maxWaitMs, 30000);
    }

    if (existsSync(socketPath())) {
      try {
        await testConnection();
        return;
      } catch {
        // not ready yet
      }
    }
    await sleep(300);
  }
  throw new Error(`Daemon did not start within ${maxWaitMs}ms. Check ${daemonLogPath()}`);
}

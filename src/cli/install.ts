import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daemonLogPath, globalDir, socketPath } from '../shared/paths.js';

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

  if (purge) {
    const dir = globalDir();
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`Removed ${dir}`);
    }
  }
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
  while (Date.now() - start < maxWaitMs) {
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

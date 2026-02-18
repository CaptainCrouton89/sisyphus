import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { globalDir, daemonPidPath, statePath } from '../shared/paths.js';
import { loadConfig } from '../shared/config.js';
import { startServer, stopServer, registerSessionCwd, loadSessionRegistry } from './server.js';
import { startMonitor, stopMonitor, setRespawnCallback } from './pane-monitor.js';
import { onAllAgentsDone } from './session-manager.js';
import { resetAgentCounterFromState } from './agent.js';

function ensureDirs(): void {
  mkdirSync(globalDir(), { recursive: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  const pidFile = daemonPidPath();
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    return pid && isProcessAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

function acquirePidLock(): void {
  const pid = readPid();
  if (pid) {
    console.error(`[sisyphus] Daemon already running (pid ${pid}). Use 'sisyphusd restart' or 'sisyphusd stop' first.`);
    process.exit(0);
  }
  writeFileSync(daemonPidPath(), String(process.pid), 'utf-8');
}

function releasePidLock(): void {
  try {
    unlinkSync(daemonPidPath());
  } catch {
    // Already gone
  }
}

function stopDaemon(): boolean {
  const pid = readPid();
  if (!pid) {
    console.log('[sisyphus] Daemon is not running');
    // Clean up stale pid file if it exists
    releasePidLock();
    return false;
  }

  console.log(`[sisyphus] Stopping daemon (pid ${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    console.error(`[sisyphus] Failed to send SIGTERM to pid ${pid}`);
    return false;
  }

  // Wait for process to exit (up to 5s)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      console.log('[sisyphus] Daemon stopped');
      releasePidLock();
      return true;
    }
    // Busy-wait in small increments (synchronous — fine for a CLI command)
    const wait = Date.now() + 100;
    while (Date.now() < wait) { /* spin */ }
  }

  console.error(`[sisyphus] Daemon (pid ${pid}) did not exit within 5s, sending SIGKILL`);
  try {
    process.kill(pid, 'SIGKILL');
  } catch { /* already dead */ }
  releasePidLock();
  return true;
}

function recoverSessions(): void {
  const registry = loadSessionRegistry();
  const entries = Object.entries(registry);

  if (entries.length === 0) {
    console.log('[sisyphus] No sessions to recover');
    return;
  }

  let recovered = 0;
  for (const [sessionId, cwd] of entries) {
    const stateFile = statePath(cwd, sessionId);
    if (!existsSync(stateFile)) {
      continue;
    }

    try {
      const session = JSON.parse(readFileSync(stateFile, 'utf-8')) as { status: string; agents?: { id: string }[] };
      if (session.status === 'active' || session.status === 'paused') {
        registerSessionCwd(sessionId, cwd);
        resetAgentCounterFromState(sessionId, session.agents ?? []);
        recovered++;
      }
    } catch {
      console.error(`[sisyphus] Failed to read session state for ${sessionId}, skipping`);
    }
  }

  console.log(`[sisyphus] Recovered ${recovered} session(s) from registry`);
}

async function startDaemon(): Promise<void> {
  console.log('[sisyphus] Starting daemon...');
  ensureDirs();
  acquirePidLock();

  const config = loadConfig(process.cwd());

  setRespawnCallback(onAllAgentsDone);

  await startServer();
  startMonitor(config.pollIntervalMs);

  recoverSessions();

  const shutdown = async () => {
    console.log('[sisyphus] Shutting down...');
    stopMonitor();
    await stopServer();
    releasePidLock();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const command = process.argv[2];

switch (command) {
  case 'stop':
    stopDaemon();
    break;

  case 'restart': {
    stopDaemon();
    // Small delay to let socket release
    const wait = Date.now() + 500;
    while (Date.now() < wait) { /* spin */ }
    startDaemon().catch((err) => {
      console.error('[sisyphus] Fatal error:', err);
      process.exit(1);
    });
    break;
  }

  case 'start':
  case undefined:
    startDaemon().catch((err) => {
      console.error('[sisyphus] Fatal error:', err);
      process.exit(1);
    });
    break;

  default:
    console.error(`[sisyphus] Unknown command: ${command}`);
    console.error('Usage: sisyphusd [start|stop|restart]');
    process.exit(1);
}

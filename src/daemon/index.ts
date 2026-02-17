import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { globalDir, daemonPidPath, statePath } from '../shared/paths.js';
import { loadConfig } from '../shared/config.js';
import { startServer, stopServer, registerSessionCwd, loadSessionRegistry } from './server.js';
import { startMonitor, stopMonitor, setRespawnCallback } from './pane-monitor.js';
import { onAllAgentsDone } from './session-manager.js';

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

function acquirePidLock(): void {
  const pidFile = daemonPidPath();
  try {
    const existing = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (existing && isProcessAlive(existing)) {
      console.error(`[sisyphus] Daemon already running (pid ${existing}). Kill it first or remove ${pidFile}`);
      process.exit(1);
    }
  } catch {
    // No pidfile or unreadable — proceed
  }
  writeFileSync(pidFile, String(process.pid), 'utf-8');
}

function releasePidLock(): void {
  try {
    unlinkSync(daemonPidPath());
  } catch {
    // Already gone
  }
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
      const session = JSON.parse(readFileSync(stateFile, 'utf-8')) as { status: string };
      if (session.status === 'active' || session.status === 'paused') {
        registerSessionCwd(sessionId, cwd);
        recovered++;
      }
    } catch {
      console.error(`[sisyphus] Failed to read session state for ${sessionId}, skipping`);
    }
  }

  console.log(`[sisyphus] Recovered ${recovered} session(s) from registry`);
}

async function main(): Promise<void> {
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

main().catch((err) => {
  console.error('[sisyphus] Fatal error:', err);
  process.exit(1);
});

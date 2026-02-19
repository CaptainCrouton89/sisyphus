import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { globalDir, daemonPidPath, statePath } from '../shared/paths.js';
import { loadConfig } from '../shared/config.js';
import { startServer, stopServer, registerSessionCwd, registerSessionTmux, loadSessionRegistry } from './server.js';
import { startMonitor, stopMonitor, setRespawnCallback, trackSession, updateTrackedWindow } from './pane-monitor.js';
import { onAllAgentsDone } from './session-manager.js';
import { resetAgentCounterFromState } from './agent.js';
import { setWindowId, setOrchestratorPaneId, getOrchestratorPaneId } from './orchestrator.js';
import { listPanes } from './tmux.js';
import { registerPane } from './pane-registry.js';
import * as stateModule from './state.js';
import type { Session } from '../shared/types.js';
import { checkAndApply } from './updater.js';

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

function isLaunchdManaged(): boolean {
  try {
    execSync('launchctl list com.sisyphus.daemon', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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

async function recoverSessions(): Promise<void> {
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
      const session = JSON.parse(readFileSync(stateFile, 'utf-8')) as Session;
      if (session.status === 'active' || session.status === 'paused') {
        registerSessionCwd(sessionId, cwd);
        resetAgentCounterFromState(sessionId, session.agents ?? []);

        // Reconnect to tmux panes if info was persisted
        if (session.tmuxSessionName && session.tmuxWindowId) {
          const livePanes = listPanes(session.tmuxWindowId);
          if (livePanes.length > 0) {
            registerSessionTmux(sessionId, session.tmuxSessionName, session.tmuxWindowId);
            setWindowId(sessionId, session.tmuxWindowId);
            trackSession(sessionId, cwd, session.tmuxSessionName);
            updateTrackedWindow(sessionId, session.tmuxWindowId);

            // Recover orchestrator pane from last incomplete cycle
            const lastIncompleteCycle = [...session.orchestratorCycles].reverse().find(c => !c.completedAt && c.paneId);
            if (lastIncompleteCycle?.paneId) {
              setOrchestratorPaneId(sessionId, lastIncompleteCycle.paneId);
              const livePaneIds = new Set(livePanes.map(p => p.paneId));
              if (livePaneIds.has(lastIncompleteCycle.paneId)) {
                registerPane(lastIncompleteCycle.paneId, sessionId, 'orchestrator');
              }
            }

            // Register live agent panes
            for (const agent of session.agents) {
              if (agent.status === 'running' && agent.paneId) {
                const livePaneIds = new Set(livePanes.map(p => p.paneId));
                if (livePaneIds.has(agent.paneId)) {
                  registerPane(agent.paneId, sessionId, 'agent', agent.id);
                }
              }
            }

            console.log(`[sisyphus] Reconnected session ${sessionId} to tmux window ${session.tmuxWindowId}`);

            // Detect sessions stuck in "all agents done, no orchestrator" state
            if (session.status === 'active' && session.agents.length > 0) {
              const hasRunningAgents = session.agents.some(a => a.status === 'running');
              if (!hasRunningAgents) {
                const livePaneIds = new Set(livePanes.map(p => p.paneId));
                const orchestratorPaneId = getOrchestratorPaneId(sessionId);
                const orchestratorAlive = orchestratorPaneId && livePaneIds.has(orchestratorPaneId);
                if (!orchestratorAlive) {
                  console.log(`[sisyphus] Detected stuck session ${sessionId} on recovery: triggering orchestrator respawn`);
                  await onAllAgentsDone(sessionId, cwd, session.tmuxWindowId!);
                }
              }
            }
          } else {
            // Window gone — pause the session so user can `sisyphus resume`
            if (session.status === 'active') {
              await stateModule.updateSessionStatus(cwd, sessionId, 'paused');
              console.log(`[sisyphus] Session ${sessionId} paused: tmux window no longer exists`);
            }
          }
        }

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

  const config = loadConfig(process.cwd());
  if (config.autoUpdate !== false) {
    await checkAndApply(); // may exit process if update found
  }

  acquirePidLock();

  setRespawnCallback(onAllAgentsDone);

  await startServer();
  startMonitor(config.pollIntervalMs);

  await recoverSessions();

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

(async () => {
  switch (command) {
    case 'stop':
      stopDaemon();
      break;

    case 'restart': {
      stopDaemon();
      // If launchd is managing the daemon, just exit — it will respawn via KeepAlive
      if (isLaunchdManaged()) {
        // Brief poll so we can report the new PID
        for (let i = 0; i < 6; i++) {
          await sleep(500);
          const respawnedPid = readPid();
          if (respawnedPid) {
            console.log(`[sisyphus] Daemon restarted (pid ${respawnedPid}) by process manager`);
            process.exit(0);
          }
        }
        console.log('[sisyphus] Daemon will be restarted by process manager');
        process.exit(0);
      }
      // No process manager — start in-process
      await startDaemon();
      break;
    }

    case 'start':
    case undefined:
      await startDaemon();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log('Usage: sisyphusd [command]');
      console.log('');
      console.log('Commands:');
      console.log('  start     Start the daemon (default if no command given)');
      console.log('  stop      Stop the running daemon');
      console.log('  restart   Stop and restart the daemon');
      console.log('  help      Show this help message');
      break;

    default:
      console.error(`[sisyphus] Unknown command: ${command}`);
      console.error('Usage: sisyphusd [start|stop|restart|help]');
      process.exit(1);
  }
})().catch((err) => {
  console.error('[sisyphus] Fatal error:', err);
  process.exit(1);
});

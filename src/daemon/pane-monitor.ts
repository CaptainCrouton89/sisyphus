import * as state from './state.js';
import * as tmux from './tmux.js';
import { getOrchestratorPaneId } from './orchestrator.js';
import { handleAgentKilled } from './agent.js';

type RespawnCallback = (sessionId: string, cwd: string, windowId: string) => void;

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let onAllAgentsDone: RespawnCallback | null = null;

export function setRespawnCallback(cb: RespawnCallback): void {
  onAllAgentsDone = cb;
}

export function startMonitor(pollIntervalMs: number = 1000): void {
  if (monitorInterval) return;
  monitorInterval = setInterval(() => {
    pollAllSessions().catch(err => {
      console.error('[sisyphus] Pane monitor error:', err);
    });
  }, pollIntervalMs);
}

export function stopMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

const trackedSessions = new Map<string, { id: string; cwd: string; tmuxSession: string; windowId: string | null }>();

export function trackSession(sessionId: string, cwd: string, tmuxSession: string): void {
  // windowId is registered separately via updateTrackedWindow after spawnOrchestrator sets it
  const existing = trackedSessions.get(sessionId);
  trackedSessions.set(sessionId, { id: sessionId, cwd, tmuxSession, windowId: existing ? existing.windowId : null });
}

export function updateTrackedWindow(sessionId: string, windowId: string): void {
  const entry = trackedSessions.get(sessionId);
  if (!entry) throw new Error(`Cannot update window for untracked session: ${sessionId}`);
  entry.windowId = windowId;
}

export function untrackSession(sessionId: string): void {
  trackedSessions.delete(sessionId);
}

async function pollAllSessions(): Promise<void> {
  for (const { id: sessionId, cwd, windowId } of trackedSessions.values()) {
    if (windowId) {
      await pollSession(sessionId, cwd, windowId);
    }
  }
}

async function pollSession(sessionId: string, cwd: string, windowId: string): Promise<void> {
  let session;
  try {
    session = state.getSession(cwd, sessionId);
  } catch (err) {
    console.error(`[sisyphus] Failed to read state for session ${sessionId}:`, err);
    return;
  }

  if (session.status !== 'active') return;

  const livePanes = tmux.listPanes(windowId);
  if (livePanes.length === 0) return;

  const livePaneIds = new Set(livePanes.map(p => p.paneId));

  for (const agent of session.agents) {
    if (agent.status !== 'running') continue;
    if (!livePaneIds.has(agent.paneId)) {
      const allDone = await handleAgentKilled(cwd, sessionId, agent.id, 'pane closed by user');
      if (allDone && onAllAgentsDone) {
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    }
  }

  // Check orchestrator pane
  const orchPaneId = getOrchestratorPaneId(sessionId);
  if (orchPaneId && !livePaneIds.has(orchPaneId)) {
    // Orchestrator pane disappeared without a yield command
    const runningAgents = session.agents.filter(a => a.status === 'running');
    if (runningAgents.length === 0) {
      // No agents running and orchestrator gone — pause
      await state.updateSessionStatus(cwd, sessionId, 'paused');
      console.log(`[sisyphus] Session ${sessionId} paused: orchestrator pane disappeared`);
    }
  }
}

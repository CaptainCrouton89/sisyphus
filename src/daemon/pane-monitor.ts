import * as state from './state.js';
import * as tmux from './tmux.js';
import { getOrchestratorPaneId, cleanupSessionMaps } from './orchestrator.js';
import { handleAgentKilled } from './agent.js';
import { respawningSessions } from './respawn-guard.js';
import type { Session } from '../shared/types.js';

type RespawnCallback = (sessionId: string, cwd: string, windowId: string) => void;

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let onAllAgentsDone: RespawnCallback | null = null;

// ─── Active time tracking ──────────────────────────────────────────────────────

let lastPollTime = 0;
let storedPollIntervalMs = 5000;

interface ActiveTimerEntry {
  sessionMs: number;
  agentMs: Map<string, number>;
  cycleMs: Map<number, number>;
}
const activeTimers = new Map<string, ActiveTimerEntry>();

export function initTimers(sessionId: string, session: Session): void {
  const entry: ActiveTimerEntry = {
    sessionMs: session.activeMs,
    agentMs: new Map(),
    cycleMs: new Map(),
  };
  for (const agent of session.agents) {
    entry.agentMs.set(agent.id, agent.activeMs);
  }
  for (const cycle of session.orchestratorCycles) {
    entry.cycleMs.set(cycle.cycle, cycle.activeMs);
  }
  activeTimers.set(sessionId, entry);
}

export function getActiveTimers(sessionId: string): ActiveTimerEntry | undefined {
  return activeTimers.get(sessionId);
}

export async function flushTimers(sessionId: string): Promise<void> {
  const entry = activeTimers.get(sessionId);
  if (!entry) return;
  const tracked = trackedSessions.get(sessionId);
  if (!tracked) return;

  // Compute deltas from last persisted values
  let session: Session;
  try {
    session = state.getSession(tracked.cwd, sessionId);
  } catch {
    return;
  }

  const sessionDelta = entry.sessionMs - session.activeMs;
  const agentDeltas = new Map<string, number>();
  for (const [agentId, ms] of entry.agentMs) {
    const agent = session.agents.slice().reverse().find(a => a.id === agentId);
    const persisted = agent?.activeMs ?? 0;
    const delta = ms - persisted;
    if (delta > 0) agentDeltas.set(agentId, delta);
  }
  const cycleDeltas = new Map<number, number>();
  for (const [cycleNum, ms] of entry.cycleMs) {
    const cycle = session.orchestratorCycles.find(c => c.cycle === cycleNum);
    const persisted = cycle?.activeMs ?? 0;
    const delta = ms - persisted;
    if (delta > 0) cycleDeltas.set(cycleNum, delta);
  }

  if (sessionDelta > 0 || agentDeltas.size > 0 || cycleDeltas.size > 0) {
    await state.incrementActiveTime(tracked.cwd, sessionId, Math.max(0, sessionDelta), agentDeltas, cycleDeltas);
  }
}

export function flushAgentTimer(sessionId: string, agentId: string): number {
  const entry = activeTimers.get(sessionId);
  if (!entry) return 0;
  return entry.agentMs.get(agentId) ?? 0;
}

export function flushCycleTimer(sessionId: string, cycleNumber: number): number {
  const entry = activeTimers.get(sessionId);
  if (!entry) return 0;
  return entry.cycleMs.get(cycleNumber) ?? 0;
}

export function getTrackedSessionIds(): string[] {
  return [...trackedSessions.keys()];
}

// ─── Monitor lifecycle ─────────────────────────────────────────────────────────

export function setRespawnCallback(cb: RespawnCallback): void {
  onAllAgentsDone = cb;
}

export function startMonitor(pollIntervalMs: number = 5000): void {
  if (monitorInterval) return;
  storedPollIntervalMs = pollIntervalMs;
  lastPollTime = Date.now();
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
  // Compute sleep-aware increment
  const now = Date.now();
  const elapsed = now - lastPollTime;
  const threshold = storedPollIntervalMs * 3;
  const increment = elapsed > threshold ? storedPollIntervalMs : elapsed;
  lastPollTime = now;

  for (const { id: sessionId, cwd, windowId } of trackedSessions.values()) {
    if (windowId) {
      await pollSession(sessionId, cwd, windowId, increment);
    }
  }
}

async function pollSession(sessionId: string, cwd: string, windowId: string, increment: number): Promise<void> {
  let session;
  try {
    session = state.getSession(cwd, sessionId);
  } catch (err) {
    console.error(`[sisyphus] Failed to read state for session ${sessionId}:`, err);
    return;
  }

  if (session.status === 'completed') {
    const orchPaneId = getOrchestratorPaneId(sessionId);
    if (orchPaneId) {
      const livePanes = tmux.listPanes(windowId);
      const livePaneIds = new Set(livePanes.map(p => p.paneId));
      if (!livePaneIds.has(orchPaneId)) {
        cleanupSessionMaps(sessionId);
        untrackSession(sessionId);
        console.log(`[sisyphus] Session ${sessionId} cleaned up: orchestrator pane closed by user`);
      }
    } else {
      // No orchestrator pane tracked — clean up immediately
      cleanupSessionMaps(sessionId);
      untrackSession(sessionId);
    }
    return;
  }

  if (session.status !== 'active') return;

  const livePanes = tmux.listPanes(windowId);
  if (livePanes.length === 0) {
    // Skip if session is in yield→respawn transition — the window is temporarily
    // empty between killing the orchestrator pane and spawning a new one.
    if (respawningSessions.has(sessionId)) return;

    // Check if the entire tmux session was destroyed
    const tracked = trackedSessions.get(sessionId);
    if (tracked && !tmux.sessionExists(tracked.tmuxSession)) {
      await flushTimers(sessionId);
      await state.updateSessionStatus(cwd, sessionId, 'paused');
      untrackSession(sessionId);
      console.log(`[sisyphus] Session ${sessionId} paused: tmux session destroyed`);
    }
    return;
  }

  const livePaneIds = new Set(livePanes.map(p => p.paneId));

  // ─── Accumulate active time ────────────────────────────────────────────
  let timerEntry = activeTimers.get(sessionId);
  if (!timerEntry) {
    initTimers(sessionId, session);
    timerEntry = activeTimers.get(sessionId)!;
  }

  let anyAlive = false;

  for (const agent of session.agents) {
    if (agent.status === 'running' && livePaneIds.has(agent.paneId)) {
      timerEntry.agentMs.set(agent.id, (timerEntry.agentMs.get(agent.id) ?? 0) + increment);
      anyAlive = true;
    }
  }

  const orchPaneId = getOrchestratorPaneId(sessionId);
  if (orchPaneId && livePaneIds.has(orchPaneId)) {
    const currentCycle = session.orchestratorCycles.length;
    if (currentCycle > 0) {
      timerEntry.cycleMs.set(currentCycle, (timerEntry.cycleMs.get(currentCycle) ?? 0) + increment);
    }
    anyAlive = true;
  }

  if (anyAlive) {
    timerEntry.sessionMs += increment;
  }

  // ─── Pane liveness checks ─────────────────────────────────────────────

  let paneRemoved = false;
  for (const agent of session.agents) {
    if (agent.status !== 'running') continue;
    if (!livePaneIds.has(agent.paneId)) {
      paneRemoved = true;
      const allDone = await handleAgentKilled(cwd, sessionId, agent.id, 'pane closed by user');
      if (allDone && onAllAgentsDone) {
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    }
  }

  if (paneRemoved) tmux.selectLayout(windowId);

  // Check orchestrator pane
  if (orchPaneId && !livePaneIds.has(orchPaneId)) {
    // Orchestrator pane disappeared without a yield command
    const cycleActiveMs = flushCycleTimer(sessionId, session.orchestratorCycles.length);
    await state.completeOrchestratorCycle(cwd, sessionId, undefined, undefined, cycleActiveMs);
    const runningAgents = session.agents.filter(a => a.status === 'running');
    if (runningAgents.length === 0) {
      // No agents running and orchestrator gone — pause
      await flushTimers(sessionId);
      await state.updateSessionStatus(cwd, sessionId, 'paused');
      console.log(`[sisyphus] Session ${sessionId} paused: orchestrator pane disappeared`);
    }
  }

  // Re-read state since handleAgentKilled may have mutated it
  session = state.getSession(cwd, sessionId);
  if (
    session.status === 'active' &&
    session.agents.length > 0 &&
    session.agents.every(a => a.status !== 'running') &&
    (!orchPaneId || !livePaneIds.has(orchPaneId)) &&
    onAllAgentsDone
  ) {
    console.log(`[sisyphus] Detected stuck session ${sessionId}: all agents done, no orchestrator — triggering respawn`);
    onAllAgentsDone(sessionId, cwd, windowId);
  }
}

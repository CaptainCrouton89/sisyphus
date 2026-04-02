import * as state from './state.js';
import * as tmux from './tmux.js';
import { getOrchestratorPaneId, cleanupSessionMaps } from './orchestrator.js';
import { handleAgentKilled } from './agent.js';
import { respawningSessions } from './respawn-guard.js';
import type { Session } from '../shared/types.js';
import { loadCompanion, saveCompanion, computeMood } from './companion.js';
import type { MoodSignals } from '../shared/companion-types.js';

type RespawnCallback = (sessionId: string, cwd: string, windowId: string) => void;
type DotsCallback = () => void;

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let onAllAgentsDone: RespawnCallback | null = null;
let onDotsUpdate: DotsCallback | null = null;

// ─── Active time tracking ──────────────────────────────────────────────────────

let lastPollTime = 0;
let storedPollIntervalMs = 5000;
let idleStartTime = 0;
let lastMoodCompute = 0;

// ─── Temporal decay event tracking ────────────────────────────────────────────

let lastCompletionTime = 0;  // epoch ms
let lastCrashTime = 0;       // epoch ms
let lastLevelUpTime = 0;     // epoch ms
let currentMaxCycleCount = 0;

export function markEventCompletion(): void { lastCompletionTime = Date.now(); }
export function markEventCrash(): void { lastCrashTime = Date.now(); }
export function markEventLevelUp(): void { lastLevelUpTime = Date.now(); }
export function updateCycleCount(count: number): void {
  if (count > currentMaxCycleCount) currentMaxCycleCount = count;
}
export function resetCycleCount(): void { currentMaxCycleCount = 0; }

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

export function setDotsCallback(cb: DotsCallback): void {
  onDotsUpdate = cb;
}

export function getTrackedSessionEntries(): Iterable<{ id: string; cwd: string; tmuxSession: string; windowId: string | null }> {
  return trackedSessions.values();
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

  // Per-poll session cache: populated by pollSession, reused by mood signal loop
  const pollSessionCache = new Map<string, Session>();

  for (const { id: sessionId, cwd, windowId } of trackedSessions.values()) {
    if (windowId) {
      await pollSession(sessionId, cwd, windowId, increment, pollSessionCache);
    }
  }

  // Recompute status dots after polling all sessions
  try { onDotsUpdate?.(); } catch { /* best-effort */ }

  // Companion mood update — errors must never break the monitor loop
  try {
    const nowMs = Date.now();
    const isIdle = trackedSessions.size === 0;

    // Throttle: skip recompute when idle and computed recently (once per minute is enough)
    if (isIdle && nowMs - lastMoodCompute < 60_000) return;

    const companion = loadCompanion();

    // Build MoodSignals from tracked session state (reuse sessions already read by pollSession)
    let recentCrashes = 0;
    let sessionLengthMs = 0;
    let idleDurationMs = 0;
    let activeAgentCount = 0;
    const cutoff = nowMs - 30 * 60 * 1000;

    for (const { id: sessionId, cwd } of trackedSessions.values()) {
      try {
        const s = pollSessionCache.get(sessionId) ?? state.getSession(cwd, sessionId);
        if (s.status === 'active') {
          sessionLengthMs = Math.max(sessionLengthMs, s.activeMs);
          for (const agent of s.agents) {
            if (agent.status === 'crashed' && agent.completedAt && new Date(agent.completedAt).getTime() > cutoff) {
              recentCrashes++;
            }
            if (agent.status === 'running') {
              activeAgentCount++;
            }
          }
        }
      } catch { /* best-effort per-session */ }
    }

    const timerKeys = [...activeTimers.keys()];
    if (timerKeys.length === 0) {
      if (idleStartTime === 0) idleStartTime = nowMs;
      idleDurationMs = nowMs - idleStartTime;
    } else {
      idleStartTime = 0;
    }

    const DECAY_WINDOW = 120_000; // 2 minutes

    const signals: MoodSignals = {
      recentCrashes,
      idleDurationMs,
      sessionLengthMs,
      cleanStreak: companion.consecutiveCleanSessions,
      justCompleted: (nowMs - lastCompletionTime) < DECAY_WINDOW,
      justCrashed: (nowMs - lastCrashTime) < DECAY_WINDOW,
      justLeveledUp: (nowMs - lastLevelUpTime) < DECAY_WINDOW,
      hourOfDay: new Date().getHours(),
      activeAgentCount,
      cycleCount: currentMaxCycleCount,
      sessionsCompletedToday: companion.recentCompletions.filter(t => t.startsWith(new Date().toISOString().slice(0, 10))).length,
    };

    const newMood = computeMood(companion, undefined, signals);
    if (newMood !== companion.mood) {
      companion.mood = newMood;
      companion.moodUpdatedAt = new Date().toISOString();
      // debugMood (updated by computeMood) is saved here; may be slightly stale when mood is unchanged
      saveCompanion(companion);
    }
    lastMoodCompute = nowMs;
  } catch { /* companion poll failures are non-fatal */ }
}

async function pollSession(
  sessionId: string,
  cwd: string,
  windowId: string,
  increment: number,
  sessionCache?: Map<string, Session>,
): Promise<void> {
  let session;
  try {
    session = state.getSession(cwd, sessionId);
    sessionCache?.set(sessionId, session);
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

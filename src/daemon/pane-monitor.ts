import * as state from './state.js';
import * as tmux from './tmux.js';
import { getOrchestratorPaneId, cleanupSessionMaps } from './orchestrator.js';
import { handleAgentKilled } from './agent.js';
import { respawningSessions } from './respawn-guard.js';
import type { Session } from '../shared/types.js';
import { loadCompanion, saveCompanion, recordCommentary, recordFeedback, computeMood } from './companion.js';
import { generateCommentary } from './companion-commentary.js';
import { showCommentaryPopup } from './companion-popup.js';
import type { MoodSignals, FeedbackEntry } from '../shared/companion-types.js';
import { emitHistoryEvent } from './history.js';

function buildFeedbackSignals(history: FeedbackEntry[]): Pick<MoodSignals, 'recentFeedbackGood' | 'recentFeedbackBad' | 'recentFeedbackWhip'> {
  const recent = history.slice(-5);
  return {
    recentFeedbackGood: recent.filter(e => e.rating === 'good').length,
    recentFeedbackBad: recent.filter(e => e.rating === 'bad').length,
    recentFeedbackWhip: recent.filter(e => e.rating === 'whip').length,
  };
}

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
let lastLateNightCommentary = 0;  // epoch ms — throttle late-night commentary to once per 30min

export function markEventCompletion(): void { lastCompletionTime = Date.now(); }
export function markEventCrash(): void { lastCrashTime = Date.now(); }
export function markEventLevelUp(): void { lastLevelUpTime = Date.now(); }

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

export function registerAgentTimer(sessionId: string, agentId: string): void {
  const entry = activeTimers.get(sessionId);
  if (!entry) return;
  if (!entry.agentMs.has(agentId)) {
    entry.agentMs.set(agentId, 0);
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

export function getTrackedSessionEntries(): Iterable<{ id: string; cwd: string; tmuxSessionId: string | undefined; tmuxSessionName: string; windowId: string | null }> {
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

const trackedSessions = new Map<string, { id: string; cwd: string; tmuxSessionId: string | undefined; tmuxSessionName: string; windowId: string | null }>();

export function trackSession(sessionId: string, cwd: string, tmuxSessionId: string | undefined, tmuxSessionName: string): void {
  // windowId is registered separately via updateTrackedWindow after spawnOrchestrator sets it
  const existing = trackedSessions.get(sessionId);
  trackedSessions.set(sessionId, { id: sessionId, cwd, tmuxSessionId, tmuxSessionName, windowId: existing ? existing.windowId : null });

  // Initialize timers immediately so agents that complete before the first poll cycle
  // still accumulate time via flushAgentTimer.
  if (!activeTimers.has(sessionId)) {
    try {
      const session = state.getSession(cwd, sessionId);
      initTimers(sessionId, session);
    } catch { /* state may not exist yet in edge cases — pollSession will init lazily */ }
  }
}

export function updateTrackedWindow(sessionId: string, windowId: string): void {
  const entry = trackedSessions.get(sessionId);
  if (!entry) throw new Error(`Cannot update window for untracked session: ${sessionId}`);
  entry.windowId = windowId;
}

export function untrackSession(sessionId: string): void {
  trackedSessions.delete(sessionId);
}

/**
 * A session is "recently active" if any agent was spawned/completed within the cutoff,
 * OR if its most recent orchestrator cycle started/completed within the cutoff.
 *
 * `agent.status === 'running'` is intentionally NOT used — that flag persists forever
 * after a daemon crash or abandoned session, so it's not a reliable activity signal.
 */
function hasRecentSessionActivity(s: Session, recentCutoffMs: number): boolean {
  for (const agent of s.agents) {
    const spawnedMs = agent.spawnedAt ? new Date(agent.spawnedAt).getTime() : 0;
    const completedMs = agent.completedAt ? new Date(agent.completedAt).getTime() : 0;
    if (spawnedMs > recentCutoffMs || completedMs > recentCutoffMs) return true;
  }
  const cycles = s.orchestratorCycles;
  if (cycles?.length) {
    const last = cycles[cycles.length - 1];
    const startMs = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
    const endMs = last?.completedAt ? new Date(last.completedAt).getTime() : 0;
    if (startMs > recentCutoffMs || endMs > recentCutoffMs) return true;
  }
  return false;
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
    let totalAgentCount = 0;
    let recentAgentCount = 0;
    let maxCycleCount = 0;
    let maxRollbackCount = 0;
    let totalRestartedAgents = 0;
    let totalLostAgents = 0;
    let totalKilledAgents = 0;
    let recentActiveSessionAgents = 0;
    const cutoff = nowMs - 30 * 60 * 1000;
    const recentCutoff = nowMs - 2 * 60 * 60 * 1000; // 2 hours

    // Iterate tracked sessions, but skip zombies entirely. A session is "real" only if
    // status === 'active' AND it has activity (agent spawn/complete or cycle) within 2h.
    // Zombie sessions (active status but no recent activity) shouldn't influence mood
    // signals OR boulder size — their stale state pollutes everything.
    for (const { id: sessionId, cwd } of trackedSessions.values()) {
      try {
        const s = pollSessionCache.get(sessionId) ?? state.getSession(cwd, sessionId);
        if (s.status !== 'active') continue;
        if (!hasRecentSessionActivity(s, recentCutoff)) continue;

        recentActiveSessionAgents += s.agents.length;
        sessionLengthMs = Math.max(sessionLengthMs, s.activeMs);
        totalAgentCount = Math.max(totalAgentCount, s.agents.length);
        maxCycleCount = Math.max(maxCycleCount, s.orchestratorCycles?.length ?? 0);
        maxRollbackCount = Math.max(maxRollbackCount, s.rollbackCount ?? 0);

        for (const agent of s.agents) {
          if (agent.status === 'crashed' && agent.completedAt && new Date(agent.completedAt).getTime() > cutoff) {
            recentCrashes++;
          }
          if (agent.status === 'running') activeAgentCount++;
          if (agent.status === 'lost') totalLostAgents++;
          if (agent.status === 'killed') totalKilledAgents++;
          if ((agent.restartCount ?? 0) > 0) totalRestartedAgents++;

          const spawnedMs = agent.spawnedAt ? new Date(agent.spawnedAt).getTime() : 0;
          const completedMs = agent.completedAt ? new Date(agent.completedAt).getTime() : 0;
          if (spawnedMs > recentCutoff || completedMs > recentCutoff) {
            recentAgentCount++;
          }
        }
      } catch { /* best-effort per-session */ }
    }

    const timerKeys = [...activeTimers.keys()];
    if (timerKeys.length === 0) {
      if (idleStartTime === 0) idleStartTime = nowMs;
      idleDurationMs = nowMs - idleStartTime;
    } else {
      // Transitioning from idle to active — fire idle-wake commentary
      if (idleStartTime > 0) {
        const idledMs = nowMs - idleStartTime;
        if (idledMs > 60_000) { // Only if idle for >1min (avoid spurious wakes)
          generateCommentary('idle-wake', companion, `Idle for ${Math.round(idledMs / 60_000)} minutes`).then(text => {
            if (text) {
              try {
                const c = loadCompanion();
                recordCommentary(c, text, 'idle-wake');
                saveCompanion(c);
              } catch { /* non-fatal */ }
            }
          }).catch(() => {});
        }
      }
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
      totalAgentCount,
      recentAgentCount,
      cycleCount: maxCycleCount,
      sessionsCompletedToday: companion.recentCompletions.filter(t => t.startsWith(new Date().toISOString().slice(0, 10))).length,
      rollbackCount: maxRollbackCount,
      restartedAgentCount: totalRestartedAgents,
      lostAgentCount: totalLostAgents,
      killedAgentCount: totalKilledAgents,
      ...buildFeedbackSignals(companion.feedbackHistory ?? []),
    };

    // Sync agent counts (computed above from tracked sessions — single source of truth)
    const recentAgentsChanged = companion.lastRecentAgentCount !== recentAgentCount;
    if (recentAgentsChanged) companion.lastRecentAgentCount = recentAgentCount;
    const recentActiveChanged = companion.recentActiveAgents !== recentActiveSessionAgents;
    if (recentActiveChanged) companion.recentActiveAgents = recentActiveSessionAgents;

    const newMood = computeMood(companion, undefined, signals);
    const moodChanged = newMood !== companion.mood;
    const companionDirty = recentAgentsChanged || recentActiveChanged;
    if (moodChanged) {
      const oldMood = companion.mood;
      companion.mood = newMood;
      companion.moodUpdatedAt = new Date().toISOString();
      saveCompanion(companion);
      const firstSessionId = trackedSessions.keys().next().value;
      if (firstSessionId) {
        emitHistoryEvent(firstSessionId, 'signals-snapshot', { from: oldMood, to: newMood, signals });
      }
    } else if (companionDirty) {
      saveCompanion(companion);
    }
    // Late-night commentary (2-6am, throttled to once per 30min)
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 6 && !isIdle && (nowMs - lastLateNightCommentary) > 30 * 60 * 1000) {
      lastLateNightCommentary = nowMs;
      const mins = String(new Date().getMinutes()).padStart(2, '0');
      let lateCtx = `${trackedSessions.size} session(s) at ${hour}:${mins}am`;
      for (const { id: sid, cwd: sCwd } of trackedSessions.values()) {
        try {
          const s = pollSessionCache.get(sid) ?? state.getSession(sCwd, sid);
          const taskSnip = s.task.length > 80 ? s.task.slice(0, 80) + '...' : s.task;
          lateCtx += `\n- ${taskSnip}`;
          if (lateCtx.length > 300) break;
        } catch { /* skip */ }
      }
      generateCommentary('late-night', companion, lateCtx).then(text => {
        if (text) {
          try {
            const c = loadCompanion();
            recordCommentary(c, text, 'late-night');
            const feedback = showCommentaryPopup(text);
            if (feedback) {
              recordFeedback(c, text, feedback.rating, 'late-night', feedback.comment);
              const sid = trackedSessions.keys().next().value;
              if (sid) {
                emitHistoryEvent(sid, 'popup-feedback', { commentaryText: text, rating: feedback.rating, comment: feedback.comment, event: 'late-night', mood: c.mood });
              }
            }
            saveCompanion(c);
          } catch { /* non-fatal */ }
        }
      }).catch(() => {});
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
    if (tracked && !tmux.isSessionAlive(tracked.tmuxSessionId, tracked.tmuxSessionName)) {
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

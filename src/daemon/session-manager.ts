import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import * as tmux from './tmux.js';
import { spawnAgent, restartAgent, resetAgentCounterFromState, clearAgentCounter, handleAgentSubmit, handleAgentReport, handleAgentKilled } from './agent.js';
import { trackSession, untrackSession, updateTrackedWindow, flushTimers, flushCycleTimer } from './pane-monitor.js';
import { resetColors } from './colors.js';
import { sessionDir, sessionsDir } from '../shared/paths.js';
import { unregisterSessionPanes, unregisterAgentPane, getSessionPanes } from './pane-registry.js';
import type { Session } from '../shared/types.js';
import { sendTerminalNotification } from './notify.js';
import { generateSessionName } from './summarize.js';
import { registerSessionTmux } from './server.js';
import { respawningSessions } from './respawn-guard.js';

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function switchToHomeSession(session: Session): void {
  if (!session.tmuxSessionName) return;
  const home = tmux.findHomeSession(session.cwd);
  if (home) tmux.switchAttachedClients(session.tmuxSessionName, home);
}

export async function startSession(task: string, cwd: string, context?: string, name?: string): Promise<Session> {
  const sessionId = uuidv4();

  if (name && !NAME_PATTERN.test(name)) {
    throw new Error(`Invalid session name "${name}": only alphanumeric, hyphens, and underscores allowed`);
  }

  const tmuxName = `sisyphus-${name ?? sessionId.slice(0, 8)}`;

  if (tmux.sessionExists(tmuxName)) {
    throw new Error(`Tmux session "${tmuxName}" already exists. Choose a different name.`);
  }

  const session = state.createSession(sessionId, task, cwd, context, name);

  const { windowId, initialPaneId } = tmux.createSession(tmuxName, 'main', cwd);
  tmux.setSessionOption(tmuxName, '@sisyphus_cwd', cwd.replace(/\/+$/, ''));
  await state.updateSessionTmux(cwd, sessionId, tmuxName, windowId);

  trackSession(sessionId, cwd, tmuxName);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
  updateTrackedWindow(sessionId, windowId);

  // Kill the initial pane created by tmux new-session (orchestrator has its own)
  tmux.killPane(initialPaneId);

  pruneOldSessions(cwd);

  // Fire-and-forget: auto-generate a descriptive session name via Haiku
  if (!name) {
    generateSessionName(task).then(async (generatedName) => {
      if (!generatedName) {
        console.log(`[sisyphus] Name generation returned null for session ${sessionId}`);
        return;
      }
      let finalName = generatedName;
      let candidate = `sisyphus-${finalName}`;
      let attempt = 0;
      while (tmux.sessionExists(candidate) && attempt < 5) {
        attempt++;
        finalName = `${generatedName}-${attempt}`;
        candidate = `sisyphus-${finalName}`;
      }
      if (tmux.sessionExists(candidate)) return;

      try {
        tmux.renameSession(tmuxName, candidate);
      } catch { return; }

      await state.updateSessionName(cwd, sessionId, finalName);
      await state.updateSessionTmux(cwd, sessionId, candidate, state.getSession(cwd, sessionId).tmuxWindowId!);
      trackSession(sessionId, cwd, candidate);
      registerSessionTmux(sessionId, candidate, state.getSession(cwd, sessionId).tmuxWindowId!);

      // Update pane labels for all live panes in this session
      const session = state.getSession(cwd, sessionId);
      for (const pane of getSessionPanes(sessionId)) {
        // Update the structured session variable (border format resolves it per-pane)
        tmux.updatePaneMeta(pane.paneId, { session: finalName });
        // Keep underlying pane title in sync for tmux list-panes / debugging
        if (pane.role === 'orchestrator') {
          tmux.setPaneTitle(pane.paneId, `ssph:orch ${finalName} c${session.orchestratorCycles.length}`);
        } else if (pane.role === 'agent' && pane.agentId) {
          const agent = session.agents.find(a => a.id === pane.agentId);
          if (agent) {
            const shortType = agent.agentType && agent.agentType !== 'worker'
              ? agent.agentType.replace(/^sisyphus:/, '')
              : '';
            const paneLabel = shortType ? `${agent.name}-${shortType}` : agent.name;
            tmux.setPaneTitle(pane.paneId, `ssph:${finalName} ${paneLabel} c${session.orchestratorCycles.length}`);
          }
        }
      }
      console.log(`[sisyphus] Session ${sessionId} named: ${finalName}`);
    }).catch((err) => {
      console.error(`[sisyphus] Name generation failed for session ${sessionId}:`, err);
    });
  }

  return { ...state.getSession(cwd, sessionId), tmuxSessionName: tmuxName };
}

const PRUNE_KEEP_COUNT = 10;
const PRUNE_KEEP_DAYS = 7;

function pruneOldSessions(cwd: string): void {
  try {
    const dir = sessionsDir(cwd);
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    const candidates: Array<{ id: string; createdAt: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const session = state.getSession(cwd, entry.name);
        if (session.status === 'active' || session.status === 'paused') continue;
        candidates.push({ id: session.id, createdAt: new Date(session.createdAt).getTime() });
      } catch {
        // Unreadable session dir — skip, don't delete
      }
    }

    if (candidates.length <= PRUNE_KEEP_COUNT) return;

    candidates.sort((a, b) => b.createdAt - a.createdAt);

    const cutoff = Date.now() - PRUNE_KEEP_DAYS * 24 * 60 * 60 * 1000;
    const keep = new Set<string>();

    for (let i = 0; i < Math.min(PRUNE_KEEP_COUNT, candidates.length); i++) {
      keep.add(candidates[i]!.id);
    }
    for (const c of candidates) {
      if (c.createdAt >= cutoff) keep.add(c.id);
    }

    for (const c of candidates) {
      if (keep.has(c.id)) continue;
      rmSync(sessionDir(cwd, c.id), { recursive: true, force: true });
    }
  } catch (err) {
    console.error('[sisyphus] Session pruning failed:', err);
  }
}

export async function reopenWindow(sessionId: string, cwd: string): Promise<{ tmuxSessionName: string; tmuxWindowId: string }> {
  const session = state.getSession(cwd, sessionId);
  const tmuxName = session.tmuxSessionName ?? `sisyphus-${session.name ?? sessionId.slice(0, 8)}`;

  // If window still exists, just return the existing IDs
  if (tmux.sessionExists(tmuxName) && session.tmuxWindowId) {
    return { tmuxSessionName: tmuxName, tmuxWindowId: session.tmuxWindowId };
  }

  // Create fresh tmux session
  const created = tmux.createSession(tmuxName, 'main', cwd);
  tmux.setSessionOption(tmuxName, '@sisyphus_cwd', cwd.replace(/\/+$/, ''));
  await state.updateSessionTmux(cwd, sessionId, tmuxName, created.windowId);

  return { tmuxSessionName: tmuxName, tmuxWindowId: created.windowId };
}

export async function resumeSession(sessionId: string, cwd: string, message?: string): Promise<Session> {
  const session = state.getSession(cwd, sessionId);

  const tmuxName = session.tmuxSessionName ?? `sisyphus-${sessionId.slice(0, 8)}`;

  let windowId: string;
  if (tmux.sessionExists(tmuxName) && session.tmuxWindowId) {
    // Reuse existing tmux session
    windowId = session.tmuxWindowId;
  } else {
    // Create fresh tmux session with the same name
    const created = tmux.createSession(tmuxName, 'main', cwd);
    tmux.setSessionOption(tmuxName, '@sisyphus_cwd', cwd.replace(/\/+$/, ''));
    windowId = created.windowId;
    // Kill the initial pane after orchestrator spawns (below)
    await state.updateSessionTmux(cwd, sessionId, tmuxName, windowId);
    // We'll kill the initial pane after spawning orchestrator
    var initialPaneId = created.initialPaneId;
  }

  if (session.status !== 'active') {
    // Determine which agents still have live panes
    const livePaneIds = new Set<string>();
    if (session.tmuxWindowId) {
      const panes = tmux.listPanes(session.tmuxWindowId);
      for (const pane of panes) {
        livePaneIds.add(pane.paneId);
      }
    }

    // Mark running agents as "lost" only if their pane is gone (or no window ID to check)
    for (const agent of session.agents) {
      if (agent.status === 'running') {
        const isAlive = agent.paneId != null && livePaneIds.has(agent.paneId);
        if (!isAlive) {
          await state.updateAgent(cwd, sessionId, agent.id, {
            status: 'lost',
            completedAt: new Date().toISOString(),
            killedReason: 'session resumed — agent was still running',
          });
        }
      }
    }
  }

  await state.updateSessionStatus(cwd, sessionId, 'active');
  await state.updateSessionTmux(cwd, sessionId, tmuxName, windowId);

  // Reset counters based on existing agents
  resetAgentCounterFromState(sessionId, session.agents);
  resetColors(sessionId);
  orchestratorDone.delete(sessionId);

  trackSession(sessionId, cwd, tmuxName);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId, message);
  updateTrackedWindow(sessionId, windowId);

  // Kill the initial pane if we created a fresh tmux session
  if (initialPaneId) {
    tmux.killPane(initialPaneId);
  }

  return state.getSession(cwd, sessionId);
}

export function getSessionStatus(cwd: string, sessionId: string): Session {
  return state.getSession(cwd, sessionId);
}

export function listSessions(cwd: string): Array<{ id: string; name?: string; task: string; status: string; createdAt: string; agentCount: number; tmuxSessionName?: string; tmuxWindowId?: string }> {
  const dir = sessionsDir(cwd);
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const sessions: Array<{ id: string; name?: string; task: string; status: string; createdAt: string; agentCount: number; tmuxSessionName?: string; tmuxWindowId?: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const session = state.getSession(cwd, entry.name);
      sessions.push({
        id: session.id,
        name: session.name,
        task: session.task,
        status: session.status,
        createdAt: session.createdAt,
        agentCount: session.agents.length,
        tmuxSessionName: session.tmuxSessionName,
        tmuxWindowId: session.tmuxWindowId,
      });
    } catch (err) {
      console.error(`[sisyphus] Failed to read session ${entry.name}:`, err);
    }
  }

  return sessions;
}

const pendingRespawns = new Set<string>();
// Track sessions where the orchestrator has exited (yielded, crashed, etc.)
// Prevents respawning a new orchestrator while the current one is still running
const orchestratorDone = new Set<string>();

export function onAllAgentsDone(sessionId: string, cwd: string, windowId: string): void {
  if (pendingRespawns.has(sessionId)) return;

  // Don't respawn while the orchestrator is still running — wait for yield.
  // Also check persisted state: if the last cycle has completedAt, the orchestrator
  // already yielded (e.g., before a daemon restart wiped in-memory state).
  if (!orchestratorDone.has(sessionId)) {
    const session = state.getSession(cwd, sessionId);
    const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
    if (lastCycle?.completedAt) {
      orchestratorDone.add(sessionId);
    } else {
      console.log(`[sisyphus] All agents done for session ${sessionId}, waiting for orchestrator to yield`);
      return;
    }
  }

  const session = state.getSession(cwd, sessionId);
  if (session.status !== 'active') {
    respawningSessions.delete(sessionId);
    return;
  }

  pendingRespawns.add(sessionId);
  orchestratorDone.delete(sessionId);

  // Snapshot state at cycle boundary before respawning orchestrator
  const cycleNumber = session.orchestratorCycles.length;
  if (cycleNumber > 0) {
    state.createSnapshot(cwd, sessionId, cycleNumber);
  }

  // Respawn on next tick — agents already finished, no delay needed
  setImmediate(async () => {
    pendingRespawns.delete(sessionId);
    try {
      // Re-activate if the pane monitor raced and paused us during a yield await
      const freshSession = state.getSession(cwd, sessionId);
      if (freshSession.status === 'paused' && respawningSessions.has(sessionId)) {
        await state.updateSessionStatus(cwd, sessionId, 'active');
      } else if (freshSession.status !== 'active') {
        respawningSessions.delete(sessionId);
        return;
      }

      // Ensure the tmux session and window still exist.
      // Killing the last pane (orchestrator yield with no agents) destroys the window/session.
      let activeWindowId = windowId;
      const tmuxName = freshSession.tmuxSessionName;
      const needsRecreation = tmuxName && (
        !tmux.sessionExists(tmuxName) ||
        tmux.listPanes(activeWindowId).length === 0
      );
      let initialPaneId: string | undefined;
      if (needsRecreation) {
        // Kill stale session if it exists without our window
        if (tmux.sessionExists(tmuxName!)) {
          tmux.killSession(tmuxName!);
        }
        const created = tmux.createSession(tmuxName!, 'main', cwd);
        tmux.setSessionOption(tmuxName!, '@sisyphus_cwd', cwd.replace(/\/+$/, ''));
        activeWindowId = created.windowId;
        initialPaneId = created.initialPaneId;
        await state.updateSessionTmux(cwd, sessionId, tmuxName!, activeWindowId);
        trackSession(sessionId, cwd, tmuxName!);
        registerSessionTmux(sessionId, tmuxName!, activeWindowId);
      }
      await orchestrator.spawnOrchestrator(sessionId, cwd, activeWindowId);
      updateTrackedWindow(sessionId, activeWindowId);
      if (initialPaneId) tmux.killPane(initialPaneId);

      // Clean up completed agent panes now that the orchestrator is alive
      for (const agent of freshSession.agents) {
        if (agent.status !== 'running' && agent.paneId) {
          tmux.killPane(agent.paneId);
        }
      }
      tmux.selectLayout(activeWindowId);
    } catch (err) {
      console.error(`[sisyphus] Failed to respawn orchestrator for session ${sessionId}:`, err);
    } finally {
      respawningSessions.delete(sessionId);
    }
  });
}

export async function handleSpawn(
  sessionId: string,
  cwd: string,
  agentType: string,
  name: string,
  instruction: string,
  repo?: string,
): Promise<{ agentId: string }> {
  const windowId = orchestrator.getWindowId(sessionId);
  if (!windowId) throw new Error(`No tmux window found for session ${sessionId}`);

  // Re-activate completed sessions so the cycle can resume
  const session = state.getSession(cwd, sessionId);
  if (session.status === 'completed') {
    await state.updateSessionStatus(cwd, sessionId, 'active');
    trackSession(sessionId, cwd, session.tmuxSessionName!);
  }

  const agent = await spawnAgent({
    sessionId,
    sessionName: session.name,
    cycleNum: session.orchestratorCycles.length,
    cwd,
    agentType,
    name,
    instruction,
    windowId,
    repo,
  });

  await state.appendAgentToLastCycle(cwd, sessionId, agent.id);

  return { agentId: agent.id };
}

export async function handleSubmit(cwd: string, sessionId: string, agentId: string, report: string, windowId: string): Promise<void> {
  const allDone = await handleAgentSubmit(cwd, sessionId, agentId, report);
  if (allDone) {
    onAllAgentsDone(sessionId, cwd, windowId);
  }
}

export async function handleReport(cwd: string, sessionId: string, agentId: string, content: string): Promise<void> {
  await handleAgentReport(cwd, sessionId, agentId, content);
}

export async function handleYield(sessionId: string, cwd: string, nextPrompt?: string, mode?: string): Promise<void> {
  // Re-activate paused sessions so respawn can proceed
  const pre = state.getSession(cwd, sessionId);
  if (pre.status === 'paused') {
    await state.updateSessionStatus(cwd, sessionId, 'active');
  }

  // Guard against pane monitor pausing us during the yield→respawn transition.
  // Killing the orchestrator pane may destroy the tmux window (if it's the last pane),
  // and the pane monitor could see 0 live panes and pause the session before we respawn.
  respawningSessions.add(sessionId);

  await orchestrator.handleOrchestratorYield(sessionId, cwd, nextPrompt, mode);

  // Mark orchestrator as done for this cycle — unblocks respawn
  orchestratorDone.add(sessionId);

  const session = state.getSession(cwd, sessionId);
  const hasRunningAgents = session.agents.some(a => a.status === 'running');
  if (!hasRunningAgents) {
    // Fall back to state's tmuxWindowId if in-memory map is missing (e.g., after daemon restart)
    const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
    if (windowId) {
      onAllAgentsDone(sessionId, cwd, windowId);
      // Guard cleared inside onAllAgentsDone's setImmediate callback
    } else {
      respawningSessions.delete(sessionId);
    }
  } else {
    // Agents still running — their panes keep the window alive, no race possible
    respawningSessions.delete(sessionId);
  }
}

export async function handleComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  await flushTimers(sessionId);
  await orchestrator.handleOrchestratorComplete(sessionId, cwd, report);
  switchToHomeSession(session);
}

export async function handleContinue(sessionId: string, cwd: string): Promise<void> {
  await state.continueSession(cwd, sessionId);
}

export async function handleKill(sessionId: string, cwd: string): Promise<number> {
  await flushTimers(sessionId);
  const session = state.getSession(cwd, sessionId);
  const windowId = orchestrator.getWindowId(sessionId);

  // Kill all running agents
  let killedAgents = 0;
  for (const agent of session.agents) {
    if (agent.status === 'running') {
      await state.updateAgent(cwd, sessionId, agent.id, {
        status: 'killed',
        killedReason: 'session killed by user',
        completedAt: new Date().toISOString(),
      });
      killedAgents++;
    }
  }

  // Kill the orchestrator pane if it exists
  const orchPaneId = orchestrator.getOrchestratorPaneId(sessionId);
  if (orchPaneId) {
    tmux.killPane(orchPaneId);
  }

  // Mark session as completed
  await state.updateSessionStatus(cwd, sessionId, 'completed');

  // Untrack from pane monitor and pane registry
  untrackSession(sessionId);
  unregisterSessionPanes(sessionId);

  // Switch any attached clients back to the home session before destroying
  switchToHomeSession(session);

  // Kill the entire tmux session (destroys all panes/windows atomically)
  if (session.tmuxSessionName) {
    tmux.killSession(session.tmuxSessionName);
  } else if (windowId) {
    tmux.killWindow(windowId);
  }

  // Clean up agent counter
  clearAgentCounter(sessionId);
  orchestratorDone.delete(sessionId);

  return killedAgents;
}

export async function handleRestartAgent(sessionId: string, cwd: string, agentId: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
  if (!windowId) throw new Error(`No tmux window found for session ${sessionId}`);

  await restartAgent(sessionId, cwd, agentId, windowId);
}

export async function handleKillAgent(sessionId: string, cwd: string, agentId: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  if (agent.status !== 'running') throw new Error(`Agent ${agentId} is not running (status: ${agent.status})`);

  // Unregister pane first so the pane monitor doesn't trigger a respawn
  unregisterAgentPane(sessionId, agentId);

  // Kill the tmux pane
  if (agent.paneId) {
    tmux.killPane(agent.paneId);
  }

  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'killed',
    killedReason: 'killed by user',
    completedAt: new Date().toISOString(),
  });
}

export async function handleRollback(sessionId: string, cwd: string, toCycle: number): Promise<{ sessionId: string; restoredToCycle: number }> {
  const session = state.getSession(cwd, sessionId);

  // Validate cycle range
  if (toCycle < 1 || toCycle > session.orchestratorCycles.length) {
    const available = state.listSnapshots(cwd, sessionId);
    throw new Error(
      `Invalid cycle ${toCycle}. Available snapshots: ${available.length > 0 ? available.join(', ') : 'none'}`,
    );
  }

  // Validate snapshot exists
  const available = state.listSnapshots(cwd, sessionId);
  if (!available.includes(toCycle)) {
    throw new Error(
      `No snapshot for cycle ${toCycle}. Available snapshots: ${available.length > 0 ? available.join(', ') : 'none'}`,
    );
  }

  // Kill running agents (without completing session or killing window)
  for (const agent of session.agents) {
    if (agent.status === 'running') {
      await state.updateAgent(cwd, sessionId, agent.id, {
        status: 'killed',
        killedReason: 'session rolled back',
        completedAt: new Date().toISOString(),
      });
    }
  }

  // Kill orchestrator pane if running
  const orchPaneId = orchestrator.getOrchestratorPaneId(sessionId);
  if (orchPaneId) {
    tmux.killPane(orchPaneId);
  }

  // Untrack from monitor and registry
  untrackSession(sessionId);
  unregisterSessionPanes(sessionId);
  clearAgentCounter(sessionId);
  orchestratorDone.delete(sessionId);

  // Restore snapshot state
  await state.restoreSnapshot(cwd, sessionId, toCycle);

  // Delete snapshots for cycles after the rollback target
  state.deleteSnapshotsAfter(cwd, sessionId, toCycle);

  return { sessionId, restoredToCycle: toCycle };
}

export async function handlePaneExited(
  paneId: string,
  cwd: string,
  sessionId: string,
  role: 'orchestrator' | 'agent',
  agentId?: string,
): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  if (session.status !== 'active') return;

  if (role === 'agent' && agentId) {
    const agent = session.agents.find(a => a.id === agentId);
    if (!agent || agent.status !== 'running') return;

    // Agent exited without calling `sisyphus submit`
    const label = agent.name ? `${agent.name} (${agentId})` : agentId;
    sendTerminalNotification('Sisyphus', `Agent ${label} exited without submitting a report`);

    const allDone = await handleAgentKilled(cwd, sessionId, agentId, 'pane exited');
    if (allDone) {
      const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
      if (windowId) {
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    }
  } else if (role === 'orchestrator') {
    // Orchestrator pane exited unexpectedly (crash, context exhaustion, /exit)
    const sessionName = session.name ?? sessionId.slice(0, 8);
    sendTerminalNotification('Sisyphus', `Orchestrator exited without yielding (${sessionName})`);

    // Guard against pane monitor pausing us during the await below
    respawningSessions.add(sessionId);

    const cycleActiveMs = flushCycleTimer(sessionId, session.orchestratorCycles.length);
    await state.completeOrchestratorCycle(cwd, sessionId, undefined, undefined, cycleActiveMs);
    orchestratorDone.add(sessionId);
    const hasRunningAgents = session.agents.some(a => a.status === 'running');
    if (!hasRunningAgents && session.agents.length > 0) {
      const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
      if (windowId) {
        console.log(`[sisyphus] Orchestrator pane exited for session ${sessionId}, all agents done — triggering respawn`);
        onAllAgentsDone(sessionId, cwd, windowId);
        // Guard cleared inside onAllAgentsDone's setImmediate callback
      } else {
        respawningSessions.delete(sessionId);
      }
    } else if (!hasRunningAgents) {
      // No agents at all — pause session
      respawningSessions.delete(sessionId);
      await state.updateSessionStatus(cwd, sessionId, 'paused');
      console.log(`[sisyphus] Session ${sessionId} paused: orchestrator pane exited with no agents`);
    } else {
      // Agents still running — their panes keep the window alive
      respawningSessions.delete(sessionId);
    }
  }
}

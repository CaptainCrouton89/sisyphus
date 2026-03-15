import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import * as tmux from './tmux.js';
import { spawnAgent, resetAgentCounterFromState, clearAgentCounter, handleAgentSubmit, handleAgentReport, handleAgentKilled } from './agent.js';
import { trackSession, untrackSession, updateTrackedWindow } from './pane-monitor.js';
import { resetColors } from './colors.js';
import { sessionDir, sessionsDir } from '../shared/paths.js';
import { unregisterSessionPanes, unregisterAgentPane } from './pane-registry.js';
import type { Session } from '../shared/types.js';
import { mergeWorktrees, cleanupWorktree } from './worktree.js';

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

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
  tmux.setSessionOption(tmuxName, '@sisyphus_cwd', cwd);
  await state.updateSessionTmux(cwd, sessionId, tmuxName, windowId);

  trackSession(sessionId, cwd, tmuxName);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
  updateTrackedWindow(sessionId, windowId);

  // Kill the initial pane created by tmux new-session (orchestrator has its own)
  tmux.killPane(initialPaneId);

  pruneOldSessions(cwd);

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
    tmux.setSessionOption(tmuxName, '@sisyphus_cwd', cwd);
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

  // Don't respawn while the orchestrator is still running — wait for yield
  if (!orchestratorDone.has(sessionId)) {
    console.log(`[sisyphus] All agents done for session ${sessionId}, waiting for orchestrator to yield`);
    return;
  }

  const session = state.getSession(cwd, sessionId);
  if (session.status !== 'active') return;

  pendingRespawns.add(sessionId);
  orchestratorDone.delete(sessionId);

  // Merge any worktree agents before respawning orchestrator
  const worktreeAgents = session.agents.filter(a => a.worktreePath && a.mergeStatus === 'pending');
  if (worktreeAgents.length > 0) {
    const results = mergeWorktrees(cwd, worktreeAgents);
    for (const result of results) {
      const mergeStatus = result.status as 'merged' | 'no-changes' | 'conflict';
      state.updateAgent(cwd, sessionId, result.agentId, {
        mergeStatus,
        mergeDetails: result.conflictDetails,
      }).catch((err: unknown) => console.error(`[sisyphus] Failed to update merge status for ${result.agentId}:`, err));
    }
  }

  // Snapshot state at cycle boundary before respawning orchestrator
  const cycleNumber = session.orchestratorCycles.length;
  if (cycleNumber > 0) {
    state.createSnapshot(cwd, sessionId, cycleNumber);
  }

  // Respawn on next tick — agents already finished, no delay needed
  setImmediate(async () => {
    pendingRespawns.delete(sessionId);
    try {
      // Re-check status — pane monitor may have paused us in the meantime
      const freshSession = state.getSession(cwd, sessionId);
      if (freshSession.status !== 'active') return;

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
        tmux.setSessionOption(tmuxName!, '@sisyphus_cwd', cwd);
        activeWindowId = created.windowId;
        initialPaneId = created.initialPaneId;
        await state.updateSessionTmux(cwd, sessionId, tmuxName!, activeWindowId);
        trackSession(sessionId, cwd, tmuxName!);
      }
      await orchestrator.spawnOrchestrator(sessionId, cwd, activeWindowId);
      updateTrackedWindow(sessionId, activeWindowId);
      if (initialPaneId) tmux.killPane(initialPaneId);
    } catch (err) {
      console.error(`[sisyphus] Failed to respawn orchestrator for session ${sessionId}:`, err);
    }
  });
}

export async function handleSpawn(
  sessionId: string,
  cwd: string,
  agentType: string,
  name: string,
  instruction: string,
  worktree?: boolean,
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
    cwd,
    agentType,
    name,
    instruction,
    windowId,
    worktree,
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
    }
  }
}

export async function handleComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  await orchestrator.handleOrchestratorComplete(sessionId, cwd, report);
}

export async function handleContinue(sessionId: string, cwd: string): Promise<void> {
  await state.continueSession(cwd, sessionId);
}

export async function handleRegisterClaudeSession(
  cwd: string,
  sessionId: string,
  agentId: string,
  claudeSessionId: string,
): Promise<void> {
  await state.updateAgent(cwd, sessionId, agentId, { claudeSessionId });
}

export async function handleKill(sessionId: string, cwd: string): Promise<number> {
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

  // Clean up worktrees for agents that had them
  for (const agent of session.agents) {
    if (agent.worktreePath && agent.branchName) {
      cleanupWorktree(cwd, agent.worktreePath, agent.branchName);
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

  // Clean up worktree if applicable
  if (agent.worktreePath && agent.branchName) {
    cleanupWorktree(cwd, agent.worktreePath, agent.branchName);
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

  // Clean up worktrees
  for (const agent of session.agents) {
    if (agent.worktreePath && agent.branchName) {
      cleanupWorktree(cwd, agent.worktreePath, agent.branchName);
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

    const allDone = await handleAgentKilled(cwd, sessionId, agentId, 'pane exited');
    if (allDone) {
      const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
      if (windowId) {
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    }
  } else if (role === 'orchestrator') {
    // Orchestrator pane exited unexpectedly (crash, context exhaustion, /exit)
    orchestratorDone.add(sessionId);
    const hasRunningAgents = session.agents.some(a => a.status === 'running');
    if (!hasRunningAgents && session.agents.length > 0) {
      const windowId = orchestrator.getWindowId(sessionId) ?? session.tmuxWindowId;
      if (windowId) {
        console.log(`[sisyphus] Orchestrator pane exited for session ${sessionId}, all agents done — triggering respawn`);
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    } else if (!hasRunningAgents) {
      // No agents at all — pause session
      await state.updateSessionStatus(cwd, sessionId, 'paused');
      console.log(`[sisyphus] Session ${sessionId} paused: orchestrator pane exited with no agents`);
    }
  }
}

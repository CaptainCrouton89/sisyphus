import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import * as tmux from './tmux.js';
import { spawnAgent, resetAgentCounterFromState, clearAgentCounter, handleAgentSubmit, handleAgentReport, handleAgentKilled } from './agent.js';
import { trackSession, untrackSession, updateTrackedWindow } from './pane-monitor.js';
import { resetColors } from './colors.js';
import { sessionDir, sessionsDir } from '../shared/paths.js';
import { unregisterSessionPanes } from './pane-registry.js';
import type { Session } from '../shared/types.js';
import { mergeWorktrees, cleanupWorktree } from './worktree.js';

export async function startSession(task: string, cwd: string, tmuxSession: string, windowId: string): Promise<Session> {
  const sessionId = uuidv4();
  const session = state.createSession(sessionId, task, cwd);
  await state.updateSessionTmux(cwd, sessionId, tmuxSession, windowId);

  trackSession(sessionId, cwd, tmuxSession);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
  updateTrackedWindow(sessionId, windowId);

  pruneOldSessions(cwd);

  return session;
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

export async function resumeSession(sessionId: string, cwd: string, tmuxSession: string, windowId: string, message?: string): Promise<Session> {
  const session = state.getSession(cwd, sessionId);

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
  await state.updateSessionTmux(cwd, sessionId, tmuxSession, windowId);

  // Reset counters based on existing agents
  resetAgentCounterFromState(sessionId, session.agents);
  resetColors(sessionId);

  trackSession(sessionId, cwd, tmuxSession);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId, message);
  updateTrackedWindow(sessionId, windowId);

  return state.getSession(cwd, sessionId);
}

export function getSessionStatus(cwd: string, sessionId: string): Session {
  return state.getSession(cwd, sessionId);
}

export function listSessions(cwd: string): Array<{ id: string; task: string; status: string; createdAt: string; agentCount: number }> {
  const dir = sessionsDir(cwd);
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir, { withFileTypes: true });
  const sessions: Array<{ id: string; task: string; status: string; createdAt: string; agentCount: number }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const session = state.getSession(cwd, entry.name);
      sessions.push({
        id: session.id,
        task: session.task,
        status: session.status,
        createdAt: session.createdAt,
        agentCount: session.agents.length,
      });
    } catch (err) {
      console.error(`[sisyphus] Failed to read session ${entry.name}:`, err);
    }
  }

  return sessions;
}

const pendingRespawns = new Set<string>();

export function onAllAgentsDone(sessionId: string, cwd: string, windowId: string): void {
  if (pendingRespawns.has(sessionId)) return;

  const session = state.getSession(cwd, sessionId);
  if (session.status !== 'active') return;

  pendingRespawns.add(sessionId);

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

  // Respawn on next tick — agents already finished, no delay needed
  setImmediate(() => {
    pendingRespawns.delete(sessionId);
    orchestrator.spawnOrchestrator(sessionId, cwd, windowId)
      .then(() => updateTrackedWindow(sessionId, windowId))
      .catch((err: unknown) => console.error(`[sisyphus] Failed to respawn orchestrator for session ${sessionId}:`, err));
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

export async function handleYield(sessionId: string, cwd: string, nextPrompt?: string): Promise<void> {
  // Re-activate paused sessions so respawn can proceed
  const pre = state.getSession(cwd, sessionId);
  if (pre.status === 'paused') {
    await state.updateSessionStatus(cwd, sessionId, 'active');
  }

  await orchestrator.handleOrchestratorYield(sessionId, cwd, nextPrompt);

  const session = state.getSession(cwd, sessionId);
  const hasRunningAgents = session.agents.some(a => a.status === 'running');
  if (!hasRunningAgents) {
    const windowId = orchestrator.getWindowId(sessionId);
    if (windowId) {
      onAllAgentsDone(sessionId, cwd, windowId);
    }
  }
}

export async function handleComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  await orchestrator.handleOrchestratorComplete(sessionId, cwd, report);
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

  // Kill the entire tmux window
  if (windowId) {
    tmux.killWindow(windowId);
  }

  // Clean up agent counter
  clearAgentCounter(sessionId);

  return killedAgents;
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
      const windowId = orchestrator.getWindowId(sessionId);
      if (windowId) {
        onAllAgentsDone(sessionId, cwd, windowId);
      }
    }
  } else if (role === 'orchestrator') {
    // Orchestrator pane exited unexpectedly (crash, context exhaustion, /exit)
    const hasRunningAgents = session.agents.some(a => a.status === 'running');
    if (!hasRunningAgents && session.agents.length > 0) {
      const windowId = orchestrator.getWindowId(sessionId);
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

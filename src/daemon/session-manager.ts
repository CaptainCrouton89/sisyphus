import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync } from 'node:fs';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import * as tmux from './tmux.js';
import { spawnAgent, resetAgentCounter, clearAgentCounter } from './agent.js';
import { handleAgentSubmit } from './agent.js';
import { trackSession, untrackSession, updateTrackedWindow } from './pane-monitor.js';
import { resetColors } from './colors.js';
import { sessionsDir } from '../shared/paths.js';
import type { Session, TaskStatus } from '../shared/types.js';

export async function startSession(task: string, cwd: string, tmuxSession: string, windowId: string): Promise<Session> {
  const sessionId = uuidv4();
  const session = state.createSession(sessionId, task, cwd);

  trackSession(sessionId, cwd, tmuxSession);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
  updateTrackedWindow(sessionId, windowId);

  return session;
}

export async function resumeSession(sessionId: string, cwd: string, tmuxSession: string, windowId: string): Promise<Session> {
  const session = state.getSession(cwd, sessionId);

  // Mark any "running" agents as "lost"
  for (const agent of session.agents) {
    if (agent.status === 'running') {
      await state.updateAgent(cwd, sessionId, agent.id, {
        status: 'lost',
        completedAt: new Date().toISOString(),
        killedReason: 'session resumed — agent was still running',
      });
    }
  }

  await state.updateSessionStatus(cwd, sessionId, 'active');

  // Reset counters based on existing agents
  resetAgentCounter(sessionId, session.agents.length);
  resetColors(sessionId);

  trackSession(sessionId, cwd, tmuxSession);
  await orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
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

export function onAllAgentsDone(sessionId: string, cwd: string, windowId: string): void {
  const session = state.getSession(cwd, sessionId);
  if (session.status !== 'active') return;

  // Delay to let /exit finish quitting the previous Claude session
  setTimeout(() => {
    orchestrator.spawnOrchestrator(sessionId, cwd, windowId)
      .then(() => updateTrackedWindow(sessionId, windowId))
      .catch((err: unknown) => console.error(`[sisyphus] Failed to respawn orchestrator for session ${sessionId}:`, err));
  }, 2000);
}

export async function handleSpawn(
  sessionId: string,
  cwd: string,
  agentType: string,
  name: string,
  instruction: string,
): Promise<{ agentId: string }> {
  const windowId = orchestrator.getWindowId(sessionId);
  if (!windowId) throw new Error(`No tmux window found for session ${sessionId}`);

  const agent = await spawnAgent({
    sessionId,
    cwd,
    agentType,
    name,
    instruction,
    windowId,
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

export async function handleYield(sessionId: string, cwd: string): Promise<void> {
  await orchestrator.handleOrchestratorYield(sessionId, cwd);
}

export async function handleComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  untrackSession(sessionId);
  await orchestrator.handleOrchestratorComplete(sessionId, cwd, report);
}

export async function handleTaskAdd(cwd: string, sessionId: string, description: string, initialStatus?: string): Promise<{ taskId: string }> {
  const VALID_STATUSES: Set<string> = new Set(['draft', 'pending', 'in_progress', 'done']);
  const status = initialStatus !== undefined && VALID_STATUSES.has(initialStatus) ? initialStatus as TaskStatus : undefined;
  const task = await state.addTask(cwd, sessionId, description, status);
  return { taskId: task.id };
}

export async function handleTaskUpdate(cwd: string, sessionId: string, taskId: string, status?: string, description?: string): Promise<void> {
  const VALID_STATUSES: Set<string> = new Set(['draft', 'pending', 'in_progress', 'done']);
  const updates: { status?: TaskStatus; description?: string } = {};
  if (status !== undefined) {
    if (!VALID_STATUSES.has(status)) throw new Error(`Invalid status: ${status}. Valid: draft, pending, in_progress, done`);
    updates.status = status as TaskStatus;
  }
  if (description !== undefined) updates.description = description;
  await state.updateTask(cwd, sessionId, taskId, updates);
}

export function handleTasksList(cwd: string, sessionId: string): { tasks: Session['tasks'] } {
  const session = state.getSession(cwd, sessionId);
  return { tasks: session.tasks };
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

  // Kill the orchestrator pane if it exists
  const orchPaneId = orchestrator.getOrchestratorPaneId(sessionId);
  if (orchPaneId) {
    tmux.killPane(orchPaneId);
  }

  // Mark session as completed
  await state.updateSessionStatus(cwd, sessionId, 'completed');

  // Untrack from pane monitor
  untrackSession(sessionId);

  // Kill the entire tmux window
  if (windowId) {
    tmux.killWindow(windowId);
  }

  // Clean up agent counter
  clearAgentCounter(sessionId);

  return killedAgents;
}

import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync } from 'node:fs';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import { spawnAgent, resetAgentCounter } from './agent.js';
import { handleAgentSubmit } from './agent.js';
import { trackSession, untrackSession, updateTrackedWindow } from './pane-monitor.js';
import { resetColors } from './colors.js';
import { sessionsDir } from '../shared/paths.js';
import type { Session, TaskStatus } from '../shared/types.js';

export function startSession(task: string, cwd: string, tmuxSession: string, windowId: string): Session {
  const sessionId = uuidv4();
  const session = state.createSession(sessionId, task, cwd);

  trackSession(sessionId, cwd, tmuxSession);
  orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
  updateTrackedWindow(sessionId, windowId);

  return session;
}

export function resumeSession(sessionId: string, cwd: string, tmuxSession: string, windowId: string): Session {
  const session = state.getSession(cwd, sessionId);

  // Mark any "running" agents as "lost"
  for (const agent of session.agents) {
    if (agent.status === 'running') {
      state.updateAgent(cwd, sessionId, agent.id, {
        status: 'lost',
        completedAt: new Date().toISOString(),
        killedReason: 'session resumed — agent was still running',
      });
    }
  }

  state.updateSessionStatus(cwd, sessionId, 'active');

  // Reset counters based on existing agents
  resetAgentCounter(session.agents.length);
  resetColors(sessionId);

  trackSession(sessionId, cwd, tmuxSession);
  orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
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
    orchestrator.spawnOrchestrator(sessionId, cwd, windowId);
    updateTrackedWindow(sessionId, windowId);
  }, 2000);
}

export function handleSpawn(
  sessionId: string,
  cwd: string,
  agentType: string,
  name: string,
  instruction: string,
): { agentId: string } {
  const windowId = orchestrator.getWindowId(sessionId);
  if (!windowId) throw new Error(`No tmux window found for session ${sessionId}`);

  const agent = spawnAgent({
    sessionId,
    cwd,
    agentType,
    name,
    instruction,
    windowId,
  });

  state.appendAgentToLastCycle(cwd, sessionId, agent.id);

  return { agentId: agent.id };
}

export function handleSubmit(cwd: string, sessionId: string, agentId: string, report: string, windowId: string): void {
  const allDone = handleAgentSubmit(cwd, sessionId, agentId, report);
  if (allDone) {
    onAllAgentsDone(sessionId, cwd, windowId);
  }
}

export function handleYield(sessionId: string, cwd: string): void {
  orchestrator.handleOrchestratorYield(sessionId, cwd);
}

export function handleComplete(sessionId: string, cwd: string, report: string): void {
  untrackSession(sessionId);
  orchestrator.handleOrchestratorComplete(sessionId, cwd, report);
}

export function handleTaskAdd(cwd: string, sessionId: string, description: string): { taskId: string } {
  const task = state.addTask(cwd, sessionId, description);
  return { taskId: task.id };
}

export function handleTaskUpdate(cwd: string, sessionId: string, taskId: string, status: string): void {
  state.updateTask(cwd, sessionId, taskId, status as TaskStatus);
}

export function handleTasksList(cwd: string, sessionId: string): { tasks: Session['tasks'] } {
  const session = state.getSession(cwd, sessionId);
  return { tasks: session.tasks };
}

export function handleRegisterClaudeSession(
  cwd: string,
  sessionId: string,
  agentId: string,
  claudeSessionId: string,
): void {
  state.updateAgent(cwd, sessionId, agentId, { claudeSessionId });
}

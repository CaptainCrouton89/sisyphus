import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Agent, Task, OrchestratorCycle, SessionStatus, TaskStatus } from '../shared/types.js';
import { statePath, sessionDir } from '../shared/paths.js';

function atomicWrite(filePath: string, data: string): void {
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.state.${randomUUID()}.tmp`);
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath);
}

export function createSession(id: string, task: string, cwd: string): Session {
  const dir = sessionDir(cwd, id);
  mkdirSync(dir, { recursive: true });

  const session: Session = {
    id,
    task,
    cwd,
    status: 'active',
    createdAt: new Date().toISOString(),
    tasks: [],
    agents: [],
    orchestratorCycles: [],
  };

  atomicWrite(statePath(cwd, id), JSON.stringify(session, null, 2));
  return session;
}

export function getSession(cwd: string, sessionId: string): Session {
  const content = readFileSync(statePath(cwd, sessionId), 'utf-8');
  return JSON.parse(content) as Session;
}

function saveSession(session: Session): void {
  atomicWrite(statePath(session.cwd, session.id), JSON.stringify(session, null, 2));
}

export function addTask(cwd: string, sessionId: string, description: string, initialStatus?: TaskStatus): Task {
  const session = getSession(cwd, sessionId);
  const nextNum = session.tasks.length + 1;
  const task: Task = {
    id: `t${nextNum}`,
    description,
    status: initialStatus !== undefined ? initialStatus : 'pending',
  };
  session.tasks.push(task);
  saveSession(session);
  return task;
}

export function updateTask(cwd: string, sessionId: string, taskId: string, updates: { status?: TaskStatus; description?: string }): void {
  const session = getSession(cwd, sessionId);
  const task = session.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found in session ${sessionId}`);
  if (updates.status) task.status = updates.status;
  if (updates.description) task.description = updates.description;
  saveSession(session);
}

export function addAgent(cwd: string, sessionId: string, agent: Agent): void {
  const session = getSession(cwd, sessionId);
  session.agents.push(agent);
  saveSession(session);
}

export function updateAgent(cwd: string, sessionId: string, agentId: string, updates: Partial<Agent>): void {
  const session = getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
  Object.assign(agent, updates);
  saveSession(session);
}

export function addOrchestratorCycle(cwd: string, sessionId: string, cycle: OrchestratorCycle): void {
  const session = getSession(cwd, sessionId);
  session.orchestratorCycles.push(cycle);
  saveSession(session);
}

export function updateSessionStatus(cwd: string, sessionId: string, status: SessionStatus, completionReport?: string): void {
  const session = getSession(cwd, sessionId);
  session.status = status;
  if (completionReport !== undefined) {
    session.completionReport = completionReport;
  }
  saveSession(session);
}

export function appendAgentToLastCycle(cwd: string, sessionId: string, agentId: string): void {
  const session = getSession(cwd, sessionId);
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return;
  cycles[cycles.length - 1]!.agentsSpawned.push(agentId);
  saveSession(session);
}

export function completeSession(cwd: string, sessionId: string, report: string): void {
  const session = getSession(cwd, sessionId);
  session.status = 'completed';
  session.completedAt = new Date().toISOString();
  session.completionReport = report;
  saveSession(session);
}

export function completeOrchestratorCycle(cwd: string, sessionId: string): void {
  const session = getSession(cwd, sessionId);
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return;
  cycles[cycles.length - 1]!.completedAt = new Date().toISOString();
  saveSession(session);
}

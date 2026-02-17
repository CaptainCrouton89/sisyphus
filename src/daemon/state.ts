import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Agent, Task, OrchestratorCycle, SessionStatus, TaskStatus } from '../shared/types.js';
import { statePath, sessionDir } from '../shared/paths.js';

// Per-session mutex to prevent read-modify-write races
const sessionLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(sessionId: string, fn: () => T): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>(r => { resolve = r; });
  sessionLocks.set(sessionId, next);
  await prev;
  try {
    return fn();
  } finally {
    resolve!();
  }
}

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

export async function addTask(cwd: string, sessionId: string, description: string, initialStatus?: TaskStatus): Promise<Task> {
  return withSessionLock(sessionId, () => {
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
  });
}

export async function updateTask(cwd: string, sessionId: string, taskId: string, updates: { status?: TaskStatus; description?: string }): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const task = session.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in session ${sessionId}`);
    if (updates.status) task.status = updates.status;
    if (updates.description) task.description = updates.description;
    saveSession(session);
  });
}

export async function addAgent(cwd: string, sessionId: string, agent: Agent): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.agents.push(agent);
    saveSession(session);
  });
}

export async function updateAgent(cwd: string, sessionId: string, agentId: string, updates: Partial<Agent>): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
    Object.assign(agent, updates);
    saveSession(session);
  });
}

export async function addOrchestratorCycle(cwd: string, sessionId: string, cycle: OrchestratorCycle): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.orchestratorCycles.push(cycle);
    saveSession(session);
  });
}

export async function updateSessionStatus(cwd: string, sessionId: string, status: SessionStatus, completionReport?: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.status = status;
    if (completionReport !== undefined) {
      session.completionReport = completionReport;
    }
    saveSession(session);
  });
}

export async function appendAgentToLastCycle(cwd: string, sessionId: string, agentId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const cycles = session.orchestratorCycles;
    if (cycles.length === 0) return;
    cycles[cycles.length - 1]!.agentsSpawned.push(agentId);
    saveSession(session);
  });
}

export async function completeSession(cwd: string, sessionId: string, report: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    session.completionReport = report;
    saveSession(session);
  });
}

export async function completeOrchestratorCycle(cwd: string, sessionId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const cycles = session.orchestratorCycles;
    if (cycles.length === 0) return;
    cycles[cycles.length - 1]!.completedAt = new Date().toISOString();
    saveSession(session);
  });
}

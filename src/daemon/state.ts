import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Agent, AgentReport, Task, OrchestratorCycle, SessionStatus, TaskStatus } from '../shared/types.js';
import { statePath, sessionDir, contextDir, planPath, logsPath } from '../shared/paths.js';

const PLAN_SEED = `<!-- plan.md — What still needs to happen -->
<!-- This is a living document. Write your remaining work plan here: phases, -->
<!-- next steps, file references, open questions. Remove or collapse items as -->
<!-- they're completed so this file only reflects outstanding work. The -->
<!-- orchestrator sees this every cycle — keep it focused and current. -->
`;

const LOGS_SEED = `<!-- logs.md — Session memory -->
<!-- Record important observations, decisions, and findings here. This is your -->
<!-- persistent memory across cycles: things you tried, what worked/failed, -->
<!-- design decisions and their rationale, gotchas discovered during -->
<!-- implementation. Unlike plan.md, entries here accumulate — they're a log. -->
`;

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
  mkdirSync(contextDir(cwd, id), { recursive: true });

  writeFileSync(planPath(cwd, id), PLAN_SEED, 'utf-8');
  writeFileSync(logsPath(cwd, id), LOGS_SEED, 'utf-8');

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
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
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

export async function appendAgentReport(cwd: string, sessionId: string, agentId: string, entry: AgentReport): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
    agent.reports.push(entry);
    saveSession(session);
  });
}

export async function completeOrchestratorCycle(cwd: string, sessionId: string, nextPrompt?: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const cycles = session.orchestratorCycles;
    if (cycles.length === 0) return;
    const cycle = cycles[cycles.length - 1]!;
    cycle.completedAt = new Date().toISOString();
    if (nextPrompt) cycle.nextPrompt = nextPrompt;
    saveSession(session);
  });
}

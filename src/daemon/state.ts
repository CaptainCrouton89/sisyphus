import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contextDir, logsPath, planPath, promptsDir, sessionDir, statePath } from '../shared/paths.js';
import type { Agent, AgentReport, OrchestratorCycle, Session, SessionStatus } from '../shared/types.js';

const PLAN_SEED = `---
description: >
  Living document of what still needs to happen. Write out ne
---
`;

const LOGS_SEED = `---
description: >
  Session memory. Record important observations, decisions, and findings here.
  This is your persistent memory across cycles: things you tried, what
  worked/failed, design decisions and their rationale, gotchas discovered during
  implementation.
---
`;

const CONTEXT_CLAUDE_MD = `# context/

Agents save exploration findings, architectural notes, and reference material here for use across cycles.
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
  mkdirSync(promptsDir(cwd, id), { recursive: true });

  writeFileSync(planPath(cwd, id), PLAN_SEED, 'utf-8');
  writeFileSync(logsPath(cwd, id), LOGS_SEED, 'utf-8');
  writeFileSync(join(contextDir(cwd, id), 'CLAUDE.md'), CONTEXT_CLAUDE_MD, 'utf-8');

  const session: Session = {
    id,
    task,
    cwd,
    status: 'active',
    createdAt: new Date().toISOString(),
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

export async function updateSessionTmux(cwd: string, sessionId: string, tmuxSessionName: string, tmuxWindowId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.tmuxSessionName = tmuxSessionName;
    session.tmuxWindowId = tmuxWindowId;
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

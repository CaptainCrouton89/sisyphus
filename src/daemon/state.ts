import { randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { contextDir, goalPath, initialPromptPath, legacyLogsPath, logsDir, reportsDir, roadmapPath, promptsDir, sessionDir, snapshotDir, snapshotsDir, statePath, strategyPath } from '../shared/paths.js';
import { ensureSisyphusGitignore } from '../shared/gitignore.js';
import type { Agent, AgentReport, Message, OrchestratorCycle, Session, SessionStatus } from '../shared/types.js';
import { findAgentById } from '../shared/utils.js';

const ROADMAP_SEED = `---
description: >
  Living document tracking development phases and outstanding work.
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

export function createSession(id: string, task: string, cwd: string, context?: string, name?: string): Session {
  ensureSisyphusGitignore(cwd);

  const dir = sessionDir(cwd, id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(contextDir(cwd, id), { recursive: true });
  mkdirSync(promptsDir(cwd, id), { recursive: true });

  writeFileSync(roadmapPath(cwd, id), ROADMAP_SEED, 'utf-8');
  mkdirSync(logsDir(cwd, id), { recursive: true });
  writeFileSync(goalPath(cwd, id), task, 'utf-8');
  writeFileSync(initialPromptPath(cwd, id), task, 'utf-8');
  writeFileSync(join(contextDir(cwd, id), 'CLAUDE.md'), CONTEXT_CLAUDE_MD, 'utf-8');
  if (context) {
    writeFileSync(join(contextDir(cwd, id), 'initial-context.md'), context, 'utf-8');
  }

  const createdAt = new Date().toISOString();
  const created = new Date(createdAt);
  const session: Session = {
    id,
    ...(name ? { name } : {}),
    task,
    ...(context ? { context } : {}),
    cwd,
    status: 'active',
    createdAt,
    activeMs: 0,
    agents: [],
    orchestratorCycles: [],
    messages: [],
    startHour: created.getHours(),
    startDayOfWeek: created.getDay(),
  };

  atomicWrite(statePath(cwd, id), JSON.stringify(session, null, 2));
  return session;
}

export function getSession(cwd: string, sessionId: string): Session {
  const content = readFileSync(statePath(cwd, sessionId), 'utf-8');
  const session = JSON.parse(content) as Session;
  // Normalize fields from pre-existing sessions that may lack newer properties
  if (session.activeMs == null) session.activeMs = 0;
  for (const agent of session.agents) {
    if (!agent.repo) agent.repo = '.';
    if (agent.activeMs == null) agent.activeMs = 0;
  }
  for (const cycle of session.orchestratorCycles) {
    if (cycle.activeMs == null) cycle.activeMs = 0;
  }
  return session;
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
    const agent = findAgentById(session.agents, agentId);
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

export async function continueSession(cwd: string, sessionId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    if (session.status !== 'completed') {
      throw new Error(`Session ${sessionId} is not completed (status: ${session.status})`);
    }
    session.status = 'active';
    session.completedAt = undefined;
    session.completionReport = undefined;
    const cycles = session.orchestratorCycles;
    if (cycles.length > 0) {
      cycles[cycles.length - 1]!.completedAt = undefined;
    }
    saveSession(session);
    writeFileSync(roadmapPath(cwd, sessionId), '', 'utf-8');
  });
}

export async function appendAgentReport(cwd: string, sessionId: string, agentId: string, entry: AgentReport): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = findAgentById(session.agents, agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
    agent.reports.push(entry);
    saveSession(session);
  });
}

export async function updateReportSummary(
  cwd: string,
  sessionId: string,
  agentId: string,
  filePath: string,
  summary: string,
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = findAgentById(session.agents, agentId);
    if (!agent) return;
    const report = agent.reports.find((r) => r.filePath === filePath);
    if (report) {
      report.summary = summary;
      saveSession(session);
    }
  });
}

export async function updateSessionName(cwd: string, sessionId: string, name: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.name = name;
    saveSession(session);
  });
}

export async function updateSessionTmux(cwd: string, sessionId: string, tmuxSessionName: string, tmuxWindowId: string, tmuxSessionId?: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.tmuxSessionName = tmuxSessionName;
    session.tmuxSessionId = tmuxSessionId;
    session.tmuxWindowId = tmuxWindowId;
    saveSession(session);
  });
}

export async function updateSession(cwd: string, sessionId: string, updates: Partial<Session>): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    Object.assign(session, updates);
    saveSession(session);
  });
}

export async function drainMessages(cwd: string, sessionId: string, count: number): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    if (!session.messages || count <= 0) return;
    session.messages = session.messages.slice(count);
    saveSession(session);
  });
}

export async function appendMessage(cwd: string, sessionId: string, message: Message): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    if (!session.messages) session.messages = [];
    session.messages.push(message);
    saveSession(session);
  });
}

export async function updateTask(cwd: string, sessionId: string, task: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.task = task;
    saveSession(session);
    writeFileSync(goalPath(cwd, sessionId), task, 'utf-8');
  });
}

export async function completeOrchestratorCycle(cwd: string, sessionId: string, nextPrompt?: string, mode?: string, activeMs?: number): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const cycles = session.orchestratorCycles;
    if (cycles.length === 0) return;
    const cycle = cycles[cycles.length - 1]!;
    if (cycle.completedAt) return;
    cycle.completedAt = new Date().toISOString();
    if (nextPrompt) cycle.nextPrompt = nextPrompt;
    if (mode) cycle.mode = mode;
    if (activeMs != null) cycle.activeMs += activeMs;
    saveSession(session);
  });
}

export async function incrementActiveTime(
  cwd: string,
  sessionId: string,
  sessionDelta: number,
  agentDeltas: Map<string, number>,
  cycleDeltas: Map<number, number>,
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.activeMs += sessionDelta;
    for (const [agentId, delta] of agentDeltas) {
      const agent = findAgentById(session.agents, agentId);
      if (agent) agent.activeMs += delta;
    }
    for (const [cycleNum, delta] of cycleDeltas) {
      const cycle = session.orchestratorCycles.find(c => c.cycle === cycleNum);
      if (cycle) cycle.activeMs += delta;
    }
    saveSession(session);
  });
}

export function createSnapshot(cwd: string, sessionId: string, cycleNumber: number): void {
  const dir = snapshotDir(cwd, sessionId, cycleNumber);
  mkdirSync(dir, { recursive: true });

  copyFileSync(statePath(cwd, sessionId), join(dir, 'state.json'));

  const roadmap = roadmapPath(cwd, sessionId);
  if (existsSync(roadmap)) copyFileSync(roadmap, join(dir, 'roadmap.md'));

  const ld = logsDir(cwd, sessionId);
  if (existsSync(ld)) cpSync(ld, join(dir, 'logs'), { recursive: true });
  const legacyLogs = legacyLogsPath(cwd, sessionId);
  if (existsSync(legacyLogs)) copyFileSync(legacyLogs, join(dir, 'logs.md'));
}

export async function restoreSnapshot(cwd: string, sessionId: string, toCycle: number): Promise<void> {
  return withSessionLock(sessionId, () => {
    const dir = snapshotDir(cwd, sessionId, toCycle);
    if (!existsSync(dir)) throw new Error(`No snapshot found for cycle ${toCycle}`);

    // Restore state.json atomically
    const snapshotState = readFileSync(join(dir, 'state.json'), 'utf-8');
    const session = JSON.parse(snapshotState) as Session;
    session.status = 'paused';
    session.completedAt = undefined;
    session.completionReport = undefined;
    session.tmuxSessionName = undefined;
    session.tmuxSessionId = undefined;
    session.tmuxWindowId = undefined;
    atomicWrite(statePath(cwd, sessionId), JSON.stringify(session, null, 2));

    // Restore roadmap.md and logs
    const snapshotRoadmap = join(dir, 'roadmap.md');
    if (existsSync(snapshotRoadmap)) copyFileSync(snapshotRoadmap, roadmapPath(cwd, sessionId));

    const snapshotLogsDir = join(dir, 'logs');
    if (existsSync(snapshotLogsDir)) {
      const currentLogsDir = logsDir(cwd, sessionId);
      if (existsSync(currentLogsDir)) rmSync(currentLogsDir, { recursive: true, force: true });
      cpSync(snapshotLogsDir, currentLogsDir, { recursive: true });
    } else {
      // Legacy fallback: snapshot has logs.md instead of logs/
      const snapshotLogs = join(dir, 'logs.md');
      if (existsSync(snapshotLogs)) copyFileSync(snapshotLogs, legacyLogsPath(cwd, sessionId));
    }
  });
}

export function listSnapshots(cwd: string, sessionId: string): number[] {
  const dir = snapshotsDir(cwd, sessionId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('cycle-'))
    .map(e => parseInt(e.name.replace('cycle-', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

export function deleteSnapshotsAfter(cwd: string, sessionId: string, afterCycle: number): void {
  const dir = snapshotsDir(cwd, sessionId);
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('cycle-')) continue;
    const num = parseInt(entry.name.replace('cycle-', ''), 10);
    if (!isNaN(num) && num > afterCycle) {
      rmSync(join(dir, entry.name), { recursive: true, force: true });
    }
  }
}

// --- Session cloning ---

function replaceIdInDir(dir: string, sourceId: string, cloneId: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { recursive: true }) as string[];
  for (const rel of entries) {
    const fullPath = join(dir, rel);
    if (!statSync(fullPath).isFile()) continue;
    const buf = readFileSync(fullPath);
    // Skip binary files (null byte in first 8KB)
    const sample = buf.subarray(0, 8192);
    if (sample.includes(0)) continue;
    const text = buf.toString('utf-8');
    if (text.includes(sourceId)) {
      writeFileSync(fullPath, text.replaceAll(sourceId, cloneId), 'utf-8');
    }
  }
}

export function cloneSessionDir(
  sourceCwd: string,
  sourceId: string,
  cloneId: string,
  goal: string,
  context?: string,
  strategy?: boolean,
): void {
  const srcDir = sessionDir(sourceCwd, sourceId);
  const dstDir = sessionDir(sourceCwd, cloneId);
  mkdirSync(dstDir, { recursive: true });

  // Deep-copy directories
  const dirsToCopy = ['context', 'prompts', 'reports', 'snapshots'] as const;
  for (const sub of dirsToCopy) {
    const src = join(srcDir, sub);
    const dst = join(dstDir, sub);
    if (existsSync(src)) {
      cpSync(src, dst, { recursive: true });
    } else {
      mkdirSync(dst, { recursive: true });
    }
  }

  // Conditionally copy strategy.md
  if (strategy) {
    const srcStrategy = strategyPath(sourceCwd, sourceId);
    if (existsSync(srcStrategy)) {
      const text = readFileSync(srcStrategy, 'utf-8');
      writeFileSync(strategyPath(sourceCwd, cloneId), text.replaceAll(sourceId, cloneId), 'utf-8');
    }
  }

  // Replace source ID with clone ID in copied directories
  for (const sub of dirsToCopy) {
    replaceIdInDir(join(dstDir, sub), sourceId, cloneId);
  }

  // Write fresh files
  writeFileSync(goalPath(sourceCwd, cloneId), goal, 'utf-8');
  writeFileSync(initialPromptPath(sourceCwd, cloneId), goal, 'utf-8');
  writeFileSync(roadmapPath(sourceCwd, cloneId), ROADMAP_SEED, 'utf-8');
  mkdirSync(logsDir(sourceCwd, cloneId), { recursive: true });

  // Write context/CLAUDE.md
  writeFileSync(join(contextDir(sourceCwd, cloneId), 'CLAUDE.md'), CONTEXT_CLAUDE_MD, 'utf-8');

  // Write initial-context.md if context provided
  if (context) {
    writeFileSync(join(contextDir(sourceCwd, cloneId), 'initial-context.md'), context, 'utf-8');
  }
}

export async function createCloneState(
  sourceCwd: string,
  sourceId: string,
  cloneId: string,
  goal: string,
  context?: string,
  configModel?: string,
  configOrchestratorPrompt?: string,
): Promise<Session> {
  return withSessionLock(cloneId, () => {
    const source = getSession(sourceCwd, sourceId);

    const createdAt = new Date().toISOString();
    const created = new Date(createdAt);

    // Deep-copy preserved fields
    const agents = structuredClone(source.agents);
    const orchestratorCycles = structuredClone(source.orchestratorCycles);
    const messages = structuredClone(source.messages);

    // Normalize running agents to killed
    const now = new Date().toISOString();
    for (const agent of agents) {
      if (agent.status === 'running') {
        agent.status = 'killed';
        agent.completedAt = now;
        agent.killedReason = 'inherited from source session';
      }
    }

    // Resolve model and launchConfig with fallback to config
    const model = source.model ?? configModel;
    const launchConfig = source.launchConfig
      ? structuredClone(source.launchConfig)
      : {
          model,
          context,
          orchestratorPrompt: configOrchestratorPrompt,
        };

    const clone: Session = {
      id: cloneId,
      task: goal,
      ...(context ? { context } : {}),
      cwd: sourceCwd,
      status: 'active',
      createdAt,
      activeMs: 0,
      agents,
      orchestratorCycles,
      messages,
      startHour: created.getHours(),
      startDayOfWeek: created.getDay(),
      parentSessionId: sourceId,
      ...(model ? { model } : {}),
      launchConfig,
    };

    atomicWrite(statePath(sourceCwd, cloneId), JSON.stringify(clone, null, 2));
    return clone;
  });
}

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch as fsWatch, writeFileSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, withLock } from './lib/atomic.js';
import { contextDir, goalPath, initialPromptPath, legacyLogsPath, logsDir, reportsDir, roadmapPath, promptsDir, sessionDir, snapshotDir, snapshotsDir, statePath, strategyPath } from '../shared/paths.js';
import { ensureSisyphusGitignore } from '../shared/gitignore.js';
import type { Agent, AgentReport, AgentStatus, Message, OrchestratorCycle, Session, SessionStatus } from '../shared/types.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';

const ROADMAP_SEED = `---
description: >
  Living document tracking development phases and outstanding work.
---
`;

const CONTEXT_CLAUDE_MD = `# context/

Agents save exploration findings, architectural notes, and reference material here for use across cycles.
`;

function withSessionLock<T>(sessionId: string, fn: () => T): Promise<T> {
  return withLock(sessionId, fn);
}

export function createSession(id: string, task: string, cwd: string, context?: string, name?: string, effort?: 'low' | 'medium' | 'high' | 'xhigh'): Session {
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
    userBlockedMs: 0,
    agents: [],
    orchestratorCycles: [],
    messages: [],
    startHour: created.getHours(),
    startDayOfWeek: created.getDay(),
    orphaned: false,
    ...(effort ? { effort } : {}),
  };

  atomicWrite(statePath(cwd, id), JSON.stringify(session, null, 2));
  return session;
}

function normalizeSession(session: Session): void {
  // Normalize fields from pre-existing sessions that may lack newer properties
  if (session.activeMs == null) session.activeMs = 0;
  if (session.userBlockedMs == null) session.userBlockedMs = 0;
  for (const agent of session.agents) {
    if (!agent.repo) agent.repo = '.';
    if (agent.activeMs == null) agent.activeMs = 0;
    if (agent.orphaned == null) agent.orphaned = false;
    // pid / pidLstart left undefined when absent — their absence signals "not yet captured"
  }
  if (session.orphaned == null) session.orphaned = false;
  // session.effort is intentionally not defaulted here — absence means "not explicitly set"
  // and consumers (agent.ts, orchestrator.ts, status.ts) fall back to 'high' at read time.
  // orphanReason is only set alongside orphaned=true; absent on healthy sessions and old state files
  for (const cycle of session.orchestratorCycles) {
    if (cycle.activeMs == null) cycle.activeMs = 0;
    if (cycle.userBlockedMs == null) cycle.userBlockedMs = 0;
  }
}

// Event-driven in-memory cache keyed by absolute statePath. Tracked sessions
// (registered via installStateWatcher) keep a parsed Session in the Map and an
// fs.watch watcher that reloads on change. Hot-path readers (pane-monitor,
// session-manager) are pure Map lookups — no statSync, no readFileSync per call.
// Untracked sessions fall through to the synchronous read path so on-demand
// callers (list, prune) still work without registration.
const sessionCache = new Map<string, Session>();
const watchers = new Map<string, FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 25;

function loadFromDisk(p: string): Session {
  const session = JSON.parse(readFileSync(p, 'utf-8')) as Session;
  normalizeSession(session);
  return session;
}

function reloadIntoCache(p: string): void {
  if (!sessionCache.has(p)) return; // untracked or just uninstalled — drop
  try {
    sessionCache.set(p, loadFromDisk(p));
  } catch (err) {
    // Transient: atomicWrite's rename may race a stat/read attempt; the next
    // watcher event will fire and we'll succeed then. Don't evict — a stale
    // entry is safer than a missing one for a tracked, live session.
    console.warn(`[sisyphus] state cache reload failed for ${p}:`, err instanceof Error ? err.message : err);
  }
}

function scheduleReload(p: string): void {
  const existing = debounceTimers.get(p);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    debounceTimers.delete(p);
    reloadIntoCache(p);
  }, DEBOUNCE_MS);
  t.unref?.();
  debounceTimers.set(p, t);
}

function installWatcher(p: string): void {
  if (watchers.has(p)) return;
  let w: FSWatcher;
  try {
    w = fsWatch(p, { persistent: false });
  } catch (err) {
    console.warn(`[sisyphus] fs.watch install failed for ${p}:`, err instanceof Error ? err.message : err);
    return;
  }
  w.on('change', (eventType) => {
    if (eventType === 'rename') {
      // atomicWrite replaces the path via rename — on macOS the existing watcher
      // can stop observing the new inode. Close, schedule a reload, and re-arm
      // once the reload has settled.
      try { w.close(); } catch { /* best-effort */ }
      watchers.delete(p);
      scheduleReload(p);
      const reinstall = setTimeout(() => {
        if (sessionCache.has(p)) installWatcher(p);
      }, DEBOUNCE_MS + 10);
      reinstall.unref?.();
    } else {
      scheduleReload(p);
    }
  });
  w.on('error', (err) => {
    console.warn(`[sisyphus] fs.watch error for ${p}:`, err instanceof Error ? err.message : err);
    try { w.close(); } catch { /* best-effort */ }
    watchers.delete(p);
  });
  watchers.set(p, w);
}

/**
 * Begin tracking a session's state.json in the in-memory cache. Loads the file
 * once and installs an fs.watch watcher; subsequent getSession() calls become
 * pure Map lookups. Idempotent — safe to call repeatedly. Called by
 * pane-monitor.trackSession on every session registration.
 *
 * On macOS, fs.watch can miss subsequent change events when installed in the
 * same microtask as a renameSync on the same path (atomicWrite's pattern).
 * We defer the watcher install via setImmediate so kqueue settles on the
 * post-rename inode — the cache itself is primed synchronously so in-daemon
 * reads never block on this.
 */
export function installStateWatcher(cwd: string, sessionId: string): void {
  const p = statePath(cwd, sessionId);
  try {
    sessionCache.set(p, loadFromDisk(p));
  } catch (err) {
    console.warn(`[sisyphus] state cache prime failed for ${p}:`, err instanceof Error ? err.message : err);
    return;
  }
  setImmediate(() => {
    if (sessionCache.has(p)) installWatcher(p);
  });
}

/**
 * Stop tracking a session — close the watcher, clear any pending debounce, and
 * drop the cache entry. Called by pane-monitor.untrackSession on cleanup paths
 * (kill, complete, quiesce, rollback).
 */
export function uninstallStateWatcher(cwd: string, sessionId: string): void {
  const p = statePath(cwd, sessionId);
  const w = watchers.get(p);
  if (w) {
    try { w.close(); } catch { /* best-effort */ }
    watchers.delete(p);
  }
  const t = debounceTimers.get(p);
  if (t) {
    clearTimeout(t);
    debounceTimers.delete(p);
  }
  sessionCache.delete(p);
}

export function getSession(cwd: string, sessionId: string): Session {
  const p = statePath(cwd, sessionId);
  const hit = sessionCache.get(p);
  if (hit) return structuredClone(hit);
  // Untracked sessions (pre-trackSession lookups, prune sweeps, etc.) read
  // directly. Not cached — caching here would silently grow without bound and
  // skip the watcher path.
  return loadFromDisk(p);
}

function saveSession(session: Session): void {
  const p = statePath(session.cwd, session.id);
  atomicWrite(p, JSON.stringify(session, null, 2));
  // Same-tick eager update: fs.watch fires asynchronously after the rename, so
  // callers issuing getSession immediately after a write would otherwise see
  // the pre-write value. Only writes for already-tracked sessions update the
  // cache — pre-tracking writes (createSession) leave it empty until
  // installStateWatcher primes it.
  if (sessionCache.has(p)) {
    sessionCache.set(p, structuredClone(session));
  }
}

/**
 * Returns true when the session has dangerousMode enabled. Safe to call before
 * the state file exists (e.g. mid-create) — returns false on any read error.
 */
export function isSessionDangerous(cwd: string, sessionId: string): boolean {
  try {
    return getSession(cwd, sessionId).dangerousMode === true;
  } catch {
    return false;
  }
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

export async function markAgentOrphan(
  cwd: string,
  sessionId: string,
  agentId: string,
  opts: { reason: string; status?: AgentStatus; activeMs?: number },
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
    agent.orphaned = true;
    agent.status = opts.status !== undefined ? opts.status : 'lost';
    agent.killedReason = opts.reason;
    agent.completedAt = new Date().toISOString();
    if (opts.activeMs !== undefined) agent.activeMs = opts.activeMs;
    delete agent.pid;
    delete agent.pidLstart;
    saveSession(session);
  });
}

export async function markSessionOrphan(
  cwd: string,
  sessionId: string,
  opts: { reason: string },
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.orphaned = true;
    session.orphanReason = opts.reason;
    saveSession(session);
  });
}

export async function clearSessionOrphan(cwd: string, sessionId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    if (!session.orphaned && session.orphanReason == null) return;
    session.orphaned = false;
    delete session.orphanReason;
    saveSession(session);
  });
}

export async function clearAgentPidInfo(
  cwd: string,
  sessionId: string,
  agentId: string,
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
    if (!agent) return;
    delete agent.pid;
    delete agent.pidLstart;
    saveSession(session);
  });
}

export async function setAgentPid(
  cwd: string,
  sessionId: string,
  agentId: string,
  pid: number,
  pidLstart: string,
): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
    if (!agent) return;
    agent.pid = pid;
    agent.pidLstart = pidLstart;
    saveSession(session);
  });
}

export async function setAgentConsumedInline(cwd: string, sessionId: string, agentId: string): Promise<void> {
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found in session ${sessionId}`);
    if (agent.consumedInline) return;
    agent.consumedInline = true;
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
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
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
    const agent = session.agents.slice().reverse().find((a: Agent) => a.id === agentId);
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

export async function incrementUserBlockedMs(
  cwd: string,
  sessionId: string,
  deltaMs: number,
  askedAt?: string,
  askedBy?: string,
): Promise<void> {
  if (deltaMs <= 0) return;
  return withSessionLock(sessionId, () => {
    const session = getSession(cwd, sessionId);
    session.userBlockedMs = (session.userBlockedMs ?? 0) + deltaMs;
    if (askedAt) {
      const askedAtMs = new Date(askedAt).getTime();
      const cycle = session.orchestratorCycles.find(c => {
        const startMs = new Date(c.timestamp).getTime();
        const endMs = c.completedAt ? new Date(c.completedAt).getTime() : Infinity;
        return startMs <= askedAtMs && askedAtMs < endMs;
      });
      if (cycle) cycle.userBlockedMs = (cycle.userBlockedMs ?? 0) + deltaMs;
    }
    if (askedBy && askedBy !== ORCHESTRATOR_ASKED_BY) {
      const agent = session.agents.slice().reverse().find(a => a.id === askedBy);
      if (agent) agent.userBlockedMs = (agent.userBlockedMs ?? 0) + deltaMs;
    }
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
      const agent = session.agents.slice().reverse().find(a => a.id === agentId);
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

  const strategy = strategyPath(cwd, sessionId);
  if (existsSync(strategy)) copyFileSync(strategy, join(dir, 'strategy.md'));

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

    // Restore roadmap.md, strategy.md, and logs
    const snapshotRoadmap = join(dir, 'roadmap.md');
    if (existsSync(snapshotRoadmap)) copyFileSync(snapshotRoadmap, roadmapPath(cwd, sessionId));

    const snapshotStrategy = join(dir, 'strategy.md');
    if (existsSync(snapshotStrategy)) copyFileSync(snapshotStrategy, strategyPath(cwd, sessionId));

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
      ...(source.effort != null ? { effort: source.effort } : {}),
    };

    atomicWrite(statePath(sourceCwd, cloneId), JSON.stringify(clone, null, 2));
    return clone;
  });
}

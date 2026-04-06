import { createServer, type Server } from 'node:net';
import { unlinkSync, existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { socketPath, globalDir, messagesDir, sessionsDir } from '../shared/paths.js';
import { join } from 'node:path';
import type { Request, Response } from '../shared/protocol.js';
import type { MessageSource } from '../shared/types.js';
import * as sessionManager from './session-manager.js';
import { loadCompanion, saveCompanion } from './companion.js';
import * as state from './state.js';
import { lookupPane, unregisterPane } from './pane-registry.js';
import { emitHistoryEvent } from './history.js';
import { getActiveTimers } from './pane-monitor.js';
import type { Compositor } from './segments/index.js';

let server: Server | null = null;
let compositor: Compositor | null = null;

export function setCompositor(c: Compositor): void {
  compositor = c;
}

interface SessionTracking {
  cwd: string;
  tmuxSession?: string;
  windowId?: string;
  tmuxSessionId?: string;
  messageCounter: number;
}
const sessionTrackingMap = new Map<string, SessionTracking>();

function registryPath(): string {
  return join(globalDir(), 'session-registry.json');
}

function persistSessionRegistry(): void {
  const dir = globalDir();
  mkdirSync(dir, { recursive: true });
  const registry: Record<string, string> = {};
  for (const [id, tracking] of sessionTrackingMap) {
    registry[id] = tracking.cwd;
  }
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2), 'utf-8');
}

export function loadSessionRegistry(): Record<string, string> {
  const p = registryPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function registerSessionCwd(sessionId: string, cwd: string): void {
  const existing = sessionTrackingMap.get(sessionId);
  if (existing) {
    existing.cwd = cwd;
  } else {
    sessionTrackingMap.set(sessionId, { cwd, messageCounter: 0 });
  }
  persistSessionRegistry();
}

export function registerSessionTmux(sessionId: string, tmuxSession: string, windowId: string, tmuxSessionId?: string): void {
  const existing = sessionTrackingMap.get(sessionId);
  if (existing) {
    existing.tmuxSession = tmuxSession;
    existing.windowId = windowId;
    existing.tmuxSessionId = tmuxSessionId;
  } else {
    sessionTrackingMap.set(sessionId, { cwd: '', tmuxSession, windowId, tmuxSessionId, messageCounter: 0 });
  }
}

function unknownSessionError(sessionId: string): Response {
  return { ok: false, error: `Unknown session: ${sessionId}. Run \`sisyphus list --all\` to see available sessions.` };
}

/**
 * Ensure a session is tracked in memory, recovering from disk if needed.
 * Returns the tracking entry on success, or an error response if the session
 * cannot be found on disk either.
 */
function ensureTrackedFromDisk(sessionId: string, cwd: string): { tracking: SessionTracking } | { error: Response } {
  const existing = sessionTrackingMap.get(sessionId);
  if (existing) return { tracking: existing };
  const stateFile = `${cwd}/.sisyphus/sessions/${sessionId}/state.json`;
  if (existsSync(stateFile)) {
    const tracking: SessionTracking = { cwd, messageCounter: 0 };
    sessionTrackingMap.set(sessionId, tracking);
    persistSessionRegistry();
    return { tracking };
  }
  return { error: unknownSessionError(sessionId) };
}

/**
 * Build a map of sessionId → cwd from all known sources:
 * in-memory tracking map, persisted registry, and on-disk session directories.
 */
function collectAllSessionIds(): Map<string, string> {
  const idToCwd = new Map<string, string>();

  // 1. In-memory tracking map (authoritative for active sessions)
  for (const [id, tracking] of sessionTrackingMap) {
    idToCwd.set(id, tracking.cwd);
  }

  // 2. Persisted registry
  const registry = loadSessionRegistry();
  for (const [id, cwd] of Object.entries(registry)) {
    if (!idToCwd.has(id)) idToCwd.set(id, cwd);
  }

  // 3. Scan on-disk session dirs across all known cwds
  const scannedCwds = new Set<string>();
  for (const cwd of idToCwd.values()) {
    if (scannedCwds.has(cwd)) continue;
    scannedCwds.add(cwd);
    try {
      const dir = sessionsDir(cwd);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !idToCwd.has(entry.name)) {
          idToCwd.set(entry.name, cwd);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  return idToCwd;
}

/**
 * Resolve a potentially partial session ID to a full UUID.
 * Checks in-memory tracking map, persisted registry, and on-disk sessions.
 * Returns the full ID on unique match, or an error response on ambiguity.
 * Also hydrates the tracking map so downstream handlers get the correct cwd.
 */
function resolvePartialSessionId(partial: string): { id: string } | { error: Response } {
  // Exact match in memory — fast path
  if (sessionTrackingMap.has(partial)) return { id: partial };

  const allSessions = collectAllSessionIds();

  // Exact match across all sources
  if (allSessions.has(partial)) {
    ensureTracked(partial, allSessions);
    return { id: partial };
  }

  // Prefix match
  const matches = [...allSessions.keys()].filter(id => id.startsWith(partial));
  if (matches.length === 1) {
    const id = matches[0]!;
    ensureTracked(id, allSessions);
    return { id };
  }
  if (matches.length > 1) {
    const list = matches.map(id => `  ${id}`).join('\n');
    return { error: { ok: false, error: `Ambiguous session prefix "${partial}" matches ${matches.length} sessions:\n${list}` } };
  }

  // No match — let downstream handlers produce their own errors
  return { id: partial };
}

/** If a session is not in the tracking map, hydrate it from the known cwd. */
function ensureTracked(id: string, idToCwd: Map<string, string>): void {
  if (sessionTrackingMap.has(id)) return;
  const cwd = idToCwd.get(id);
  if (cwd) {
    sessionTrackingMap.set(id, { cwd, messageCounter: 0 });
  }
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    // Resolve partial session IDs before dispatching
    if ('sessionId' in req && req.sessionId) {
      const resolved = resolvePartialSessionId(req.sessionId);
      if ('error' in resolved) return resolved.error;
      (req as Record<string, unknown>).sessionId = resolved.id;
    }

    switch (req.type) {
      case 'start': {
        const session = await sessionManager.startSession(req.task, req.cwd, req.context, req.name);
        sessionTrackingMap.set(session.id, {
          cwd: req.cwd,
          tmuxSession: session.tmuxSessionName,
          windowId: session.tmuxWindowId,
          tmuxSessionId: session.tmuxSessionId,
          messageCounter: 0,
        });
        persistSessionRegistry();
        return { ok: true, data: { sessionId: session.id, tmuxSessionName: session.tmuxSessionName } };
      }

      case 'clone': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        const result = await sessionManager.cloneSession(
          req.sessionId, tracking.cwd, req.goal, req.context, req.name, req.strategy
        );
        sessionTrackingMap.set(result.id, {
          cwd: tracking.cwd,
          tmuxSession: result.tmuxSessionName,
          windowId: result.tmuxWindowId,
          tmuxSessionId: result.tmuxSessionId,
          messageCounter: 0,
        });
        persistSessionRegistry();
        return { ok: true, data: { sessionId: result.id, tmuxSessionName: result.tmuxSessionName } };
      }

      case 'spawn': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        const result = await sessionManager.handleSpawn(req.sessionId, tracking.cwd, req.agentType, req.name, req.instruction, req.repo);
        return { ok: true, data: { agentId: result.agentId } };
      }

      case 'submit': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        if (!tracking.windowId) return { ok: false, error: `No tmux window found for session: ${req.sessionId}` };
        await sessionManager.handleSubmit(tracking.cwd, req.sessionId, req.agentId, req.report, tracking.windowId);
        return { ok: true };
      }

      case 'report': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleReport(tracking.cwd, req.sessionId, req.agentId, req.content);
        return { ok: true };
      }

      case 'yield': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleYield(req.sessionId, tracking.cwd, req.nextPrompt, req.mode);
        return { ok: true };
      }

      case 'complete': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleComplete(req.sessionId, tracking.cwd, req.report);
        return { ok: true };
      }

      case 'continue': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleContinue(req.sessionId, tracking.cwd);
        return { ok: true };
      }

      case 'status': {
        let sessionId = req.sessionId;

        // If no session ID provided, find the most recent active/paused session for this cwd
        if (!sessionId && req.cwd) {
          const sessions = sessionManager.listSessions(req.cwd);
          const active = sessions.find(s => s.status === 'active') ?? sessions.find(s => s.status === 'paused');
          if (active) sessionId = active.id;
        }

        if (sessionId) {
          const cwd = sessionTrackingMap.get(sessionId)?.cwd ?? req.cwd;
          if (!cwd) return unknownSessionError(sessionId);
          const session = sessionManager.getSessionStatus(cwd, sessionId);
          // Overlay live in-memory timer values for real-time accuracy
          const timers = getActiveTimers(sessionId);
          if (timers) {
            session.activeMs = timers.sessionMs;
            for (const agent of session.agents) {
              const agentMs = timers.agentMs.get(agent.id);
              if (agentMs != null) agent.activeMs = agentMs;
            }
            for (const cycle of session.orchestratorCycles) {
              const cycleMs = timers.cycleMs.get(cycle.cycle);
              if (cycleMs != null) cycle.activeMs = cycleMs;
            }
          }
          return { ok: true, data: { session: session as unknown as Record<string, unknown> } };
        }
        return { ok: true, data: { message: 'daemon running' } };
      }

      case 'list': {
        const allSessions: Array<Record<string, unknown>> = [];
        if (req.all) {
          // List sessions across all known cwds
          const seenCwds = new Set<string>();
          for (const tracking of sessionTrackingMap.values()) {
            if (seenCwds.has(tracking.cwd)) continue;
            seenCwds.add(tracking.cwd);
            const sessions = sessionManager.listSessions(tracking.cwd);
            allSessions.push(...sessions.map(s => ({ ...s, cwd: tracking.cwd } as unknown as Record<string, unknown>)));
          }
        } else {
          // List sessions for the requesting cwd only
          const sessions = sessionManager.listSessions(req.cwd);
          allSessions.push(...sessions.map(s => ({ ...s, cwd: req.cwd } as unknown as Record<string, unknown>)));
          // Count total across all cwds for the hint
          let totalCount = allSessions.length;
          const seenCwds = new Set<string>([req.cwd]);
          for (const tracking of sessionTrackingMap.values()) {
            if (seenCwds.has(tracking.cwd)) continue;
            seenCwds.add(tracking.cwd);
            totalCount += sessionManager.listSessions(tracking.cwd).length;
          }
          if (totalCount > allSessions.length) {
            return { ok: true, data: { sessions: allSessions, totalCount, filtered: true } };
          }
        }
        return { ok: true, data: { sessions: allSessions } };
      }

      case 'resume': {
        const resumeResult = ensureTrackedFromDisk(req.sessionId, req.cwd);
        if ('error' in resumeResult) return resumeResult.error;
        const tracking = resumeResult.tracking;
        const session = await sessionManager.resumeSession(req.sessionId, tracking.cwd, req.message);
        if (session.tmuxSessionName) tracking.tmuxSession = session.tmuxSessionName;
        if (session.tmuxWindowId) tracking.windowId = session.tmuxWindowId;
        return { ok: true, data: { sessionId: session.id, status: session.status, tmuxSessionName: session.tmuxSessionName } };
      }

      case 'kill': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        const killedAgents = await sessionManager.handleKill(req.sessionId, tracking.cwd);
        sessionTrackingMap.delete(req.sessionId);
        persistSessionRegistry();
        return { ok: true, data: { killedAgents, sessionId: req.sessionId } };
      }

      case 'kill-agent': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleKillAgent(req.sessionId, tracking.cwd, req.agentId);
        return { ok: true, data: { agentId: req.agentId } };
      }

      case 'restart-agent': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleRestartAgent(req.sessionId, tracking.cwd, req.agentId);
        return { ok: true, data: { agentId: req.agentId } };
      }

      case 'rollback': {
        const rollbackResult = ensureTrackedFromDisk(req.sessionId, req.cwd);
        if ('error' in rollbackResult) return rollbackResult.error;
        const tracking = rollbackResult.tracking;
        const result = await sessionManager.handleRollback(req.sessionId, tracking.cwd, req.toCycle);
        return { ok: true, data: result as unknown as Record<string, unknown> };
      }

      case 'reconnect': {
        const reconnectResult = ensureTrackedFromDisk(req.sessionId, req.cwd);
        if ('error' in reconnectResult) return reconnectResult.error;
        const tracking = reconnectResult.tracking;
        const result = await sessionManager.reconnectSession(req.sessionId, tracking.cwd);
        tracking.tmuxSession = result.tmuxSessionName;
        tracking.windowId = result.tmuxWindowId;
        tracking.tmuxSessionId = result.tmuxSessionId;
        return { ok: true, data: result };
      }

      case 'reopen-window': {
        const reopenResult = ensureTrackedFromDisk(req.sessionId, req.cwd);
        if ('error' in reopenResult) return reopenResult.error;
        const tracking = reopenResult.tracking;
        const result = await sessionManager.reopenWindow(req.sessionId, tracking.cwd);
        tracking.tmuxSession = result.tmuxSessionName;
        tracking.windowId = result.tmuxWindowId;
        return { ok: true, data: result };
      }

      case 'delete': {
        // Kill session if active (best-effort)
        const activeTracking = sessionTrackingMap.get(req.sessionId);
        if (activeTracking) {
          try {
            await sessionManager.handleKill(req.sessionId, activeTracking.cwd);
          } catch {
            // May already be dead — continue
          }
          sessionTrackingMap.delete(req.sessionId);
          persistSessionRegistry();
        }
        // Remove session directory
        const { sessionDir } = await import('../shared/paths.js');
        rmSync(sessionDir(req.cwd, req.sessionId), { recursive: true, force: true });
        return { ok: true };
      }

      case 'pane-exited': {
        const entry = lookupPane(req.paneId);
        if (!entry) return { ok: true }; // Already handled or unknown
        const tracking = sessionTrackingMap.get(entry.sessionId);
        if (!tracking) {
          unregisterPane(req.paneId);
          return { ok: true };
        }
        unregisterPane(req.paneId);
        await sessionManager.handlePaneExited(req.paneId, tracking.cwd, entry.sessionId, entry.role, entry.agentId);
        return { ok: true };
      }

      case 'update-task': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await state.updateTask(tracking.cwd, req.sessionId, req.task);
        return { ok: true };
      }

      case 'message': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);

        tracking.messageCounter += 1;
        const id = `msg-${String(tracking.messageCounter).padStart(3, '0')}`;

        const source: MessageSource = req.source ?? { type: 'user' };
        const summary = req.content.length > 200 ? req.content.slice(0, 200) + '...' : req.content;

        let filePath: string | undefined;
        if (req.content.length > 200) {
          const dir = messagesDir(tracking.cwd, req.sessionId);
          mkdirSync(dir, { recursive: true });
          filePath = join(dir, `${id}.md`);
          writeFileSync(filePath, req.content, 'utf-8');
        }

        await state.appendMessage(tracking.cwd, req.sessionId, {
          id,
          source,
          content: req.content,
          summary,
          ...(filePath ? { filePath } : {}),
          timestamp: new Date().toISOString(),
        });
        emitHistoryEvent(req.sessionId, 'message', { source: source.type, content: req.content });
        return { ok: true };
      }

      case 'companion': {
        const companion = loadCompanion();
        if (req.name !== undefined) {
          companion.name = req.name;
          saveCompanion(companion);
        }
        return { ok: true, data: companion as unknown as Record<string, unknown> };
      }

      case 'register-segment': {
        if (!compositor) return { ok: false, error: 'Compositor not initialized' };
        compositor.registerExternal({
          id: req.id,
          side: req.side,
          priority: req.priority,
          bg: req.bg,
          content: req.content,
        });
        return { ok: true };
      }

      case 'update-segment': {
        if (!compositor) return { ok: false, error: 'Compositor not initialized' };
        try {
          compositor.updateExternal(req.id, req.content);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }

      case 'unregister-segment': {
        if (!compositor) return { ok: false, error: 'Compositor not initialized' };
        compositor.unregisterExternal(req.id);
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown request type: ${(req as Record<string, unknown>).type}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function startServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const sock = socketPath();

    if (existsSync(sock)) {
      unlinkSync(sock);
    }

    server = createServer((conn) => {
      let buffer = '';

      conn.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          let req: Request;
          try {
            req = JSON.parse(line) as Request;
          } catch {
            conn.write(JSON.stringify({ ok: false, error: 'Invalid JSON' }) + '\n');
            continue;
          }

          handleRequest(req).then((res) => {
            if (!conn.destroyed) {
              conn.write(JSON.stringify(res) + '\n');
            }
          });
        }
      });

      conn.on('error', (err) => {
        // Suppress EPIPE — client disconnected before response was written
        if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
          console.error('[sisyphus] Connection error:', err.message);
        }
      });
    });

    server.on('error', reject);

    server.listen(sock, () => {
      console.log(`[sisyphus] Daemon listening on ${sock}`);
      resolve(server!);
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      const sock = socketPath();
      if (existsSync(sock)) {
        unlinkSync(sock);
      }
      server = null;
      resolve();
    });
  });
}

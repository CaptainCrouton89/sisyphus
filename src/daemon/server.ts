import { createServer, type Server } from 'node:net';
import { unlinkSync, existsSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { socketPath, globalDir, messagesDir } from '../shared/paths.js';
import { join } from 'node:path';
import type { Request, Response } from '../shared/protocol.js';
import type { MessageSource } from '../shared/types.js';
import * as sessionManager from './session-manager.js';
import * as state from './state.js';
import { lookupPane, unregisterPane } from './pane-registry.js';

let server: Server | null = null;

interface SessionTracking {
  cwd: string;
  tmuxSession?: string;
  windowId?: string;
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

export function registerSessionTmux(sessionId: string, tmuxSession: string, windowId: string): void {
  const existing = sessionTrackingMap.get(sessionId);
  if (existing) {
    existing.tmuxSession = tmuxSession;
    existing.windowId = windowId;
  } else {
    sessionTrackingMap.set(sessionId, { cwd: '', tmuxSession, windowId, messageCounter: 0 });
  }
}

function unknownSessionError(sessionId: string): Response {
  return { ok: false, error: `Unknown session: ${sessionId}. Run \`sisyphus list --all\` to see available sessions.` };
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    switch (req.type) {
      case 'start': {
        const session = await sessionManager.startSession(req.task, req.cwd, req.context, req.name);
        sessionTrackingMap.set(session.id, {
          cwd: req.cwd,
          tmuxSession: session.tmuxSessionName,
          windowId: session.tmuxWindowId,
          messageCounter: 0,
        });
        persistSessionRegistry();
        return { ok: true, data: { sessionId: session.id, tmuxSessionName: session.tmuxSessionName } };
      }

      case 'spawn': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        const result = await sessionManager.handleSpawn(req.sessionId, tracking.cwd, req.agentType, req.name, req.instruction, req.worktree);
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
        if (req.sessionId) {
          const cwd = sessionTrackingMap.get(req.sessionId)?.cwd ?? req.cwd;
          if (!cwd) return unknownSessionError(req.sessionId);
          const session = sessionManager.getSessionStatus(cwd, req.sessionId);
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
        let tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) {
          // Session not in memory — try to recover from disk using the cwd provided by CLI
          const stateFile = `${req.cwd}/.sisyphus/sessions/${req.sessionId}/state.json`;
          if (existsSync(stateFile)) {
            tracking = { cwd: req.cwd, messageCounter: 0 };
            sessionTrackingMap.set(req.sessionId, tracking);
            persistSessionRegistry();
          } else {
            return { ok: false, error: `Unknown session: ${req.sessionId}. No state.json found at ${stateFile}. Run \`sisyphus list --all\` to see available sessions.` };
          }
        }
        const session = await sessionManager.resumeSession(req.sessionId, tracking.cwd, req.message);
        if (session.tmuxSessionName) tracking.tmuxSession = session.tmuxSessionName;
        if (session.tmuxWindowId) tracking.windowId = session.tmuxWindowId;
        return { ok: true, data: { sessionId: session.id, status: session.status, tmuxSessionName: session.tmuxSessionName } };
      }

      case 'register_claude_session': {
        const tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) return unknownSessionError(req.sessionId);
        await sessionManager.handleRegisterClaudeSession(tracking.cwd, req.sessionId, req.agentId, req.claudeSessionId);
        return { ok: true };
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
        let tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) {
          const stateFile = `${req.cwd}/.sisyphus/sessions/${req.sessionId}/state.json`;
          if (existsSync(stateFile)) {
            registerSessionCwd(req.sessionId, req.cwd);
            tracking = sessionTrackingMap.get(req.sessionId)!;
          } else {
            return unknownSessionError(req.sessionId);
          }
        }
        const result = await sessionManager.handleRollback(req.sessionId, tracking.cwd, req.toCycle);
        return { ok: true, data: result as unknown as Record<string, unknown> };
      }

      case 'reopen-window': {
        let tracking = sessionTrackingMap.get(req.sessionId);
        if (!tracking) {
          const stateFile = `${req.cwd}/.sisyphus/sessions/${req.sessionId}/state.json`;
          if (existsSync(stateFile)) {
            tracking = { cwd: req.cwd, messageCounter: 0 };
            sessionTrackingMap.set(req.sessionId, tracking);
            persistSessionRegistry();
          } else {
            return unknownSessionError(req.sessionId);
          }
        }
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
            conn.write(JSON.stringify(res) + '\n');
          });
        }
      });

      conn.on('error', (err) => {
        console.error('[sisyphus] Connection error:', err.message);
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

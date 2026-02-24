import { createServer, type Server } from 'node:net';
import { unlinkSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { socketPath, globalDir } from '../shared/paths.js';
import { join } from 'node:path';
import type { Request, Response } from '../shared/protocol.js';
import * as sessionManager from './session-manager.js';
import { lookupPane, unregisterPane } from './pane-registry.js';

let server: Server | null = null;

// Track the cwd for each session so we can route requests
const sessionCwdMap = new Map<string, string>();
// Track the originating tmux session for each sisyphus session
const sessionTmuxMap = new Map<string, string>();
// Track the originating tmux window for each sisyphus session
const sessionWindowMap = new Map<string, string>();

export function getSessionCwd(sessionId: string): string | undefined {
  return sessionCwdMap.get(sessionId);
}

export function getSessionTmux(sessionId: string): string | undefined {
  return sessionTmuxMap.get(sessionId);
}

function registryPath(): string {
  return join(globalDir(), 'session-registry.json');
}

function persistSessionRegistry(): void {
  const dir = globalDir();
  mkdirSync(dir, { recursive: true });
  const registry: Record<string, string> = {};
  for (const [id, cwd] of sessionCwdMap) {
    registry[id] = cwd;
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
  sessionCwdMap.set(sessionId, cwd);
  persistSessionRegistry();
}

export function registerSessionTmux(sessionId: string, tmuxSession: string, windowId: string): void {
  sessionTmuxMap.set(sessionId, tmuxSession);
  sessionWindowMap.set(sessionId, windowId);
}

async function handleRequest(req: Request): Promise<Response> {
  try {
    switch (req.type) {
      case 'start': {
        const session = await sessionManager.startSession(req.task, req.cwd, req.tmuxSession, req.tmuxWindow, req.context);
        registerSessionCwd(session.id, req.cwd);
        sessionTmuxMap.set(session.id, req.tmuxSession);
        sessionWindowMap.set(session.id, req.tmuxWindow);
        return { ok: true, data: { sessionId: session.id } };
      }

      case 'spawn': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        const result = await sessionManager.handleSpawn(req.sessionId, cwd, req.agentType, req.name, req.instruction, req.worktree);
        return { ok: true, data: { agentId: result.agentId } };
      }

      case 'submit': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        const windowId = sessionWindowMap.get(req.sessionId);
        if (!windowId) return { ok: false, error: `No tmux window found for session: ${req.sessionId}` };
        await sessionManager.handleSubmit(cwd, req.sessionId, req.agentId, req.report, windowId);
        return { ok: true };
      }

      case 'report': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        await sessionManager.handleReport(cwd, req.sessionId, req.agentId, req.content);
        return { ok: true };
      }

      case 'yield': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        await sessionManager.handleYield(req.sessionId, cwd, req.nextPrompt);
        return { ok: true };
      }

      case 'complete': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        await sessionManager.handleComplete(req.sessionId, cwd, req.report);
        return { ok: true };
      }

      case 'status': {
        if (req.sessionId) {
          const cwd = sessionCwdMap.get(req.sessionId);
          if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
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
          for (const cwd of sessionCwdMap.values()) {
            if (seenCwds.has(cwd)) continue;
            seenCwds.add(cwd);
            const sessions = sessionManager.listSessions(cwd);
            allSessions.push(...sessions.map(s => ({ ...s, cwd } as unknown as Record<string, unknown>)));
          }
        } else {
          // List sessions for the requesting cwd only
          const sessions = sessionManager.listSessions(req.cwd);
          allSessions.push(...sessions.map(s => ({ ...s, cwd: req.cwd } as unknown as Record<string, unknown>)));
          // Count total across all cwds for the hint
          let totalCount = allSessions.length;
          const seenCwds = new Set<string>([req.cwd]);
          for (const cwd of sessionCwdMap.values()) {
            if (seenCwds.has(cwd)) continue;
            seenCwds.add(cwd);
            totalCount += sessionManager.listSessions(cwd).length;
          }
          if (totalCount > allSessions.length) {
            return { ok: true, data: { sessions: allSessions, totalCount, filtered: true } };
          }
        }
        return { ok: true, data: { sessions: allSessions } };
      }

      case 'resume': {
        let cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) {
          // Session not in memory — try to recover from disk using the cwd provided by CLI
          const stateFile = `${req.cwd}/.sisyphus/sessions/${req.sessionId}/state.json`;
          if (existsSync(stateFile)) {
            cwd = req.cwd;
            registerSessionCwd(req.sessionId, cwd);
          } else {
            return { ok: false, error: `Unknown session: ${req.sessionId}. No state.json found at ${stateFile}` };
          }
        }
        sessionTmuxMap.set(req.sessionId, req.tmuxSession);
        sessionWindowMap.set(req.sessionId, req.tmuxWindow);
        const session = await sessionManager.resumeSession(req.sessionId, cwd, req.tmuxSession, req.tmuxWindow, req.message);
        return { ok: true, data: { sessionId: session.id, status: session.status } };
      }

      case 'register_claude_session': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        await sessionManager.handleRegisterClaudeSession(cwd, req.sessionId, req.agentId, req.claudeSessionId);
        return { ok: true };
      }

      case 'kill': {
        const cwd = sessionCwdMap.get(req.sessionId);
        if (!cwd) return { ok: false, error: `Unknown session: ${req.sessionId}` };
        const killedAgents = await sessionManager.handleKill(req.sessionId, cwd);
        sessionCwdMap.delete(req.sessionId);
        sessionTmuxMap.delete(req.sessionId);
        sessionWindowMap.delete(req.sessionId);
        persistSessionRegistry();
        return { ok: true, data: { killedAgents, sessionId: req.sessionId } };
      }

      case 'pane-exited': {
        const entry = lookupPane(req.paneId);
        if (!entry) return { ok: true }; // Already handled or unknown
        const cwd = sessionCwdMap.get(entry.sessionId);
        if (!cwd) {
          unregisterPane(req.paneId);
          return { ok: true };
        }
        unregisterPane(req.paneId);
        await sessionManager.handlePaneExited(req.paneId, cwd, entry.sessionId, entry.role, entry.agentId);
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

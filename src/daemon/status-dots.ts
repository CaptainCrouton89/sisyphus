import { readFileSync } from 'node:fs';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { respawningSessions } from './respawn-guard.js';
import { sendTerminalNotification } from './notify.js';
import { loadConfig } from '../shared/config.js';
import type { Session } from '../shared/types.js';

const CLAUDE_STATE_DIR = '/tmp/claude-tmux-state';

// ─── Session phase detection ─────────────────────────────────────────────────

export type SessionPhase =
  | 'orchestrator:processing'
  | 'orchestrator:idle'
  | 'agents:running'
  | 'between-cycles'
  | 'paused'
  | 'completed';

interface SessionDot {
  phase: SessionPhase;
  createdAt: string;
}

// ─── Dot rendering ───────────────────────────────────────────────────────────

export const DOT_MAP: Record<SessionPhase, { icon: string; color: string }> = {
  'orchestrator:processing': { icon: '●', color: '#d4ad6a' },  // yellow — orchestrator thinking
  'orchestrator:idle':       { icon: '●', color: '#d47766' },  // red — needs your input
  'agents:running':          { icon: '◆', color: '#d4ad6a' },  // yellow diamond — agents working
  'between-cycles':          { icon: '◆', color: '#5e584e' },  // dim diamond — respawning
  'paused':                  { icon: '○', color: '#d47766' },  // red hollow — stuck
  'completed':               { icon: '●', color: '#a9b16e' },  // green — done
};

function renderDots(dots: SessionDot[]): string {
  // Stable ordering by creation time
  const sorted = [...dots].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted
    .map(d => {
      const { icon, color } = DOT_MAP[d.phase];
      return `#[fg=${color}]${icon}`;
    })
    .join('');
}

// ─── Claude hook file reading ────────────────────────────────────────────────

export function readClaudeState(paneId: string): 'idle' | 'processing' | 'stopped' | null {
  // paneId is like "%42" — strip the %
  const numericId = paneId.replace('%', '');
  try {
    const content = readFileSync(`${CLAUDE_STATE_DIR}/${numericId}`, 'utf-8').trim();
    if (content === 'idle' || content === 'processing' || content === 'stopped') {
      return content;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Phase detection ─────────────────────────────────────────────────────────

function detectPhase(
  session: Session,
  livePaneIds: Set<string>,
): SessionPhase {
  if (session.status === 'completed') return 'completed';
  if (session.status === 'paused') return 'paused';

  // Active session — determine sub-phase
  if (respawningSessions.has(session.id)) return 'between-cycles';

  // Derive orchestrator pane from persisted cycle state (survives daemon restarts)
  const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
  const orchPaneId = lastCycle && !lastCycle.completedAt ? lastCycle.paneId : undefined;
  const orchAlive = orchPaneId != null && livePaneIds.has(orchPaneId);
  const hasRunningAgents = session.agents.some(a => a.status === 'running');

  if (orchAlive) {
    const claudeState = readClaudeState(orchPaneId!);
    if (claudeState === 'idle' || claudeState === 'stopped') {
      return 'orchestrator:idle';
    }
    return 'orchestrator:processing';
  }

  if (hasRunningAgents) return 'agents:running';

  return 'between-cycles';
}

// ─── Sisyphus phase tracking (consumed by status-bar.ts) ─────────────────────

const sisyphusPhases = new Map<string, { phase: SessionPhase; tmuxSession: string }>();

// Tracks which tmux session names currently have @sisyphus_phase set so we can
// clear it when a session leaves tracking.
const sessionNamesWithPhase = new Set<string>();

// Previous phase per session — used to detect transitions and fire one-shot notifications
const previousPhases = new Map<string, SessionPhase>();

export function getSisyphusPhases(): ReadonlyMap<string, { phase: SessionPhase; tmuxSession: string }> {
  return sisyphusPhases;
}

// ─── Tracked sessions interface ──────────────────────────────────────────────

interface TrackedEntry {
  id: string;
  cwd: string;
  tmuxSessionId: string | undefined;
  tmuxSessionName: string;
  windowId: string | null;
}

type GetTrackedEntries = () => Iterable<TrackedEntry>;

let getTrackedEntries: GetTrackedEntries | null = null;

export function setTrackedEntriesProvider(provider: GetTrackedEntries): void {
  getTrackedEntries = provider;
}

// ─── Recently completed sessions (TTL-based) ────────────────────────────────

const COMPLETED_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CompletedEntry {
  createdAt: string;
  cwd: string;
  expireAt: number;
}

const completedSessions = new Map<string, CompletedEntry>();

export function markSessionCompleted(sessionId: string, createdAt: string, cwd: string): void {
  completedSessions.set(sessionId, {
    createdAt,
    cwd,
    expireAt: Date.now() + COMPLETED_TTL_MS,
  });
}

function pruneCompleted(): void {
  const now = Date.now();
  for (const [id, entry] of completedSessions) {
    if (entry.expireAt < now) completedSessions.delete(id);
  }
}

// ─── Dashboard window discovery ──────────────────────────────────────────────

// Cache dashboard window IDs per cwd to avoid repeated tmux queries
const dashboardWindowCache = new Map<string, { windowId: string; checkedAt: number }>();
const CACHE_TTL_MS = 30_000;

function getDashboardWindowId(cwd: string): string | null {
  const now = Date.now();
  const cached = dashboardWindowCache.get(cwd);
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached.windowId;
  }

  const homeSession = tmux.findHomeSession(cwd);
  if (!homeSession) return null;

  const windowId = tmux.getSessionOption(homeSession, '@sisyphus_dashboard');
  if (!windowId) return null;

  dashboardWindowCache.set(cwd, { windowId, checkedAt: now });
  return windowId;
}

export function invalidateDashboardCache(cwd: string): void {
  dashboardWindowCache.delete(cwd);
}

// ─── Main recompute ──────────────────────────────────────────────────────────

export function recomputeDots(): void {
  if (!getTrackedEntries) return;

  pruneCompleted();
  sisyphusPhases.clear();

  // Group tracked sessions by cwd
  const byCwd = new Map<string, Array<{ sessionId: string; windowId: string }>>();
  for (const entry of getTrackedEntries()) {
    if (!entry.windowId) continue;
    let group = byCwd.get(entry.cwd);
    if (!group) {
      group = [];
      byCwd.set(entry.cwd, group);
    }
    group.push({ sessionId: entry.id, windowId: entry.windowId });
  }

  // Add completed sessions
  for (const [sessionId, entry] of completedSessions) {
    if (!byCwd.has(entry.cwd)) {
      byCwd.set(entry.cwd, []);
    }
  }

  // Build map of tmux info for tracked entries
  const tmuxInfoMap = new Map<string, { name: string; id: string | undefined }>(); // sessionId -> tmux info
  for (const entry of getTrackedEntries()) {
    tmuxInfoMap.set(entry.id, { name: entry.tmuxSessionName, id: entry.tmuxSessionId });
  }

  // For each cwd, compute dots, write to dashboard window, and set per-session phase
  for (const [cwd, tracked] of byCwd) {
    const dots: SessionDot[] = [];
    const seenIds = new Set<string>();

    // Active/tracked sessions
    for (const { sessionId, windowId } of tracked) {
      seenIds.add(sessionId);
      try {
        const session = state.getSession(cwd, sessionId);
        const livePanes = tmux.listPanes(windowId);
        const livePaneIds = new Set(livePanes.map(p => p.paneId));
        const phase = detectPhase(session, livePaneIds);
        dots.push({ phase, createdAt: session.createdAt });

        const tmuxInfo = tmuxInfoMap.get(sessionId);
        if (tmuxInfo) {
          sisyphusPhases.set(sessionId, { phase, tmuxSession: tmuxInfo.name });
        }

        // Fire notification on transition to orchestrator:idle (waiting for input)
        const prevPhase = previousPhases.get(sessionId);
        if (phase === 'orchestrator:idle' && prevPhase !== 'orchestrator:idle') {
          const config = loadConfig(cwd);
          if (config.notifications?.enabled !== false) {
            const sessionName = session.name ?? sessionId.slice(0, 8);
            sendTerminalNotification('Sisyphus', `Waiting for input: ${sessionName}`, session.tmuxSessionName);
          }
        }
        previousPhases.set(sessionId, phase);
      } catch {
        // Session state unreadable — skip
      }
    }

    // Completed sessions (not already tracked)
    for (const [sessionId, entry] of completedSessions) {
      if (entry.cwd !== cwd || seenIds.has(sessionId)) continue;
      dots.push({ phase: 'completed', createdAt: entry.createdAt });
    }

    const dashboardWindowId = getDashboardWindowId(cwd);
    if (dashboardWindowId) {
      const rendered = dots.length > 0 ? ' ' + renderDots(dots) : '';
      tmux.setWindowOption(dashboardWindowId, '@sisyphus_dots', rendered);
    }
  }

  // Prune previousPhases for sessions no longer tracked
  for (const id of previousPhases.keys()) {
    if (!sisyphusPhases.has(id)) previousPhases.delete(id);
  }
}

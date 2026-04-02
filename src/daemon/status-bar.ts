import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as tmux from './tmux.js';
import { DOT_MAP, getSisyphusPhases, type SessionPhase } from './status-dots.js';

const CLAUDE_STATE_DIR = '/tmp/claude-tmux-state';
const SESSION_ORDER_PATH = join(homedir(), '.config', 'tmux', 'session-order');

// ─── Claude state reading ───────────────────────────────────────────────────

type ClaudeState = 'processing' | 'stopped' | 'idle';

const STATE_PRIORITY: Record<ClaudeState, number> = {
  processing: 3,
  stopped: 2,
  idle: 1,
};

const STATE_COLORS: Record<ClaudeState | 'none', string> = {
  processing: '#d4ad6a',
  stopped: '#d47766',
  idle: '#5e584e',
  none: '#5e584e',
};

function readClaudeState(paneId: string): ClaudeState | null {
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

// ─── Session ordering ───────────────────────────────────────────────────────

let sessionOrderCache: string[] | null = null;
let sessionOrderCacheTime = 0;
const SESSION_ORDER_CACHE_TTL = 30_000;

function getSessionOrder(): string[] {
  const now = Date.now();
  if (sessionOrderCache && now - sessionOrderCacheTime < SESSION_ORDER_CACHE_TTL) {
    return sessionOrderCache;
  }
  try {
    if (existsSync(SESSION_ORDER_PATH)) {
      sessionOrderCache = readFileSync(SESSION_ORDER_PATH, 'utf-8')
        .split('\n')
        .filter(Boolean);
    } else {
      sessionOrderCache = [];
    }
  } catch {
    sessionOrderCache = [];
  }
  sessionOrderCacheTime = now;
  return sessionOrderCache;
}

function orderSessions(sessions: string[], order: string[]): string[] {
  if (order.length === 0) return sessions.sort();
  const orderMap = new Map(order.map((name, idx) => [name, idx]));
  return [...sessions].sort((a, b) => {
    const aIdx = orderMap.get(a) ?? Infinity;
    const bIdx = orderMap.get(b) ?? Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
  });
}

// ─── Per-session rendering ──────────────────────────────────────────────────

function renderNormalSession(name: string, state: ClaudeState | 'none'): string {
  const color = STATE_COLORS[state];
  // Split style attributes into separate #[] calls — commas inside #[] break tmux #{?} conditionals
  const active = `#[fg=${color}]#[bg=#4a4d55]#[bold] ● ${name} #[default]`;
  const inactive = `#[fg=${color}]● ${name}`;
  return `#{?#{==:#{session_name},${name}},${active},${inactive}}`;
}

function renderSisyphusSession(tmuxName: string, phase: SessionPhase): string {
  const { icon, color } = DOT_MAP[phase];
  // Split style attributes into separate #[] calls — commas inside #[] break tmux #{?} conditionals
  const active = `#[fg=${color}]#[bg=#4a4d55]${icon} S#[default]`;
  const inactive = `#[fg=${color}]${icon} S`;
  return `#{?#{==:#{session_name},${tmuxName}},${active},${inactive}}`;
}

// ─── Main status bar write ──────────────────────────────────────────────────

export function writeStatusBar(): void {
  const allPanes = tmux.listAllPanes();
  const allSessions = tmux.listAllSessions();

  if (allSessions.length === 0) return;

  // Compute per-session Claude state from pane data
  const sessionStates = new Map<string, ClaudeState | 'none'>();
  for (const session of allSessions) {
    sessionStates.set(session, 'none');
  }
  for (const { sessionName, paneId } of allPanes) {
    const state = readClaudeState(paneId);
    if (!state) continue;
    const current = sessionStates.get(sessionName);
    if (!current || current === 'none' || STATE_PRIORITY[state] > STATE_PRIORITY[current as ClaudeState]) {
      sessionStates.set(sessionName, state);
    }
  }

  // Separate normal vs sisyphus sessions
  const phases = getSisyphusPhases();
  const sisyphusTmuxNames = new Set<string>();
  for (const { tmuxSession } of phases.values()) {
    sisyphusTmuxNames.add(tmuxSession);
  }

  const normalSessions: string[] = [];
  const sisyphusSessions: Array<{ tmuxName: string; phase: SessionPhase }> = [];

  for (const session of allSessions) {
    if (sisyphusTmuxNames.has(session)) {
      for (const entry of phases.values()) {
        if (entry.tmuxSession === session) {
          sisyphusSessions.push({ tmuxName: session, phase: entry.phase });
          break;
        }
      }
    } else if (!session.startsWith('ssyph_')) {
      normalSessions.push(session);
    }
  }

  // Order sessions
  const sessionOrder = getSessionOrder();
  const orderedNormal = orderSessions(normalSessions, sessionOrder);

  // Render
  const normalParts = orderedNormal.map(name => {
    const state = sessionStates.get(name) ?? 'none';
    return renderNormalSession(name, state);
  });

  const sisyphusParts = sisyphusSessions.map(({ tmuxName, phase }) =>
    renderSisyphusSession(tmuxName, phase),
  );

  const sections: string[] = [];
  if (normalParts.length > 0) sections.push(normalParts.join(' '));
  if (sisyphusParts.length > 0) sections.push(sisyphusParts.join(' '));

  const rendered = sections.join(' #[fg=#5e584e]│ ');

  tmux.setGlobalOption('@sisyphus_status', rendered);
}

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as tmux from './tmux.js';
import { DOT_MAP, getSisyphusPhases, getTotalRunningAgents, readClaudeState, type SessionPhase } from './status-dots.js';
import { loadCompanion } from './companion.js';
import { renderCompanion } from '../shared/companion-render.js';
import type { CompanionState } from '../shared/companion-types.js';

// ─── Companion flash state ──────────────────────────────────────────────────

let flashUntil = 0;
let flashText = '';

// ─── Companion cache (10s TTL) ──────────────────────────────────────────────

let cachedCompanion: CompanionState | null = null;
let companionCacheTime = 0;
const COMPANION_CACHE_TTL = 10_000;

function getCachedCompanion(): CompanionState {
  const now = Date.now();
  if (!cachedCompanion || now - companionCacheTime > COMPANION_CACHE_TTL) {
    cachedCompanion = loadCompanion();
    companionCacheTime = now;
  }
  return cachedCompanion;
}

export function flashCompanion(text: string, durationMs = 10_000): void {
  flashText = text;
  flashUntil = Date.now() + durationMs;
}

const SESSION_ORDER_PATH = join(homedir(), '.config', 'tmux', 'session-order');

// ─── Claude state types ─────────────────────────────────────────────────────

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

const SESSIONS_BG = '#252629';
const SISYPHUS_BG = '#36383e';
const COMPANION_BG = '#4a4d55';
const ACTIVE_SESSION_BG = '#3d3225';
const ACTIVE_TEXT = '#e2d9c6';
const INACTIVE_TEXT = '#b0a898';
const WINDOW_TAB_BG = '#2d2f33';
const WINDOW_TAB_ACTIVE_BG = '#4a4d55';
const STATUS_LEFT_BG = '#1d1e21';

function windowTabFormat(bg: string, text: string, active = false): string {
  const nextWindowIsActive = '#{e|==:#{active_window_index},#{e|+|:#{window_index},1}}';
  const rightArrowBg = active
    ? `#{?window_end_flag,${STATUS_LEFT_BG},${WINDOW_TAB_BG}}`
    : `#{?${nextWindowIsActive},${WINDOW_TAB_ACTIVE_BG},${STATUS_LEFT_BG}}`;
  const rightArrow = `#[fg=${bg}]#[bg=${rightArrowBg}]\uE0B0`;
  const name = active
    ? `#[fg=${text}]#[bg=${bg}]#[bold] #W#(~/.tmux/claude-status.sh '#{window_id}')#{@sisyphus_dots} #[nobold]`
    : `#[fg=${text}]#[bg=${bg}] #W#(~/.tmux/claude-status.sh '#{window_id}')#{@sisyphus_dots} `;
  return `${name}${rightArrow}`;
}

function renderNormalSession(name: string, state: ClaudeState | 'none', sectionBg: string): string {
  const color = STATE_COLORS[state];
  const active = `#[bg=${ACTIVE_SESSION_BG}]#[fg=${color}] ● #[fg=${ACTIVE_TEXT}]#[bold]${name}#[nobold] #[bg=${sectionBg}]`;
  const inactive = `#[fg=${color}] ● #[fg=${INACTIVE_TEXT}]${name} `;
  return `#{?#{==:#{session_name},${name}},${active},${inactive}}`;
}

function renderSisyphusSession(tmuxName: string, phase: SessionPhase, sectionBg: string): string {
  const { icon, color } = DOT_MAP[phase];
  const active = `#[bg=${ACTIVE_SESSION_BG}]#[fg=${color}] ${icon} #[fg=${ACTIVE_TEXT}]#[bold]S#[nobold] #[bg=${sectionBg}]`;
  const inactive = `#[fg=${color}] ${icon} #[fg=${INACTIVE_TEXT}]S `;
  return `#{?#{==:#{session_name},${tmuxName}},${active},${inactive}}`;
}

function renderSessionArrow(
  name: string,
  leftNeighborName: string | null,
  leftBg: string,
  sectionBg: string,
): string {
  const active = `#[fg=${ACTIVE_SESSION_BG}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]`;
  const afterActive = leftNeighborName
    ? `#[fg=${sectionBg}]#[bg=${ACTIVE_SESSION_BG}]\uE0B2#[bg=${sectionBg}]`
    : `#[fg=${sectionBg}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]`;

  if (!leftNeighborName) {
    return `#{?#{==:#{session_name},${name}},${active},${afterActive}}`;
  }

  return `#{?#{==:#{session_name},${name}},${active},#{?#{==:#{session_name},${leftNeighborName}},${afterActive},#[fg=${sectionBg}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]}}`;
}

function renderSessionBand(
  parts: Array<{ name: string; rendered: string }>,
  sectionBg: string,
  prevBg: string,
): { content: string; trailingName: string | null } {
  if (parts.length === 0) return { content: '', trailingName: null };

  let band = '';

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const leftNeighbor = i > 0 ? parts[i - 1]!.name : null;
    const leftBg = i > 0 ? sectionBg : prevBg;
    band += renderSessionArrow(part.name, leftNeighbor, leftBg, sectionBg);
    band += part.rendered;
  }

  return { content: band, trailingName: parts[parts.length - 1]!.name };
}

function renderSectionBoundary(targetBg: string, prevBg: string, trailingName: string | null): string {
  const inactive = `#[fg=${targetBg}]#[bg=${prevBg}]\uE0B2#[bg=${targetBg}]`;
  if (!trailingName) return inactive;
  const active = `#[fg=${targetBg}]#[bg=${ACTIVE_SESSION_BG}]\uE0B2#[bg=${targetBg}]`;
  return `#{?#{==:#{session_name},${trailingName}},${active},${inactive}}`;
}

// ─── Status-right integration ──────────────────────────────────────────────

const SISYPHUS_STATUS_REF = '#{E:@sisyphus_status}';
let statusIntegrated = false;

export function ensureStatusRightIntegration(): void {
  if (statusIntegrated) return;
  statusIntegrated = true;

  try {
    tmux.setGlobalOption('window-status-separator', '');
    tmux.setGlobalOption('window-status-format', windowTabFormat(WINDOW_TAB_BG, INACTIVE_TEXT));
    tmux.setGlobalOption('window-status-current-format', windowTabFormat(WINDOW_TAB_ACTIVE_BG, ACTIVE_TEXT, true));
  } catch { /* non-fatal */ }

  // Remove from status-left if present (prior injection location)
  try {
    const left = tmux.getGlobalOption('status-left');
    if (left?.includes('@sisyphus_status')) {
      tmux.setGlobalOption('status-left', left.replace(/\s*#\{E:@sisyphus_status\}/g, '').trim());
    }
  } catch { /* non-fatal */ }

  try {
    const current = tmux.getGlobalOption('status-right');
    if (!current || current.includes('@sisyphus_status')) return;

    let updated = current.replace(/#\[fg=/, `${SISYPHUS_STATUS_REF} #[fg=`);
    if (updated === current) updated = SISYPHUS_STATUS_REF + current;
    tmux.setGlobalOption('status-right', updated);

    try {
      const lengthStr = tmux.getGlobalOption('status-right-length');
      const length = parseInt(lengthStr ?? '120', 10);
      if (length < 250) {
        tmux.setGlobalOption('status-right-length', '250');
      }
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }
}

// ─── Main status bar write ──────────────────────────────────────────────────

export function writeStatusBar(): void {
  ensureStatusRightIntegration();

  const now = Date.now();

  // ─── Flash takeover: replace entire bar with face + commentary ───────────
  if (now < flashUntil) {
    let rendered = '';
    try {
      const companion = getCachedCompanion();
      const facePart = renderCompanion(companion, ['face', 'boulder'], {
        tmuxFormat: true,
        agentCount: getTotalRunningAgents(),
      });
      const commentary = flashText || companion.lastCommentary?.text || '';
      rendered = `#[fg=${COMPANION_BG}]#[bg=default]\uE0B2#[bg=${COMPANION_BG}] ${facePart} #[fg=${INACTIVE_TEXT}] ${commentary}#[default]`;
    } catch { /* non-fatal */ }
    tmux.setGlobalOption('@sisyphus_status', rendered);
    return;
  }

  // Clear expired flash
  if (flashUntil !== 0) {
    flashText = '';
    flashUntil = 0;
  }

  // ─── Normal status bar ───────────────────────────────────────────────────
  const allPanes = tmux.listAllPanes();
  const allSessions = tmux.listAllSessions();
  if (allSessions.length === 0) return;

  // Per-session Claude state (highest priority wins)
  const sessionStates = new Map<string, ClaudeState>();
  for (const { sessionName, paneId } of allPanes) {
    const state = readClaudeState(paneId);
    if (!state) continue;
    const current = sessionStates.get(sessionName);
    if (!current || STATE_PRIORITY[state] > STATE_PRIORITY[current]) {
      sessionStates.set(sessionName, state);
    }
  }

  // Classify sessions into normal vs sisyphus
  const phases = getSisyphusPhases();
  const tmuxToPhase = new Map<string, SessionPhase>();
  for (const { tmuxSession, phase } of phases.values()) {
    tmuxToPhase.set(tmuxSession, phase);
  }

  const normalSessions: string[] = [];
  const sisyphusSessions: Array<{ tmuxName: string; phase: SessionPhase }> = [];
  for (const session of allSessions) {
    const phase = tmuxToPhase.get(session);
    if (phase) {
      sisyphusSessions.push({ tmuxName: session, phase });
    } else if (!session.startsWith('ssyph_')) {
      normalSessions.push(session);
    }
  }

  // Render per-session items
  const orderedNormal = orderSessions(normalSessions, getSessionOrder());
  const normalParts = orderedNormal.map(name => ({
    name,
    rendered: renderNormalSession(name, sessionStates.get(name) ?? 'none', SESSIONS_BG),
  }));
  const sisyphusParts = sisyphusSessions.map(({ tmuxName, phase }) => ({
    name: tmuxName,
    rendered: renderSisyphusSession(tmuxName, phase, SISYPHUS_BG),
  }));

  // Companion face + boulder
  let companionStr = '';
  try {
    companionStr = renderCompanion(getCachedCompanion(), ['face', 'boulder'], {
      maxWidth: 20,
      tmuxFormat: true,
      agentCount: getTotalRunningAgents(),
    });
  } catch { /* non-fatal */ }

  // Build powerline with inward-pointing arrows
  let rendered = '';
  let prevBg = 'default';
  let trailingSessionName: string | null = null;

  if (normalParts.length > 0) {
    const band = renderSessionBand(normalParts, SESSIONS_BG, prevBg);
    rendered += band.content;
    prevBg = SESSIONS_BG;
    trailingSessionName = band.trailingName;
  }

  if (sisyphusParts.length > 0) {
    rendered += renderSectionBoundary(SISYPHUS_BG, prevBg, trailingSessionName);
    const band = renderSessionBand(sisyphusParts, SISYPHUS_BG, SISYPHUS_BG);
    rendered += band.content;
    prevBg = SISYPHUS_BG;
    trailingSessionName = band.trailingName;
  }

  if (companionStr) {
    rendered += renderSectionBoundary(COMPANION_BG, prevBg, trailingSessionName);
    rendered += ` ${companionStr} `;
    prevBg = COMPANION_BG;
  }

  if (prevBg !== 'default') {
    rendered += '#[default]';
  }

  tmux.setGlobalOption('@sisyphus_status', rendered);
}

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as tmux from './tmux.js';
import { DOT_MAP, getSisyphusPhases, getTotalRunningAgents, type SessionPhase } from './status-dots.js';
import { loadCompanion } from './companion.js';
import { renderCompanion, getBaseForm, getMoodFace, getStatCosmetics, composeLine, getBoulderForm } from '../shared/companion-render.js';
import type { CompanionField, CompanionState, Mood } from '../shared/companion-types.js';

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

// Powerline section bg colors (gradient across sections)
const SESSIONS_BG = '#252629';       // gloam bg1
const SISYPHUS_BG = '#36383e';       // gloam bg3
const COMPANION_BG = '#4a4d55';      // gloam bg5
const ACTIVE_SESSION_BG = '#3d3225'; // warm bg3-level
const ACTIVE_TEXT = '#e2d9c6';
const INACTIVE_TEXT = '#b0a898';

const MOOD_TMUX_COLORS: Record<Mood, string> = {
  happy: 'green',
  grinding: 'yellow',
  frustrated: 'red',
  zen: 'cyan',
  sleepy: 'colour245',
  excited: 'white',
  existential: 'magenta',
};

function renderNormalSession(name: string, state: ClaudeState | 'none', sectionBg: string): string {
  const color = STATE_COLORS[state];
  // Split attrs — commas inside #[] break tmux #{?} conditionals.
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

// ─── Status-right integration ──────────────────────────────────────────────

const SISYPHUS_STATUS_REF = '#{E:@sisyphus_status}';
let statusIntegrated = false;

export function ensureStatusRightIntegration(): void {
  if (statusIntegrated) return;
  statusIntegrated = true;

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

    // Insert before the time section (the first #[fg= block)
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

  // ─── Flash takeover: replace entire bar with face + commentary ───────────
  const now = Date.now();
  const isFlashing = now < flashUntil;

  if (isFlashing) {
    let rendered = '';
    try {
      const companion = getCachedCompanion();
      const agentCount = getTotalRunningAgents();

      const baseForm = getBaseForm(companion.level);
      const face = getMoodFace(companion.mood);
      const bodyWithFace = baseForm.replace('FACE', face);
      const cosmetics = getStatCosmetics(companion.stats);
      const boulder = getBoulderForm(agentCount);
      const facePart = composeLine(bodyWithFace, cosmetics, boulder);

      const moodColor = MOOD_TMUX_COLORS[companion.mood];
      const commentary = flashText || companion.lastCommentary?.text || '';

      rendered = `#[fg=${COMPANION_BG}]#[bg=default]\uE0B2`
        + `#[bg=${COMPANION_BG}]`
        + `#[fg=${moodColor}] ${facePart} `
        + `#[fg=${INACTIVE_TEXT}] ${commentary}`
        + `#[default]`;
    } catch { /* non-fatal */ }
    tmux.setGlobalOption('@sisyphus_status', rendered);
    return;
  }

  // ─── Clear expired flash state ───────────────────────────────────────────
  if (flashUntil !== 0) {
    flashText = '';
    flashUntil = 0;
  }

  // ─── Normal status bar ───────────────────────────────────────────────────
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

  // Render per-session items (fg only — bg set by section bands)
  const normalParts = orderedNormal.map(name => {
    const state = sessionStates.get(name) ?? 'none';
    return renderNormalSession(name, state, SESSIONS_BG);
  });

  const sisyphusParts = sisyphusSessions.map(({ tmuxName, phase }) =>
    renderSisyphusSession(tmuxName, phase, SISYPHUS_BG),
  );

  // Companion (normal mode — face + boulder, 20 char max)
  let companionStr = '';
  try {
    const companion = getCachedCompanion();
    const fields: CompanionField[] = ['face', 'boulder'];
    companionStr = renderCompanion(companion, fields, { maxWidth: 20, tmuxFormat: true, agentCount: getTotalRunningAgents() });
  } catch { /* companion render failures are non-fatal */ }

  // Build powerline with inward-pointing arrows (left-pointing \uE0B2 at section start)
  let rendered = '';
  let prevBg = 'default';

  if (normalParts.length > 0) {
    rendered += `#[fg=${SESSIONS_BG}]#[bg=${prevBg}]\uE0B2#[bg=${SESSIONS_BG}]${normalParts.join('')} `;
    prevBg = SESSIONS_BG;
  }

  if (sisyphusParts.length > 0) {
    rendered += `#[fg=${SISYPHUS_BG}]#[bg=${prevBg}]\uE0B2#[bg=${SISYPHUS_BG}]${sisyphusParts.join('')} `;
    prevBg = SISYPHUS_BG;
  }

  if (companionStr) {
    rendered += `#[fg=${COMPANION_BG}]#[bg=${prevBg}]\uE0B2#[bg=${COMPANION_BG}] ${companionStr} `;
    prevBg = COMPANION_BG;
  }

  if (prevBg !== 'default') {
    rendered += '#[default]';
  }

  tmux.setGlobalOption('@sisyphus_status', rendered);
}

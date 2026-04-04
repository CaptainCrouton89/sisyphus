import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as tmux from '../tmux.js';
import { readClaudeState, getSisyphusPhases } from '../status-dots.js';
import { loadCompanion } from '../companion.js';
import type { CompanionState } from '../../shared/companion-types.js';
import { execSafe } from '../../shared/exec.js';
import { shellQuote } from '../../shared/shell.js';
import type {
  Segment,
  ExternalSegment,
  RenderContext,
  StatusBarConfig,
  ClaudeState,
  Side,
} from './types.js';

// The background color behind the tmux status bar (status-style bg).
// Arrows at powerline edges need this as the "outside" color.
export const STATUS_BAR_BG = '#1d1e21';

// ─── Session ordering ──────────────────────────────────────────────────────────

const SESSION_ORDER_PATH = join(homedir(), '.config', 'tmux', 'session-order');

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

// ─── Companion cache ───────────────────────────────────────────────────────────

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

// ─── Claude state priority ─────────────────────────────────────────────────────

const STATE_PRIORITY: Record<ClaudeState, number> = {
  processing: 3,
  stopped: 2,
  idle: 1,
};

// ─── Window listing ────────────────────────────────────────────────────────────

function listWindowsForSession(sessionName: string): Array<{ index: number; name: string; id: string }> {
  const output = execSafe(`tmux list-windows -t ${shellQuote(sessionName)} -F "#{window_index} #{window_id} #{window_name}"`);
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const parts = line.split(' ');
    const index = parseInt(parts[0]!, 10);
    const id = parts[1]!;
    const name = parts.slice(2).join(' ');
    return { index, id, name };
  });
}

// ─── Powerline helpers ─────────────────────────────────────────────────────────

/**
 * Right-pointing powerline arrow (left side, \uE0B0).
 * Transitions from `fromBg` to `toBg`.
 */
function leftArrow(fromBg: string, toBg: string): string {
  return `#[fg=${fromBg}]#[bg=${toBg}]\uE0B0`;
}

/**
 * Left-pointing powerline arrow (right side, \uE0B2).
 * Transitions from `fromBg` (left/outer) to `toBg` (right/inner).
 * The arrow fg is `toBg` (the band we're entering), bg is `fromBg`.
 */
function rightArrow(fromBg: string, toBg: string): string {
  return `#[fg=${toBg}]#[bg=${fromBg}]\uE0B2`;
}

/**
 * Cross-band boundary arrow for the right side (left-pointing, \uE0B2).
 * If `trailingName` is the active session, renders with ACTIVE_SESSION_BG.
 * Otherwise renders the normal inactive transition.
 *
 * Ported from `renderSectionBoundary()` in status-bar.ts.
 */
function renderSectionBoundary(
  targetBg: string,
  prevBg: string,
  trailingName: string | null,
  activeBg: string,
): string {
  const inactive = `#[fg=${targetBg}]#[bg=${prevBg}]\uE0B2#[bg=${targetBg}]`;
  if (!trailingName) return inactive;
  const active = `#[fg=${targetBg}]#[bg=${activeBg}]\uE0B2#[bg=${targetBg}]`;
  return `#{?#{==:#{session_name},${trailingName}},${active},${inactive}}`;
}

/**
 * Intra-band arrow for a session within a band.
 * The arrow preceding session `name` is colored based on:
 * - If `name` is the active session: arrow uses ACTIVE_SESSION_BG as bg
 * - If `leftNeighborName` is the active session: arrow bg is ACTIVE_SESSION_BG to close the highlight
 * - Otherwise: arrow is invisible (fg=sectionBg)
 *
 * Ported from `renderSessionArrow()` in status-bar.ts.
 */
function renderSessionArrow(
  name: string,
  leftNeighborName: string | null,
  leftBg: string,
  sectionBg: string,
  activeBg: string,
): string {
  const active = `#[fg=${activeBg}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]`;
  const afterActive = leftNeighborName
    ? `#[fg=${sectionBg}]#[bg=${activeBg}]\uE0B2#[bg=${sectionBg}]`
    : `#[fg=${sectionBg}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]`;

  if (!leftNeighborName) {
    return `#{?#{==:#{session_name},${name}},${active},${afterActive}}`;
  }

  return `#{?#{==:#{session_name},${name}},${active},#{?#{==:#{session_name},${leftNeighborName}},${afterActive},#[fg=${sectionBg}]#[bg=${leftBg}]\uE0B2#[bg=${sectionBg}]}}`;
}

// ─── Compositor ────────────────────────────────────────────────────────────────

export class Compositor {
  private segments = new Map<string, Segment>();
  private external = new Map<string, ExternalSegment>();
  private config: StatusBarConfig;
  private initialized = false;

  constructor(config: StatusBarConfig) {
    this.config = config;
  }

  register(segment: Segment): void {
    this.segments.set(segment.id, segment);
  }

  registerExternal(ext: ExternalSegment): void {
    this.external.set(ext.id, ext);
  }

  updateExternal(id: string, content: string): void {
    const ext = this.external.get(id);
    if (!ext) throw new Error(`External segment not registered: ${id}`);
    ext.content = content;
  }

  unregisterExternal(id: string): void {
    this.external.delete(id);
  }

  render(): void {
    if (!this.initialized) {
      this.initialize();
      this.initialized = true;
    }

    const ctx = this.buildContext();

    // Right side: global, written directly to status-right
    const rightResult = this.composeRight(ctx);
    tmux.setGlobalOption('status-right', rightResult);

    // Left side: per-session, written as @sisyphus_left session option on each tmux session
    // status-left globally set to #{E:@sisyphus_left}
    for (const session of ctx.allSessions) {
      const sessionCtx = this.buildSessionContext(ctx, session.name);
      const leftResult = this.composeLeft(sessionCtx, session.name);
      tmux.setSessionOption(session.name, '@sisyphus_left', leftResult);
    }
    tmux.setGlobalOption('status-left', '#{E:@sisyphus_left}');
  }

  private initialize(): void {
    // Disable built-in window list (we render it in the windows segment)
    tmux.setGlobalOption('window-status-format', '');
    tmux.setGlobalOption('window-status-current-format', '');
    tmux.setGlobalOption('window-status-separator', '');
    tmux.setGlobalOption('status-left-length', '250');
    tmux.setGlobalOption('status-right-length', '250');
  }

  private buildContext(): RenderContext {
    const allPanes = tmux.listAllPanes();
    const allSessionEntries = tmux.listAllSessions();
    const allSessions = allSessionEntries.map(e => ({ name: e.name }));

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

    const sisyphusPhases = getSisyphusPhases();
    const sessionOrder = getSessionOrder();
    const companion = getCachedCompanion();

    // Build windows map for all sessions
    const windowsBySession = new Map<string, Array<{ index: number; name: string; id: string }>>();
    for (const session of allSessions) {
      windowsBySession.set(session.name, listWindowsForSession(session.name));
    }

    return {
      allSessions,
      allPanes,
      sessionStates,
      sisyphusPhases,
      sessionOrder,
      companion,
      config: this.config,
      windowsBySession,
      prevBg: STATUS_BAR_BG,
    };
  }

  /**
   * Build a session-specific RenderContext for left-side rendering.
   * Overrides windowsBySession to only include the target session's windows,
   * and filters allSessions/allPanes to the target session.
   */
  private buildSessionContext(ctx: RenderContext, sessionName: string): RenderContext {
    return {
      ...ctx,
      allSessions: ctx.allSessions.filter(s => s.name === sessionName),
    };
  }

  /**
   * Compose the left side for a specific tmux session.
   * Renders left-pointing (right-arrow) powerline bands.
   */
  private composeLeft(ctx: RenderContext, sessionName: string): string {
    const ids = this.config.left;
    const orderedSegments = this.getOrderedSegments('left', ids);

    if (orderedSegments.length === 0) return '';

    const rendered: Array<{ bg: string; content: string; includesArrows?: boolean }> = [];
    let trackBg = STATUS_BAR_BG;
    for (const seg of orderedSegments) {
      ctx.prevBg = trackBg;
      const output = 'render' in seg ? seg.render(ctx) : { content: seg.content };
      if (!output.content) continue;
      const configBg = this.config.segments[seg.id]?.bg;
      const effectiveBg = configBg ?? seg.bg;
      rendered.push({ bg: effectiveBg, content: output.content, includesArrows: output.includesArrows });
      trackBg = effectiveBg;
    }

    if (rendered.length === 0) return '';

    // Left side: right-pointing arrows (\uE0B0), bands go left to right
    let result = '';
    let prevBg = STATUS_BAR_BG;
    let isFirst = true;

    for (const band of rendered) {
      if (band.includesArrows) {
        result += band.content;
      } else if (isFirst) {
        // First segment: no entry arrow, just set bg directly
        result += `#[bg=${band.bg}]`;
        result += band.content;
      } else {
        result += leftArrow(prevBg, band.bg);
        result += band.content;
      }
      prevBg = band.bg;
      isFirst = false;
    }

    // Close — skip if last segment handled its own arrows
    const lastBand = rendered[rendered.length - 1]!;
    if (!lastBand.includesArrows) {
      result += leftArrow(prevBg, STATUS_BAR_BG);
    }
    result += '#[default]';

    return result;
  }

  /**
   * Compose the right side globally.
   * Renders left-pointing powerline bands with session-aware arrow transitions.
   */
  private composeRight(ctx: RenderContext): string {
    const ids = this.config.right;
    const orderedSegments = this.getOrderedSegments('right', ids);

    if (orderedSegments.length === 0) return '';

    const activeBg = this.config.colors.activeBg;

    // Render each segment
    const rendered: Array<{ bg: string; content: string; trailingName?: string }> = [];
    for (const seg of orderedSegments) {
      const output = 'render' in seg ? seg.render(ctx) : { content: seg.content };
      if (!output.content) continue;
      const configBg = this.config.segments[seg.id]?.bg;
      const effectiveBg = configBg ?? seg.bg;
      rendered.push({ bg: effectiveBg, content: output.content, trailingName: output.trailingName });
    }

    if (rendered.length === 0) return '';

    // Right side: left-pointing arrows (\uE0B2)
    // Bands are rendered right-to-left visually (rightmost band first in string = closest to right edge)
    // But we build the string left-to-right: first band is leftmost (farthest from right edge)
    let result = '';
    let prevBg = 'default';
    let trailingName: string | null = null;

    for (const band of rendered) {
      if (prevBg === 'default') {
        // First band: arrow from default bg
        result += `#[fg=${band.bg}]#[bg=default]\uE0B2#[bg=${band.bg}]`;
      } else {
        result += renderSectionBoundary(band.bg, prevBg, trailingName, activeBg);
      }
      result += band.content;
      prevBg = band.bg;
      if (band.trailingName !== undefined) {
        trailingName = band.trailingName ?? null;
      }
    }

    result += '#[default]';

    return result;
  }

  /**
   * Get ordered segments for a side.
   * Order: config array position first, then priority for unregistered segments.
   */
  private getOrderedSegments(side: Side, configIds: string[]): Array<Segment | ExternalSegment> {
    const result: Array<Segment | ExternalSegment> = [];
    const seen = new Set<string>();

    // Config-ordered first
    for (const id of configIds) {
      const seg = this.segments.get(id) ?? this.external.get(id);
      if (seg && seg.side === side) {
        result.push(seg);
        seen.add(id);
      }
    }

    // Remaining registered segments not in config, sorted by priority
    const remaining: Array<Segment | ExternalSegment> = [];
    for (const [id, seg] of this.segments) {
      if (seg.side === side && !seen.has(id)) remaining.push(seg);
    }
    for (const [id, seg] of this.external) {
      if (seg.side === side && !seen.has(id)) remaining.push(seg);
    }
    remaining.sort((a, b) => a.priority - b.priority);
    result.push(...remaining);

    return result;
  }

  /**
   * Build a session band with intra-band session arrows.
   * Used by segment implementations that render session lists.
   * Exported as a static helper so segments can use it without circular deps.
   */
  static renderSessionBand(
    parts: Array<{ name: string; rendered: string }>,
    sectionBg: string,
    prevBg: string,
    activeBg: string,
  ): { content: string; trailingName: string | null } {
    if (parts.length === 0) return { content: '', trailingName: null };

    let band = '';

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      const leftNeighbor = i > 0 ? parts[i - 1]!.name : null;
      const leftBg = i > 0 ? sectionBg : prevBg;
      band += renderSessionArrow(part.name, leftNeighbor, leftBg, sectionBg, activeBg);
      band += part.rendered;
    }

    return { content: band, trailingName: parts[parts.length - 1]!.name };
  }
}

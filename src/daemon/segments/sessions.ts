import type { Segment, RenderContext, SegmentOutput } from './types.js';
import { Compositor } from './compositor.js';

// ─── Session ordering ──────────────────────────────────────────────────────────

function orderSessions(sessions: string[], order: string[]): string[] {
  if (order.length === 0) return [...sessions].sort();
  const orderMap = new Map(order.map((name, idx) => [name, idx]));
  return [...sessions].sort((a, b) => {
    const aIdx = orderMap.get(a) ?? Infinity;
    const bIdx = orderMap.get(b) ?? Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
  });
}

// ─── Session rendering ─────────────────────────────────────────────────────────

function renderNormalSession(
  name: string,
  color: string,
  activeBg: string,
  activeText: string,
  inactiveText: string,
  sectionBg: string,
): string {
  const active = `#[bg=${activeBg}]#[fg=${color}] ● #[fg=${activeText}]#[bold]${name}#[nobold] #[bg=${sectionBg}]`;
  const inactive = `#[fg=${color}] ● #[fg=${inactiveText}]${name} `;
  return `#{?#{==:#{session_name},${name}},${active},${inactive}}`;
}

// ─── Segment implementation ────────────────────────────────────────────────────

class SessionsSegment implements Segment {
  readonly id = 'sessions';
  readonly side = 'right' as const;
  readonly priority = 100;
  readonly bg: string;

  constructor(bg: string) {
    this.bg = bg;
  }

  render(ctx: RenderContext): SegmentOutput {
    const { allSessions, sisyphusPhases, sessionOrder, sessionStates, config } = ctx;
    const { colors } = config;

    // Build set of tmux session names that belong to sisyphus sessions
    const sisyphusTmuxNames = new Set<string>();
    for (const { tmuxSession } of sisyphusPhases.values()) {
      sisyphusTmuxNames.add(tmuxSession);
    }

    // Filter to normal (non-sisyphus) sessions
    const normalNames = allSessions
      .map(s => s.name)
      .filter(name => !sisyphusTmuxNames.has(name) && !name.startsWith('ssyph_'));

    if (normalNames.length === 0) {
      return { content: '' };
    }

    const ordered = orderSessions(normalNames, sessionOrder);

    const parts = ordered.map(name => {
      const state = sessionStates.get(name);
      let color: string;
      switch (state) {
        case 'processing': color = colors.processing; break;
        case 'stopped':    color = colors.stopped;    break;
        default:           color = colors.idle;        break;
      }
      return {
        name,
        rendered: renderNormalSession(
          name,
          color,
          colors.activeBg,
          colors.activeText,
          colors.inactiveText,
          this.bg,
        ),
      };
    });

    const { content, trailingName } = Compositor.renderSessionBand(
      parts,
      this.bg,
      this.bg,     // compositor already drew the entry arrow; use sectionBg to suppress the first intra-band arrow
      colors.activeBg,
    );

    return {
      content,
      trailingName: trailingName === null ? undefined : trailingName,
    };
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the sessions segment.
 * Pass `ctx.config.segments.sessions?.bg` (or the DEFAULT_STATUS_BAR_CONFIG value)
 * as `bg` — the compositor uses this value for cross-band arrow color transitions.
 */
export function createSessionsSegment(bg: string): Segment {
  return new SessionsSegment(bg);
}

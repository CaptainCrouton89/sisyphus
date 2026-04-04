import { DOT_MAP } from '../status-dots.js';
import { Compositor } from './compositor.js';
import { DEFAULT_STATUS_BAR_CONFIG } from './types.js';
import type { Segment, SegmentOutput, RenderContext } from './types.js';

const SEGMENT_ID = 'sisyphus-sessions';
const DEFAULT_BG = DEFAULT_STATUS_BAR_CONFIG.segments[SEGMENT_ID]!.bg!;

export function createSisyphusSessionsSegment(): Segment {
  return {
    id: SEGMENT_ID,
    side: 'right',
    priority: 200,
    bg: DEFAULT_BG,

    render(ctx: RenderContext): SegmentOutput {
      const segCfg = ctx.config.segments[SEGMENT_ID];
      const sectionBg = (segCfg?.bg !== undefined) ? segCfg.bg : DEFAULT_BG;
      const { activeBg, activeText, inactiveText } = ctx.config.colors;

      if (ctx.sisyphusPhases.size === 0) {
        return { content: '' };
      }

      const parts: Array<{ name: string; rendered: string }> = [];

      for (const { phase, tmuxSession } of ctx.sisyphusPhases.values()) {
        const { icon, color } = DOT_MAP[phase];
        const active =
          `#[bg=${activeBg}]#[fg=${color}] ${icon} #[fg=${activeText}]#[bold]S#[nobold] #[bg=${sectionBg}]`;
        const inactive =
          `#[fg=${color}] ${icon} #[fg=${inactiveText}]S `;
        const rendered =
          `#{?#{==:#{session_name},${tmuxSession}},${active},${inactive}}`;
        parts.push({ name: tmuxSession, rendered });
      }

      // prevBg is sectionBg because renderSectionBoundary already emitted the
      // cross-band arrow before this segment's content is inserted.
      const { content, trailingName } = Compositor.renderSessionBand(
        parts,
        sectionBg,
        sectionBg,
        activeBg,
      );

      return {
        content,
        trailingName: trailingName !== null ? trailingName : undefined,
      };
    },
  };
}

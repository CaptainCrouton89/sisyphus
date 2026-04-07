import { renderCompanion } from '../../shared/companion-render.js';
import type { Segment, SegmentOutput, RenderContext } from './types.js';

const DEFAULT_BG = '#4a4d55';

export function createCompanionSegment(): Segment {
  return {
    id: 'companion',
    side: 'right',
    priority: 300,
    bg: DEFAULT_BG,
    render(ctx: RenderContext): SegmentOutput {
      const { companion } = ctx;
      const fields: Parameters<typeof renderCompanion>[1] =
        ctx.sisyphusPhases.size > 0
          ? ['face', 'boulder', 'verb']
          : ['face', 'boulder', 'hobby'];

      let companionStr: string;
      try {
        companionStr = renderCompanion(companion, fields, {
          maxWidth: 38,
          tmuxFormat: true,
          agentCount: ctx.companion.recentActiveAgents ?? 0,
          verbIndex: companion.spinnerVerbIndex,
        });
      } catch {
        return { content: '' };
      }

      if (!companionStr) {
        return { content: '' };
      }

      return { content: ` ${companionStr} ` };
    },
  };
}

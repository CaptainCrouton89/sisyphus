import type { Segment, RenderContext, SegmentOutput } from './types.js';

export function createSessionNameSegment(): Segment {
  return {
    id: 'session-name',
    side: 'left',
    priority: 50,
    bg: '#4a4d55',

    render(ctx: RenderContext): SegmentOutput {
      const bg = ctx.config.segments['session-name']?.bg ?? '#4a4d55';
      const activeText = ctx.config.colors.activeText;
      return {
        content: `#[fg=${activeText}]#[bg=${bg}]#[bold] #{session_name} #[nobold]`,
      };
    },
  };
}

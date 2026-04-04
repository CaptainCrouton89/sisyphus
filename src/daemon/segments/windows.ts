import * as tmux from '../tmux.js';
import { readClaudeState } from '../status-dots.js';
import type { Segment, RenderContext, SegmentOutput } from './types.js';

/**
 * Renders window tabs for the current tmux session on the left side.
 * Uses #{active_window_index} conditionals for active tab highlighting and
 * powerline arrows between tabs. Pane dots are computed at render time.
 * Handles its own entry/exit arrows so they participate in active-window conditionals.
 */
export function createWindowsSegment(): Segment {
  return {
    id: 'windows',
    side: 'left',
    priority: 100,

    bg: '#2d2f33',

    render(ctx: RenderContext): SegmentOutput {
      const bg = ctx.config.segments.windows?.bg ?? '#2d2f33';
      const activeBg = ctx.config.segments.windows?.activeBg ?? '#4a4d55';
      const activeText = ctx.config.colors.activeText;
      const inactiveText = ctx.config.colors.inactiveText;

      const sessionName = ctx.allSessions[0]?.name;
      if (!sessionName) return { content: '' };

      const windows = ctx.windowsBySession.get(sessionName);
      if (!windows || windows.length === 0) return { content: '' };

      // Pre-compute pane dots per window
      const windowDots = new Map<number, string>();
      for (const win of windows) {
        const panes = tmux.listWindowPanes(win.id);
        let dots = '';
        for (const { paneId } of panes) {
          const state = readClaudeState(paneId);
          if (!state) continue;
          const color = ctx.config.colors[state];
          dots += `#[fg=${color}]●`;
        }
        windowDots.set(win.index, dots);
      }

      // Build tab content for each window
      const tabs: Array<{ index: number; active: string; inactive: string }> = [];
      for (const win of windows) {
        const dots = windowDots.get(win.index) ?? '';
        const dotsStr = dots ? ` ${dots}` : '';
        const displayName = win.name.replace(/\s*\(.*?\)\s*$/, '');
        const active = `#[fg=${activeText}]#[bg=${activeBg}]#[bold] ${displayName}${dotsStr} #[nobold]`;
        const inactive = `#[fg=${inactiveText}]#[bg=${bg}] ${displayName}${dotsStr} `;
        tabs.push({ index: win.index, active, inactive });
      }

      let content = '';
      const firstIdx = tabs[0]!.index;
      const lastIdx = tabs[tabs.length - 1]!.index;

      // Entry arrow: prevBg → bg or activeBg (conditional on first tab active)
      const fromBg = ctx.prevBg;
      content += `#{?#{==:#{active_window_index},${firstIdx}},` +
        `#[fg=${fromBg}]#[bg=${activeBg}]\uE0B0,` +
        `#[fg=${fromBg}]#[bg=${bg}]\uE0B0}`;

      for (let i = 0; i < tabs.length; i += 1) {
        const tab = tabs[i]!;
        const idx = tab.index;

        // Arrow before this tab (between tabs, not before the first)
        if (i > 0) {
          const prevIdx = tabs[i - 1]!.index;
          const arrowActiveLeft = `#[fg=${activeBg}]#[bg=${bg}]\uE0B0`;
          const arrowActiveRight = `#[fg=${bg}]#[bg=${activeBg}]\uE0B0`;
          const arrowInactive = `#[fg=${bg}]#[bg=${bg}]\uE0B0`;

          const arrow =
            `#{?#{==:#{active_window_index},${prevIdx}},${arrowActiveLeft},` +
            `#{?#{==:#{active_window_index},${idx}},${arrowActiveRight},${arrowInactive}}}`;
          content += arrow;
        }

        // Tab content (conditional on active_window_index)
        content += `#{?#{==:#{active_window_index},${idx}},${tab.active},${tab.inactive}}`;
      }

      // Sisyphus session dots for the window
      content += '#{@sisyphus_dots}';

      // Exit arrow: bg or activeBg → statusBarBg (conditional on last tab active)
      const statusBarBg = '#1d1e21';
      content += `#{?#{==:#{active_window_index},${lastIdx}},` +
        `#[fg=${activeBg}]#[bg=${statusBarBg}]\uE0B0,` +
        `#[fg=${bg}]#[bg=${statusBarBg}]\uE0B0}`;

      return { content, includesArrows: true };
    },
  };
}

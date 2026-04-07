import type { SessionPhase } from '../status-dots.js';
import type { CompanionState } from '../../shared/companion-types.js';

export type Side = 'left' | 'right';
export type ClaudeState = 'processing' | 'stopped' | 'idle';

export interface SegmentOutput {
  content: string;        // tmux format string (no bg/arrows — compositor handles those)
  trailingName?: string;  // last session/item name, for active-highlight arrow transitions at band boundaries
  includesArrows?: boolean; // if true, segment rendered its own entry/exit arrows — compositor skips them
}

export interface Segment {
  id: string;
  side: Side;
  priority: number;       // lower = further from center
  bg: string;             // hex color for powerline band
  render(ctx: RenderContext): SegmentOutput;
}

export interface ExternalSegment {
  id: string;
  side: Side;
  priority: number;
  bg: string;
  content: string;        // static tmux format string, updated via protocol
}

export interface StatusBarColors {
  processing: string;
  stopped: string;
  idle: string;
  activeBg: string;
  activeText: string;
  inactiveText: string;
}

export interface SegmentConfig {
  bg?: string;
  activeBg?: string;
  [key: string]: unknown;
}

export interface StatusBarConfig {
  enabled: boolean;
  colors: StatusBarColors;
  left: string[];
  right: string[];
  segments: Record<string, SegmentConfig>;
}

export interface RenderContext {
  allSessions: Array<{ name: string }>;
  allPanes: Array<{ sessionName: string; paneId: string }>;
  sessionStates: Map<string, ClaudeState>;
  sisyphusPhases: ReadonlyMap<string, { phase: SessionPhase; tmuxSession: string }>;
  sessionOrder: string[];
  companion: CompanionState;
  config: StatusBarConfig;
  windowsBySession: Map<string, Array<{ index: number; name: string; id: string }>>;
  prevBg: string; // bg of the preceding segment (or STATUS_BAR_BG if first) — set by compositor per segment
}

export const DEFAULT_STATUS_BAR_CONFIG: StatusBarConfig = {
  enabled: true,
  colors: {
    processing: '#d4ad6a',
    stopped: '#a9b16e',
    idle: '#5e584e',
    activeBg: '#3d3225', // gloam.sel_yellow
    activeText: '#e2d9c6',
    inactiveText: '#b0a898',
  },
  left: ['session-name', 'windows'],
  right: ['sessions', 'sisyphus-sessions', 'companion'],
  segments: {
    sessions: { bg: '#252629' },
    'sisyphus-sessions': { bg: '#36383e' },
    companion: { bg: '#4a4d55' },
    'session-name': { bg: '#4a4d55' },
    windows: { bg: '#2d2f33', activeBg: '#3d3225' /* gloam.sel_yellow */ },
  },
};

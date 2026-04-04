export type {
  Side,
  ClaudeState,
  SegmentOutput,
  Segment,
  ExternalSegment,
  StatusBarColors,
  SegmentConfig,
  StatusBarConfig,
  RenderContext,
} from './types.js';
export { DEFAULT_STATUS_BAR_CONFIG } from './types.js';
export { Compositor } from './compositor.js';
export { createSessionsSegment } from './sessions.js';
export { createSisyphusSessionsSegment } from './sisyphus-sessions.js';
export { createCompanionSegment } from './companion.js';
export { createWindowsSegment } from './windows.js';
export { createSessionNameSegment } from './clock.js';

import type { Session } from '../shared/types.js';
import type { TreeNode } from './types/tree.js';
import type { ReportBlock } from './lib/reports.js';

// ---------------------------------------------------------------------------
// Polling data interfaces (moved from usePolling.ts)
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  name?: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
  tmuxWindowId?: string;
  /** Cached result of windowExists check — avoids synchronous subprocess in render */
  windowAlive?: boolean;
}

export interface CycleLog {
  cycle: number;
  content: string;
}

// ---------------------------------------------------------------------------
// InputMode (moved from InputBar.tsx)
// ---------------------------------------------------------------------------

export type InputMode =
  | 'navigate'
  | 'report-detail'
  | 'leader'
  | 'copy-menu'
  | 'help'
  | 'companion-overlay'
  | 'companion-debug'
  | 'compose'
  | 'search';

// ---------------------------------------------------------------------------
// Compose mode types
// ---------------------------------------------------------------------------

export type ComposeAction =
  | { kind: 'new-session' }
  | { kind: 'message-orchestrator'; sessionId: string }
  | { kind: 'resume'; sessionId: string }
  | { kind: 'continue'; sessionId: string }
  | { kind: 'spawn-agent'; sessionId: string }
  | { kind: 'message-agent'; sessionId: string; agentId: string };

/** Actions where empty content is allowed (submit without typing) */
export const OPTIONAL_COMPOSE = new Set(['resume', 'continue']);

/** Display labels for compose actions */
export const COMPOSE_HEADERS: Record<ComposeAction['kind'], string> = {
  'new-session': 'New Session',
  'message-orchestrator': 'Message Orchestrator',
  'resume': 'Resume Session',
  'continue': 'Continue Session',
  'spawn-agent': 'Spawn Agent',
  'message-agent': 'Message Agent',
};

// ---------------------------------------------------------------------------
// Render scheduling
// ---------------------------------------------------------------------------

let renderScheduled = false;
let renderFn: (() => void) | null = null;

export function setRenderFunction(fn: () => void): void {
  renderFn = fn;
}

export function requestRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  setImmediate(() => {
    renderScheduled = false;
    renderFn?.();
  });
}

// ---------------------------------------------------------------------------
// ThrottledScroll
// ---------------------------------------------------------------------------

const FRAME_MS = 16; // ~60fps

export class ThrottledScroll {
  offset: number = 0;
  private target: number = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onRender: () => void;

  constructor(onRender: () => void, initial = 0) {
    this.onRender = onRender;
    this.offset = initial;
    this.target = initial;
  }

  private scheduleFlush(): void {
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.offset = this.target;
        this.onRender();
      }, FRAME_MS);
    }
  }

  scrollBy(delta: number): void {
    this.target = Math.max(0, this.target + delta);
    this.scheduleFlush();
  }

  scrollTo(value: number): void {
    this.target = Math.max(0, value);
    this.scheduleFlush();
  }

  reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.target = 0;
    this.offset = 0;
  }

  destroy(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

export interface AppState {
  // Terminal dimensions
  rows: number;
  cols: number;

  // Tree navigation
  cursorIndex: number;
  expanded: Set<string>;
  mode: InputMode;
  focusPane: 'tree' | 'detail' | 'logs';

  // Session
  selectedSessionId: string | null;
  searchFilter: string | null;
  searchText: string;
  targetAgentId: string | null;

  // UI
  notification: string | null;
  notificationTimer: ReturnType<typeof setTimeout> | null;
  showCombinedView: boolean;

  // Scroll
  detailScroll: ThrottledScroll;
  logsScroll: ThrottledScroll;

  // Polling data (from daemon)
  sessions: SessionSummary[];
  selectedSession: Session | null;
  planContent: string;
  strategyContent: string;
  goalContent: string;
  logsContent: string;
  logsCycles: CycleLog[];
  paneAlive: boolean;
  contextFiles: string[];
  error: string | null;

  // Cursor stabilization
  cursorNodeId: string | null;
  prevNodes: TreeNode[];
  prevCycleCount: number;

  // Render caches
  cachedReportBlocks: Map<string, ReportBlock[]>;
  cachedTreeNodes: TreeNode[] | null;
  treeCacheKey: string;
  cachedDetailLines: import('./lib/format.js').DetailLine[] | null;
  detailCacheKey: string;
  detailRenderedCache: import('./render.js').RenderedCache;
  cachedLogsLines: import('./lib/format.js').DetailLine[] | null;
  logsCacheKey: string;
  logsRenderedCache: import('./render.js').RenderedCache;

  // Neovim integration
  nvimBridge: import('./lib/nvim-bridge.js').NvimBridge | null;
  nvimEnabled: boolean;
  prevNvimFile: string | null;
  nvimEditable: boolean;
  nvimOpenTabs: Map<string, { path: string; readonly: boolean }>;

  // Compose mode
  composeAction: ComposeAction | null;
  composeTempFile: string | null;
  composeSignalFile: string | null;
  composePollTimer: ReturnType<typeof setInterval> | null;
  composePrevNvimFile: string | null;

  // Config
  cwd: string;
}

export function createAppState(cwd: string): AppState {
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;

  const detailScroll = new ThrottledScroll(requestRender);
  const logsScroll = new ThrottledScroll(requestRender);

  return {
    rows,
    cols,
    cursorIndex: 0,
    expanded: new Set(),
    mode: 'navigate',
    focusPane: 'tree',
    selectedSessionId: null,
    searchFilter: null,
    searchText: '',
    targetAgentId: null,
    notification: null,
    notificationTimer: null,
    showCombinedView: false,
    detailScroll,
    logsScroll,
    sessions: [],
    selectedSession: null,
    planContent: '',
    strategyContent: '',
    goalContent: '',
    logsContent: '',
    logsCycles: [],
    paneAlive: true,
    contextFiles: [],
    error: null,
    cursorNodeId: null,
    prevNodes: [],
    prevCycleCount: 0,
    cachedReportBlocks: new Map(),
    cachedTreeNodes: null,
    treeCacheKey: '',
    cachedDetailLines: null,
    detailCacheKey: '',
    detailRenderedCache: { lines: [], ansi: [] },
    cachedLogsLines: null,
    logsCacheKey: '',
    logsRenderedCache: { lines: [], ansi: [] },
    nvimBridge: null,
    nvimEnabled: true,
    prevNvimFile: null,
    nvimEditable: false,
    nvimOpenTabs: new Map(),
    composeAction: null,
    composeTempFile: null,
    composeSignalFile: null,
    composePollTimer: null,
    composePrevNvimFile: null,
    cwd,
  };
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

export function notify(state: AppState, msg: string): void {
  state.notification = msg;
  if (state.notificationTimer !== null) {
    clearTimeout(state.notificationTimer);
  }
  state.notificationTimer = setTimeout(() => {
    state.notification = null;
    state.notificationTimer = null;
    requestRender();
  }, 3000);
}

// ---------------------------------------------------------------------------
// Cursor stabilization
// ---------------------------------------------------------------------------

export function stabilizeCursor(state: AppState, nodes: TreeNode[]): void {
  if (nodes.length === 0) {
    state.cursorIndex = 0;
    return;
  }

  const targetId = state.cursorNodeId;
  if (targetId === null) {
    state.cursorNodeId = nodes[0]?.id ?? null;
    return;
  }

  // If current index already points to the right node, no adjustment needed
  if (nodes[state.cursorIndex]?.id === targetId) return;

  // Find the tracked node in the new tree
  const newIndex = nodes.findIndex((n) => n.id === targetId);
  if (newIndex !== -1) {
    state.cursorIndex = newIndex;
  } else {
    // Node is gone (parent collapsed, session removed, etc.) — clamp
    const clamped = Math.min(state.cursorIndex, nodes.length - 1);
    state.cursorIndex = clamped;
    state.cursorNodeId = nodes[clamped]?.id ?? null;
  }
}

// ---------------------------------------------------------------------------
// Auto-expand cycle
// ---------------------------------------------------------------------------

export function autoExpandCycle(state: AppState): void {
  const selectedSession = state.selectedSession;
  if (!selectedSession) return;

  const sessionNodeId = `session:${selectedSession.id}`;
  const cycles = selectedSession.orchestratorCycles;

  // Only auto-manage cycle expansion if the session is already expanded by user
  if (!state.expanded.has(sessionNodeId)) {
    state.prevCycleCount = cycles.length;
    return;
  }

  if (cycles.length === 0) {
    state.prevCycleCount = 0;
    return;
  }

  const latest = cycles[cycles.length - 1]!;
  const latestId = `cycle:${selectedSession.id}:${latest.cycle}`;

  if (cycles.length > state.prevCycleCount && state.prevCycleCount > 0) {
    // New cycle appeared — collapse previous, expand latest
    const prevCycle = cycles[cycles.length - 2];
    if (prevCycle) {
      const prevId = `cycle:${selectedSession.id}:${prevCycle.cycle}`;
      state.expanded.delete(prevId);
      state.expanded.add(latestId);
    }
  } else if (!state.expanded.has(latestId)) {
    // Ensure latest is expanded
    state.expanded.add(latestId);
  }

  state.prevCycleCount = cycles.length;
}

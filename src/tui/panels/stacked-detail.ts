/**
 * Stacked g/s/r detail panel (3b).
 *
 * Renders goal/strategy/roadmap content as three vertically-stacked strips,
 * or a single cycle-log strip when state.detailMode === 'cycle-log'.
 *
 * Extension point (3d): when cursor is on the virtual `Needs You` tree node,
 * extend `state.detailMode` to `'gsr' | 'cycle-log' | 'inbox'` and dispatch
 * to an inbox view from `renderStackedDetailRows`.
 *
 * Extension point (deferred Q5): wire [/] in `renderCycleLogMode` to walk
 * state.logsCycles by index instead of always showing the latest.
 */

import {
  buildEmptyPanelRows,
  buildPanelRows,
  clipAnsi,
  colorToSGR,
  renderLine,
  type Rect,
} from '../render.js';
import type { AppState, ThrottledScroll } from '../state.js';
import type { DetailContext } from './detail.js';
import { buildLogsLines } from './detail.js';
import {
  type DetailLine,
} from '../lib/format.js';
import { buildHighlightedMarkdownLines } from '../lib/markdown-highlight.js';

const HEADERS_ACTIVE = {
  top:    'GOAL',
  middle: 'STRATEGY',
  bottom: 'ROADMAP',
};

const HEADERS_DONE = {
  top:    'GOAL',
  middle: 'COMPLETION',
  bottom: 'SUMMARY',
};

export function renderStackedDetailRows(
  rect: Rect,
  state: AppState,
  detailCtx: DetailContext,
): string[] {
  const focused = state.focusPane === 'detail';
  const { w, h } = rect;
  const innerW = w - 4;

  const cursorNode = detailCtx.nodes[state.cursorIndex];
  if (!cursorNode || !state.selectedSession || cursorNode.sessionId !== state.selectedSession.id) {
    return buildEmptyPanelRows(rect, focused, 'gray', '\x1b[2mSelect a session\x1b[0m');
  }

  if (state.detailMode === 'cycle-log') {
    return renderCycleLogMode(rect, state, focused);
  }

  const session = state.selectedSession;
  const isDone = session.status === 'completed';
  const headers = isDone ? HEADERS_DONE : HEADERS_ACTIVE;

  const middleContent = isDone
    ? buildCompletionContent(session)
    : state.strategyContent;
  const bottomContent = isDone
    ? pickSummaryContent(state)
    : state.planContent;

  const cacheKey = [
    cursorNode.sessionId,
    rect.w,
    isDone ? 'done' : 'active',
    state.goalContent.length,
    middleContent.length,
    bottomContent.length,
  ].join(':');

  let lines = state.cachedStackedLines;
  if (cacheKey !== state.stackedCacheKey || lines === null) {
    lines = {
      goal:     buildSectionLines(state.goalContent, innerW),
      strategy: buildSectionLines(middleContent, innerW),
      roadmap:  buildSectionLines(bottomContent, innerW),
      cycleLog: [],
    };
    state.cachedStackedLines = lines;
    state.stackedCacheKey = cacheKey;
  }

  const heights = allocateStripHeights(h, lines.goal.length, lines.strategy.length, lines.roadmap.length);

  const rows = new Array<string>(h);
  const focusColor = focused ? 'cyan' : 'gray';
  const sgr = `\x1b[${colorToSGR(focusColor)}m`;
  const reset = '\x1b[0m';
  rows[0] = sgr + '╭' + '─'.repeat(w - 2) + '╮' + reset;
  rows[h - 1] = sgr + '╰' + '─'.repeat(w - 2) + '╯' + reset;

  let cursor = 1;
  cursor = paintStrip(rows, cursor, w, sgr, reset, headers.top, lines.goal,
    state.goalScroll, heights.goalHeight, state.focusedStrip === 'goal' && focused);
  rows[cursor++] = sgr + '├' + '─'.repeat(w - 2) + '┤' + reset;
  cursor = paintStrip(rows, cursor, w, sgr, reset, headers.middle, lines.strategy,
    state.strategyScroll, heights.stratHeight, state.focusedStrip === 'strategy' && focused);
  rows[cursor++] = sgr + '├' + '─'.repeat(w - 2) + '┤' + reset;
  paintStrip(rows, cursor, w, sgr, reset, headers.bottom, lines.roadmap,
    state.roadmapScroll, heights.roadHeight, state.focusedStrip === 'roadmap' && focused);

  return rows;
}

function buildCompletionContent(session: import('../../shared/types.js').Session): string {
  const parts: string[] = [];
  if (session.completedAt) {
    parts.push(`*completed ${formatTimestamp(session.completedAt)}*`);
    parts.push('');
  }
  if (session.completionReport && session.completionReport.trim()) {
    parts.push(session.completionReport.trim());
  } else {
    parts.push('_No completion report written._');
  }
  return parts.join('\n');
}

function pickSummaryContent(state: AppState): string {
  if (state.completionSummaryContent.trim()) return state.completionSummaryContent;
  if (state.logsCycles.length > 0) {
    const last = state.logsCycles[state.logsCycles.length - 1]!;
    return `# Cycle ${last.cycle} log\n\n${last.content}`;
  }
  if (state.strategyContent.trim()) return state.strategyContent;
  return '_No completion artifacts. Try expanding context/ in the tree for raw files._';
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// --- helpers ---

function buildSectionLines(content: string, innerW: number): DetailLine[] {
  return buildHighlightedMarkdownLines(content, innerW);
}

function allocateStripHeights(rectH: number, gN: number, sN: number, _rN: number) {
  const innerH = rectH - 2;
  const stripsAvail = innerH - 2; // two separator rows
  const goalCap  = Math.floor(stripsAvail * 0.20);
  const stratCap = Math.floor(stripsAvail * 0.40);
  const roadCap  = stripsAvail - goalCap - stratCap;
  const goalNeed  = Math.min(gN + 1, goalCap);
  const stratNeed = Math.min(sN + 1, stratCap);
  const slack = (goalCap - goalNeed) + (stratCap - stratNeed);
  return {
    goalHeight:  Math.max(2, goalNeed),
    stratHeight: Math.max(2, stratNeed),
    roadHeight:  Math.max(2, roadCap + slack),
  };
}

function paintStrip(
  rows: string[], startRow: number, w: number, sgr: string, reset: string,
  label: string,
  lines: DetailLine[], scroll: ThrottledScroll, height: number, focused: boolean,
): number {
  const innerW = w - 4;
  const borderL = sgr + '│' + reset + ' ';
  const borderR = ' ' + sgr + '│' + reset;

  const headerSeg = `\x1b[${colorToSGR('yellow')};1m  ▎ ${label}\x1b[0m`;
  const headerClipped = clipAnsi(headerSeg + (focused ? ' ◀' : ''), innerW);
  rows[startRow] = borderL + headerClipped + borderR;

  const contentH = height - 1;
  const hasOverflow = lines.length > contentH;
  const viewableH = hasOverflow ? contentH - 1 : contentH;
  const maxScroll = Math.max(0, lines.length - viewableH);
  scroll.setMax(maxScroll);
  const effOffset = scroll.offset;

  for (let i = 0; i < viewableH; i++) {
    const li = effOffset + i;
    const ansi = li < lines.length ? renderLine(lines[li]!) : '';
    rows[startRow + 1 + i] = borderL + clipAnsi(ansi, innerW) + borderR;
  }
  if (hasOverflow) {
    const pct = maxScroll > 0 ? Math.round((effOffset / maxScroll) * 100) : 100;
    const indicator = `\x1b[2m  ↕ ${pct}% · ${lines.length} lines\x1b[0m`;
    rows[startRow + 1 + viewableH] = borderL + clipAnsi(indicator, innerW) + borderR;
  }
  return startRow + height;
}

function renderCycleLogMode(rect: Rect, state: AppState, focused: boolean): string[] {
  // Extension point (deferred Q5): wire [/] to walk state.logsCycles by index instead of latest.
  if (state.logsCycles.length === 0) {
    return buildEmptyPanelRows(rect, focused, 'gray', '\x1b[2mNo cycle logs yet\x1b[0m');
  }
  const cacheKey = `cycleLog:${state.logsCycles.length}:${rect.w}`;
  let lines: DetailLine[];
  if (cacheKey === state.stackedCacheKey && state.cachedStackedLines !== null) {
    lines = state.cachedStackedLines.cycleLog;
  } else {
    lines = buildLogsLines(state.logsCycles, rect.w);
    const existing = state.cachedStackedLines ?? { goal: [], strategy: [], roadmap: [], cycleLog: [] };
    state.cachedStackedLines = { ...existing, cycleLog: lines };
    state.stackedCacheKey = cacheKey;
  }
  return buildPanelRows(rect, lines, state.detailScroll, focused, 'cyan', state.stackedRenderedCache);
}

import { writeClipped, type FrameBuffer } from '../render.js';
import { ansiBold, ansiDim } from '../lib/format.js';
import type { AppState } from '../state.js';
import type { TreeNodeType } from '../types/tree.js';

// ─── Status Line ──────────────────────────────────────────────────────────────

const B = ansiBold;
const D = ansiDim;
const SEP = D('│ ');

export function renderStatusLine(
  buf: FrameBuffer,
  y: number,
  state: AppState,
  cursorNodeType: TreeNodeType | undefined,
): void {
  const { mode, focusPane, notification, error } = state;

  if (mode === 'report-detail') return;

  let content: string;

  // Notifications/errors take over the status line transiently
  if (notification !== null) {
    const icon = /error|failed/i.test(notification)
      ? '✕'
      : /success|created|killed|sent|copied|deleted/i.test(notification)
        ? '✓'
        : 'ℹ';
    content = `\x1b[1;33m${icon} ${notification}\x1b[0m`;
  } else if (error !== null) {
    content = `\x1b[31m⚠ ${error}\x1b[0m`;
  } else if (mode === 'search') {
    const cursor = `\x1b[7m \x1b[0m`;
    content = `\x1b[1;34m/\x1b[0m${state.searchText}${cursor}` + D('  enter to apply · esc to clear');
  } else if (mode === 'leader') {
    content = `\x1b[1;35mLEADER\x1b[0m` + D('  [c]opy [o]pen [a]gent [S]ession [g]o  or  [s]cycle [h]ome [n]ew [m]sg [t]status [l]picker [x]kill [/]search [?]help  [esc] cancel');
  } else if (mode === 'copy-menu') {
    content = `\x1b[1;36mCOPY\x1b[0m` + D('  [p]ath  [i]d  [c] context  [l]ogs  [r]eport  [a]gent ID  [esc] cancel');
  } else if (mode === 'open-menu') {
    content = `\x1b[1;32mOPEN\x1b[0m` + D('  [g]oal  [r]oadmap  [s]trategy  [l]ogs  [d]ir  [R]eport  [c]scratch  [e]dit context  [esc] cancel');
  } else if (mode === 'agent-menu') {
    content = `\x1b[1;34mAGENT\x1b[0m` + D('  [s]pawn  [m]sg  [r]estart  [R]erun  [j]ump  [o]pen-claude  [t]ail  [k]ill  [e]xplore  [d]ebug  [esc] cancel');
  } else if (mode === 'session-menu') {
    content = `\x1b[1;31mSESSION\x1b[0m` + D('  [n]ew  [r]esume  [c]ontinue  [b]ollback  [k]ill  [d]elete  [e]xport  [w]indow  [C]lone  [i]history  [esc] cancel');
  } else if (mode === 'go-menu') {
    content = `\x1b[1;33mGO\x1b[0m` + D('  [w]indow  [p]ane  [s]ession  [n]ext  [r]econnect  [esc] cancel');
  } else if (mode === 'help') {
    content = `\x1b[1;33mHELP\x1b[0m` + D('  [esc] or [?] to dismiss');
  } else if (focusPane === 'logs' || focusPane === 'detail') {
    content =
      B('[jk/↑↓]') + D(' scroll  ') +
      B('[h/←/tab]') + D(' back  ') +
      B('[t]') + D('oggle view  ') +
      B('[F]') + D('low ±  ') +
      SEP +
      B('[m]') + D('sg  ') +
      B('[g]') + D('oal  ') +
      B('[n]') + D('ew  ') +
      B('[p]') + D('lan  ') +
      B('[w]') + D('indow  ') +
      B('[R]') + D('esume  ') +
      B('[q]') + D('uit');
  } else if (cursorNodeType === 'needs-you-virtual') {
    content =
      B('[enter]') + D(' open ask  ') +
      B('[esc]') + D(' back  ') +
      SEP +
      B('[q]') + D('uit');
  } else {
    // tree focused
    let contextFilePart = '';
    if (cursorNodeType === 'context-file') {
      contextFilePart = B('[e]') + D('dit  ') + B('[⏎]') + D(' open  ');
    }
    content =
      contextFilePart +
      B('[enter]') + D(' select  ') +
      B('[m]') + D('essage  ') +
      B('[n]') + D('ew  ') +
      B('[w]') + D(' tmux  ') +
      SEP +
      B('[q]') + D('uit');
  }

  writeClipped(buf, 1, y, content, buf.width - 2);
}

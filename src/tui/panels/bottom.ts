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
  if (mode === 'compose') return;

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
    content = `\x1b[1;35mLEADER\x1b[0m` + D('  press a command key or [esc] to cancel');
  } else if (mode === 'copy-menu') {
    content = `\x1b[1;36mCOPY\x1b[0m` + D('  [p] path  [C] context  [l] logs  [s] session ID  [esc] cancel');
  } else if (mode === 'help') {
    content = `\x1b[1;33mHELP\x1b[0m` + D('  [esc] or [?] to dismiss');
  } else if (focusPane === 'logs' || focusPane === 'detail') {
    content =
      B('[jk/↑↓]') + D(' scroll  ') +
      B('[h/←/tab]') + D(' back  ') +
      B('[t]') + D('oggle view  ') +
      SEP +
      B('[m]') + D('sg  ') +
      B('[g]') + D('oal  ') +
      B('[n]') + D('ew  ') +
      B('[p]') + D('lan  ') +
      B('[w]') + D('indow  ') +
      B('[R]') + D('esume  ') +
      B('[q]') + D('uit');
  } else {
    // tree focused
    let contextFilePart = '';
    if (cursorNodeType === 'context-file') {
      contextFilePart = B('[e]') + D('dit  ') + B('[⏎]') + D(' open  ');
    }
    content =
      B('[hjkl]') + D(' navigate  ') +
      SEP +
      contextFilePart +
      B('[space]') + D(' leader  ') +
      B('[tab]') + D(' detail  ') +
      B('[t]') + D('oggle view  ') +
      SEP +
      B('[m]') + D('sg  ') +
      B('[n]') + D('ew  ') +
      B('[R]') + D('esume  ') +
      B('[q]') + D('uit');
  }

  writeClipped(buf, 1, y, content, buf.width - 2);
}

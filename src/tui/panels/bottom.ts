import { writeClipped, type FrameBuffer } from '../render.js';
import { ansiBold, ansiDim } from '../lib/format.js';
import type { AppState } from '../state.js';
import { INPUT_MODES, PROMPTS } from '../state.js';
import type { TreeNodeType } from '../types/tree.js';

// ─── Notification Row ─────────────────────────────────────────────────────────

export function renderNotificationRow(
  buf: FrameBuffer,
  y: number,
  notification: string | null,
  error: string | null,
): void {
  if (notification !== null) {
    const icon = /error|failed/i.test(notification)
      ? '✕'
      : /success|created|killed|sent|copied|deleted/i.test(notification)
        ? '✓'
        : 'ℹ';
    const content = `\x1b[1;33m${icon} ${notification}\x1b[0m`;
    writeClipped(buf, 1, y, content, buf.width - 2);
  } else if (error !== null) {
    const content = `\x1b[31m⚠ ${error}\x1b[0m`;
    writeClipped(buf, 1, y, content, buf.width - 2);
  }
}

// ─── Input Bar ────────────────────────────────────────────────────────────────

export function renderInputBar(
  buf: FrameBuffer,
  y: number,
  state: AppState,
): void {
  const { mode, inputText, inputCursorPos } = state;

  if (mode === 'navigate') {
    const content = `\x1b[2mPress [m] to message orchestrator, [n] for new session\x1b[0m`;
    writeClipped(buf, 1, y, content, buf.width - 2);
    return;
  }

  if (
    mode === 'report-detail' ||
    mode === 'leader' ||
    mode === 'copy-menu' ||
    mode === 'help' ||
    !INPUT_MODES.has(mode)
  ) {
    return;
  }

  const prompt = PROMPTS[mode] ?? mode;
  const cursorChar = inputCursorPos < inputText.length ? inputText[inputCursorPos]! : ' ';
  const before = inputText.slice(0, inputCursorPos);
  const after = inputText.slice(inputCursorPos + 1);

  const content =
    `\x1b[33m${prompt} > \x1b[0m` +
    before +
    `\x1b[7m${cursorChar}\x1b[0m` +
    after +
    `\x1b[2m  (enter to send, esc to cancel)\x1b[0m`;

  writeClipped(buf, 1, y, content, buf.width - 2);
}

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
  const { mode, focusPane } = state;

  if (mode === 'report-detail') return;

  let content: string;

  if (mode === 'leader') {
    content = `\x1b[1;35mLEADER\x1b[0m` + D('  press a command key or [esc] to cancel');
  } else if (mode === 'copy-menu') {
    content = `\x1b[1;36mCOPY\x1b[0m` + D('  [p] path  [C] context  [l] logs  [s] session ID  [esc] cancel');
  } else if (mode === 'help') {
    content = `\x1b[1;33mHELP\x1b[0m` + D('  [esc] or [?] to dismiss');
  } else if (mode === 'delete-confirm') {
    content = `\x1b[1;31mDELETE\x1b[0m` + D("  type 'yes' to confirm, [esc] to cancel");
  } else if (mode === 'spawn-agent') {
    content = `\x1b[1;32mSPAWN\x1b[0m` + D('  enter agent instruction, [esc] to cancel');
  } else if (mode === 'search') {
    content = `\x1b[1;34mSEARCH\x1b[0m` + D('  type to filter, enter to apply, [esc] to cancel');
  } else if (mode === 'message-agent') {
    content = `\x1b[1;36mMESSAGE\x1b[0m` + D('  enter message for agent, [esc] to cancel');
  } else if (mode === 'shell-command') {
    content = `\x1b[1;35mSHELL\x1b[0m` + D('  enter command, [esc] to cancel');
  } else if (mode !== 'navigate') {
    content = D('[enter] send  [esc] cancel');
  } else if (focusPane === 'logs' || focusPane === 'detail') {
    content =
      B('[jk/↑↓]') + D(' scroll  ') +
      B('[h/←/tab]') + D(' back  ') +
      B('[t]') + D('oggle logs  ') +
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
      B('[t]') + D('oggle logs  ') +
      SEP +
      B('[m]') + D('sg  ') +
      B('[n]') + D('ew  ') +
      B('[R]') + D('esume  ') +
      B('[q]') + D('uit');
  }

  writeClipped(buf, 1, y, content, buf.width - 2);
}

import { drawBorder, writeClipped, type FrameBuffer } from '../render.js';
import { ansiColor, ansiDim } from '../lib/format.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEADER_WIDTH = 26;
const LEADER_HEIGHT = 19; // 17 content lines + 2 border lines
const COPY_HEIGHT = 9;    // 7 content lines + 2 border lines
const HELP_WIDTH = 62;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function helpRow(left: string, right: string, innerWidth: number): string {
  const col = Math.floor(innerWidth / 2);
  return (left.padEnd(col) + right).padEnd(innerWidth);
}

// ─── Overlays ─────────────────────────────────────────────────────────────────

export function renderLeaderOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const x = cols - LEADER_WIDTH - 1;
  const y = rows - LEADER_HEIGHT - 2;
  const innerWidth = LEADER_WIDTH - 2;

  drawBorder(buf, x, y, LEADER_WIDTH, LEADER_HEIGHT, 'magenta');

  const lines: string[] = [
    ansiColor('  LEADER'.padEnd(innerWidth), 'magenta', true),
    ' '.padEnd(innerWidth),
    '  y  copy menu'.padEnd(innerWidth),
    '  d  delete session'.padEnd(innerWidth),
    '  l  daemon logs'.padEnd(innerWidth),
    '  o  open session dir'.padEnd(innerWidth),
    '  a  spawn agent'.padEnd(innerWidth),
    '  m  message agent'.padEnd(innerWidth),
    '  /  search'.padEnd(innerWidth),
    '  !  shell command'.padEnd(innerWidth),
    '  j  jump to pane'.padEnd(innerWidth),
    '  k  kill session/agent'.padEnd(innerWidth),
    '  q  quit'.padEnd(innerWidth),
    '  ?  help'.padEnd(innerWidth),
    ' 1-9  jump to session'.padEnd(innerWidth),
    ' '.padEnd(innerWidth),
    ansiDim('  esc  dismiss'.padEnd(innerWidth)),
  ];

  for (let i = 0; i < lines.length; i++) {
    writeClipped(buf, x + 1, y + 1 + i, lines[i]!, innerWidth);
  }
}

export function renderCopyMenuOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const x = cols - LEADER_WIDTH - 1;
  const y = rows - COPY_HEIGHT - 2;
  const innerWidth = LEADER_WIDTH - 2;

  drawBorder(buf, x, y, LEADER_WIDTH, COPY_HEIGHT, 'cyan');

  const lines: string[] = [
    ansiColor('  COPY'.padEnd(innerWidth), 'cyan', true),
    ' '.padEnd(innerWidth),
    '  p  session path'.padEnd(innerWidth),
    '  C  LLM context'.padEnd(innerWidth),
    '  l  logs content'.padEnd(innerWidth),
    '  s  session ID'.padEnd(innerWidth),
    ansiDim('  esc  cancel'.padEnd(innerWidth)),
  ];

  for (let i = 0; i < lines.length; i++) {
    writeClipped(buf, x + 1, y + 1 + i, lines[i]!, innerWidth);
  }
}

export function renderHelpOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const innerWidth = HELP_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - HELP_WIDTH) / 2));

  const contentLines: string[] = [
    helpRow('  hjkl/↑↓←→  navigate', '  tab  switch pane', innerWidth),
    helpRow('  enter  expand/open', '  t  toggle logs', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  n  new session', '  m  message orch.', innerWidth),
    helpRow('  R  resume session', '  C  continue session', innerWidth),
    helpRow('  b  rollback cycle', '  x  restart agent', innerWidth),
    helpRow('  r  re-run agent', '  g  edit goal', innerWidth),
    helpRow('  p  open roadmap', '  w  go to window', innerWidth),
    helpRow('  c  claude companion', '  q  quit', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  space → y  copy submenu', '  space → d  delete session', innerWidth),
    helpRow('  space → j  jump to pane', '  space → k  kill', innerWidth),
    helpRow('  space → q  quit', '  space → o  open dir', innerWidth),
    helpRow('  space → l  tail logs', '  space → /  search', innerWidth),
    helpRow('  space → a  spawn agent', '  space → m  msg agent', innerWidth),
    helpRow('  space → ?  help', '  space → 1-9  jump', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  y → p  session path', '  y → C  LLM context', innerWidth),
    helpRow('  y → l  logs content', '  y → s  session ID', innerWidth),
  ];

  // title + blank + contentLines + blank = contentLines.length + 3 inner rows, + 2 border
  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, HELP_WIDTH, height, 'yellow');

  // Title row
  writeClipped(buf, x + 1, y + 1, ansiColor('  KEYBINDINGS  (esc or ? to close)'.padEnd(innerWidth), 'yellow', true), innerWidth);
  // Blank row after title
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  // Content rows (clamp to available height: height - 4 rows for title+blank+trailing_blank+borders)
  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }

  // Trailing blank (only if there's room)
  const trailingBlankRow = y + 3 + Math.min(contentLines.length, availableContentRows);
  if (trailingBlankRow < y + height - 1) {
    writeClipped(buf, x + 1, trailingBlankRow, ' '.padEnd(innerWidth), innerWidth);
  }
}

import { clipAnsi, colorToSGR, type Rect } from '../render.js';
import type { NvimBridge } from '../lib/nvim-bridge.js';

/**
 * Render the neovim detail panel with a status header as self-contained row strings.
 * Produces exactly rect.h strings, each rect.w display columns wide.
 * Compatible with the row-based panel composition in app.ts.
 */
export function renderNvimDetailRows(
  rect: Rect,
  bridge: NvimBridge,
  focused: boolean,
  editable: boolean,
  statusRows: string[],
  composing: boolean = false,
): string[] {
  const { w, h } = rect;
  const rows = new Array<string>(h);

  // Border styling — cyan when focused to distinguish nvim mode, gray otherwise
  const borderColor = focused ? 'cyan' : 'gray';
  const sgr = `\x1b[${colorToSGR(borderColor)}m`;
  const reset = '\x1b[0m';
  const innerW = w - 4; // border + padding on each side

  // Top border — insert badge when focused
  if (focused) {
    const badgeText = composing ? ' COMPOSE ' : editable ? ' EDIT ' : ' NVIM ';
    const badgeLen = badgeText.length;
    const dashesLeft = 2;
    const dashesRight = Math.max(0, w - 2 - dashesLeft - badgeLen);
    rows[0] =
      sgr + '╭' + '─'.repeat(dashesLeft) + reset +
      `\x1b[${colorToSGR('cyan')};1m` + badgeText + reset +
      sgr + '─'.repeat(dashesRight) + '╮' + reset;
  } else {
    rows[0] = sgr + '╭' + '─'.repeat(w - 2) + '╮' + reset;
  }

  // Bottom border
  rows[h - 1] = sgr + '╰' + '─'.repeat(w - 2) + '╯' + reset;

  // Border pieces for interior rows
  const borderL = sgr + '│' + reset + ' ';
  const borderR = ' ' + sgr + '│' + reset;
  const blankInner = ' '.repeat(innerW);
  const emptyRow = borderL + blankInner + borderR;

  // Pre-fill interior rows with empty content
  for (let i = 1; i < h - 1; i++) rows[i] = emptyRow;

  if (innerW <= 0 || h <= 2) return rows;

  // Render status rows (ANSI, not nvim)
  const statusCount = statusRows.length;
  for (let i = 0; i < statusCount && i < h - 3; i++) {
    const clipped = clipAnsi(statusRows[i]!, innerW);
    rows[1 + i] = borderL + clipped + borderR;
  }

  // Separator between status and nvim content
  const separatorRow = 1 + statusCount;
  if (separatorRow < h - 1) {
    rows[separatorRow] = sgr + '├' + '─'.repeat(w - 2) + '┤' + reset;
  }

  // Get neovim screen rows and fill the remaining interior
  const nvimStartRow = separatorRow + 1;
  const nvimRows = bridge.getRows();
  for (let i = nvimStartRow; i < h - 1; i++) {
    const nvimIdx = i - nvimStartRow;
    const nvimRow = nvimRows[nvimIdx];
    if (nvimRow !== undefined) {
      const clipped = clipAnsi(nvimRow, innerW);
      rows[i] = borderL + clipped + borderR;
    }
  }

  return rows;
}

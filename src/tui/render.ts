import stringWidth from 'string-width';
import type { Seg, DetailLine } from './lib/format.js';

export type { Seg, DetailLine };

// ─── Color mapping ────────────────────────────────────────────────────────────

export const COLOR_SGR: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
};

export function colorToSGR(color: string): number {
  const code = COLOR_SGR[color];
  if (code === undefined) throw new Error(`Unknown color: ${color}`);
  return code;
}

// ─── Seg → ANSI conversion (§1.1) ────────────────────────────────────────────

export function renderLine(segs: Seg[]): string {
  let out = '';
  for (const s of segs) {
    const codes: number[] = [];
    if (s.bold) codes.push(1);
    if (s.dim) codes.push(2);
    if (s.italic) codes.push(3);
    if (s.inverse) codes.push(7);
    if (s.color) codes.push(colorToSGR(s.color));
    if (codes.length > 0) {
      out += `\x1b[${codes.join(';')}m${s.text}\x1b[0m`;
    } else {
      out += s.text;
    }
  }
  return out;
}

// ─── Frame Buffer (§1.2) ──────────────────────────────────────────────────────

export interface FrameBuffer {
  lines: string[];
  width: number;
  height: number;
}

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  const blank = ' '.repeat(width);
  return {
    lines: Array.from({ length: height }, () => blank),
    width,
    height,
  };
}

// ─── Frame Diffing (§1.3) ────────────────────────────────────────────────────

export function flushFrame(frame: string[], prevFrame: string[]): string {
  let out = '\x1b[?2026h'; // begin synchronized output
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] !== prevFrame[i]) {
      out += `\x1b[${i + 1};1H`; // cursor to row i+1, col 1
      out += '\x1b[2K';           // clear entire line
      out += frame[i];
    }
  }
  out += '\x1b[?2026l'; // end synchronized output
  return out;
}

// ─── ANSI escape sequence regex ───────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

// ─── Write functions ──────────────────────────────────────────────────────────

/**
 * Write content into frame buffer at position (x, y).
 *
 * Strategy: rebuild the target line by splitting into display columns,
 * inserting the new content, then reassembling. Since we build the frame
 * fresh each render, we can treat the existing line as plain chars + ANSI.
 *
 * This implementation replaces display columns [x, x+displayWidth(content))
 * in the buffer line with the new content.
 */
export function writeAt(buf: FrameBuffer, x: number, y: number, content: string): void {
  if (y < 0 || y >= buf.height) return;
  if (x < 0 || x >= buf.width) return;

  const existing = buf.lines[y]!;
  const contentDisplayWidth = stringWidth(content.replace(ANSI_RE, ''));

  // Split the existing line into prefix (0..x) and suffix (x+contentDisplayWidth..)
  // We need to walk the existing line respecting display widths.
  const prefix = sliceDisplayCols(existing, 0, x);
  const suffix = sliceDisplayCols(existing, x + contentDisplayWidth, buf.width);

  // Pad prefix if it's shorter than expected (can happen at end of line)
  const prefixWidth = stringWidth(prefix.replace(ANSI_RE, ''));
  const paddedPrefix = prefix + ' '.repeat(Math.max(0, x - prefixWidth));

  buf.lines[y] = paddedPrefix + content + suffix;
}

/**
 * Write ANSI string into buffer at (x, y), truncating to maxWidth display columns.
 * Pads remaining width with spaces.
 */
export function writeClipped(
  buf: FrameBuffer,
  x: number,
  y: number,
  content: string,
  maxWidth: number,
): void {
  if (y < 0 || y >= buf.height) return;
  if (x < 0 || x >= buf.width) return;

  let out = '';
  let displayWidth = 0;
  let i = 0;

  while (i < content.length) {
    // Check for ANSI escape sequence — pass through without counting width
    if (content[i] === '\x1b' && content[i + 1] === '[') {
      const match = content.slice(i).match(/^\x1b\[[0-9;]*[a-zA-Z]/);
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
    }

    // Get the next character (handle surrogate pairs)
    const cp = content.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chWidth = stringWidth(ch);

    if (displayWidth + chWidth > maxWidth) break;

    out += ch;
    displayWidth += chWidth;
    i += ch.length;
  }

  // Ensure any open SGR sequences are reset
  if (out.includes('\x1b[') && !out.endsWith('\x1b[0m')) {
    out += '\x1b[0m';
  }

  // Pad to maxWidth
  const remaining = maxWidth - displayWidth;
  if (remaining > 0) {
    out += ' '.repeat(remaining);
  }

  writeAt(buf, x, y, out);
}

/**
 * Write centered text at the given row.
 */
export function writeCenter(buf: FrameBuffer, row: number, content: string): void {
  const textWidth = stringWidth(content.replace(ANSI_RE, ''));
  const x = Math.max(0, Math.floor((buf.width - textWidth) / 2));
  writeAt(buf, x, row, content);
}

// ─── Border Drawing (§1.5) ────────────────────────────────────────────────────

export function drawBorder(
  buf: FrameBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const sgr = `\x1b[${colorToSGR(color)}m`;
  const reset = '\x1b[0m';

  // Top: ╭────╮
  writeAt(buf, x, y, sgr + '╭' + '─'.repeat(w - 2) + '╮' + reset);
  // Bottom: ╰────╯
  writeAt(buf, x, y + h - 1, sgr + '╰' + '─'.repeat(w - 2) + '╯' + reset);
  // Sides
  for (let row = y + 1; row < y + h - 1; row++) {
    writeAt(buf, x, row, sgr + '│' + reset);
    writeAt(buf, x + w - 1, row, sgr + '│' + reset);
  }
}

// ─── Panel Rendering (§4.2) ───────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function renderPanel(
  buf: FrameBuffer,
  rect: Rect,
  lines: DetailLine[],
  scrollOffset: number,
  focused: boolean,
  borderColor: string,
): void {
  const { x, y, w, h } = rect;

  // 1. Draw border
  drawBorder(buf, x, y, w, h, focused ? 'blue' : borderColor);

  // 2. Inner dimensions (border + 1 padding each side, matching Ink's paddingX={1})
  const innerX = x + 2;
  const innerW = w - 4;
  const innerY = y + 1;
  const innerH = h - 2;

  if (innerW <= 0 || innerH <= 0) return;

  // 3. Windowed slice (same logic as ScrollablePanel.tsx:31-38)
  const hasOverflow = lines.length > innerH;
  const viewableH = hasOverflow ? innerH - 1 : innerH;
  const maxScroll = Math.max(0, lines.length - viewableH);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const visible = lines.slice(effectiveOffset, effectiveOffset + viewableH);

  // 4. Render visible lines
  for (let i = 0; i < visible.length; i++) {
    const ansi = renderLine(visible[i]!);
    writeClipped(buf, innerX, innerY + i, ansi, innerW);
  }

  // 5. Scroll indicator
  if (hasOverflow) {
    const scrollPct = maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;
    const indicator = `  ↕ ${scrollPct}% · ${lines.length} lines`;
    writeClipped(buf, innerX, innerY + viewableH, `\x1b[2m${indicator}\x1b[0m`, innerW);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Slice a string (which may contain ANSI escapes) to display columns [start, end).
 * ANSI sequences are passed through only within the slice range.
 */
function sliceDisplayCols(s: string, start: number, end: number): string {
  let out = '';
  let col = 0;
  let i = 0;
  let inSlice = false;
  let hasOpenSGR = false;

  while (i < s.length && col < end) {
    // ANSI escape: pass through if we're in the slice
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const match = s.slice(i).match(/^\x1b\[[0-9;]*[a-zA-Z]/);
      if (match) {
        if (col >= start) {
          out += match[0];
          // Track if we have open SGR (non-reset)
          hasOpenSGR = match[0] !== '\x1b[0m' && match[0] !== '\x1b[m';
        }
        i += match[0].length;
        continue;
      }
    }

    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chWidth = stringWidth(ch);

    if (col >= start) {
      inSlice = true;
      // Don't emit char that would overflow end
      if (col + chWidth > end) break;
      out += ch;
    }

    col += chWidth;
    i += ch.length;
  }

  // Close any open SGR
  if (inSlice && hasOpenSGR) {
    out += '\x1b[0m';
  }

  return out;
}

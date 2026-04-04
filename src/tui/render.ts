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
    const codes: string[] = [];
    if (s.bold) codes.push('1');
    if (s.dim) codes.push('2');
    if (s.italic) codes.push('3');
    if (s.inverse) codes.push('7');
    if (s.color) codes.push(String(colorToSGR(s.color)));
    if (s.bg) codes.push(s.bg);
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

let cachedBlank = '';
let cachedBlankWidth = 0;

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  if (width !== cachedBlankWidth) {
    cachedBlank = ' '.repeat(width);
    cachedBlankWidth = width;
  }
  const lines = new Array<string>(height);
  for (let i = 0; i < height; i++) lines[i] = cachedBlank;
  return { lines, width, height };
}

/**
 * Copy rows from a previous frame into the buffer (skip re-render for clean panels).
 */
export function copyRows(buf: FrameBuffer, src: string[], startRow: number, count: number): void {
  for (let i = 0; i < count && startRow + i < buf.height; i++) {
    buf.lines[startRow + i] = src[startRow + i]!;
  }
}

// ─── Frame Diffing (§1.3) ────────────────────────────────────────────────────

export function flushFrame(frame: string[], prevFrame: string[], suffix?: string): string {
  let out = '\x1b[?2026h'; // begin synchronized output
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] !== prevFrame[i]) {
      out += `\x1b[${i + 1};1H`; // cursor to row i+1, col 1
      out += '\x1b[2K';           // clear entire line
      out += frame[i];
    }
  }
  if (suffix) out += suffix;
  out += '\x1b[?2026l'; // end synchronized output
  return out;
}

// ─── ANSI escape sequence regex ───────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

// ─── Clip ANSI string to display width (no buffer interaction) ──────────────

/**
 * Clip an ANSI string to exactly `maxWidth` display columns, padding with spaces.
 * Pure function — no buffer splicing.
 */
export function clipAnsi(content: string, maxWidth: number): string {
  let out = '';
  let displayWidth = 0;
  let i = 0;

  while (i < content.length) {
    if (content[i] === '\x1b' && content[i + 1] === '[') {
      const seqLen = ansiLen(content, i);
      if (seqLen > 0) {
        out += content.substring(i, i + seqLen);
        i += seqLen;
        continue;
      }
    }
    const cp = content.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chWidth = cp < 128 ? 1 : stringWidth(ch);
    if (displayWidth + chWidth > maxWidth) break;
    out += ch;
    displayWidth += chWidth;
    i += ch.length;
  }

  if (out.includes('\x1b[') && !out.endsWith('\x1b[0m')) {
    out += '\x1b[0m';
  }

  const remaining = maxWidth - displayWidth;
  if (remaining > 0) out += ' '.repeat(remaining);
  return out;
}

/**
 * Fast display-width calculation that skips ANSI escapes without regex allocation.
 */
function displayWidthFast(s: string): number {
  let w = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const len = ansiLen(s, i);
      if (len > 0) { i += len; continue; }
    }
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    w += cp < 128 ? 1 : stringWidth(ch);
    i += ch.length;
  }
  return w;
}

/**
 * Parse ANSI escape sequence at position i. Returns length of sequence or 0.
 * Avoids s.slice(i).match(regex) which allocates a new string each call.
 */
function ansiLen(s: string, i: number): number {
  // Caller already verified s[i] === '\x1b' && s[i+1] === '['
  let j = i + 2;
  const len = s.length;
  // Consume parameter bytes: digits 0-9 and semicolons
  while (j < len) {
    const c = s.charCodeAt(j);
    if ((c >= 0x30 && c <= 0x39) || c === 0x3b) { // '0'-'9' or ';'
      j++;
    } else {
      break;
    }
  }
  // Must end with a letter (final byte)
  if (j < len) {
    const c = s.charCodeAt(j);
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) { // A-Z or a-z
      return j + 1 - i;
    }
  }
  return 0;
}

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
  // suffix uses restoreState=true to preserve ANSI bg/fg from before the splice point.
  const prefix = sliceDisplayCols(existing, 0, x);
  const suffix = sliceDisplayCols(existing, x + contentDisplayWidth, buf.width, true);

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
      const seqLen = ansiLen(content, i);
      if (seqLen > 0) {
        out += content.substring(i, i + seqLen);
        i += seqLen;
        continue;
      }
    }

    // Get the next character (handle surrogate pairs)
    const cp = content.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chWidth = cp < 128 ? 1 : stringWidth(ch);

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

  // Splice directly into buffer line — we already know exact display width is maxWidth,
  // so skip writeAt's redundant stringWidth + double sliceDisplayCols re-parse.
  const existing = buf.lines[y]!;
  const prefix = sliceDisplayCols(existing, 0, x);
  const suffix = sliceDisplayCols(existing, x + maxWidth, buf.width, true);
  const prefixDisplayW = displayWidthFast(prefix);
  const paddedPrefix = prefixDisplayW < x ? prefix + ' '.repeat(x - prefixDisplayW) : prefix;
  buf.lines[y] = paddedPrefix + out + suffix;
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

/**
 * Cache for pre-rendered ANSI strings. Keyed by the DetailLine[] identity —
 * when the caller provides a `renderedCache`, renderPanel will populate it
 * on first render and reuse on subsequent frames (avoiding renderLine per line).
 */
export interface RenderedCache {
  lines: DetailLine[];
  ansi: string[];
}

export function renderPanel(
  buf: FrameBuffer,
  rect: Rect,
  lines: DetailLine[],
  scrollOffset: number,
  focused: boolean,
  borderColor: string,
  renderedCache?: RenderedCache | null,
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

  // 3. Pre-render ANSI strings (cached across frames)
  let ansiLines: string[];
  if (renderedCache && renderedCache.lines === lines) {
    ansiLines = renderedCache.ansi;
  } else {
    ansiLines = new Array<string>(lines.length);
    for (let i = 0; i < lines.length; i++) {
      ansiLines[i] = renderLine(lines[i]!);
    }
    if (renderedCache) {
      renderedCache.lines = lines;
      renderedCache.ansi = ansiLines;
    }
  }

  // 4. Windowed slice
  const hasOverflow = lines.length > innerH;
  const viewableH = hasOverflow ? innerH - 1 : innerH;
  const maxScroll = Math.max(0, lines.length - viewableH);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);

  // 5. Render visible lines
  for (let i = 0; i < viewableH && effectiveOffset + i < ansiLines.length; i++) {
    writeClipped(buf, innerX, innerY + i, ansiLines[effectiveOffset + i]!, innerW);
  }

  // 6. Scroll indicator
  if (hasOverflow) {
    const scrollPct = maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;
    const indicator = `  ↕ ${scrollPct}% · ${lines.length} lines`;
    writeClipped(buf, innerX, innerY + viewableH, `\x1b[2m${indicator}\x1b[0m`, innerW);
  }
}

/**
 * Build panel as self-contained row strings (w display-columns each, including borders).
 * Returns h strings. No buffer interaction — avoids sliceDisplayCols entirely.
 */
export function buildPanelRows(
  rect: Rect,
  lines: DetailLine[],
  scrollOffset: number,
  focused: boolean,
  borderColor: string,
  renderedCache?: RenderedCache | null,
): string[] {
  const { w, h } = rect;
  const rows = new Array<string>(h);

  const color = focused ? 'blue' : borderColor;
  const sgr = `\x1b[${colorToSGR(color)}m`;
  const reset = '\x1b[0m';
  const innerW = w - 4;
  const innerH = h - 2;
  const blankInner = ' '.repeat(innerW);

  // Top border
  rows[0] = sgr + '╭' + '─'.repeat(w - 2) + '╮' + reset;
  // Bottom border
  rows[h - 1] = sgr + '╰' + '─'.repeat(w - 2) + '╯' + reset;

  // Pre-fill interior rows with empty content
  const borderL = sgr + '│' + reset + ' ';
  const borderR = ' ' + sgr + '│' + reset;
  const emptyRow = borderL + blankInner + borderR;
  for (let i = 1; i < h - 1; i++) rows[i] = emptyRow;

  if (innerW <= 0 || innerH <= 0) return rows;

  // Pre-render ANSI strings (cached across frames)
  let ansiLines: string[];
  if (renderedCache && renderedCache.lines === lines) {
    ansiLines = renderedCache.ansi;
  } else {
    ansiLines = new Array<string>(lines.length);
    for (let i = 0; i < lines.length; i++) {
      ansiLines[i] = renderLine(lines[i]!);
    }
    if (renderedCache) {
      renderedCache.lines = lines;
      renderedCache.ansi = ansiLines;
    }
  }

  // Windowed slice
  const hasOverflow = lines.length > innerH;
  const viewableH = hasOverflow ? innerH - 1 : innerH;
  const maxScroll = Math.max(0, lines.length - viewableH);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);

  // Content rows — clip and compose without buffer splicing
  for (let i = 0; i < viewableH && effectiveOffset + i < ansiLines.length; i++) {
    const clipped = clipAnsi(ansiLines[effectiveOffset + i]!, innerW);
    rows[1 + i] = borderL + clipped + borderR;
  }

  // Scroll indicator
  if (hasOverflow) {
    const scrollPct = maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;
    const indicator = `  ↕ ${scrollPct}% · ${lines.length} lines`;
    const clipped = clipAnsi(`\x1b[2m${indicator}\x1b[0m`, innerW);
    rows[1 + viewableH] = borderL + clipped + borderR;
  }

  return rows;
}

/**
 * Build empty panel rows (border only, no content).
 */
export function buildEmptyPanelRows(
  rect: Rect,
  focused: boolean,
  borderColor: string,
  centerText?: string,
): string[] {
  const { w, h } = rect;
  const rows = new Array<string>(h);
  const color = focused ? 'blue' : borderColor;
  const sgr = `\x1b[${colorToSGR(color)}m`;
  const reset = '\x1b[0m';
  const innerW = w - 4;
  const borderL = sgr + '│' + reset + ' ';
  const borderR = ' ' + sgr + '│' + reset;
  const emptyRow = borderL + ' '.repeat(innerW) + borderR;

  rows[0] = sgr + '╭' + '─'.repeat(w - 2) + '╮' + reset;
  rows[h - 1] = sgr + '╰' + '─'.repeat(w - 2) + '╯' + reset;
  for (let i = 1; i < h - 1; i++) rows[i] = emptyRow;

  if (centerText) {
    const midRow = Math.floor(h / 2);
    if (midRow > 0 && midRow < h - 1) {
      const clipped = clipAnsi(centerText, innerW);
      // Center within panel
      const textW = displayWidthFast(centerText);
      const pad = Math.max(0, Math.floor((innerW - textW) / 2));
      const centered = ' '.repeat(pad) + clipped;
      rows[midRow] = borderL + clipAnsi(centered, innerW) + borderR;
    }
  }

  return rows;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Slice a string (which may contain ANSI escapes) to display columns [start, end).
 * ANSI sequences are passed through only within the slice range.
 */
function sliceDisplayCols(s: string, start: number, end: number, restoreState = false): string {
  let out = '';
  let col = 0;
  let i = 0;
  let inSlice = false;
  let hasOpenSGR = false;

  // When restoreState is true, track the last ANSI state before the slice
  // so it can be prepended — restores bg/fg colors that were set earlier in the line.
  let pendingSGR = '';

  while (i < s.length && col < end) {
    // ANSI escape: pass through if we're in the slice
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const seqLen = ansiLen(s, i);
      if (seqLen > 0) {
        const seq = s.substring(i, i + seqLen);
        if (col >= start) {
          out += seq;
          // Track if we have open SGR (non-reset)
          hasOpenSGR = seq !== '\x1b[0m' && seq !== '\x1b[m';
        } else if (restoreState) {
          // Accumulate ANSI state from before the slice
          if (seq === '\x1b[0m' || seq === '\x1b[m') {
            pendingSGR = '';
          } else {
            pendingSGR += seq;
          }
        }
        i += seqLen;
        continue;
      }
    }

    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chWidth = cp < 128 ? 1 : stringWidth(ch);

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

  // Prepend accumulated state so suffix inherits the correct colors
  if (restoreState && pendingSGR) {
    out = pendingSGR + out;
  }

  return out;
}

/**
 * Gloam-themed markdown highlighter for goal/strategy/roadmap strips.
 *
 * Pure-JS pass that converts markdown text into `DetailLine[]` ready for
 * `renderLine`. Headings get full-width tinted backgrounds (h1 orange →
 * h6 surface gray) with brighter foregrounds; lists, checkboxes, code,
 * blockquotes, and inline emphasis (bold/italic/code/link/strikethrough)
 * get their own styling.
 *
 * The output is sized to `innerW`: heading lines are padded with bg-painted
 * spaces so the tint fills the full strip width when rendered.
 */

import stringWidth from 'string-width';
import { GLOAM } from './gloam.js';
import { cleanMarkdown, stripFrontmatter, type DetailLine, type Seg } from './format.js';

// ─── Heading styles by level ───────────────────────────────────────────────

interface HeadingStyle {
  /** Heading text foreground (the title itself) */
  textFg: string;
  /** Marker (`#…`) foreground — slightly muted vs. text */
  markerFg: string;
  /** Tinted background painted across the full row */
  bg: string;
}

const HEADING_STYLES: HeadingStyle[] = [
  { textFg: GLOAM.bright_orange, markerFg: GLOAM.orange, bg: GLOAM.bg_dim_orange }, // h1
  { textFg: GLOAM.bright_yellow, markerFg: GLOAM.yellow, bg: GLOAM.bg_dim_yellow }, // h2
  { textFg: GLOAM.bright_green,  markerFg: GLOAM.green,  bg: GLOAM.bg_dim_green  }, // h3
  { textFg: GLOAM.bright_blue,   markerFg: GLOAM.blue,   bg: GLOAM.bg_dim_blue   }, // h4
  { textFg: GLOAM.bright_purple, markerFg: GLOAM.purple, bg: GLOAM.bg_dim_purple }, // h5
  { textFg: GLOAM.fg2,           markerFg: GLOAM.fg3,    bg: GLOAM.bg_bg1        }, // h6
];

// ─── Display-hazard cleanup ────────────────────────────────────────────────
// Mirrors `cleanMarkdown`'s emoji-handling without touching markdown syntax.

function stripDisplayHazards(s: string): string {
  return s
    .replace(/✅/g, '✓')
    .replace(/❌/g, '✗')
    .replace(/\p{Emoji_Presentation}/gu, '');
}

// ─── Inline emphasis tokenizer ─────────────────────────────────────────────

interface InlineSpan {
  start: number;
  end: number;
  kind: 'bold' | 'italic' | 'code' | 'strike' | 'link';
  /** rendered display text for the span (markers stripped) */
  text: string;
}

const INLINE_RE =
  /\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`|~~([^~\n]+)~~|\[([^\]\n]+)\]\(([^)\n]+)\)/g;

function tokenizeInline(line: string, baseFg: string, baseStyle?: Partial<Seg>): Seg[] {
  const out: Seg[] = [];
  const baseSeg = (text: string): Seg => ({ text, fg: baseFg, ...baseStyle });

  let cursor = 0;
  for (const m of line.matchAll(INLINE_RE)) {
    const idx = m.index!;
    if (idx > cursor) out.push(baseSeg(line.slice(cursor, idx)));

    if (m[1] !== undefined) {
      out.push({ text: m[1], fg: GLOAM.fg0, bold: true, bg: baseStyle?.bg });
    } else if (m[2] !== undefined) {
      out.push({ text: m[2], fg: GLOAM.fg0, bold: true, bg: baseStyle?.bg });
    } else if (m[3] !== undefined) {
      out.push({ text: m[3], fg: GLOAM.fg0, italic: true, bg: baseStyle?.bg });
    } else if (m[4] !== undefined) {
      out.push({ text: m[4], fg: GLOAM.fg0, italic: true, bg: baseStyle?.bg });
    } else if (m[5] !== undefined) {
      // Inline code — aqua fg, subtle bg1 tint (skip when inside heading bg)
      out.push({
        text: m[5],
        fg: GLOAM.aqua,
        bg: baseStyle?.bg ?? GLOAM.bg_bg1,
      });
    } else if (m[6] !== undefined) {
      out.push({ text: m[6], fg: GLOAM.fg3, strikethrough: true, bg: baseStyle?.bg });
    } else if (m[7] !== undefined && m[8] !== undefined) {
      out.push({ text: m[7], fg: GLOAM.blue, bold: true, bg: baseStyle?.bg });
    }

    cursor = idx + m[0].length;
  }
  if (cursor < line.length) out.push(baseSeg(line.slice(cursor)));
  if (out.length === 0) out.push(baseSeg(''));
  return out;
}

// ─── Plain-text width (sums Seg.text display widths) ───────────────────────

function segsDisplayWidth(segs: Seg[]): number {
  let w = 0;
  for (const s of segs) w += stringWidth(s.text);
  return w;
}

// ─── Soft-wrap a pre-tokenized line to width ───────────────────────────────
// Tokenizes input segs into word/space atoms (preserving each char's style),
// then greedy-packs atoms onto lines. Word boundaries are respected even when
// they straddle segment boundaries (e.g. " guard around" spilling out of a
// preceding inline-code span). Continuation lines get a plain-space indent.

interface Atom {
  text: string;
  width: number;
  style: Omit<Seg, 'text'>;
  /** true → atom is a run of spaces (collapsible at line boundaries) */
  space: boolean;
}

function segsToAtoms(segs: Seg[]): Atom[] {
  const atoms: Atom[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const { text, ...style } = s;
    // Split on whitespace boundaries: every run of spaces becomes a `space`
    // atom; every non-space run becomes a word atom.
    const re = /(\s+|\S+)/g;
    for (const m of text.matchAll(re)) {
      const piece = m[0];
      atoms.push({
        text: piece,
        width: stringWidth(piece),
        style,
        space: /^\s+$/.test(piece),
      });
    }
  }
  return atoms;
}

function wrapSegs(segs: Seg[], width: number, contIndent: string): DetailLine[] {
  if (width <= 0) return [segs];
  const atoms = segsToAtoms(segs);
  if (atoms.length === 0) return [[{ text: '' }]];

  const lines: DetailLine[] = [];
  let current: Seg[] = [];
  let currentWidth = 0;

  const pushAtom = (a: Atom) => {
    current.push({ ...a.style, text: a.text });
    currentWidth += a.width;
  };
  const flushLine = () => {
    // Trim trailing pure-space segs (cosmetic: tinted/colored trailing space
    // can leak across the right border when bg-painted, so prefer cleaner
    // breaks). Heading lines never reach here — they bypass wrapping.
    while (current.length > 0) {
      const last = current[current.length - 1]!;
      if (/^\s+$/.test(last.text) && !last.bg) {
        currentWidth -= stringWidth(last.text);
        current.pop();
      } else break;
    }
    lines.push(current.length > 0 ? current : [{ text: '' }]);
    current = [];
    currentWidth = 0;
  };

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i]!;

    if (atom.space) {
      // Spaces that overflow the right edge are dropped at the wrap boundary
      // — flushLine() will trim non-bg trailing whitespace anyway. Leading
      // spaces (line-start indent on the first body line) are preserved.
      if (currentWidth + atom.width <= width) pushAtom(atom);
      continue;
    }

    // Word atom
    if (atom.width > width) {
      // Word wider than full line → hard-break it on character boundaries.
      let remaining = atom.text;
      while (remaining.length > 0) {
        const spaceLeft = width - currentWidth;
        if (spaceLeft <= 0) {
          flushLine();
          if (contIndent) {
            current.push({ text: contIndent });
            currentWidth = stringWidth(contIndent);
          }
          continue;
        }
        let cut = 0;
        let cutW = 0;
        for (let k = 0; k < remaining.length; k++) {
          const cw = stringWidth(remaining[k]!);
          if (cutW + cw > spaceLeft) break;
          cutW += cw;
          cut = k + 1;
        }
        if (cut === 0) {
          flushLine();
          if (contIndent) {
            current.push({ text: contIndent });
            currentWidth = stringWidth(contIndent);
          }
          continue;
        }
        current.push({ ...atom.style, text: remaining.slice(0, cut) });
        currentWidth += cutW;
        remaining = remaining.slice(cut);
        if (remaining.length > 0) {
          flushLine();
          if (contIndent) {
            current.push({ text: contIndent });
            currentWidth = stringWidth(contIndent);
          }
        }
      }
      continue;
    }

    if (currentWidth + atom.width > width) {
      flushLine();
      if (contIndent) {
        current.push({ text: contIndent });
        currentWidth = stringWidth(contIndent);
      }
    }
    pushAtom(atom);
  }
  flushLine();
  return lines.length > 0 ? lines : [[{ text: '' }]];
}

// ─── Heading rendering — full-width bg-padded ──────────────────────────────

function buildHeadingLine(
  level: number,
  rawText: string,
  innerW: number,
): DetailLine {
  const style = HEADING_STYLES[Math.min(level - 1, HEADING_STYLES.length - 1)]!;
  const cleanedText = stripDisplayHazards(rawText).trim();
  const marker = '#'.repeat(level);
  const prefix = '  '; // matches the standard 2-space content margin
  const sep = ' ';

  const headerSegs: Seg[] = [
    { text: prefix, bg: style.bg },
    { text: marker, fg: style.markerFg, bg: style.bg, bold: true },
    { text: sep, bg: style.bg },
    { text: cleanedText, fg: style.textFg, bg: style.bg, bold: true },
  ];
  const used = segsDisplayWidth(headerSegs);
  const padW = Math.max(0, innerW - used);
  if (padW > 0) {
    headerSegs.push({ text: ' '.repeat(padW), bg: style.bg });
  }
  return headerSegs;
}

// ─── Bullet/numbered list ──────────────────────────────────────────────────

function buildListLine(
  marker: string,
  body: string,
  innerW: number,
  prefixIndent: string,
  markerFg: string,
): DetailLine[] {
  const indent = `${prefixIndent}  `; // continuation aligns under text
  const head: Seg[] = [
    { text: prefixIndent, fg: GLOAM.fg2 },
    { text: marker, fg: markerFg, bold: true },
    { text: ' ', fg: GLOAM.fg2 },
  ];
  const headW = segsDisplayWidth(head);
  const bodySegs = tokenizeInline(stripDisplayHazards(body), GLOAM.fg1);
  const wrapped = wrapSegs([...head, ...bodySegs], innerW, indent);
  // wrapSegs treats the indent+head as part of segs — but we want first-line
  // to start with our colored head and continuations to use plain indent.
  // To keep things simple, we already wrap with contIndent set.
  return wrapped;
  // Note: contIndent is plain (no fg) to keep continuation rows readable;
  // wrapSegs prepends a single indent seg for each new line — good enough.
}

// ─── Checkbox ──────────────────────────────────────────────────────────────

function buildCheckboxLine(
  checked: boolean,
  body: string,
  innerW: number,
): DetailLine[] {
  const icon = checked ? '☑' : '☐';
  const iconFg = checked ? GLOAM.green : GLOAM.fg4;
  const head: Seg[] = [
    { text: '  ', fg: GLOAM.fg2 },
    { text: icon, fg: iconFg, bold: true },
    { text: ' ', fg: GLOAM.fg2 },
  ];
  const bodyFg = checked ? GLOAM.fg3 : GLOAM.fg1;
  const bodyStyle = checked ? { strikethrough: true } : {};
  const bodySegs = tokenizeInline(stripDisplayHazards(body), bodyFg, bodyStyle);
  return wrapSegs([...head, ...bodySegs], innerW, '    ');
}

// ─── Blockquote ────────────────────────────────────────────────────────────

function buildQuoteLine(body: string, innerW: number): DetailLine[] {
  const head: Seg[] = [
    { text: '  ', fg: GLOAM.fg2 },
    { text: '▎ ', fg: GLOAM.fg3 },
  ];
  const bodySegs = tokenizeInline(stripDisplayHazards(body), GLOAM.fg2, { italic: true });
  return wrapSegs([...head, ...bodySegs], innerW, '    ');
}

// ─── Horizontal rule ───────────────────────────────────────────────────────

function buildHrLine(innerW: number): DetailLine {
  const w = Math.max(2, innerW - 4);
  return [
    { text: '  ', fg: GLOAM.fg4 },
    { text: '─'.repeat(w), fg: GLOAM.fg4 },
  ];
}

// ─── Code block content ────────────────────────────────────────────────────

function buildCodeFenceLine(fence: string, innerW: number): DetailLine {
  return [
    { text: '  ', fg: GLOAM.fg4 },
    {
      text: fence + ' '.repeat(Math.max(0, innerW - 2 - stringWidth(fence))),
      fg: GLOAM.fg4,
      bg: GLOAM.bg_bg1,
    },
  ];
}

function buildCodeLine(content: string, innerW: number): DetailLine {
  const cleaned = stripDisplayHazards(content);
  const cw = stringWidth(cleaned);
  const padW = Math.max(0, innerW - 2 - cw);
  return [
    { text: '  ', bg: GLOAM.bg_bg1 },
    { text: cleaned, fg: GLOAM.aqua, bg: GLOAM.bg_bg1 },
    ...(padW > 0 ? [{ text: ' '.repeat(padW), bg: GLOAM.bg_bg1 }] : []),
  ];
}

// ─── Plain paragraph ───────────────────────────────────────────────────────

function buildParagraphLines(body: string, innerW: number): DetailLine[] {
  const head: Seg[] = [{ text: '  ', fg: GLOAM.fg1 }];
  const bodySegs = tokenizeInline(stripDisplayHazards(body), GLOAM.fg1);
  return wrapSegs([...head, ...bodySegs], innerW, '  ');
}

// ─── GFM tables ────────────────────────────────────────────────────────────

type TableAlign = 'left' | 'center' | 'right';

function parseTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseTableSeparator(line: string): TableAlign[] | null {
  if (!line.includes('|') && !/^[\s:|+-]+$/.test(line)) return null;
  const cells = parseTableCells(line);
  if (cells.length === 0) return null;
  const aligns: TableAlign[] = [];
  for (const c of cells) {
    const m = c.match(/^(:?)\s*-{2,}\s*(:?)$/);
    if (!m) return null;
    if (m[1] === ':' && m[2] === ':') aligns.push('center');
    else if (m[2] === ':') aligns.push('right');
    else aligns.push('left');
  }
  return aligns;
}

function padCell(text: string, width: number, align: TableAlign): string {
  const w = stringWidth(text);
  const pad = Math.max(0, width - w);
  let left = 0;
  let right = 0;
  if (align === 'right') left = pad;
  else if (align === 'center') {
    left = Math.floor(pad / 2);
    right = pad - left;
  } else right = pad;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

/**
 * Soft-wrap cell text to `width` columns, returning each visual line padded
 * (and aligned) to exactly `width` display columns. Words longer than the
 * column hard-break on character boundaries.
 */
function wrapCell(text: string, width: number, align: TableAlign): string[] {
  if (width <= 0) return [''];
  const cleaned = cleanMarkdown(text);
  if (cleaned === '') return [padCell('', width, align)];

  const out: string[] = [];
  let cur = '';
  let curW = 0;
  const flush = () => {
    out.push(padCell(cur.replace(/\s+$/, ''), width, align));
    cur = '';
    curW = 0;
  };

  for (const piece of cleaned.match(/\s+|\S+/g) ?? []) {
    const isSpace = /^\s+$/.test(piece);
    const pw = stringWidth(piece);

    if (isSpace) {
      if (curW === 0) continue; // drop leading whitespace on a wrapped line
      if (curW + pw > width) flush();
      else {
        cur += piece;
        curW += pw;
      }
      continue;
    }

    if (curW + pw <= width) {
      cur += piece;
      curW += pw;
      continue;
    }

    if (curW > 0) flush();

    if (pw > width) {
      // Hard-break a word wider than the column.
      let rem = piece;
      while (rem.length > 0) {
        let cut = 0;
        let cutW = 0;
        for (let k = 0; k < rem.length; k++) {
          const cw = stringWidth(rem[k]!);
          if (cutW + cw > width) break;
          cutW += cw;
          cut = k + 1;
        }
        if (cut === 0) cut = 1;
        const slice = rem.slice(0, cut);
        if (cut === rem.length) {
          cur = slice;
          curW = stringWidth(slice);
        } else {
          out.push(padCell(slice, width, align));
        }
        rem = rem.slice(cut);
      }
      continue;
    }

    cur = piece;
    curW = pw;
  }

  if (curW > 0 || out.length === 0) flush();
  return out;
}

function buildTableLines(
  headers: string[],
  alignsIn: TableAlign[],
  rowsIn: string[][],
  innerW: number,
): DetailLine[] {
  const ncols = headers.length;
  if (ncols === 0) return [];

  // Normalize aligns and rows to exactly ncols entries so downstream indexing
  // is total. Missing entries default to left-align / empty string.
  const aligns: TableAlign[] = [];
  for (let i = 0; i < ncols; i++) {
    const a = alignsIn[i];
    aligns.push(a === undefined ? 'left' : a);
  }

  const rows: string[][] = rowsIn.map((r) => {
    const out: string[] = [];
    for (let i = 0; i < ncols; i++) {
      const c = r[i];
      out.push(c === undefined ? '' : c);
    }
    return out;
  });

  // Natural widths from cleaned cell text
  const naturalW: number[] = new Array(ncols).fill(0);
  const measure = (cells: string[]) => {
    for (let i = 0; i < ncols; i++) {
      const w = stringWidth(cleanMarkdown(cells[i]!));
      if (w > naturalW[i]!) naturalW[i] = w;
    }
  };
  measure(headers);
  for (const r of rows) measure(r);

  // Layout: 2-char margin + left border + (cell + right-border) per column.
  // Each cell is " <content> " (2 chars padding) so per-column overhead is 3
  // (one separator + two pad spaces). Plus 1 for the leading border.
  const margin = 2;
  const overhead = 1 + ncols * 3;
  const available = innerW - margin - overhead;
  const minColW = 3;

  if (available < ncols * minColW) {
    return [[{ text: '  (table too narrow to render)', fg: GLOAM.fg4, italic: true }]];
  }

  const colW: number[] = [...naturalW];
  for (let i = 0; i < ncols; i++) if (colW[i]! < minColW) colW[i] = minColW;
  let total = colW.reduce((a, b) => a + b, 0);

  if (total > available) {
    // Shrink the widest column repeatedly until it fits.
    while (total > available) {
      let widest = 0;
      for (let i = 1; i < ncols; i++) if (colW[i]! > colW[widest]!) widest = i;
      if (colW[widest]! <= minColW) break;
      colW[widest]!--;
      total--;
    }
  } else if (total < available) {
    // Grow the widest column to absorb the slack so the right border aligns.
    while (total < available) {
      let widest = 0;
      for (let i = 1; i < ncols; i++) if (colW[i]! > colW[widest]!) widest = i;
      colW[widest]!++;
      total++;
    }
  }

  const borderFg = GLOAM.fg3;
  const headerFg = GLOAM.fg0;
  const headerBg = GLOAM.bg_bg1;
  const cellFg = GLOAM.fg1;
  const marginText = '  ';

  const buildBorder = (left: string, mid: string, right: string): DetailLine => {
    let s = left;
    for (let i = 0; i < ncols; i++) {
      s += '─'.repeat(colW[i]! + 2);
      s += i === ncols - 1 ? right : mid;
    }
    return [{ text: marginText }, { text: s, fg: borderFg }];
  };

  const buildDataRow = (cells: string[], header: boolean): DetailLine[] => {
    const wrapped: string[][] = [];
    for (let i = 0; i < ncols; i++) {
      const cell = cells[i];
      wrapped.push(wrapCell(cell === undefined ? '' : cell, colW[i]!, aligns[i]!));
    }
    let height = 1;
    for (const w of wrapped) if (w.length > height) height = w.length;
    // Pad shorter columns with blank lines so the row has a uniform height.
    for (let i = 0; i < ncols; i++) {
      const blank = ' '.repeat(colW[i]!);
      while (wrapped[i]!.length < height) wrapped[i]!.push(blank);
    }

    const out: DetailLine[] = [];
    for (let row = 0; row < height; row++) {
      const segs: Seg[] = [
        { text: marginText },
        { text: '│', fg: borderFg },
      ];
      for (let i = 0; i < ncols; i++) {
        const padded = ' ' + wrapped[i]![row]! + ' ';
        segs.push(
          header
            ? { text: padded, fg: headerFg, bg: headerBg, bold: true }
            : { text: padded, fg: cellFg },
        );
        segs.push({ text: '│', fg: borderFg });
      }
      out.push(segs);
    }
    return out;
  };

  const out: DetailLine[] = [];
  out.push(buildBorder('┌', '┬', '┐'));
  for (const dl of buildDataRow(headers, true)) out.push(dl);
  out.push(buildBorder('├', '┼', '┤'));
  for (const r of rows) for (const dl of buildDataRow(r, false)) out.push(dl);
  out.push(buildBorder('└', '┴', '┘'));
  return out;
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Convert a markdown document into a stream of styled DetailLine[] sized to
 * `innerW` columns. Trailing/leading blank lines are normalized; YAML
 * frontmatter is stripped via the shared helper.
 */
export function buildHighlightedMarkdownLines(
  content: string,
  innerW: number,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const clean = stripFrontmatter(content);
  if (!clean.trim()) {
    lines.push([{ text: '  (empty)', fg: GLOAM.fg4, italic: true }]);
    return lines;
  }

  const rawLines = clean.split('\n');
  let inCodeBlock = false;

  for (let li = 0; li < rawLines.length; li++) {
    const raw = rawLines[li]!;
    const trimmed = raw.trim();

    // Code fence — toggles block state, rendered as a dim line
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      lines.push(buildCodeFenceLine(trimmed, innerW));
      continue;
    }

    if (inCodeBlock) {
      lines.push(buildCodeLine(raw.replace(/\t/g, '    '), innerW));
      continue;
    }

    // GFM table: current line has a pipe and next line is an alignment row.
    if (trimmed.includes('|') && li + 1 < rawLines.length) {
      const sepLine = rawLines[li + 1]!;
      const sepAligns = parseTableSeparator(sepLine);
      if (sepAligns) {
        const headers = parseTableCells(raw);
        const tRows: string[][] = [];
        let j = li + 2;
        while (j < rawLines.length) {
          const next = rawLines[j]!;
          if (next.trim() === '') break;
          if (!next.includes('|')) break;
          if (/^```/.test(next.trim())) break;
          tRows.push(parseTableCells(next));
          j++;
        }
        for (const tl of buildTableLines(headers, sepAligns, tRows, innerW)) lines.push(tl);
        li = j - 1; // resume after consumed rows; loop ++ moves past them
        continue;
      }
    }

    // Empty line
    if (trimmed === '') {
      // Collapse multi-blanks into a single blank
      const last = lines[lines.length - 1];
      if (last && last.length === 1 && last[0]!.text === '') continue;
      lines.push([{ text: '' }]);
      continue;
    }

    // Frontmatter delimiter inside body (already stripped above, but defensive)
    if (trimmed === '---') {
      lines.push(buildHrLine(innerW));
      continue;
    }

    // Heading
    const headMatch = raw.match(/^(\s*)(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headMatch) {
      const level = headMatch[2]!.length;
      lines.push(buildHeadingLine(level, headMatch[3]!, innerW));
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      lines.push(buildHrLine(innerW));
      continue;
    }

    // Checkbox (must come before bullet match)
    const cbMatch = raw.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if (cbMatch) {
      const checked = cbMatch[1] !== ' ';
      for (const wl of buildCheckboxLine(checked, cbMatch[2]!, innerW)) lines.push(wl);
      continue;
    }

    // Numbered list
    const numMatch = raw.match(/^(\s*)(\d+)([.)])\s+(.+)$/);
    if (numMatch) {
      const indent = numMatch[1]!.length > 0 ? '    ' : '  ';
      const marker = `${numMatch[2]}${numMatch[3]}`;
      for (const wl of buildListLine(marker, numMatch[4]!, innerW, indent, GLOAM.purple)) {
        lines.push(wl);
      }
      continue;
    }

    // Bullet list
    const bulMatch = raw.match(/^(\s*)([-*+])\s+(.+)$/);
    if (bulMatch) {
      const depth = Math.floor(bulMatch[1]!.length / 2);
      const indent = '  ' + '  '.repeat(Math.min(depth, 4));
      const bullet = depth === 0 ? '·' : '◦';
      for (const wl of buildListLine(bullet, bulMatch[3]!, innerW, indent, GLOAM.orange)) {
        lines.push(wl);
      }
      continue;
    }

    // Blockquote
    const qMatch = raw.match(/^\s*>\s?(.*)$/);
    if (qMatch) {
      for (const wl of buildQuoteLine(qMatch[1]!, innerW)) lines.push(wl);
      continue;
    }

    // Paragraph
    for (const wl of buildParagraphLines(trimmed, innerW)) lines.push(wl);
  }

  // Trim trailing blank
  while (lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (last.length === 1 && last[0]!.text === '') lines.pop();
    else break;
  }

  return lines;
}

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
import { stripFrontmatter, type DetailLine, type Seg } from './format.js';

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

  for (const raw of rawLines) {
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

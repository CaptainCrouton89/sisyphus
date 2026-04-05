import { execFileSync } from 'node:child_process';
import stringWidth from 'string-width';

// ─── ANSI Constants ─────────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const FG_WHITE = `${ESC}37m`;
const FG_CYAN = `${ESC}36m`;

// ─── Termrender Availability ────────────────────────────────────────────────

let termrenderAvailable: boolean | null = null;

function isTermrenderAvailable(): boolean {
  if (termrenderAvailable !== null) return termrenderAvailable;
  try {
    execFileSync('termrender', ['--version'], { stdio: 'pipe', timeout: 3000 });
    termrenderAvailable = true;
  } catch {
    termrenderAvailable = false;
  }
  return termrenderAvailable;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const cache = new Map<string, string[]>();

// ─── Fallback: Plain Text Rendering ─────────────────────────────────────────

function visWidth(s: string): number {
  return stringWidth(s.replace(/\x1b\[[0-9;]*m/g, ''));
}

function wrapTextPlain(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    let line = '';
    for (const word of rawLine.split(/(\s+)/)) {
      if (line.length + word.length > width && line.length > 0) {
        result.push(line);
        line = word.trimStart();
      } else {
        line += word;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

const DIAGRAM_RE = /[─│┌┐└┘├┤┬┴┼╭╮╯╰▸▹►▲▼◄═║╔╗╚╝]/;
const INDENT_RE = /^\s{4,}\S/;
const PIPE_RE = /[│|+\-]{2,}/;

function isDiagramLine(line: string): boolean {
  return DIAGRAM_RE.test(line) || INDENT_RE.test(line) || PIPE_RE.test(line);
}

function renderFallback(text: string, width: number, prefix: string, baseColor: string, diagramColor: string): string[] {
  const lines: string[] = [];
  for (const cl of text.split('\n')) {
    if (cl.trim() === '') {
      lines.push('');
    } else if (isDiagramLine(cl)) {
      lines.push(`${prefix}${diagramColor}${cl}${RESET}`);
    } else {
      for (const wl of wrapTextPlain(cl, width - visWidth(prefix))) {
        lines.push(`${prefix}${baseColor}${wl}${RESET}`);
      }
    }
  }
  return lines;
}

// ─── Termrender Rendering ───────────────────────────────────────────────────

function renderViaTermrender(text: string, innerWidth: number): string[] | null {
  try {
    const output = execFileSync('termrender', ['--width', String(innerWidth)], {
      input: text,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Split into lines, drop trailing empty line from final newline
    const lines = output.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RenderMarkdownOpts {
  /** Left margin pad string (pre-computed) */
  margin?: string;
  /** Inner indent within margin (default: '  ') */
  indent?: string;
  /** Default text color for fallback rendering (default: FG_WHITE) */
  baseColor?: string;
  /** Diagram line color for fallback rendering (default: FG_CYAN) */
  diagramColor?: string;
}

/**
 * Render markdown text as ANSI-formatted terminal lines.
 *
 * Uses `termrender` CLI for full markdown rendering (bold, italic, code,
 * tables, headers, lists, blockquotes). Falls back to plain text with
 * diagram detection if termrender is not installed.
 *
 * Results are cached by text+width — safe to call on every render cycle.
 */
export function renderMarkdownLines(
  text: string,
  width: number,
  opts?: RenderMarkdownOpts,
): string[] {
  const margin = opts?.margin ?? '';
  const indent = opts?.indent ?? '  ';
  const prefix = `${margin}${indent}`;
  const innerWidth = width - visWidth(indent) * 2;

  if (innerWidth <= 0) return [text];

  const cacheKey = `${text}\0${innerWidth}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached.map(line => `${prefix}${line}`);
  }

  if (isTermrenderAvailable()) {
    const rendered = renderViaTermrender(text, innerWidth);
    if (rendered) {
      cache.set(cacheKey, rendered);
      return rendered.map(line => `${prefix}${line}`);
    }
  }

  // Fallback: plain text with diagram detection
  const baseColor = opts?.baseColor ?? FG_WHITE;
  const diagramColor = opts?.diagramColor ?? FG_CYAN;
  return renderFallback(text, width, prefix, baseColor, diagramColor);
}

/** Clear the render cache (e.g., on terminal resize) */
export function clearMarkdownCache(): void {
  cache.clear();
}

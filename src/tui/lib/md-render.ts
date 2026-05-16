import { renderMarkdown } from '@crouton-kit/humanloop';
import stringWidth from 'string-width';

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RenderMarkdownOpts {
  /** Left margin pad string (pre-computed) */
  margin?: string;
  /** Inner indent within margin (default: '  ') */
  indent?: string;
  /** Default text color for fallback rendering (unused — kept for API compat) */
  baseColor?: string;
  /** Diagram line color for fallback rendering (unused — kept for API compat) */
  diagramColor?: string;
}

function visWidth(s: string): number {
  return stringWidth(s.replace(/\x1b\[[0-9;]*m/g, ''));
}

/**
 * Render markdown text as ANSI-formatted terminal lines.
 *
 * Delegates to humanloop's `renderMarkdown` for full rendering.
 * Applies the indent/margin prefix wrapper.
 *
 * Results are cached inside humanloop — safe to call on every render cycle.
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

  const rendered = renderMarkdown(text, innerWidth);
  return rendered.map(line => `${prefix}${line}`);
}

/** Clear the render cache (no-op — cache is managed by humanloop) */
export function clearMarkdownCache(): void {
  // humanloop manages its own render cache
}

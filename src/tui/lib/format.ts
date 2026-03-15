export function formatDuration(startOrMs: string | number, endIso?: string | null): string {
  let totalMs: number;
  if (typeof startOrMs === 'number') {
    totalMs = startOrMs;
  } else {
    const start = new Date(startOrMs).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    totalMs = end - start;
  }
  const totalSeconds = Math.floor(totalMs / 1000);
  if (totalSeconds < 0) return '0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function truncate(text: string, max: number): string {
  if (max < 4) return text.slice(0, max);
  if (text.length <= max) return text;
  // Try to break at a word boundary
  const cut = text.lastIndexOf(' ', max - 1);
  const breakAt = cut > max * 0.6 ? cut : max - 1;
  return text.slice(0, breakAt) + '…';
}

/** Strip markdown syntax to plain text */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/---+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the first meaningful sentence from markdown-heavy text.
 * Much better than blind truncation — finds actual content.
 */
export function extractFirstSentence(text: string, maxLen: number): string {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('---')) continue;
    if (trimmed.startsWith('```')) continue;
    if (trimmed.startsWith('|')) continue;
    if (trimmed.length < 5) continue;

    const cleaned = stripMarkdown(trimmed);
    if (cleaned.length < 5) continue;

    // Try to end at a sentence boundary
    const periodIdx = cleaned.indexOf('. ');
    if (periodIdx > 10 && periodIdx < maxLen) {
      return cleaned.slice(0, periodIdx + 1);
    }
    return truncate(cleaned, maxLen);
  }
  const fallback = stripMarkdown(text);
  return truncate(fallback, maxLen);
}

export function durationColor(startOrMs: string | number, endIso?: string | null): string {
  let totalMs: number;
  if (typeof startOrMs === 'number') {
    totalMs = startOrMs;
  } else {
    const start = new Date(startOrMs).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    totalMs = end - start;
  }
  if (totalMs < 10 * 60 * 1000) return '';
  if (totalMs < 30 * 60 * 1000) return 'yellow';
  return 'red';
}

export function statusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'running':
      return 'green';
    case 'completed':
      return 'cyan';
    case 'paused':
      return 'yellow';
    case 'killed':
    case 'crashed':
      return 'red';
    case 'lost':
      return 'gray';
    default:
      return 'white';
  }
}

export function statusIndicator(status: string): string {
  switch (status) {
    case 'active':
      return '▶';
    case 'completed':
      return '✓';
    case 'paused':
      return '⏸';
    default:
      return '·';
  }
}

export function agentStatusIcon(status: string): string {
  switch (status) {
    case 'running':
      return '▶';
    case 'completed':
      return '✓';
    case 'killed':
      return '✕';
    case 'crashed':
      return '!';
    case 'lost':
      return '?';
    default:
      return '·';
  }
}

export function agentTypeColor(agentType: string | undefined): string | undefined {
  if (!agentType) return undefined;
  const t = agentType.toLowerCase();
  if (t.includes('research')) return 'blue';
  if (t.includes('implement') || t.includes('code')) return 'green';
  if (t.includes('review') || t.includes('test')) return 'magenta';
  if (t.includes('plan')) return 'yellow';
  return undefined;
}

export function divider(width: number, char: string = '─'): string {
  return char.repeat(Math.max(0, width));
}

/** Strip YAML frontmatter (--- ... ---) from markdown content */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

/** Clean inline markdown syntax for terminal display */
export function cleanMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return text.split('\n');
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(' ', width);
      if (breakAt <= 0) breakAt = width;
      result.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}

/** Format milliseconds or ISO date range to human-readable duration */
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

/** Map session/agent status to a color name */
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

// Color enabled if stdout is a TTY, NO_COLOR is not set, and TERM is not dumb.
// FORCE_COLOR=1 overrides all of the above.
const COLOR_ENABLED =
  process.env['FORCE_COLOR'] === '1' ||
  (process.stdout.isTTY === true &&
    process.env['NO_COLOR'] === undefined &&
    process.env['TERM'] !== 'dumb');

function wrap(open: string, close: string = '\x1b[0m') {
  return (s: string): string => COLOR_ENABLED ? `${open}${s}${close}` : s;
}

export const bold = wrap('\x1b[1m');
export const dim = wrap('\x1b[2m');
export const red = wrap('\x1b[31m');
export const green = wrap('\x1b[32m');
export const yellow = wrap('\x1b[33m');
export const cyan = wrap('\x1b[36m');
export const gray = wrap('\x1b[90m');
export const magenta = wrap('\x1b[35m');
export const white = wrap('\x1b[37m');

const COLOR_FNS: Record<string, (s: string) => string> = {
  red, green, yellow, cyan, gray, magenta, white,
  bold, dim,
};

export function colorize(text: string, colorName: string): string {
  const fn = COLOR_FNS[colorName];
  return fn ? fn(text) : text;
}

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

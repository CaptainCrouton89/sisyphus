import type { Session } from './types.js';

/**
 * Compute the total wall-clock milliseconds during which at least one
 * orchestrator cycle or agent was running. Merges overlapping intervals
 * so parallel agents aren't double-counted.
 */
export function computeActiveTimeMs(session: Session): number {
  const now = Date.now();
  const intervals: Array<[number, number]> = [];

  for (const cycle of session.orchestratorCycles) {
    const start = new Date(cycle.timestamp).getTime();
    const end = cycle.completedAt ? new Date(cycle.completedAt).getTime() : now;
    if (end > start) intervals.push([start, end]);
  }

  for (const agent of session.agents) {
    const start = new Date(agent.spawnedAt).getTime();
    const end = agent.completedAt ? new Date(agent.completedAt).getTime() : now;
    if (end > start) intervals.push([start, end]);
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [intervals[0]!];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur = intervals[i]!;
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }

  return merged.reduce((sum, [start, end]) => sum + (end - start), 0);
}

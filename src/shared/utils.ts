import type { Session } from './types.js';

/**
 * Return the tracked active time for a session.
 * Active time is accumulated by the daemon's pane monitor, excluding sleep/idle gaps.
 */
export function computeActiveTimeMs(session: Session): number {
  return session.activeMs;
}

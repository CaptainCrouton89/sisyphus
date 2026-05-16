import { existsSync, readFileSync } from 'node:fs';
import { digestPath } from './paths.js';
import type { StatusDigest } from './types.js';

/**
 * Spinner-verb list derived from a session's digest.json, or null when the
 * digest is missing/malformed/empty. unusualEvents are prefixed `unusual:` so
 * they read distinctly from the plain status lines as the spinner rotates.
 */
export function digestSpinnerVerbs(cwd: string, sessionId: string): string[] | null {
  try {
    const dp = digestPath(cwd, sessionId);
    if (!existsSync(dp)) return null;
    const raw = JSON.parse(readFileSync(dp, 'utf-8')) as Partial<StatusDigest>;
    if (
      !raw ||
      typeof raw.recentWork !== 'string' ||
      typeof raw.currentActivity !== 'string' ||
      typeof raw.whatsNext !== 'string' ||
      !Array.isArray(raw.unusualEvents)
    ) {
      return null;
    }
    const base = [raw.recentWork, raw.currentActivity, raw.whatsNext]
      .map(v => v.trim())
      .filter(v => v.length > 0);
    const unusual = raw.unusualEvents
      .filter((e): e is string => typeof e === 'string')
      .map(e => e.trim())
      .filter(e => e.length > 0)
      .map(e => `unusual: ${e}`);
    const verbs = [...base, ...unusual];
    return verbs.length > 0 ? verbs : null;
  } catch {
    return null;
  }
}

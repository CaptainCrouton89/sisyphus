import { statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Keep ~/.sisyphus/daemon.log bounded. launchd opens the log via StandardOutPath
 * with O_APPEND, so truncating the inode through a separate fd resets size to 0
 * and the next stdout write lands at byte 0 (O_APPEND re-seeks to EOF per write).
 *
 * No rotation files — this is a daemon log, not an audit trail. If you need
 * history, you needed it before it hit 100MB.
 */

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 60_000;

let rotateInterval: ReturnType<typeof setInterval> | null = null;

function logPath(): string {
  return join(homedir(), '.sisyphus', 'daemon.log');
}

function checkAndTruncate(maxBytes: number): void {
  const path = logPath();
  try {
    const stat = statSync(path);
    if (stat.size <= maxBytes) return;
    truncateSync(path, 0);
    // Log the rotation itself so future log archaeology shows the gap was intentional.
    console.log(`[sisyphus] daemon.log truncated at ${stat.size} bytes (cap ${maxBytes})`);
  } catch (err) {
    // If the log doesn't exist or we can't stat it, there's nothing useful to do.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.error('[sisyphus] log-rotate stat/truncate failed:', err);
    }
  }
}

export function startLogRotator(
  maxBytes: number = DEFAULT_MAX_BYTES,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  if (rotateInterval) return;
  // Run once at startup so a daemon restart on top of a bloated log resets it
  // immediately rather than waiting for the first tick.
  checkAndTruncate(maxBytes);
  rotateInterval = setInterval(() => checkAndTruncate(maxBytes), intervalMs);
  rotateInterval.unref?.();
}

export function stopLogRotator(): void {
  if (rotateInterval) {
    clearInterval(rotateInterval);
    rotateInterval = null;
  }
}

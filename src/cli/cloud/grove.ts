import { shellQuote } from '../../shared/shell.js';
import { runOnBox } from '../deploy/ssh-exec.js';
import type { Provider } from '../deploy/creds.js';

/**
 * Pinned grove version installed on the cloud box. Bump intentionally; auto-
 * updates are not wired into the daily sisyphusd-update timer.
 */
export const GROVE_VERSION = '0.2.13';

/**
 * Ensure grove is installed on the box. Idempotent: short-circuits if `grove`
 * is already on PATH. Installs globally via `sudo npm i -g` (the deploy box
 * uses the NodeSource APT install with /usr/lib/node_modules root-owned).
 */
export function ensureGroveInstalled(provider: Provider): void {
  const probe = runOnBox(provider, 'command -v grove >/dev/null 2>&1');
  if (probe.exitCode === 0) return;
  process.stderr.write('Installing grove on box...\n');
  const install = runOnBox(provider, `sudo npm i -g @crouton-kit/grove@${GROVE_VERSION}`);
  if (install.exitCode !== 0) {
    throw new Error(`Failed to install grove: ${install.stderr || install.stdout}`);
  }
}

/**
 * Register a repo path with grove. Uses `--update` for idempotency: re-running
 * with the same name+path is a no-op, and updating the path on a name reuse
 * is intentional (we control the path layout).
 */
export function ensureGroveRegistered(
  provider: Provider,
  repo: string,
  instancePath: string,
): void {
  const cmd = `grove register --update --name ${shellQuote(repo)} ${shellQuote(instancePath)}`;
  const result = runOnBox(provider, cmd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to register grove project ${repo}: ${result.stderr || result.stdout}`);
  }
}

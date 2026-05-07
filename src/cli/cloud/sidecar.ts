import { boxCloudSidecarPath, boxCloudSidecarDir } from '../../shared/paths.js';
import { shellQuote } from '../../shared/shell.js';
import { runOnBox } from '../deploy/ssh-exec.js';
import type { Provider } from '../deploy/creds.js';
import type { PackageManager } from './repo.js';

export interface CloudSidecar {
  originUrl: string | null;
  localHostname: string;
  lastSync?: string;
  lastInstall?: string;
  packageManager?: PackageManager;
}

/**
 * Read the per-repo sidecar JSON from the box at `~/.sisyphus/cloud/<repo>.json`.
 * Returns null if the file doesn't exist or is unparseable.
 */
export function readSidecar(provider: Provider, repo: string): CloudSidecar | null {
  const path = boxCloudSidecarPath(repo);
  // `cat` returns non-zero if file missing — that's our "no sidecar" signal.
  const result = runOnBox(provider, `cat ${shellQuote(path)} 2>/dev/null`);
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  try {
    const parsed = JSON.parse(result.stdout) as CloudSidecar;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write/replace the sidecar JSON on the box. Creates `~/.sisyphus/cloud/`
 * if needed.
 */
export function writeSidecar(provider: Provider, repo: string, data: CloudSidecar): void {
  const dir = boxCloudSidecarDir();
  const path = boxCloudSidecarPath(repo);
  const json = JSON.stringify(data, null, 2);
  // Heredoc with a fixed sentinel keeps the JSON payload from needing further
  // shell escaping. Sentinel is unlikely to appear in real payloads.
  const cmd = [
    `mkdir -p ${shellQuote(dir)}`,
    `cat > ${shellQuote(path)} <<'SISYPHUS_CLOUD_SIDECAR_EOF'`,
    json,
    'SISYPHUS_CLOUD_SIDECAR_EOF',
  ].join('\n');
  const result = runOnBox(provider, cmd);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to write sidecar for ${repo}: ${result.stderr || result.stdout}`);
  }
}

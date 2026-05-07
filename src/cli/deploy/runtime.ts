import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { atomicWrite } from '../../daemon/lib/atomic.js';
import { deployRuntimePath } from '../../shared/paths.js';
import type { Provider } from './creds.js';

/**
 * Per-provider runtime state — facts learned *after* `terraform apply`
 * that aren't (or can't be) Terraform outputs. Currently just the
 * post-tailnet-discovery hostname/IP, which the runner uses for all
 * subsequent ssh/logs/update calls because the requested `--name` may
 * have been suffixed by Tailscale to avoid collisions with stale
 * offline nodes.
 *
 * Lives at `~/.sisyphus/deploy/<provider>/runtime.json`. Cleared on
 * `down`. Independent of Terraform state.
 */
export interface RuntimeState {
  /** Short MagicDNS label, e.g. "sisyphus-1". */
  tailscaleHostname: string;
  /** Full MagicDNS FQDN, e.g. "sisyphus-1.taildaec87.ts.net". */
  tailscaleFqdn: string;
  tailscaleIpv4: string;
  discoveredAt: string;
}

export function readRuntimeState(provider: Provider): RuntimeState | null {
  const path = deployRuntimePath(provider);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as RuntimeState;
  } catch {
    return null;
  }
}

export function writeRuntimeState(provider: Provider, state: RuntimeState): void {
  atomicWrite(deployRuntimePath(provider), JSON.stringify(state, null, 2) + '\n');
}

export function clearRuntimeState(provider: Provider): void {
  const path = deployRuntimePath(provider);
  if (existsSync(path)) unlinkSync(path);
}

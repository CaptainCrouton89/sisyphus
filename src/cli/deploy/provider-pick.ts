import { isValidProvider, PROVIDERS, type Provider } from './creds.js';
import { isProvisioned } from './runner.js';

/**
 * Resolve which provider a `cloud` command should target.
 *
 * - `explicit` set: validate against the known provider list and return.
 * - Exactly one provisioned: return it silently.
 * - Zero provisioned: throw with a hint to run `deploy <provider> up`.
 * - Multiple provisioned: throw with a hint to pass `--provider`.
 */
export function pickProvider(explicit?: string): Provider {
  if (explicit) {
    if (!isValidProvider(explicit)) {
      throw new Error(`Unknown provider "${explicit}". Valid: ${PROVIDERS.join(', ')}.`);
    }
    return explicit;
  }

  const provisioned = PROVIDERS.filter((p) => isProvisioned(p));
  if (provisioned.length === 1) return provisioned[0]!;
  if (provisioned.length === 0) {
    throw new Error(
      'No cloud provider provisioned. Run `sis deploy <hetzner|aws> up` first.',
    );
  }
  throw new Error(
    `Multiple providers provisioned (${provisioned.join(', ')}). Pass --provider <name>.`,
  );
}

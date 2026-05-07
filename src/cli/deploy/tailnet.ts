import { execSafe } from '../../shared/exec.js';

export interface DiscoveredNode {
  /** Short MagicDNS label (e.g. "sisyphus-1"). May differ from requested name when Tailscale suffixes to avoid collisions with offline nodes. */
  shortName: string;
  /** Fully-qualified MagicDNS name (e.g. "sisyphus-1.taildaec87.ts.net"). */
  magicDnsName: string;
  /** Tailscale IPv4 (always present). */
  ipv4: string;
  /** Tailscale IPv6 if exposed. */
  ipv6: string | null;
}

interface TailscalePeer {
  HostName?: string;
  DNSName?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  Created?: string;
}

interface TailscaleStatus {
  Peer?: Record<string, TailscalePeer>;
}

/**
 * Locate a freshly-joined sisyphus box on the user's tailnet by reading
 * `tailscale status --json` locally.
 *
 * Tailscale appends `-1`, `-2`, ... to the MagicDNS label when the
 * requested hostname collides with an existing (even offline) node, so
 * the actual short name may not match `requestedName`. We match peers by
 * the OS-level `HostName` (which is what we passed to `tailscale up
 * --hostname=...` and is preserved verbatim) and require `Online=true`
 * to disambiguate from stale offline nodes.
 */
export function discoverNode(requestedName: string): DiscoveredNode | null {
  const json = execSafe('tailscale status --json');
  if (!json) return null;

  let status: TailscaleStatus;
  try {
    status = JSON.parse(json) as TailscaleStatus;
  } catch {
    return null;
  }

  const peers = status.Peer === undefined ? [] : Object.values(status.Peer);
  const candidates = peers.filter(
    (p) => p.HostName === requestedName && p.Online === true,
  );
  if (candidates.length === 0) return null;

  // Multiple online peers with the same OS hostname shouldn't happen, but
  // pick the most recently created defensively.
  candidates.sort((a, b) => {
    const ac = a.Created === undefined ? '' : a.Created;
    const bc = b.Created === undefined ? '' : b.Created;
    return bc.localeCompare(ac);
  });
  const peer = candidates[0]!;

  const dnsRaw = peer.DNSName === undefined ? '' : peer.DNSName;
  const dns = dnsRaw.replace(/\.$/, '');
  if (!dns) return null;
  const shortName = dns.split('.')[0]!;

  const ips = peer.TailscaleIPs === undefined ? [] : peer.TailscaleIPs;
  const ipv4 = ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  if (!ipv4) return null;
  const ipv6 = ips.find((ip) => ip.includes(':')) ?? null;

  return { shortName, magicDnsName: dns, ipv4, ipv6 };
}

/**
 * Poll for the new box on the tailnet. Tailscale propagation typically
 * completes within 5–15s but can take longer on a busy tailnet, hence
 * the generous default of 60s.
 */
export async function discoverNodeWithRetry(
  requestedName: string,
  maxRetries = 30,
  intervalMs = 2000,
): Promise<DiscoveredNode | null> {
  for (let i = 0; i < maxRetries; i++) {
    const node = discoverNode(requestedName);
    if (node) return node;
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

/**
 * Cheap pre-flight check: is `tailscale` on PATH and reachable? Used to
 * decide whether to attempt discovery at all (vs. silently skipping when
 * the user doesn't run Tailscale locally).
 */
export function isTailscaleAvailable(): boolean {
  return execSafe('tailscale version') !== null;
}

import {
  promptLine,
  readTailscaleEnv,
  writeTailscaleEnv,
  type TailscaleEnv,
} from './creds.js';

interface MintOptions {
  hostname: string;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CreateKeyResponse {
  id: string;
  key: string;
  expires: string;
}

const TS_API = 'https://api.tailscale.com/api/v2';
const KEY_EXPIRY_SECONDS = 90 * 24 * 60 * 60;

/**
 * Mint a Tailscale auth key for the box being provisioned. Two paths:
 *
 *   1. OAuth client (preferred): mints an ephemeral, single-use, tagged
 *      key via API. No human-readable key sits in Terraform state plain
 *      text.
 *   2. Manual auth key (fallback): user pastes a reusable key from the
 *      admin UI. Less secure, but zero-config.
 *
 * If neither is configured, prompts the user to choose and persists.
 */
export async function mintTailscaleKey(opts: MintOptions): Promise<string> {
  let env = readTailscaleEnv();

  if (!env.oauthClientId && !env.authKey) {
    env = await firstRunPrompt();
    writeTailscaleEnv(env);
  }

  if (env.oauthClientId && env.oauthClientSecret) {
    if (!env.tag) {
      throw new Error('Tailscale tag is missing from ~/.sisyphus/deploy/tailscale.env. Re-run `sis deploy auth tailscale`.');
    }
    return mintViaOAuth(env.oauthClientId, env.oauthClientSecret, env.tag, opts.hostname);
  }

  if (env.authKey) {
    return env.authKey;
  }

  throw new Error('Tailscale not configured. Run `sis deploy auth tailscale`.');
}

async function firstRunPrompt(): Promise<TailscaleEnv> {
  console.log('');
  console.log('Tailscale credentials not configured. Pick one:');
  console.log('');
  console.log('  1) OAuth client (recommended) — mints fresh ephemeral keys per box');
  console.log('     and auto-cleans stale offline nodes so hostnames don\'t get suffixed.');
  console.log('     Create at https://login.tailscale.com/admin/settings/oauth');
  console.log('     with scopes `auth_keys:write` + `devices:write` and tag `tag:sisyphus`.');
  console.log('  2) Reusable auth key (simpler) — paste from');
  console.log('     https://login.tailscale.com/admin/settings/keys');
  console.log('');
  const choice = (await promptLine('Choice [1/2]: ', false)).trim();

  if (choice === '1') {
    const clientId = await promptLine('  TS_OAUTH_CLIENT_ID: ', false);
    const clientSecret = await promptLine('  TS_OAUTH_CLIENT_SECRET: ', true);
    if (!clientId || !clientSecret) throw new Error('OAuth client ID and secret are required.');
    const tagInput = await promptLine('  Tag for minted keys [tag:sisyphus]: ', false);
    const tag = tagInput.length > 0 ? tagInput : 'tag:sisyphus';
    return { oauthClientId: clientId, oauthClientSecret: clientSecret, tag };
  }

  if (choice === '2') {
    const key = await promptLine('  TS_AUTHKEY: ', true);
    if (!key) throw new Error('Auth key is required.');
    return { authKey: key };
  }

  throw new Error(`Invalid choice: ${choice}`);
}

async function mintViaOAuth(
  clientId: string,
  clientSecret: string,
  tag: string,
  hostname: string,
): Promise<string> {
  const token = await fetchAccessToken(clientId, clientSecret);

  // Best-effort: clear out stale offline devices that share the requested
  // hostname so Tailscale doesn't suffix the new node with `-1`. Requires
  // the `devices:write` scope on the OAuth client; failures here are not
  // fatal because the new mint still works (just with a suffix).
  try {
    const removed = await deleteStaleDevicesForHostname(token, hostname);
    if (removed > 0) {
      console.log(`Tailscale: removed ${removed} stale offline node(s) named "${hostname}".`);
    }
  } catch (err) {
    console.log(`Tailscale: skipped stale-node cleanup (${(err as Error).message}). Add 'devices:write' scope to clean up automatically.`);
  }

  const body = {
    capabilities: {
      devices: {
        create: {
          reusable: false,
          ephemeral: false,
          preauthorized: true,
          tags: [tag],
        },
      },
    },
    expirySeconds: KEY_EXPIRY_SECONDS,
    description: `sisyphus deploy: ${hostname}`,
  };

  const res = await fetch(`${TS_API}/tailnet/-/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tailscale key mint failed (HTTP ${res.status}): ${detail}`);
  }

  const data = (await res.json()) as CreateKeyResponse;
  if (!data.key) throw new Error('Tailscale API returned no key.');
  return data.key;
}

interface TailscaleDevice {
  id: string;
  hostname: string;
  lastSeen: string;
}

async function deleteStaleDevicesForHostname(token: string, hostname: string): Promise<number> {
  const res = await fetch(`${TS_API}/tailnet/-/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} listing devices`);
  }

  const data = (await res.json()) as { devices: TailscaleDevice[] };
  const STALE_AFTER_MS = 5 * 60 * 1000;
  const now = Date.now();
  const stale = data.devices.filter((d) => {
    if (d.hostname !== hostname) return false;
    const seen = Date.parse(d.lastSeen);
    if (Number.isNaN(seen)) return false;
    return now - seen > STALE_AFTER_MS;
  });

  let removed = 0;
  for (const device of stale) {
    const r = await fetch(`${TS_API}/device/${device.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) removed++;
  }
  return removed;
}

async function fetchAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${TS_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=auth_keys',
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tailscale OAuth failed (HTTP ${res.status}): ${detail}`);
  }

  const data = (await res.json()) as OAuthTokenResponse;
  if (!data.access_token) throw new Error('Tailscale OAuth returned no access_token.');
  return data.access_token;
}

/**
 * Interactive setup for `sis deploy auth tailscale`. Walks the user
 * through OAuth client creation or manual key paste, then persists.
 */
export async function authTailscale(): Promise<void> {
  const env = await firstRunPrompt();
  writeTailscaleEnv(env);

  if (env.oauthClientId) {
    if (!env.oauthClientSecret) {
      throw new Error('OAuth client secret missing after first-run prompt — internal error.');
    }
    console.log('');
    console.log('Verifying credentials...');
    // Let exceptions propagate to the CLI's top-level handler; it logs the
    // message and exits non-zero. We don't catch + re-log because that
    // double-prints the failure to stderr.
    await fetchAccessToken(env.oauthClientId, env.oauthClientSecret);
    console.log('OAuth client verified — `sis deploy <provider> up` will mint ephemeral keys.');
  } else {
    console.log('');
    console.log('Auth key saved. Note: reusable auth keys are less secure than OAuth clients.');
  }
}

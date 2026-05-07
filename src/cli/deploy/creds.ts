import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { atomicWrite } from '../../daemon/lib/atomic.js';
import {
  deployCredsPath,
  deployDir,
  deployTailscaleEnvPath,
} from '../../shared/paths.js';

export type Provider = 'hetzner' | 'aws';

export const PROVIDERS: readonly Provider[] = ['hetzner', 'aws'];

export function isValidProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

interface CredsSpec {
  provider: Provider;
  required: readonly string[];
  optional?: readonly string[];
  helpUrl: string;
}

const SPECS: Record<Provider, CredsSpec> = {
  hetzner: {
    provider: 'hetzner',
    required: ['HCLOUD_TOKEN'],
    helpUrl: 'https://console.hetzner.cloud/projects → API tokens → Generate',
  },
  aws: {
    provider: 'aws',
    required: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    optional: ['AWS_REGION', 'AWS_SESSION_TOKEN'],
    helpUrl: 'https://console.aws.amazon.com/iam/home → Users → Security credentials',
  },
};

export function ensureDeployDir(): void {
  const dir = deployDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function serializeEnvFile(values: Record<string, string>): string {
  const lines: string[] = ['# Managed by `sis deploy`. Do not edit unless you know what you are doing.'];
  for (const [k, v] of Object.entries(values)) {
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}

function readEnvFile(path: string): Record<string, string> | null {
  if (!existsSync(path)) return null;
  return parseEnvFile(readFileSync(path, 'utf-8'));
}

function writeEnvFile(path: string, values: Record<string, string>): void {
  ensureDeployDir();
  atomicWrite(path, serializeEnvFile(values));
  chmodSync(path, 0o600);
}

async function promptLine(question: string, hidden: boolean): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Mute echo for secrets — same trick as `read -s`.
  if (hidden) {
    const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void };
    const originalWrite = stdout.write.bind(stdout);
    let prompted = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (stringToWrite: string) => {
      if (!prompted) {
        originalWrite(stringToWrite);
        prompted = true;
      }
      // swallow subsequent keystroke echoes
    };
  }
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer.trim();
}

async function promptMissing(spec: CredsSpec, existing: Record<string, string>): Promise<Record<string, string>> {
  const next = { ...existing };
  const missing = spec.required.filter((k) => !next[k]);
  if (missing.length === 0) return next;

  console.log('');
  console.log(`Provider creds needed for: ${spec.provider}`);
  console.log(`Where to get them: ${spec.helpUrl}`);
  console.log('');
  for (const key of missing) {
    const isSecret = /SECRET|TOKEN|KEY/.test(key) && key !== 'AWS_ACCESS_KEY_ID';
    const value = await promptLine(`  ${key}: `, isSecret);
    if (!value) throw new Error(`${key} is required.`);
    next[key] = value;
  }
  return next;
}

/**
 * Load creds for a provider. If any required keys are missing, prompts the
 * user and persists to `~/.sisyphus/deploy/<provider>.env` (0600). Returns
 * the loaded env vars merged with `process.env`-style record suitable for
 * passing as `env` to a child process.
 */
export async function loadProviderCreds(provider: Provider): Promise<Record<string, string>> {
  const spec = SPECS[provider];
  const path = deployCredsPath(provider);
  const existing = readEnvFile(path) ?? {};
  const final = await promptMissing(spec, existing);
  if (final !== existing) writeEnvFile(path, final);
  return final;
}

export function maskValue(value: string): string {
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
}

// ── Tailscale ─────────────────────────────────────────────────────────────────

export interface TailscaleEnv {
  // OAuth client (preferred): mints ephemeral, single-use, tagged keys per `up`.
  oauthClientId?: string;
  oauthClientSecret?: string;
  // Fallback: a reusable auth key pasted from the admin UI.
  authKey?: string;
  // Tag applied to minted keys (e.g. "tag:sisyphus") — required when using OAuth.
  tag?: string;
}

export function readTailscaleEnv(): TailscaleEnv {
  const raw = readEnvFile(deployTailscaleEnvPath()) ?? {};
  return {
    oauthClientId: raw.TS_OAUTH_CLIENT_ID,
    oauthClientSecret: raw.TS_OAUTH_CLIENT_SECRET,
    authKey: raw.TS_AUTHKEY,
    tag: raw.TS_TAG,
  };
}

export function writeTailscaleEnv(env: TailscaleEnv): void {
  const values: Record<string, string> = {};
  if (env.oauthClientId) values.TS_OAUTH_CLIENT_ID = env.oauthClientId;
  if (env.oauthClientSecret) values.TS_OAUTH_CLIENT_SECRET = env.oauthClientSecret;
  if (env.authKey) values.TS_AUTHKEY = env.authKey;
  if (env.tag) values.TS_TAG = env.tag;
  writeEnvFile(deployTailscaleEnvPath(), values);
}

export { promptLine };

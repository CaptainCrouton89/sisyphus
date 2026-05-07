import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  deployProviderDir,
  deployStateBackupPath,
  deployStatePath,
} from '../../shared/paths.js';
import { EXEC_ENV } from '../../shared/exec.js';
import { ensureDeployDir, loadProviderCreds, type Provider } from './creds.js';
import { formatCostLine } from './pricing.js';
import { providerModuleDir } from './templates.js';
import { mintTailscaleKey } from './tailscale.js';

/**
 * UpOptions is the fully-resolved option struct passed to deployUp.
 * Defaults are applied at the commander layer (deploy.ts) so this
 * module can assume every field is populated.
 */
export interface UpOptions {
  region: string;
  arch: 'arm' | 'x86';
  size: string | null;
  sshKey: string;
  name: string;
  withChromium: boolean;
  enableAutoUpdate: boolean;
}

export interface DeployOutputs {
  ipv4: string;
  tailscale_hostname: string;
  ssh_command: string;
  instance_type: string;
}

/**
 * Run `terraform <args>` in the provider's working directory, streaming
 * output to the user. Returns exit code; throws on spawn failure.
 *
 * Working directory is the bundled provider module (read-only). State
 * is written to `~/.sisyphus/deploy/<provider>/terraform.tfstate` via
 * the `-state` flag, keeping the bundled module immutable across
 * provisions.
 */
function runTerraform(provider: Provider, args: string[], extraEnv: Record<string, string>): number {
  ensureProviderStateDir(provider);
  ensureTerraformInstalled();

  const result = spawnSync('terraform', args, {
    cwd: providerModuleDir(provider),
    stdio: 'inherit',
    env: { ...EXEC_ENV, ...extraEnv },
  });
  if (result.error) throw result.error;
  // status is null when the process was killed by a signal — treat as failure.
  return result.status === null ? 1 : result.status;
}

function ensureTerraformInstalled(): void {
  const result = spawnSync('terraform', ['version'], { stdio: 'pipe', env: EXEC_ENV });
  if (result.error || result.status !== 0) {
    const platform = process.platform;
    const hint = platform === 'darwin'
      ? 'brew install terraform'
      : 'See https://developer.hashicorp.com/terraform/install';
    throw new Error(`terraform binary not found on PATH. Install: ${hint}`);
  }
}

function ensureProviderStateDir(provider: Provider): void {
  ensureDeployDir();
  const dir = deployProviderDir(provider);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function backupState(provider: Provider): void {
  const src = deployStatePath(provider);
  if (existsSync(src)) copyFileSync(src, deployStateBackupPath(provider));
}

function readSshPubkey(path: string): string {
  if (!existsSync(path)) {
    const privateKeyPath = path.replace(/\.pub$/, '');
    throw new Error(
      `SSH pubkey not found at ${path}. Generate one with:\n  ssh-keygen -t ed25519 -f ${privateKeyPath}\nor pass --ssh-key <path>.`,
    );
  }
  return readFileSync(path, 'utf-8').trim();
}

function readOutputs(provider: Provider): DeployOutputs | null {
  const result = spawnSync('terraform', ['output', '-json', `-state=${deployStatePath(provider)}`], {
    cwd: providerModuleDir(provider),
    encoding: 'utf-8',
    env: EXEC_ENV,
  });
  if (result.status !== 0) return null;

  try {
    const parsed = JSON.parse(result.stdout) as Record<string, { value: unknown }>;
    if (Object.keys(parsed).length === 0) return null;
    const required: Array<keyof DeployOutputs> = ['ipv4', 'tailscale_hostname', 'ssh_command', 'instance_type'];
    for (const k of required) {
      if (parsed[k]?.value === undefined) return null;
    }
    return {
      ipv4: String(parsed.ipv4!.value),
      tailscale_hostname: String(parsed.tailscale_hostname!.value),
      ssh_command: String(parsed.ssh_command!.value),
      instance_type: String(parsed.instance_type!.value),
    };
  } catch {
    return null;
  }
}

function isProvisioned(provider: Provider): boolean {
  if (!existsSync(deployStatePath(provider))) return false;
  return readOutputs(provider) !== null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function deployUp(provider: Provider, opts: UpOptions): Promise<void> {
  const sshPubkey = readSshPubkey(opts.sshKey);

  const creds = await loadProviderCreds(provider);
  const tsAuthKey = await mintTailscaleKey({ hostname: opts.name });

  const tfvars: Record<string, string> = {
    name: opts.name,
    region: opts.region,
    arch: opts.arch,
    ssh_pubkey: sshPubkey,
    ts_authkey: tsAuthKey,
    with_chromium: String(opts.withChromium),
    enable_auto_update: String(opts.enableAutoUpdate),
  };
  if (opts.size !== null) tfvars.size = opts.size;

  const tfvarArgs = Object.entries(tfvars).flatMap(([k, v]) => ['-var', `${k}=${v}`]);

  console.log(`\n→ terraform init (${provider})...\n`);
  let code = runTerraform(provider, ['init', '-input=false'], creds);
  if (code !== 0) throw new Error(`terraform init failed (exit ${code})`);

  backupState(provider);

  console.log(`\n→ terraform plan (${provider})...\n`);
  code = runTerraform(
    provider,
    ['plan', '-input=false', `-state=${deployStatePath(provider)}`, ...tfvarArgs],
    creds,
  );
  if (code !== 0) throw new Error(`terraform plan failed (exit ${code})`);

  console.log(`\n→ terraform apply (${provider})...\n`);
  code = runTerraform(
    provider,
    ['apply', '-input=false', '-auto-approve', `-state=${deployStatePath(provider)}`, ...tfvarArgs],
    creds,
  );
  if (code !== 0) throw new Error(`terraform apply failed (exit ${code})`);

  const outputs = readOutputs(provider);
  if (!outputs) {
    console.log(`\nApplied — but could not parse outputs. Run \`sisyphus deploy ${provider} status\`.`);
    return;
  }

  console.log('');
  console.log('Box provisioned. Cloud-init will run for ~3–5 minutes before the daemon is reachable.');
  console.log('');
  console.log(`  IP:                  ${outputs.ipv4}`);
  console.log(`  Tailscale hostname:  ${outputs.tailscale_hostname}`);
  console.log(`  SSH:                 ${outputs.ssh_command}`);
  console.log('');
  console.log(`  Tail provisioning:   sisyphus deploy ${provider} logs`);
  console.log(`  Verify daemon:       sisyphus deploy ${provider} ssh -- sisyphus admin doctor`);
  console.log('');
}

export async function deployDown(provider: Provider, opts: { yes: boolean }): Promise<void> {
  if (!existsSync(deployStatePath(provider))) {
    console.log(`No ${provider} state found at ${deployStatePath(provider)}. Nothing to destroy.`);
    return;
  }

  if (!opts.yes) {
    const outputs = readOutputs(provider);
    if (outputs) {
      console.log(`About to destroy ${provider} box "${outputs.tailscale_hostname}" (${outputs.instance_type}, ${outputs.ipv4}).`);
    } else {
      console.log(`About to destroy ${provider} state at ${deployStatePath(provider)}.`);
    }
    const confirmed = await confirm('Type "yes" to continue:');
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }
  }

  const creds = await loadProviderCreds(provider);
  backupState(provider);
  // terraform destroy still parses the config; required vars must be set
  // even though their values don't affect the deletion API calls. Pass
  // placeholders — the actual values are already baked into state.
  const destroyVarArgs = [
    '-var', 'ssh_pubkey=destroy',
    '-var', 'ts_authkey=destroy',
  ];
  const code = runTerraform(
    provider,
    ['destroy', '-input=false', '-auto-approve', `-state=${deployStatePath(provider)}`, ...destroyVarArgs],
    creds,
  );
  if (code !== 0) throw new Error(`terraform destroy failed (exit ${code})`);
  console.log(`\n${provider} box destroyed.`);
}

export function deployStatus(provider: Provider): void {
  if (!isProvisioned(provider)) {
    console.log(`${provider}: not provisioned.`);
    return;
  }
  const outputs = readOutputs(provider);
  if (!outputs) {
    console.log(`${provider}: state present but outputs unreadable. Try \`sisyphus deploy ${provider} up\` to reconcile.`);
    return;
  }
  console.log(`${provider}: provisioned`);
  console.log(`  IP:                  ${outputs.ipv4}`);
  console.log(`  Tailscale hostname:  ${outputs.tailscale_hostname}`);
  console.log(`  SSH:                 ${outputs.ssh_command}`);
  console.log(`  Instance type:       ${outputs.instance_type}`);
  console.log(`  ${formatCostLine(provider, outputs.instance_type)}`);
}

export function deployListProviders(): void {
  const providers: Provider[] = ['hetzner', 'aws'];
  for (const p of providers) {
    const status = isProvisioned(p) ? 'provisioned' : 'not provisioned';
    console.log(`  ${p.padEnd(10)} ${status}`);
  }
}

// ── ssh / logs / update ──────────────────────────────────────────────────────

function requireOutputs(provider: Provider): DeployOutputs {
  const o = readOutputs(provider);
  if (!o) {
    throw new Error(`${provider} not provisioned. Run \`sisyphus deploy ${provider} up\`.`);
  }
  return o;
}

export function deploySsh(provider: Provider, remoteCmd: string[]): void {
  const outputs = requireOutputs(provider);
  const target = `sisyphus@${outputs.tailscale_hostname}`;

  const moshAvailable = spawnSync('mosh', ['--version'], { stdio: 'pipe', env: EXEC_ENV }).status === 0;
  const bin = moshAvailable && remoteCmd.length === 0 ? 'mosh' : 'ssh';
  const args = remoteCmd.length > 0 ? [target, ...remoteCmd] : [target];

  const child = spawn(bin, args, { stdio: 'inherit', env: EXEC_ENV });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

export function deployLogs(provider: Provider): void {
  const outputs = requireOutputs(provider);
  const target = `sisyphus@${outputs.tailscale_hostname}`;
  // tail -F survives log rotation; -n 200 gives recent context.
  const remoteCmd = 'tail -F -n 200 /var/log/cloud-init-output.log ~/.sisyphus/daemon.log 2>/dev/null';
  const child = spawn('ssh', [target, remoteCmd], { stdio: 'inherit', env: EXEC_ENV });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

export function deployUpdate(provider: Provider): void {
  const outputs = requireOutputs(provider);
  const target = `sisyphus@${outputs.tailscale_hostname}`;
  const remoteCmd = 'sudo npm i -g sisyphi@latest && systemctl --user restart sisyphusd && sisyphusd --version || true';
  const child = spawn('ssh', [target, remoteCmd], { stdio: 'inherit', env: EXEC_ENV });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function confirm(prompt: string): Promise<boolean> {
  const { promptLine } = await import('./creds.js');
  const answer = await promptLine(`${prompt} `, false);
  return answer.toLowerCase() === 'yes';
}

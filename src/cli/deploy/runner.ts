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
import { clearRuntimeState, readRuntimeState, writeRuntimeState } from './runtime.js';
import { discoverNodeWithRetry, isTailscaleAvailable } from './tailnet.js';
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
  yes: boolean;
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

export function isProvisioned(provider: Provider): boolean {
  if (!existsSync(deployStatePath(provider))) return false;
  return readOutputs(provider) !== null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function deployUp(provider: Provider, opts: UpOptions): Promise<void> {
  // Bail before minting a Tailscale key — re-running `up` on a live box has
  // surprising provider-specific behavior, and a single-use OAuth key would
  // be wasted if the user backs out.
  if (isProvisioned(provider) && !(await confirmReprovision(provider, opts.yes))) {
    return;
  }

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
    console.log(`\nApplied — but could not parse outputs. Run \`sis deploy ${provider} status\`.`);
    return;
  }

  console.log('');
  console.log('Box provisioned. Cloud-init will run for ~3–5 minutes before the daemon is reachable.');
  console.log('');
  console.log(`  Public IP:           ${outputs.ipv4}`);
  console.log(`  Requested hostname:  ${outputs.tailscale_hostname}`);

  // Discover the box on the user's tailnet so subsequent ssh/logs/update
  // calls reach the right node even if Tailscale suffixed the hostname
  // (`sisyphus-1`) due to a stale offline node squatting the requested
  // name. Skip silently when local Tailscale isn't available.
  if (isTailscaleAvailable()) {
    process.stdout.write('  Waiting for tailnet join...');
    const node = await discoverNodeWithRetry(opts.name);
    if (node) {
      writeRuntimeState(provider, {
        tailscaleHostname: node.shortName,
        tailscaleFqdn: node.magicDnsName,
        tailscaleIpv4: node.ipv4,
        discoveredAt: new Date().toISOString(),
      });
      process.stdout.write(` joined as ${node.shortName} (${node.ipv4})\n`);
      if (node.shortName !== opts.name) {
        console.log(`  Note: Tailscale suffixed the hostname because "${opts.name}" was already`);
        console.log('        claimed by an offline node. Delete the stale node at');
        console.log('        https://login.tailscale.com/admin/machines to reuse the original name.');
      }
    } else {
      process.stdout.write(' no peer matched after 60s\n');
      console.log('  (Cloud-init may still be installing Tailscale. Re-run `status` later.)');
    }
  } else {
    console.log('  (Local `tailscale` CLI not on PATH — skipping tailnet discovery.)');
  }

  console.log('');
  console.log(`  Tail provisioning:   sis deploy ${provider} logs`);
  console.log(`  Verify daemon:       sis deploy ${provider} ssh -- sis admin check doctor`);
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
  clearRuntimeState(provider);
  console.log(`\n${provider} box destroyed.`);
}

export function deployStatus(provider: Provider): void {
  if (!isProvisioned(provider)) {
    console.log(`${provider}: not provisioned.`);
    return;
  }
  const outputs = readOutputs(provider);
  if (!outputs) {
    console.log(`${provider}: state present but outputs unreadable. Try \`sis deploy ${provider} up\` to reconcile.`);
    return;
  }
  const runtime = readRuntimeState(provider);
  const effectiveHost = runtime ? runtime.tailscaleHostname : outputs.tailscale_hostname;

  console.log(`${provider}: provisioned`);
  console.log(`  Public IP:           ${outputs.ipv4}`);
  console.log(`  Tailscale hostname:  ${effectiveHost}`);
  if (runtime) {
    console.log(`  Tailscale IPv4:      ${runtime.tailscaleIpv4}`);
    console.log(`  MagicDNS FQDN:       ${runtime.tailscaleFqdn}`);
    if (runtime.tailscaleHostname !== outputs.tailscale_hostname) {
      console.log(`  (Requested "${outputs.tailscale_hostname}" but Tailscale assigned "${runtime.tailscaleHostname}".)`);
    }
  } else {
    console.log('  (No tailnet runtime state — re-run `up` or check that local tailscale is logged in.)');
  }
  console.log(`  SSH:                 ssh sisyphus@${effectiveHost}`);
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

/**
 * Pick the host to SSH to: runtime state's discovered hostname (handles
 * Tailscale `-1` suffix) when present, otherwise the Terraform output.
 */
export function effectiveSshTarget(provider: Provider): string {
  const runtime = readRuntimeState(provider);
  if (runtime) return `sisyphus@${runtime.tailscaleHostname}`;

  const outputs = readOutputs(provider);
  if (!outputs) {
    throw new Error(`${provider} not provisioned. Run \`sis deploy ${provider} up\`.`);
  }
  return `sisyphus@${outputs.tailscale_hostname}`;
}

export function deploySsh(provider: Provider, remoteCmd: string[]): void {
  const target = effectiveSshTarget(provider);

  const moshAvailable = spawnSync('mosh', ['--version'], { stdio: 'pipe', env: EXEC_ENV }).status === 0;
  const bin = moshAvailable && remoteCmd.length === 0 ? 'mosh' : 'ssh';
  const args = remoteCmd.length > 0 ? [target, ...remoteCmd] : [target];

  const child = spawn(bin, args, { stdio: 'inherit', env: EXEC_ENV });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

export function deployLogs(provider: Provider): void {
  const target = effectiveSshTarget(provider);
  // tail -F survives log rotation; -n 200 gives recent context.
  const remoteCmd = 'tail -F -n 200 /var/log/cloud-init-output.log ~/.sisyphus/daemon.log 2>/dev/null';
  const child = spawn('ssh', [target, remoteCmd], { stdio: 'inherit', env: EXEC_ENV });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

export function deployUpdate(provider: Provider): void {
  const target = effectiveSshTarget(provider);
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

/**
 * Warn before re-running `up` on an already-provisioned box. Behavior is
 * very different per provider:
 *   - Hetzner: `user_data` is ForceNew, so a fresh `ts_authkey` triggers
 *     destroy-and-recreate. All on-box state is lost.
 *   - AWS: `user_data` updates in place by default; cloud-init won't re-run
 *     on a live instance, so the freshly-minted Tailscale key is wasted.
 * Either way, `update` is the right tool for software pushes and `down`
 * + `up` is the right tool for an explicit rebuild.
 */
async function confirmReprovision(provider: Provider, yes: boolean): Promise<boolean> {
  const outputs = readOutputs(provider);
  console.log('');
  if (outputs) {
    console.log(`${provider} is already provisioned: "${outputs.tailscale_hostname}" (${outputs.instance_type}, ${outputs.ipv4}).`);
  } else {
    console.log(`${provider} state already exists at ${deployStatePath(provider)}.`);
  }
  if (provider === 'hetzner') {
    console.log('Re-running `up` on Hetzner will DESTROY and RECREATE the box (user_data is ForceNew).');
    console.log('All on-box state — daemon history, sessions, anything not in your repo — will be lost.');
  } else {
    console.log('Re-running `up` on AWS updates user_data in state but does NOT recreate the instance.');
    console.log('Cloud-init won\'t re-run on the live box, and the freshly-minted Tailscale key will be wasted.');
  }
  console.log('');
  console.log(`To push a new sisyphus version:  sis deploy ${provider} update`);
  console.log(`To rebuild from scratch:         sis deploy ${provider} down && sis deploy ${provider} up`);
  console.log('');
  if (yes) return true;
  const confirmed = await confirm('Type "yes" to proceed anyway:');
  if (!confirmed) console.log('Aborted.');
  return confirmed;
}

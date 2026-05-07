import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  deployDown,
  deployListProviders,
  deployLogs,
  deploySsh,
  deployStatus,
  deployUp,
  deployUpdate,
  type UpOptions,
} from '../deploy/runner.js';
import type { Provider } from '../deploy/creds.js';
import { authTailscale } from '../deploy/tailscale.js';

const PROVIDERS: readonly Provider[] = ['hetzner', 'aws'];

interface RawUpOptions {
  region?: string;
  arch?: string;
  size?: string;
  sshKey?: string;
  chromium?: boolean; // commander exposes --no-chromium as opts.chromium = false
  autoUpdate?: boolean;
  name?: string;
  yes?: boolean;
}

interface DownOptions {
  yes?: boolean;
}

function assertArch(raw: string): 'arm' | 'x86' {
  if (raw === 'arm' || raw === 'x86') return raw;
  throw new Error(`Invalid --arch: ${raw}. Must be 'arm' or 'x86'.`);
}

function defaultRegion(provider: Provider): string {
  return provider === 'hetzner' ? 'nbg1' : 'us-east-1';
}

function resolveUpOptions(provider: Provider, raw: RawUpOptions): UpOptions {
  // arch/name/sshKey carry commander-supplied defaults — guaranteed defined.
  if (!raw.arch || !raw.name || !raw.sshKey) {
    throw new Error('Internal error: commander failed to apply defaults for --arch/--name/--ssh-key.');
  }
  const arch = assertArch(raw.arch);
  // --region's default is provider-specific, so commander can't supply it.
  const region = raw.region === undefined ? defaultRegion(provider) : raw.region;
  // --size has no default — undefined means "fall through to the Terraform module's arch-based default".
  const size = raw.size === undefined ? null : raw.size;
  // commander: --no-chromium → chromium === false; absent → undefined (default install on)
  const withChromium = raw.chromium !== false;
  const enableAutoUpdate = raw.autoUpdate !== false;
  const yes = raw.yes === true;
  return { region, arch, size, sshKey: raw.sshKey, name: raw.name, withChromium, enableAutoUpdate, yes };
}

export function registerDeploy(program: Command): void {
  const deploy = program
    .command('deploy')
    .description('Provision a Tailscale-only sisyphus box on Hetzner or AWS via Terraform.');

  deploy
    .option('--providers', 'List available providers and provisioning status.')
    .action((opts: { providers?: boolean }) => {
      if (opts.providers) {
        deployListProviders();
        return;
      }
      deploy.help();
    });

  // sisyphus deploy auth tailscale — one-time OAuth client setup
  const auth = deploy.command('auth').description('Configure deploy credentials.');
  auth
    .command('tailscale')
    .description('Configure Tailscale OAuth client or fallback auth key.')
    .action(async () => {
      await authTailscale();
    });

  for (const provider of PROVIDERS) {
    const sub = deploy.command(provider).description(`${provider} commands.`);

    sub
      .command('up')
      .description(`Provision the ${provider} box (terraform init → plan → apply).`)
      .option('--region <region>', `Provider region (defaults: hetzner=nbg1, aws=us-east-1).`)
      .option('--arch <arch>', "'arm' (default) or 'x86'. Picks the default --size and image.", 'arm')
      .option('--size <size>', 'Instance type override (defaults follow --arch).')
      .option('--ssh-key <path>', 'Path to SSH public key.', join(homedir(), '.ssh', 'id_ed25519.pub'))
      .option('--no-chromium', 'Skip headless Chromium install.')
      .option('--no-auto-update', 'Skip the daily auto-update systemd timer.')
      .option('--name <name>', 'Box hostname / Tailscale node name.', 'sisyphus')
      .option('-y, --yes', 'Skip the re-provision confirmation prompt when state already exists.')
      .action(async (raw: RawUpOptions) => {
        const opts = resolveUpOptions(provider, raw);
        await deployUp(provider, opts);
      });

    sub
      .command('down')
      .description(`Destroy the ${provider} box (terraform destroy).`)
      .option('-y, --yes', 'Skip confirmation prompt.')
      .action(async (opts: DownOptions) => {
        await deployDown(provider, { yes: opts.yes === true });
      });

    sub
      .command('status')
      .description(`Print current ${provider} outputs (IP, hostname, instance type, est. cost).`)
      .action(() => {
        deployStatus(provider);
      });

    sub
      .command('ssh [remoteCmd...]')
      .description(`SSH (or mosh, if available) into the ${provider} box via Tailscale.`)
      .action((remoteCmd: string[]) => {
        deploySsh(provider, remoteCmd);
      });

    sub
      .command('logs')
      .description(`Tail cloud-init + daemon logs from the ${provider} box.`)
      .action(() => {
        deployLogs(provider);
      });

    sub
      .command('update')
      .description(`Run \`npm i -g sisyphi@latest && systemctl --user restart sisyphusd\` on the ${provider} box.`)
      .action(() => {
        deployUpdate(provider);
      });
  }

}

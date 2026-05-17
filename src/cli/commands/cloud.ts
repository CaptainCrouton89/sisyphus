import type { Command } from 'commander';
import {
  cloudAttach,
  cloudClaudeLogin,
  cloudInstall,
  cloudSession,
  cloudStart,
  cloudStatus,
  cloudSync,
} from '../cloud/runner.js';
import { cloudHandoff, cloudHandoffCancel, cloudReclaim } from '../cloud/handoff.js';
import { inferRepoName } from '../cloud/repo.js';
import { pickProvider } from '../deploy/provider-pick.js';
import type { Provider } from '../deploy/creds.js';
import { validateRepoName } from '../../shared/shell.js';

interface CommonRaw {
  name?: string;
  provider?: string;
}

interface StartRaw extends CommonRaw {
  fresh?: boolean;
  yes?: boolean;
}

function resolve(raw: CommonRaw): { provider: Provider; repo: string } {
  const provider = pickProvider(raw.provider);
  const repo = raw.name ? raw.name : inferRepoName();
  if (!validateRepoName(repo)) {
    throw new Error(`Invalid --name "${repo}": must not contain '/' '\\' or '..'.`);
  }
  return { provider, repo };
}

export function registerCloud(program: Command): void {
  const cloud = program
    .command('cloud')
    .description('Per-repo workflow on the shared cloud box (sync, install, dashboard).');

  // cloud box is exactly at the 7-child cap (sync/install/session/attach/status/login/up) — adding another verb requires a further sub-noun.
  const box = cloud.command('box').description('Provision / operate the box for this repo');

  box
    .command('sync')
    .description('Rsync this repo to the cloud box; ensures grove is installed and the repo is registered.')
    .option('--fresh', 'Wipe the box-side dir and `git clone` from origin instead of rsync.')
    .option('-y, --yes', 'Skip the --fresh confirmation prompt.')
    .option('--name <repo>', 'Override the repo name (default: basename of git toplevel).')
    .option('--provider <name>', 'Cloud provider (default: auto-pick if exactly one is provisioned).')
    .action(async (raw: StartRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudSync(provider, repo, { fresh: raw.fresh === true, yes: raw.yes === true });
    });

  box
    .command('install')
    .description('Run the repo\'s package-manager install on the box.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudInstall(provider, repo);
    });

  box
    .command('session')
    .description('Create or refresh the box-side tmux home session for this repo.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudSession(provider, repo);
    });

  box
    .command('attach')
    .description('Attach to the box-side tmux home session for this repo.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action((raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      cloudAttach(provider, repo);
    });

  box
    .command('status')
    .description('Print box-side status for this repo (planted, session running, last sync/install).')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action((raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      cloudStatus(provider, repo);
    });

  box
    .command('login')
    .description('Run auth login on the box (device-code flow; paste the URL into your local browser).')
    .option('--provider <name>', 'Cloud provider.')
    .action((raw: CommonRaw) => {
      const provider = pickProvider(raw.provider);
      cloudClaudeLogin(provider);
    });

  box
    .command('up')
    .description('Sync, install, and create the box session in one shot (cold start). Stops short of attach.')
    .option('--fresh', 'Wipe the box-side dir and `git clone` from origin instead of rsync.')
    .option('-y, --yes', 'Skip the --fresh confirmation prompt.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: StartRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudStart(provider, repo, { fresh: raw.fresh === true, yes: raw.yes === true });
    });

  const handoff = cloud.command('handoff').description('Move a live session between local and box');

  handoff
    .command('push <session-id>')
    .description('Hand off a live session to the cloud box. Queues at next quiesce; --force interrupts now.')
    .option('--provider <name>', 'Cloud provider (default: auto-pick).')
    .option('--name <repo>', 'Override the repo name on the box.')
    .option('--force', 'Interrupt in-flight orchestrator/agents now instead of queueing.')
    .option('--cancel', 'Cancel a queued handoff before it fires.')
    .option('--wait', 'Block until the handoff completes (or fails).')
    .action(async (sessionId: string, raw: { provider?: string; name?: string; force?: boolean; cancel?: boolean; wait?: boolean }) => {
      if (raw.cancel) {
        await cloudHandoffCancel(sessionId);
        return;
      }
      const provider = pickProvider(raw.provider);
      const repo = raw.name ? raw.name : inferRepoName();
      if (!validateRepoName(repo)) {
        throw new Error(`Invalid --name "${repo}": must not contain '/' '\\' or '..'.`);
      }
      await cloudHandoff(sessionId, { provider, repo, force: raw.force === true, wait: raw.wait === true });
    });

  handoff
    .command('pull <session-id>')
    .description('Pull a handed-off session back from the cloud box and resume locally.')
    .option('--provider <name>', 'Override the cloud provider (default: read from session.handoff).')
    .option('--force', 'Force the box-side session to stop now instead of waiting for quiesce.')
    .action(async (sessionId: string, raw: { provider?: string; force?: boolean }) => {
      await cloudReclaim(sessionId, { providerOverride: raw.provider, force: raw.force === true });
    });
}

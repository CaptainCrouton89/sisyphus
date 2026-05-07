import type { Command } from 'commander';
import {
  cloudAttach,
  cloudInstall,
  cloudSession,
  cloudStart,
  cloudStatus,
  cloudSync,
} from '../cloud/runner.js';
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

  cloud
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

  cloud
    .command('install')
    .description('Run the repo\'s package-manager install on the box.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudInstall(provider, repo);
    });

  cloud
    .command('session')
    .description('Create or refresh the box-side tmux home session for this repo.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudSession(provider, repo);
    });

  cloud
    .command('attach')
    .description('Attach to the box-side tmux home session for this repo.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action((raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      cloudAttach(provider, repo);
    });

  cloud
    .command('start')
    .description('Sync, install, and start the dashboard session in one shot. (Stops short of attach.)')
    .option('--fresh', 'Wipe the box-side dir and `git clone` from origin instead of rsync.')
    .option('-y, --yes', 'Skip the --fresh confirmation prompt.')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action(async (raw: StartRaw) => {
      const { provider, repo } = resolve(raw);
      await cloudStart(provider, repo, { fresh: raw.fresh === true, yes: raw.yes === true });
    });

  cloud
    .command('status')
    .description('Print box-side status for this repo (planted, session running, last sync/install).')
    .option('--name <repo>', 'Override the repo name.')
    .option('--provider <name>', 'Cloud provider.')
    .action((raw: CommonRaw) => {
      const { provider, repo } = resolve(raw);
      cloudStatus(provider, repo);
    });
}

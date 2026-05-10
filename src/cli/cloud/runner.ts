import { spawn, spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { boxRepoPath } from '../../shared/paths.js';
import { shellQuote, shellQuoteHomePath } from '../../shared/shell.js';
import { EXEC_ENV } from '../../shared/exec.js';
import { promptLine } from '../deploy/creds.js';
import type { Provider } from '../deploy/creds.js';
import { effectiveSshTarget } from '../deploy/runner.js';
import { runOnBox, runOnBoxStreaming } from '../deploy/ssh-exec.js';
import { ensureGroveInstalled, ensureGroveRegistered } from './grove.js';
import {
  buildRsyncArgs,
  detectPackageManager,
  getOriginUrl,
  getRepoToplevel,
  packageManagerInstallCmd,
  type PackageManager,
} from './repo.js';
import { readSidecar, writeSidecar, type CloudSidecar } from './sidecar.js';

export interface SyncOptions {
  fresh: boolean;
  yes: boolean;
}

export interface StartOptions {
  fresh: boolean;
  yes: boolean;
}

// ── sync ─────────────────────────────────────────────────────────────────────

export async function cloudSync(provider: Provider, repo: string, opts: SyncOptions): Promise<void> {
  const target = effectiveSshTarget(provider);
  const remoteDir = boxRepoPath(repo);
  const localOrigin = getOriginUrl();

  ensureGroveInstalled(provider);

  const existing = readSidecar(provider, repo);
  if (existing && existing.originUrl && localOrigin && existing.originUrl !== localOrigin) {
    throw new Error(
      `Repo "${repo}" on the box is registered to a different origin:\n` +
      `  box:    ${existing.originUrl}\n` +
      `  local:  ${localOrigin}\n` +
      `Pass --name <slug> to disambiguate, or --fresh to overwrite.`,
    );
  }

  if (opts.fresh) {
    if (!localOrigin) {
      throw new Error(
        '--fresh requires an `origin` remote on the local repo. ' +
        'Not available when running from a non-git parent dir.',
      );
    }
    if (!opts.yes) {
      console.log(`This will wipe ~/projects/${repo} on the box and re-clone from ${localOrigin}.`);
      const confirmed = (await promptLine('Continue? Type "yes": ', false)).toLowerCase() === 'yes';
      if (!confirmed) {
        console.log('Aborted.');
        return;
      }
    }
    console.log(`→ wiping ${remoteDir} and cloning ${localOrigin} on box...`);
    const cloneCmd = [
      `rm -rf ${shellQuoteHomePath(remoteDir)}`,
      `mkdir -p ${shellQuoteHomePath('~/projects')}`,
      `git clone ${shellQuote(localOrigin)} ${shellQuoteHomePath(remoteDir)}`,
    ].join(' && ');
    const code = await runOnBoxStreaming(provider, cloneCmd);
    if (code !== 0) throw new Error(`fresh clone failed (exit ${code})`);
  } else {
    // Ensure the remote dir exists — rsync will create it but mkdir is harmless.
    const mkdir = runOnBox(provider, `mkdir -p ${shellQuoteHomePath(remoteDir)}`);
    if (mkdir.exitCode !== 0) {
      throw new Error(`Failed to mkdir on box: ${mkdir.stderr}`);
    }
    const toplevel = getRepoToplevel();
    const args = buildRsyncArgs(toplevel, `${target}:${remoteDir}/`);
    console.log(`→ rsync ${toplevel}/ → ${target}:${remoteDir}/`);
    const code = await runRsync(args);
    if (code !== 0) throw new Error(`rsync failed (exit ${code})`);
  }

  ensureGroveRegistered(provider, repo, remoteDir);

  const sidecar: CloudSidecar = {
    originUrl: localOrigin,
    localHostname: hostname(),
    lastSync: new Date().toISOString(),
    packageManager: existing?.packageManager,
    lastInstall: existing?.lastInstall,
  };
  writeSidecar(provider, repo, sidecar);
  console.log(`✓ synced ${repo} → ${target}:${remoteDir}/`);
}

function runRsync(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('rsync', args, { stdio: 'inherit', env: EXEC_ENV });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code === null ? 1 : code));
  });
}

// ── install ──────────────────────────────────────────────────────────────────

export async function cloudInstall(provider: Provider, repo: string): Promise<void> {
  const remoteDir = boxRepoPath(repo);
  const toplevel = getRepoToplevel();
  const pm: PackageManager = detectPackageManager(toplevel);
  const cmd = packageManagerInstallCmd(pm);
  if (!cmd) {
    console.log('No lockfile detected — skipping install.');
    return;
  }
  console.log(`→ ${pm} install in ${remoteDir} on box...`);
  // `cd` then run; explicit shell wrapping is fine over ssh.
  const remoteCmd = `cd ${shellQuoteHomePath(remoteDir)} && ${cmd}`;
  const code = await runOnBoxStreaming(provider, remoteCmd);
  if (code !== 0) throw new Error(`${pm} install failed (exit ${code})`);

  const existing = readSidecar(provider, repo);
  // Carry forward existing identity fields; only overwrite when missing.
  const sidecar: CloudSidecar = {
    originUrl: existing && existing.originUrl !== undefined ? existing.originUrl : getOriginUrl(),
    localHostname: existing ? existing.localHostname : hostname(),
    lastSync: existing?.lastSync,
    lastInstall: new Date().toISOString(),
    packageManager: pm,
  };
  writeSidecar(provider, repo, sidecar);
  console.log(`✓ installed ${repo} (${pm})`);
}

// ── session ──────────────────────────────────────────────────────────────────

export async function cloudSession(provider: Provider, repo: string): Promise<void> {
  const remoteDir = boxRepoPath(repo);
  // home-init is a sisyphus admin subcommand on the box; runs against the
  // local tmux server there. `~` expands in the remote shell.
  const cmd = `sis admin home-init ${shellQuote(repo)} ${shellQuoteHomePath(remoteDir)}`;
  console.log(`→ initializing tmux home session "${repo}" on box...`);
  const result = runOnBox(provider, cmd);
  if (result.exitCode !== 0) {
    throw new Error(`home-init failed: ${result.stderr || result.stdout}`);
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`✓ session "${repo}" ready on box`);
}

// ── attach ───────────────────────────────────────────────────────────────────

export function cloudAttach(provider: Provider, repo: string): void {
  if (process.env.TMUX) {
    throw new Error(
      'Refusing to attach from inside tmux — would nest the cloud tmux client.\n' +
      'Use a fresh terminal, or run from outside tmux:\n' +
      `  tmux new-window 'ssh -t ${effectiveSshTarget(provider)} tmux attach -t ${repo}'`,
    );
  }
  const target = effectiveSshTarget(provider);
  const child = spawn('ssh', ['-t', target, `tmux attach-session -t ${shellQuote(repo)}`], {
    stdio: 'inherit',
    env: EXEC_ENV,
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

// ── claude-login ─────────────────────────────────────────────────────────────

/**
 * Open an interactive ssh shell on the box running `claude auth login` so the
 * user can complete the device-code flow (URL prints on box, user pastes the
 * code from their local browser back into the same terminal). Self-heals on
 * boxes provisioned before claude-code was added to cloud-init by installing
 * it on demand.
 */
export function cloudClaudeLogin(provider: Provider): void {
  const target = effectiveSshTarget(provider);
  // `command -v` probes for an existing install; npm i -g runs as sisyphus
  // (cloud-init installed it as root, but a per-user fallback also works).
  const remote = [
    'command -v claude >/dev/null 2>&1',
    '|| sudo npm i -g @anthropic-ai/claude-code',
    '&& claude auth login',
  ].join(' ');
  const child = spawn('ssh', ['-t', target, remote], {
    stdio: 'inherit',
    env: EXEC_ENV,
  });
  child.on('exit', (code) => process.exit(code === null ? 1 : code));
}

// ── start (umbrella) ─────────────────────────────────────────────────────────

export async function cloudStart(provider: Provider, repo: string, opts: StartOptions): Promise<void> {
  await cloudSync(provider, repo, { fresh: opts.fresh, yes: opts.yes });
  await cloudInstall(provider, repo);
  await cloudSession(provider, repo);
  console.log('');
  console.log(`Box-side dashboard ready. Attach with:`);
  console.log(`  tmux new-window 'ssh -t ${effectiveSshTarget(provider)} tmux attach -t ${repo}'`);
  console.log('(or run inside the slash command, which does this for you.)');
}

// ── status ───────────────────────────────────────────────────────────────────

export interface CloudStatus {
  provider: Provider;
  target: string;
  sidecar: CloudSidecar | null;
  sessionRunning: boolean;
}

export function cloudStatus(provider: Provider, repo: string): void {
  const target = effectiveSshTarget(provider);
  const sidecar = readSidecar(provider, repo);
  // tmux has-session exits 0 when present.
  const sessionProbe = runOnBox(provider, `tmux has-session -t ${shellQuote(repo)} 2>/dev/null`);
  const sessionRunning = sessionProbe.exitCode === 0;

  console.log(`Cloud status for "${repo}":`);
  console.log(`  Provider:        ${provider}`);
  console.log(`  Target:          ${target}`);
  console.log(`  Planted:         ${sidecar ? 'yes' : 'no'}`);
  if (sidecar) {
    console.log(`  Origin:          ${sidecar.originUrl ? sidecar.originUrl : '(none)'}`);
    console.log(`  Last sync:       ${sidecar.lastSync ? sidecar.lastSync : '(never)'}`);
    console.log(`  Last install:    ${sidecar.lastInstall ? sidecar.lastInstall : '(never)'}`);
    console.log(`  Package manager: ${sidecar.packageManager ? sidecar.packageManager : '(none)'}`);
  }
  console.log(`  Session:         ${sessionRunning ? 'running' : 'absent'}`);
  if (sessionRunning) {
    console.log(`  Attach:          tmux new-window 'ssh -t ${target} tmux attach -t ${repo}'`);
  }
}

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EXEC_ENV } from '../../shared/exec.js';

function captureGit(args: string[], cwd?: string): { stdout: string; ok: boolean } {
  const result = spawnSync('git', args, {
    encoding: 'utf-8',
    env: EXEC_ENV,
    cwd: cwd ?? process.cwd(),
  });
  if (typeof result.stdout !== 'string') {
    throw new Error('Internal: git spawn did not capture stdout as string');
  }
  return { stdout: result.stdout.trim(), ok: result.status === 0 };
}

/**
 * Infer the repo name from the local git working tree's top-level dir basename.
 * Falls back to `basename(cwd)` when cwd is not inside a git repo — supports
 * parent dirs that contain repos but aren't themselves a repo.
 */
export function inferRepoName(cwd?: string): string {
  const { stdout, ok } = captureGit(['rev-parse', '--show-toplevel'], cwd);
  if (ok && stdout) return basename(stdout);
  return basename(cwd ?? process.cwd());
}

/**
 * Read the local repo's `origin` remote URL. Returns null if no `origin` is
 * configured or cwd is not inside a git repo.
 */
export function getOriginUrl(cwd?: string): string | null {
  const { stdout, ok } = captureGit(['remote', 'get-url', 'origin'], cwd);
  if (!ok) return null;
  return stdout.length > 0 ? stdout : null;
}

/**
 * Path to the local git toplevel, or cwd when cwd is not inside a git repo.
 * Non-repo mode is intentional: enables syncing parent dirs that contain
 * multiple child repos (each child's `.git/` rides along via rsync).
 */
export function getRepoToplevel(cwd?: string): string {
  const { stdout, ok } = captureGit(['rev-parse', '--show-toplevel'], cwd);
  if (ok && stdout) return stdout;
  return cwd ?? process.cwd();
}

/**
 * Defensive excludes layered on top of `.gitignore` filtering. Most of these
 * are usually gitignored, but listing them prevents accidentally pushing
 * hundreds of MB when a repo's `.gitignore` is incomplete.
 */
const DEFAULT_EXCLUDES = [
  '.sisyphus/',
  '.terraform/',
  'node_modules/',
  'dist/',
  '.next/',
  '.turbo/',
  'coverage/',
  'tmp/',
  '.git/lfs/',
  '.DS_Store',
];

/**
 * Build the rsync argv for a local→box sync. Includes `.git/` so the user can
 * `git push` from the box.
 */
export function buildRsyncArgs(localDir: string, remoteTarget: string): string[] {
  // Trailing slash on source = "copy contents", not "copy dir into dest".
  const src = localDir.endsWith('/') ? localDir : `${localDir}/`;
  return [
    '-avz',
    '--filter=:- .gitignore',
    ...DEFAULT_EXCLUDES.map((e) => `--exclude=${e}`),
    '-e', 'ssh',
    src,
    remoteTarget,
  ];
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun' | null;

/**
 * Detect the package manager used by a repo from its lockfile.
 * Returns null when no known lockfile is present (no install step needed).
 */
export function detectPackageManager(toplevel: string): PackageManager {
  if (existsSync(join(toplevel, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(toplevel, 'bun.lockb'))) return 'bun';
  if (existsSync(join(toplevel, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(toplevel, 'package-lock.json'))) return 'npm';
  return null;
}

export function packageManagerInstallCmd(pm: PackageManager): string | null {
  switch (pm) {
    case 'pnpm': return 'pnpm install';
    case 'bun': return 'bun install';
    case 'yarn': return 'yarn install';
    case 'npm': return 'npm install';
    default: return null;
  }
}

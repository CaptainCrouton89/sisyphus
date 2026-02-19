import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Agent } from '../shared/types.js';
import type { WorktreeConfig } from '../shared/config.js';
import { worktreeConfigPath, worktreeBaseDir } from '../shared/paths.js';

const EXEC_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? '/usr/bin:/bin'}`,
};

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, cwd }).trim();
}

function execSafe(cmd: string, cwd?: string): string | null {
  try {
    return exec(cmd, cwd);
  } catch {
    return null;
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export interface MergeResult {
  agentId: string;
  name: string;
  status: 'merged' | 'conflict' | 'no-changes';
  conflictDetails?: string;
}

export function loadWorktreeConfig(cwd: string): WorktreeConfig | null {
  try {
    const content = readFileSync(worktreeConfigPath(cwd), 'utf-8');
    return JSON.parse(content) as WorktreeConfig;
  } catch {
    return null;
  }
}

/**
 * Create git worktree (branch + add + symlinks) without running bootstrap.
 * Fast enough to run synchronously before responding to the CLI.
 */
export function createWorktreeShell(
  cwd: string,
  sessionId: string,
  agentId: string,
): { worktreePath: string; branchName: string } {
  const branchName = `sisyphus/${sessionId.slice(0, 8)}/${agentId}`;
  // Bug B: Include session prefix in path to prevent cross-session collisions
  const worktreePath = join(worktreeBaseDir(cwd), sessionId.slice(0, 8), agentId);

  mkdirSync(dirname(worktreePath), { recursive: true });

  // Bug C: Clean stale worktree entries before creating
  execSafe(`git -C ${shellQuote(cwd)} worktree prune`);
  if (existsSync(worktreePath)) {
    execSafe(`git -C ${shellQuote(cwd)} worktree remove --force ${shellQuote(worktreePath)}`);
  }
  // If the branch already exists from a previous run, remove it
  execSafe(`git -C ${shellQuote(cwd)} branch -D ${shellQuote(branchName)}`);

  exec(`git -C ${shellQuote(cwd)} branch ${shellQuote(branchName)} HEAD`);
  exec(`git -C ${shellQuote(cwd)} worktree add ${shellQuote(worktreePath)} ${shellQuote(branchName)}`);

  return { worktreePath, branchName };
}

/**
 * Create git worktree AND run bootstrap synchronously.
 * Use createWorktreeShell + bootstrapWorktree separately when you need
 * to defer the slow bootstrap to avoid blocking.
 */
export function createWorktree(
  cwd: string,
  sessionId: string,
  agentId: string,
): { worktreePath: string; branchName: string } {
  const result = createWorktreeShell(cwd, sessionId, agentId);

  const config = loadWorktreeConfig(cwd);
  if (config) {
    bootstrapWorktree(cwd, result.worktreePath, config);
  }

  return result;
}

export function bootstrapWorktree(cwd: string, worktreePath: string, config: WorktreeConfig): void {
  // Process copy entries
  if (config.copy) {
    for (const entry of config.copy) {
      const dest = join(worktreePath, entry);
      mkdirSync(dirname(dest), { recursive: true });
      execSafe(`cp -r ${shellQuote(join(cwd, entry))} ${shellQuote(dest)}`);
    }
  }

  // Process clone entries (APFS CoW on macOS, fallback to cp -r)
  if (config.clone) {
    for (const entry of config.clone) {
      const dest = join(worktreePath, entry);
      mkdirSync(dirname(dest), { recursive: true });
      const src = shellQuote(join(cwd, entry));
      const dstQ = shellQuote(dest);
      if (execSafe(`cp -Rc ${src} ${dstQ}`) === null) {
        execSafe(`cp -r ${src} ${dstQ}`);
      }
    }
  }

  // Process symlink entries
  if (config.symlink) {
    for (const entry of config.symlink) {
      const dest = join(worktreePath, entry);
      mkdirSync(dirname(dest), { recursive: true });
      execSafe(`ln -s ${shellQuote(join(cwd, entry))} ${shellQuote(dest)}`);
    }
  }

  // Process init command
  if (config.init) {
    try {
      exec(config.init, worktreePath);
    } catch (err) {
      console.error(`[sisyphus] worktree init command failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/**
 * Resolve the branch checked out in a worktree by parsing `git worktree list --porcelain`.
 * Returns null if the worktree isn't found or has a detached HEAD.
 */
function resolveWorktreeBranch(cwd: string, worktreePath: string): string | null {
  const output = execSafe(`git -C ${shellQuote(cwd)} worktree list --porcelain`);
  if (!output) return null;

  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `worktree ${worktreePath}`) {
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]!;
        if (line === '') break; // end of this worktree block
        if (line.startsWith('branch refs/heads/')) {
          return line.slice('branch refs/heads/'.length);
        }
      }
      break;
    }
  }
  return null;
}

export function mergeWorktrees(cwd: string, agents: Agent[]): MergeResult[] {
  const pending = agents.filter(
    a => a.worktreePath && a.mergeStatus === 'pending',
  );

  const results: MergeResult[] = [];

  // Snapshot any uncommitted .sisyphus state changes before merging
  // so agent branches don't conflict with main's session state updates
  execSafe(`git -C ${shellQuote(cwd)} add .sisyphus`);
  execSafe(`git -C ${shellQuote(cwd)} commit -m 'sisyphus: snapshot session state before merge'`);

  for (const agent of pending) {
    const branch = resolveWorktreeBranch(cwd, agent.worktreePath!);

    if (!branch) {
      results.push({ agentId: agent.id, name: agent.name, status: 'no-changes' });
      // Best-effort cleanup — branch name unknown, just remove worktree dir
      execSafe(`git -C ${shellQuote(cwd)} worktree remove ${shellQuote(agent.worktreePath!)} --force`);
      continue;
    }

    // Check if branch has commits ahead of merge base
    const aheadLog = execSafe(`git -C ${shellQuote(cwd)} log HEAD..${shellQuote(branch)} --oneline`);
    if (!aheadLog) {
      results.push({ agentId: agent.id, name: agent.name, status: 'no-changes' });
      cleanupWorktree(cwd, agent.worktreePath!, branch);
      continue;
    }

    // Attempt merge — capture stderr on failure for conflict details
    const mergeMsg = `sisyphus: merge ${agent.id} (${agent.name})`;
    const mergeCmd = `git -C ${shellQuote(cwd)} merge --no-ff ${shellQuote(branch)} -m ${shellQuote(mergeMsg)}`;

    try {
      exec(mergeCmd);
      // Merge succeeded — clean up worktree and branch
      execSafe(`git -C ${shellQuote(cwd)} worktree remove ${shellQuote(agent.worktreePath!)}`);
      execSafe(`git -C ${shellQuote(cwd)} branch -d ${shellQuote(branch)}`);
      results.push({ agentId: agent.id, name: agent.name, status: 'merged' });
    } catch (err: unknown) {
      // Merge failed — abort and leave worktree intact for manual resolution
      execSafe(`git -C ${shellQuote(cwd)} merge --abort`);
      // Git outputs conflict details (which files, conflict type) to stdout, not stderr
      const errObj = err as { stdout?: Buffer | string; stderr?: Buffer | string };
      const stdout = errObj.stdout
        ? (typeof errObj.stdout === 'string' ? errObj.stdout : errObj.stdout.toString('utf-8')).trim()
        : '';
      const stderr = errObj.stderr
        ? (typeof errObj.stderr === 'string' ? errObj.stderr : errObj.stderr.toString('utf-8')).trim()
        : '';
      const conflictDetails = stdout || stderr || (err instanceof Error ? err.message : String(err));
      results.push({ agentId: agent.id, name: agent.name, status: 'conflict', conflictDetails });
    }
  }

  return results;
}

export function cleanupWorktree(cwd: string, worktreePath: string, branchName: string): void {
  execSafe(`git -C ${shellQuote(cwd)} worktree remove ${shellQuote(worktreePath)} --force`);
  execSafe(`git -C ${shellQuote(cwd)} branch -D ${shellQuote(branchName)}`);

  // Remove the worktree base dir if empty
  const baseDir = dirname(worktreePath);
  try {
    const entries = readdirSync(baseDir);
    if (entries.length === 0) {
      rmSync(baseDir, { recursive: true });
    }
  } catch {
    // Ignore — directory may already be gone
  }
}

export function countWorktreeAgents(agents: Agent[]): number {
  return agents.filter(a => a.worktreePath && a.status === 'running').length;
}

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as state from './state.js';
import * as orchestrator from './orchestrator.js';
import * as sessionManager from './session-manager.js';
import { EXEC_ENV } from '../shared/exec.js';
import { boxRepoPath, sessionDir, projectDir } from '../shared/paths.js';
import { shellQuote, shellQuoteHomePath, validateRepoName } from '../shared/shell.js';
import { pickProvider } from '../cli/deploy/provider-pick.js';
import { effectiveSshTarget } from '../cli/deploy/runner.js';
import { runOnBox } from '../cli/deploy/ssh-exec.js';
import { ensureGroveInstalled, ensureGroveRegistered } from '../cli/cloud/grove.js';
import { cloudSync, cloudInstall, cloudSession } from '../cli/cloud/runner.js';
import { buildRsyncArgs, getRepoToplevel, inferRepoName } from '../cli/cloud/repo.js';
import { readSidecar } from '../cli/cloud/sidecar.js';

interface RsyncResult { code: number; stderr: string }

function runRsync(args: string[]): Promise<RsyncResult> {
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn('rsync', args, { env: EXEC_ENV });
    child.stderr?.on('data', (b: Buffer) => { stderr += b.toString(); });
    child.on('error', (err) => resolve({ code: 1, stderr: err.message }));
    child.on('exit', (code) => resolve({ code: code === null ? 1 : code, stderr }));
  });
}

/**
 * Single-quote a path for rsync's remote-side parsing. rsync invokes the
 * remote shell on `<target>:<path>`, so `~`-prefixed paths need to remain
 * tilde-expandable but the rest must be shell-safe.
 */
function rsyncRemotePath(path: string): string {
  if (path.startsWith('~/')) return `~/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}

/**
 * Sync `.sisyphus/sessions/<id>/` plus top-level project configs to the box.
 * Done separately from `buildRsyncArgs` because the default cloud-sync rsync
 * excludes `.sisyphus/` entirely (correct for `cloud sync`, wrong for handoff).
 * Uses `--delete` on the session dir so the box mirrors local exactly; does
 * NOT use `--delete` for top-level configs to avoid wiping unrelated state.
 */
async function syncSessionState(
  cwd: string,
  sessionId: string,
  repo: string,
  target: string,
  provider: import('../cli/deploy/creds.js').Provider,
): Promise<void> {
  const localSession = sessionDir(cwd, sessionId);
  const remoteSession = `${boxRepoPath(repo)}/.sisyphus/sessions/${sessionId}`;

  // mac rsync (3.2.x) doesn't support --mkpath. Create parent dirs over ssh
  // first. boxRepoPath uses literal `~/...`, expanded by the remote shell.
  const mkParents = runOnBox(provider, `mkdir -p ${shellQuote(remoteSession.replace(/^~\//, ''))}`);
  if (mkParents.exitCode !== 0) {
    throw new Error(`ssh mkdir failed: ${mkParents.stderr.trim()}`);
  }

  const sessionArgs = [
    '-avz',
    '--delete',
    '-e', 'ssh',
    `${localSession}/`,
    `${target}:${rsyncRemotePath(remoteSession)}/`,
  ];
  const r1 = await runRsync(sessionArgs);
  if (r1.code !== 0) {
    throw new Error(`rsync session dir failed (exit ${r1.code}): ${r1.stderr.trim()}`);
  }

  const localProject = projectDir(cwd);
  const candidates = ['config.json', 'orchestrator.md', 'orchestrator-settings.json'];
  for (const name of candidates) {
    const localPath = join(localProject, name);
    if (!existsSync(localPath)) continue;
    const remotePath = `${boxRepoPath(repo)}/.sisyphus/${name}`;
    const args = [
      '-avz',
      '-e', 'ssh',
      localPath,
      `${target}:${rsyncRemotePath(remotePath)}`,
    ];
    const r = await runRsync(args);
    if (r.code !== 0) {
      throw new Error(`rsync ${name} failed (exit ${r.code}): ${r.stderr.trim()}`);
    }
  }
}

/**
 * Push state to the cloud box and trigger `sis resume` on the box. The
 * box-side session will respawn the orchestrator with the (optional) handoff
 * message injected as Continuation Instructions.
 */
async function pushToCloud(sessionId: string, cwd: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const handoff = session.handoff;
  if (!handoff?.target) {
    throw new Error('pushToCloud called without handoff.target set');
  }
  const provider = pickProvider(handoff.target.provider);
  const repo = handoff.target.repo;

  console.log(`[sisyphus] handoff: pushing ${sessionId} → ${provider}:${repo}`);

  // Auto-bootstrap. Grove helpers are idempotent. If the sidecar is missing
  // this is a first-time setup for the repo on this box; run the full sync +
  // install. Otherwise an incremental rsync of the working tree is enough.
  ensureGroveInstalled(provider);
  const sidecarBefore = readSidecar(provider, repo);
  if (!sidecarBefore) {
    await cloudSync(provider, repo, { fresh: false, yes: true }, cwd);
    // Install is best-effort during handoff: rsync already delivered the
    // source tree, and box-side `claude` is global. Strict pnpm modes
    // (e.g. ERR_PNPM_IGNORED_BUILDS) shouldn't block the handoff itself —
    // the orchestrator can re-run install via an agent if needed.
    try {
      await cloudInstall(provider, repo, cwd);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.warn(`[sisyphus] handoff: cloudInstall non-fatal failure: ${m}`);
    }
  } else {
    const target = effectiveSshTarget(provider);
    const toplevel = getRepoToplevel(cwd);
    const args = buildRsyncArgs(toplevel, `${target}:${boxRepoPath(repo)}/`);
    console.log(`[sisyphus] handoff: rsync working tree`);
    const r = await runRsync(args);
    if (r.code !== 0) {
      throw new Error(`working-tree rsync failed (exit ${r.code}): ${r.stderr.trim()}`);
    }
  }
  ensureGroveRegistered(provider, repo, boxRepoPath(repo));

  const sshTarget = effectiveSshTarget(provider);
  console.log(`[sisyphus] handoff: rsync session state`);
  await syncSessionState(cwd, sessionId, repo, sshTarget, provider);

  // Rewrite session.cwd in the box-side state.json. The local state.json has
  // the macOS path (`/Users/...`) which the box's daemon would otherwise use
  // for atomic writes, sending them into the wrong filesystem location.
  // Node fs APIs don't expand `~`, so the substituted cwd must be the absolute
  // path (here: `$HOME/projects/<repo>`, resolved by the remote shell).
  const remoteStatePath = `${boxRepoPath(repo)}/.sisyphus/sessions/${sessionId}/state.json`;
  const rewriteCwdScript = `node -e "const fs=require('fs');const p=process.argv[1];const s=JSON.parse(fs.readFileSync(p,'utf8'));s.cwd=process.argv[2];fs.writeFileSync(p,JSON.stringify(s,null,2));" -- ${shellQuoteHomePath(remoteStatePath)} "$HOME"/projects/${shellQuote(repo)}`;
  const rewriteResult = runOnBox(provider, rewriteCwdScript);
  if (rewriteResult.exitCode !== 0) {
    throw new Error(`box-side state.cwd rewrite failed: ${(rewriteResult.stderr || rewriteResult.stdout).trim()}`);
  }

  await cloudSession(provider, repo);

  // Kill any pre-existing box-side tmux session with the same name.
  // Resumes from a prior failed handoff leave an orphan tmux session which
  // would collide on the next attempt's `tmux new-session`.
  const tmuxName = session.tmuxSessionName;
  if (tmuxName) {
    runOnBox(provider, `tmux kill-session -t ${shellQuote(tmuxName)} 2>/dev/null || true`);
  }

  const message = handoff.message;
  const remoteRepoDir = boxRepoPath(repo);
  const baseCmd = message
    ? `sis session resume ${shellQuote(sessionId)} ${shellQuote(message)}`
    : `sis session resume ${shellQuote(sessionId)}`;
  // cd into the repo so sis resolves state.json relative to the correct cwd.
  // shellQuoteHomePath preserves a leading `~/` so the remote shell expands it.
  const resumeCmd = `cd ${shellQuoteHomePath(remoteRepoDir)} && ${baseCmd}`;
  console.log(`[sisyphus] handoff: ssh sis resume`);
  const resumeResult = runOnBox(provider, resumeCmd);
  if (resumeResult.exitCode !== 0) {
    throw new Error(`box-side sis resume failed: ${(resumeResult.stderr || resumeResult.stdout).trim()}`);
  }

  await state.updateSession(cwd, sessionId, {
    handoff: { ...handoff, sentAt: new Date().toISOString(), lastError: undefined },
  });
  await sessionManager.quiesceLocalSession(sessionId, cwd, { interrupted: false });

  console.log(`[sisyphus] handoff: ${sessionId} now running on ${provider}:${repo}`);
}

/**
 * Called from session-manager.onAllAgentsDone when handoff is queued and we're
 * at a natural quiesce point. Routes to cloud push or pause-only.
 *
 * Errors are caught and recorded on session.handoff.lastError so the user can
 * retry. Session stays at status='active' on failure so subsequent agent
 * activity continues normally if the user clears the handoff.
 */
export async function performHandoff(sessionId: string, cwd: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const handoff = session.handoff;
  if (!handoff || handoff.sentAt) return;

  if (!handoff.target) {
    await sessionManager.quiesceLocalSession(sessionId, cwd, { interrupted: false });
    return;
  }

  try {
    await pushToCloud(sessionId, cwd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sisyphus] handoff failed for ${sessionId}: ${message}`);
    await state.updateSession(cwd, sessionId, {
      handoff: { ...handoff, lastError: message },
    });
  }
}

/**
 * Force-fire handoff immediately: interrupt running orchestrator + agents,
 * compose a resume message describing the interruption, then push.
 *
 * Fire-and-forget from the RPC handler; status updates land on
 * session.handoff.{sentAt,lastError}.
 */
export async function triggerForceHandoff(sessionId: string, cwd: string): Promise<void> {
  let handoffSnapshot: NonNullable<ReturnType<typeof state.getSession>>['handoff'];
  try {
    const session = state.getSession(cwd, sessionId);
    handoffSnapshot = session.handoff;
    if (!handoffSnapshot) throw new Error('triggerForceHandoff called without handoff queued');

    const runningAgents = session.agents.filter(a => a.status === 'running');
    const orchestratorAlive = orchestrator.getOrchestratorPaneId(sessionId) != null;

    let message: string | undefined;
    if (orchestratorAlive) {
      message = 'Cloud handoff — the previous orchestrator turn was interrupted before completion. Restart from the last persisted state.';
    } else if (runningAgents.length > 0) {
      const names = runningAgents.map(a => a.name).join(', ');
      message = `Cloud handoff — agents ${names} were terminated before completing their reports. Proceed using available reports; expect some to be missing or partial.`;
    }

    if (message) {
      await state.updateSession(cwd, sessionId, {
        handoff: { ...handoffSnapshot, message },
      });
    }

    for (const a of runningAgents) {
      await state.updateAgent(cwd, sessionId, a.id, {
        status: 'lost',
        killedReason: 'cloud handoff --force',
        completedAt: new Date().toISOString(),
      });
    }

    await performHandoff(sessionId, cwd);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error(`[sisyphus] triggerForceHandoff failed for ${sessionId}: ${m}`);
    try {
      const fresh = state.getSession(cwd, sessionId);
      if (fresh.handoff) {
        await state.updateSession(cwd, sessionId, {
          handoff: { ...fresh.handoff, lastError: m },
        });
      }
    } catch (recordErr) {
      console.error(`[sisyphus] could not record handoff error for ${sessionId}: ${recordErr instanceof Error ? recordErr.message : String(recordErr)}`);
    }
  }
}

/**
 * Validate + resolve provider at RPC queue time. Mirrors `sis cloud handoff`
 * CLI behavior: if `explicit` is given, validate it; otherwise auto-pick when
 * exactly one is provisioned. Throws with a useful message otherwise.
 */
export function resolveProvider(explicit?: string): string {
  return pickProvider(explicit);
}

export function defaultRepoName(cwd?: string): string {
  return inferRepoName(cwd);
}

export function checkRepoName(repo: string): void {
  if (!validateRepoName(repo)) {
    throw new Error(`Invalid repo name "${repo}": must not contain '/' '\\' or '..'.`);
  }
}

import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadSessionRegistry } from './server.js';
import * as state from './state.js';
import * as askStore from './ask-store.js';
import * as tmux from './tmux.js';
import { execEnv } from '../shared/env.js';
import { statePath } from '../shared/paths.js';
import { emitOrphanAsk, markAgentAsksOrphan } from './orphan-asks.js';
import { isProcessAlive } from './lib/process.js';
import type { Session } from '../shared/types.js';

const execFileAsync = promisify(execFile);

type ProbeResult = 'live' | 'gone' | 'recycled' | 'unknown';

type PsRunner = (pid: number, env: NodeJS.ProcessEnv) => Promise<string>;

const defaultPsRunner: PsRunner = async (pid, env) => {
  const { stdout } = await execFileAsync('ps', ['-o', 'lstart=', '-p', String(pid)], { env });
  return stdout.trim();
};

export async function probePidLstart(
  pid: number,
  expectedLstart: string,
  psRunner: PsRunner = defaultPsRunner,
): Promise<ProbeResult> {
  try {
    const lstart = await psRunner(pid, execEnv());
    if (!lstart) return 'gone';
    if (lstart === expectedLstart) return 'live';
    return 'recycled';
  } catch (err: unknown) {
    // ps exits non-zero when no such process exists; promisified execFile
    // surfaces exit codes on `.code` (numeric) and system errors on `.code` (string like 'ENOENT').
    const e = err as { code?: number | string };
    if (e.code === 1) return 'gone';
    return 'unknown'; // ps binary missing, signal interrupt, etc — don't false-orphan
  }
}

export async function capturePanePidLstart(paneId: string): Promise<{ pid: number; lstart: string } | null> {
  const env = execEnv();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const pid = tmux.getPanePid(paneId);
      if (pid === null) throw new Error('tmux returned non-integer pane_pid');
      // Reuse defaultPsRunner for consistent stdio config (stderr suppressed)
      const lstart = await defaultPsRunner(pid, env);
      if (!lstart) throw new Error('ps returned empty lstart');
      return { pid, lstart };
    } catch (captureErr) {
      if (attempt === 2) {
        // Only log on final failure — transient retries are expected while bash spawns the run script
        console.debug('[sisyphus] capturePanePidLstart failed after 3 attempts:', captureErr instanceof Error ? captureErr.message : captureErr);
      }
      if (attempt < 2) await new Promise<void>(r => setTimeout(r, 100));
    }
  }
  return null;
}

export async function sweepOrphans(
  registry?: Record<string, string>,
): Promise<void> {
  const reg = registry ?? loadSessionRegistry();
  await Promise.all(
    Object.entries(reg).map(async ([sessionId, cwd]) => {
      if (!existsSync(statePath(cwd, sessionId))) return;
      try {
        await Promise.all([
          sweepSessionAgents(cwd, sessionId),
          sweepSessionAsks(cwd, sessionId),
        ]);
      } catch (err) {
        console.warn(
          `[sisyphus] orphan-sweep failed for ${sessionId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}

export async function sweepSessionAgents(cwd: string, sessionId: string): Promise<void> {
  let session: Session;
  try { session = state.getSession(cwd, sessionId); } catch { return; /* state file missing or corrupt — skip */ }

  // Probe all eligible agents in parallel — each call spawns a `ps` subprocess,
  // so serializing made daemon startup feel laggy on sessions with many agents.
  const candidates = session.agents.filter(a =>
    a.status === 'running' && !a.orphaned && a.pid !== undefined && a.pidLstart,
  );
  const probes = await Promise.all(
    candidates.map(async a => ({ agent: a, probe: await probePidLstart(a.pid!, a.pidLstart!) })),
  );

  for (const { agent, probe } of probes) {
    if (probe === 'live' || probe === 'unknown') continue;
    await state.markAgentOrphan(cwd, sessionId, agent.id, {
      reason: probe === 'recycled' ? 'pid recycled (daemon-startup sweep)' : 'process gone (daemon-startup sweep)',
      status: 'lost',
    });
    await markAgentAsksOrphan(cwd, sessionId, agent.id);
    await emitOrphanAsk({
      cwd,
      sessionId,
      reason: 'pid-mismatch',
      detectedAt: new Date().toISOString(),
      agent: { id: agent.id, name: agent.name, paneId: agent.paneId },
    });
  }
}

export async function sweepSessionAsks(cwd: string, sessionId: string): Promise<void> {
  const askIds = askStore.listAsks(cwd, sessionId);
  for (const askId of askIds) {
    const meta = askStore.readMeta(cwd, sessionId, askId);
    if (!meta) continue;
    if (meta.orphaned) continue;
    if (meta.status === 'answered') continue;
    if (meta.pid === undefined) continue;
    if (isProcessAlive(meta.pid)) continue;
    await askStore.updateMeta(cwd, sessionId, askId, { orphaned: true });
  }
}

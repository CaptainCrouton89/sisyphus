import { spawn, spawnSync } from 'node:child_process';
import { EXEC_ENV } from '../../shared/exec.js';
import { effectiveSshTarget } from './runner.js';
import type { Provider } from './creds.js';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command on the box via SSH, capturing stdout/stderr.
 *
 * `EXEC_ENV` is the *local* PATH augmentation (so `ssh` resolves) — it is not
 * forwarded to the remote shell, which uses the box's own `~/.profile`/sshd
 * environment.
 */
export function runOnBox(provider: Provider, cmd: string): RunResult {
  const target = effectiveSshTarget(provider);
  const result = spawnSync('ssh', [target, cmd], {
    encoding: 'utf-8',
    env: EXEC_ENV,
  });
  // spawnSync with encoding returns string | null per Node types; null only
  // when stdio for the stream is "ignore" (we don't set that). Assert string.
  if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    throw new Error('Internal: ssh spawn did not capture output as string');
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    // status is null when killed by signal — treat as failure.
    exitCode: result.status === null ? 1 : result.status,
  };
}

/**
 * Run a command on the box via SSH, streaming stdout/stderr to the user's
 * terminal. Returns the exit code. Use for long-running commands like
 * package-manager installs.
 */
export function runOnBoxStreaming(provider: Provider, cmd: string): Promise<number> {
  const target = effectiveSshTarget(provider);
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [target, cmd], {
      stdio: 'inherit',
      env: EXEC_ENV,
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code === null ? 1 : code));
  });
}

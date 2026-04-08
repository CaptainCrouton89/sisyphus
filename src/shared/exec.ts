import { execSync } from 'node:child_process';
import { execEnv } from './env.js';

export const EXEC_ENV = execEnv();

export function exec(cmd: string, cwd?: string, timeoutMs: number = 30_000): string {
  return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, cwd, timeout: timeoutMs }).trim();
}

export function execSafe(cmd: string, cwd?: string, timeoutMs?: number): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs }).trim();
  } catch { return null; }
}

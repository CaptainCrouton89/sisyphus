import { execSync } from 'node:child_process';
import { execEnv } from './env.js';

export const EXEC_ENV = execEnv();

export function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, cwd }).trim();
}

export function execSafe(cmd: string, cwd?: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

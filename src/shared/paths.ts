import { homedir } from 'node:os';
import { join } from 'node:path';

export function globalDir(): string {
  return join(homedir(), '.sisyphus');
}

export function socketPath(): string {
  return join(globalDir(), 'daemon.sock');
}

export function globalConfigPath(): string {
  return join(globalDir(), 'config.json');
}

export function daemonLogPath(): string {
  return join(globalDir(), 'daemon.log');
}

export function daemonPidPath(): string {
  return join(globalDir(), 'daemon.pid');
}

export function projectDir(cwd: string): string {
  return join(cwd, '.sisyphus');
}

export function projectConfigPath(cwd: string): string {
  return join(projectDir(cwd), 'config.json');
}

export function projectOrchestratorPromptPath(cwd: string): string {
  return join(projectDir(cwd), 'orchestrator.md');
}

export function sessionsDir(cwd: string): string {
  return join(projectDir(cwd), 'sessions');
}

export function sessionDir(cwd: string, sessionId: string): string {
  return join(sessionsDir(cwd), sessionId);
}

export function statePath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'state.json');
}

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

export function daemonUpdatingPath(): string {
  return join(globalDir(), 'updating');
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

export function reportsDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'reports');
}

export function reportFilePath(cwd: string, sessionId: string, agentId: string, suffix: string): string {
  return join(reportsDir(cwd, sessionId), `${agentId}-${suffix}.md`);
}

export function messagesDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'messages');
}

export function promptsDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'prompts');
}

export function contextDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'context');
}

export function roadmapPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'roadmap.md');
}

export function goalPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'goal.md');
}

export function logsDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'logs');
}

export function cycleLogPath(cwd: string, sessionId: string, cycle: number): string {
  return join(logsDir(cwd, sessionId), `cycle-${String(cycle).padStart(3, '0')}.md`);
}

// Backwards compat for old sessions
export function legacyLogsPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'logs.md');
}

export function snapshotsDir(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), 'snapshots');
}

export function snapshotDir(cwd: string, sessionId: string, cycle: number): string {
  return join(snapshotsDir(cwd, sessionId), `cycle-${cycle}`);
}


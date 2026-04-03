import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import type { Command } from 'commander';
import { sessionsManifestPath } from '../../shared/paths.js';

interface ManifestEntry {
  type: 'S' | 'H';
  tmuxName: string;
  cwd: string;
  phase: string | null;
  dashboardWindowId: string | null;
}

interface Manifest {
  updatedAt: number;
  sessions: ManifestEntry[];
}

const DOT_MAP: Record<string, { icon: string; color: string }> = {
  'orchestrator:processing': { icon: '●', color: '#d4ad6a' },
  'orchestrator:idle':       { icon: '●', color: '#d47766' },
  'agents:running':          { icon: '◆', color: '#d4ad6a' },
  'between-cycles':          { icon: '◆', color: '#5e584e' },
  'paused':                  { icon: '○', color: '#d47766' },
  'completed':               { icon: '●', color: '#a9b16e' },
};

function readManifest(): Manifest | null {
  const p = sessionsManifestPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Manifest;
  } catch {
    return null;
  }
}

function tmuxExec(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function registerTmuxSessions(program: Command): void {
  program
    .command('tmux-sessions')
    .description('Output sisyphus session list for tmux status bar')
    .action(() => {
      const manifest = readManifest();
      if (!manifest) return;

      const currentSession = tmuxExec("tmux display-message -p '#{session_name}'");

      // Find the cwd of the current session from the manifest
      const currentEntry = manifest.sessions.find(s => s.tmuxName === currentSession);
      if (!currentEntry) return;
      const cwd = currentEntry.cwd;

      // Filter to sessions matching this cwd
      const entries = manifest.sessions.filter(s => s.cwd === cwd);
      if (entries.length <= 1) return;

      const parts = entries.map(e => {
        const dot = e.phase ? DOT_MAP[e.phase] : null;
        const dotStr = dot ? ` #[fg=${dot.color}]${dot.icon}` : '';
        const displayName = e.tmuxName.replace(/^ssyph_[^_]+_/, '');
        const isCurrent = e.tmuxName === currentSession;

        if (isCurrent) {
          return `#[fg=#e2d9c6,bold]${displayName}${dotStr}#[default]`;
        }
        return `#[fg=#5e584e]${displayName}${dotStr}#[default]`;
      });

      process.stdout.write(parts.join('#[fg=#3a3d42] │ '));
    });
}

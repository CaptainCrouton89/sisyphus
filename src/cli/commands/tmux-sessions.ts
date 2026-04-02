import { execSync } from 'node:child_process';
import type { Command } from 'commander';

interface SessionEntry {
  name: string;
  displayName: string;
  phase: string | null;
}

const DOT_MAP: Record<string, { icon: string; color: string }> = {
  'orchestrator:processing': { icon: '●', color: '#d4ad6a' },
  'orchestrator:idle':       { icon: '●', color: '#d47766' },
  'agents:running':          { icon: '◆', color: '#d4ad6a' },
  'between-cycles':          { icon: '◆', color: '#5e584e' },
  'paused':                  { icon: '○', color: '#d47766' },
  'completed':               { icon: '●', color: '#a9b16e' },
};

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
      const cwd = tmuxExec('tmux show-option -v @sisyphus_cwd');
      if (!cwd) return;

      const currentSession = tmuxExec("tmux display-message -p '#{session_name}'");

      const sessionList = tmuxExec('tmux list-sessions -F "#{session_name}"');
      if (!sessionList) return;

      const entries: SessionEntry[] = [];

      for (const name of sessionList.split('\n').filter(Boolean)) {
        const scwd = tmuxExec(`tmux show-option -t "${name}" -v @sisyphus_cwd`);
        if (scwd !== cwd) continue;

        const phase = tmuxExec(`tmux show-option -t "${name}" -v @sisyphus_phase`);
        const displayName = name.replace(/^ssyph_[^_]+_/, '');
        entries.push({ name, displayName, phase });
      }

      if (entries.length <= 1) return;

      const parts = entries.map(e => {
        const dot = e.phase ? DOT_MAP[e.phase] : null;
        const dotStr = dot ? ` #[fg=${dot.color}]${dot.icon}` : '';
        const isCurrent = e.name === currentSession;

        if (isCurrent) {
          return `#[fg=#e2d9c6,bold]${e.displayName}${dotStr}#[default]`;
        }
        return `#[fg=#5e584e]${e.displayName}${dotStr}#[default]`;
      });

      process.stdout.write(parts.join('#[fg=#3a3d42] │ '));
    });
}

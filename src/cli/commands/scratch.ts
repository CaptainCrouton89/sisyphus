import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { assertTmux } from '../tmux.js';
import { shellQuote } from '../../shared/shell.js';

/**
 * Find the home session (non-ssyph_ session with matching @sisyphus_cwd).
 * Returns the tmux session name, or null if none found.
 */
function findHomeSession(cwd: string): string | null {
  const normalizedCwd = cwd.replace(/\/+$/, '');
  let output: string;
  try {
    output = execSync('tmux list-sessions -F "#{session_name}"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
  for (const name of output.split('\n').filter(Boolean)) {
    if (name.startsWith('ssyph_')) continue;
    try {
      const val = execSync(
        `tmux show-options -t ${shellQuote(name)} -v @sisyphus_cwd`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      if (val === normalizedCwd) return name;
    } catch {
      // Option not set — skip
    }
  }
  return null;
}

export function registerScratch(program: Command): void {
  program
    .command('scratch [prompt...]')
    .description('Open a standalone Claude Code session in the home tmux session')
    .option('-c, --cwd <path>', 'Working directory for the Claude session')
    .action((promptParts: string[], opts: { cwd?: string }) => {
      assertTmux();

      const cwd = opts.cwd ?? process.env['SISYPHUS_CWD'] ?? process.cwd();
      const homeSession = findHomeSession(cwd);

      if (!homeSession) {
        // Fall back to current tmux session
        const current = execSync('tmux display-message -p "#{session_name}"', {
          encoding: 'utf-8',
        }).trim();
        openScratchWindow(current, cwd, promptParts.join(' '));
        return;
      }

      openScratchWindow(homeSession, cwd, promptParts.join(' '));
    });
}

function openScratchWindow(tmuxSession: string, cwd: string, prompt: string): void {
  const windowId = execSync(
    `tmux new-window -t ${shellQuote(tmuxSession)} -n "scratch" -c ${shellQuote(cwd)} -P -F "#{window_id}"`,
    { encoding: 'utf-8' },
  ).trim();

  let cmd = 'claude --dangerously-skip-permissions';
  if (prompt) {
    cmd += ` --prompt ${shellQuote(prompt)}`;
  }

  execSync(
    `tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`,
  );

  console.log(`Scratch session opened in ${tmuxSession}`);
}

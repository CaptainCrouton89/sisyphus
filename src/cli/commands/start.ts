import type { Command } from 'commander';
import { execSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { sendRequest } from '../client.js';
import { getTmuxSession, isTmuxInstalled } from '../tmux.js';
import { shellQuote } from '../../shared/shell.js';
import { openDashboardWindow } from './dashboard.js';
import type { Request } from '../../shared/protocol.js';


/**
 * Get or create a tmux session for the given cwd.
 * Returns the session name. Does NOT attach — caller decides.
 */
function ensureTmuxSessionExists(cwd: string): string {
  const sessionName = `sisyphus-${basename(cwd)}`;

  try {
    execSync(`tmux has-session -t ${shellQuote(sessionName)}`, { stdio: 'pipe' });
  } catch {
    execSync(
      `tmux new-session -d -s ${shellQuote(sessionName)} -c ${shellQuote(cwd)}`,
      { stdio: 'pipe' },
    );
  }

  return sessionName;
}

/**
 * Attach the user's terminal to a tmux session.
 * If already inside tmux, switches the client. Otherwise, attaches directly.
 * Attach/switch takes over the terminal — this blocks until detach.
 */
function attachToTmuxSession(sessionName: string): void {
  if (process.env['TMUX']) {
    // Already in tmux — switch to the target session
    spawnSync('tmux', ['switch-client', '-t', sessionName], { stdio: 'inherit' });
  } else {
    // Not in tmux — attach takes over the terminal
    spawnSync('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' });
  }
}


export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sisyphus session')
    .argument('<task>', 'Task description for the orchestrator')
    .option('-c, --context <context>', 'Background context for the orchestrator')
    .option('-n, --name <name>', 'Human-readable name for the session')
    .option('--no-tmux-check', 'Skip the tmux session check')
    .action(async (task: string, opts: { context?: string; name?: string; tmuxCheck?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (!isTmuxInstalled()) {
        console.error('Error: tmux is not installed. Sisyphus requires tmux for agent panes.');
        console.error('  Install: brew install tmux (macOS) or apt install tmux (Linux)');
        process.exit(1);
      }

      // Send the start request — this is just a socket call, no tmux needed
      const request: Request = { type: 'start', task, context: opts.context, cwd, name: opts.name };
      const response = await sendRequest(request);
      if (!response.ok) {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }

      const sessionId = response.data?.sessionId as string;
      console.log(`Task handed off to sisyphus orchestrator (session ${sessionId})`);

      if (opts.tmuxCheck === false) {
        // --no-tmux-check: print info and exit, don't touch tmux
        const tmuxSessionName = response.data?.tmuxSessionName as string | undefined;
        if (tmuxSessionName) {
          console.log(`Tmux session: ${tmuxSessionName}`);
          console.log(`  tmux attach -t ${tmuxSessionName}`);
        }
        console.log(`Monitor: sisyphus status ${sessionId}`);
        return;
      }

      // Determine which tmux session to use for the dashboard.
      // If we're already in tmux, use the current session.
      // If not, create a dedicated session for this project.
      const tmuxSession = process.env['TMUX']
        ? getTmuxSession()
        : ensureTmuxSessionExists(cwd);

      // Tag the tmux session with the cwd
      try {
        execSync(
          `tmux set-option -t ${shellQuote(tmuxSession)} @sisyphus_cwd ${shellQuote(cwd)}`,
          { stdio: 'ignore' },
        );
      } catch (err) {
        console.error(`Warning: failed to tag tmux session with cwd: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Open dashboard in the tmux session
      try {
        openDashboardWindow(tmuxSession, cwd);
      } catch (err) {
        console.error(`Warning: failed to open dashboard window: ${err instanceof Error ? err.message : String(err)}`);
      }

      // If we weren't in tmux, attach now — user lands on the dashboard
      if (!process.env['TMUX']) {
        attachToTmuxSession(tmuxSession);
      }

      console.log(`Monitor: sisyphus status ${sessionId}`);
    });
}

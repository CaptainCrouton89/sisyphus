import type { Command } from 'commander';
import { execSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { sendRequest } from '../client.js';
import { getTmuxSessionInfo, isTmuxInstalled } from '../tmux.js';
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
    .option('--effort <tier>', 'Pipeline effort tier (low|medium|high|xhigh)')
    .option('--no-tmux-check', 'Skip the tmux session check')
    .action(async (task: string, opts: { context?: string; name?: string; effort?: string; tmuxCheck?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (opts.effort !== undefined) {
        const validTiers = ['low', 'medium', 'high', 'xhigh'];
        if (!validTiers.includes(opts.effort)) {
          console.error(`Error: --effort must be one of: ${validTiers.join(', ')}`);
          process.exit(1);
        }
      }

      if (!isTmuxInstalled()) {
        console.error('Error: tmux is not installed. Sisyphus requires tmux for agent panes.');
        console.error('  Install: brew install tmux (macOS) or apt install tmux (Linux)');
        process.exit(1);
      }

      // Send the start request — this is just a socket call, no tmux needed
      const effort = opts.effort as 'low' | 'medium' | 'high' | 'xhigh' | undefined;
      const request: Request = { type: 'start', task, context: opts.context, cwd, name: opts.name, ...(effort !== undefined ? { effort } : {}) };
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
      let tmuxSession: string;
      let tmuxSessionTarget: string;
      if (process.env['TMUX']) {
        const info = getTmuxSessionInfo();
        tmuxSession = info.name;
        tmuxSessionTarget = info.id;
      } else {
        tmuxSession = ensureTmuxSessionExists(cwd);
        tmuxSessionTarget = tmuxSession;
      }

      // Tag the tmux session with the cwd — but don't clobber a tag that
      // already points to a different project. Overwriting would re-home an
      // existing session onto this project, poisoning alt+s cycle groups and
      // C-s h for the original project.
      // Target by $N id when available — tmux -t <name> can substring-match
      // the wrong session under sparse env.
      try {
        const normalizedCwd = cwd.replace(/\/+$/, '');
        let existing = '';
        try {
          existing = execSync(
            `tmux show-options -t ${shellQuote(tmuxSessionTarget)} -v @sisyphus_cwd`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
          ).trim();
        } catch {
          // option unset
        }
        if (!existing || existing === normalizedCwd) {
          execSync(
            `tmux set-option -t ${shellQuote(tmuxSessionTarget)} @sisyphus_cwd ${shellQuote(normalizedCwd)}`,
            { stdio: 'ignore' },
          );
        } else {
          console.error(
            `Note: tmux session "${tmuxSession}" is already the home for ${existing}; leaving its @sisyphus_cwd unchanged.`,
          );
        }
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

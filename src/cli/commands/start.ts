import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { sendRequest } from '../client.js';
import { getTmuxSession } from '../tmux.js';
import { isDashboardOpen, launchDashboard } from './dashboard.js';
import type { Request } from '../../shared/protocol.js';

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function isTmuxInstalled(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sisyphus session')
    .argument('<task>', 'Task description for the orchestrator')
    .option('-c, --context <context>', 'Background context for the orchestrator')
    .option('-n, --name <name>', 'Human-readable name for the session')
    .action(async (task: string, opts: { context?: string; name?: string }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (!process.env['TMUX'] && isTmuxInstalled()) {
        console.log('Note: Sisyphus uses tmux to manage agent panes.');
        console.log('It is highly recommended to run sisyphus from inside a tmux session.');
        console.log('  tmux new-session');
        console.log('');
      }
      const request: Request = { type: 'start', task, context: opts.context, cwd, name: opts.name };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessionId = response.data?.sessionId as string;
        const tmuxSessionName = response.data?.tmuxSessionName as string | undefined;
        // Tag the user's current tmux session so it's part of the same cycle group
        if (process.env['TMUX']) {
          try {
            execSync(`tmux set-option @sisyphus_cwd ${shellQuote(cwd)}`, { stdio: 'ignore' });
          } catch { /* not in tmux or tmux error — ignore */ }

          try {
            const tmuxSession = getTmuxSession();
            if (!isDashboardOpen(tmuxSession)) {
              launchDashboard(tmuxSession, cwd);
              console.log(`Dashboard opened in tmux window "sisyphus-dashboard"`);
            }
          } catch { /* dashboard launch failed — non-fatal */ }
        }

        console.log(`Task handed off to sisyphus orchestrator (session ${sessionId})`);
        console.log(`The orchestrator and its agents will handle this task autonomously — no further action needed from you.`);

        if (tmuxSessionName) {
          console.log(`\nTmux session: ${tmuxSessionName}`);
          console.log(`  tmux attach -t ${tmuxSessionName}`);
        }

        console.log(`\nMonitor:`);
        console.log(`  sisyphus status ${sessionId}    # agents, cycles, reports`);
        console.log(`  tail -f ~/.sisyphus/daemon.log   # daemon activity`);
        console.log(`\nControl:`);
        console.log(`  sisyphus resume ${sessionId} "new instructions"  # respawn with follow-up`);
        console.log(`  sisyphus kill ${sessionId}        # stop all agents and orchestrator`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

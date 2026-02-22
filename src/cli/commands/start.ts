import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { getTmuxSession, getTmuxWindow } from '../tmux.js';

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sisyphus session')
    .argument('<task>', 'Task description for the orchestrator')
    .action(async (task: string) => {
      const tmuxSession = getTmuxSession();
      const tmuxWindow = getTmuxWindow();
      const request: Request = { type: 'start', task, cwd: process.cwd(), tmuxSession, tmuxWindow };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessionId = response.data?.sessionId as string;
        console.log(`Session started: ${sessionId}`);

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

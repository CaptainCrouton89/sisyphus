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
        if (response.data?.tmuxWindow) {
          console.log(`Orchestrator spawned in tmux window: ${response.data.tmuxWindow}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

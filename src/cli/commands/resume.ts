import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { getTmuxSession, getTmuxWindow } from '../tmux.js';

export function registerResume(program: Command): void {
  program
    .command('resume')
    .description('Resume a paused session')
    .argument('<session-id>', 'Session ID to resume')
    .argument('[message]', 'Additional instructions for the orchestrator')
    .action(async (sessionId: string, message?: string) => {
      const tmuxSession = getTmuxSession();
      const tmuxWindow = getTmuxWindow();
      const cwd = process.cwd();
      const request: Request = { type: 'resume', sessionId, cwd, tmuxSession, tmuxWindow, message };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Session ${sessionId} resumed`);
        if (response.data?.tmuxWindow) {
          console.log(`Orchestrator respawned in tmux window: ${response.data.tmuxWindow}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

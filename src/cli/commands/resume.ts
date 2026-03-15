import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerResume(program: Command): void {
  program
    .command('resume')
    .description('Resume a paused session')
    .argument('<session-id>', 'Session ID to resume')
    .argument('[message]', 'Additional instructions for the orchestrator')
    .action(async (sessionId: string, message?: string) => {
      const cwd = process.cwd();
      const request: Request = { type: 'resume', sessionId, cwd, message };
      const response = await sendRequest(request);
      if (response.ok) {
        const tmuxSessionName = response.data?.tmuxSessionName as string | undefined;
        console.log(`Session ${sessionId} resumed`);
        if (tmuxSessionName) {
          console.log(`Tmux session: ${tmuxSessionName}`);
          console.log(`  tmux attach -t ${tmuxSessionName}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

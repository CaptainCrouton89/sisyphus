import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerKill(program: Command): void {
  program
    .command('kill <sessionId>')
    .description('Kill a running session and all its agents')
    .action(async (sessionId: string) => {
      const request: Request = { type: 'kill', sessionId };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Session ${sessionId} killed.`);
        if (response.data) {
          const { killedAgents } = response.data as { killedAgents: number };
          console.log(`Cleaned up: ${killedAgents} agent(s) killed, tmux window removed.`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

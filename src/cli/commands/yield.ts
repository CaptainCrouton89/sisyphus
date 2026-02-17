import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerYield(program: Command): void {
  program
    .command('yield')
    .description('Orchestrator yields control, waiting for agents to complete')
    .action(async () => {
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
        process.exit(1);
      }

      const request: Request = { type: 'yield', sessionId, agentId: 'orchestrator' };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Yielded. Waiting for agents to complete.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

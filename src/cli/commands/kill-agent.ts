import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerKillAgent(program: Command): void {
  program
    .command('kill-agent <agentId>')
    .description('Kill a running agent')
    .option('-s, --session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .action(async (agentId: string, opts: { session?: string }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: No session ID. Use --session or set SISYPHUS_SESSION_ID.');
        process.exit(1);
      }

      const request: Request = { type: 'kill-agent', sessionId, agentId };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Agent ${agentId} killed.`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

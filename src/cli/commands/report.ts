import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Send a progress report without exiting (agent only)')
    .option('--message <message>', 'Progress report content')
    .action(async (opts: { message?: string }) => {
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: SISYPHUS_SESSION_ID and SISYPHUS_AGENT_ID environment variables must be set');
        process.exit(1);
      }

      const content = opts.message ?? await readStdin();
      if (!content) {
        console.error('Error: provide --message or pipe content via stdin');
        process.exit(1);
      }

      const request: Request = { type: 'report', sessionId, agentId, content };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Progress report recorded');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerComplete(program: Command): void {
  program
    .command('complete')
    .description('Mark the current session as completed')
    .requiredOption('--report <report>', 'Final completion report')
    .action(async (opts: { report: string }) => {
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
        process.exit(1);
      }

      const request: Request = { type: 'complete', sessionId, report: opts.report };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Session completed.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerSubmit(program: Command): void {
  program
    .command('submit')
    .description('Submit agent work report and mark as completed')
    .requiredOption('--report <report>', 'Work report')
    .action(async (opts: { report: string }) => {
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: SISYPHUS_SESSION_ID and SISYPHUS_AGENT_ID environment variables must be set');
        process.exit(1);
      }

      const request: Request = { type: 'submit', sessionId, agentId, report: opts.report };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Report submitted successfully');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerUpdateTask(program: Command): void {
  program
    .command('update-task <task>')
    .description('Update the session task')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (task: string, opts: { session?: string }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      const request: Request = { type: 'update-task', sessionId, task };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Task updated');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

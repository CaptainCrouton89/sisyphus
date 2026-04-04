import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerDelete(program: Command): void {
  program
    .command('delete <sessionId>')
    .description('Delete a session and all its data')
    .option('--cwd <path>', 'Project directory', process.env.SISYPHUS_CWD || process.cwd())
    .action(async (sessionId: string, opts: { cwd: string }) => {
      const request: Request = { type: 'delete', sessionId, cwd: opts.cwd };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Session ${sessionId} deleted.`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

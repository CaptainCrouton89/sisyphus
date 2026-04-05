import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerUnregisterSegment(program: Command): void {
  program
    .command('unregister-segment', { hidden: true })
    .description('Remove an external status bar segment')
    .requiredOption('--id <id>', 'Segment identifier to remove')
    .action(async (opts: { id: string }) => {
      const request: Request = { type: 'unregister-segment', id: opts.id };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Segment '${opts.id}' unregistered.`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

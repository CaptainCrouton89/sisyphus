import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { buildSessionContext } from '../../tui/lib/context.js';

export function registerSessionContext(program: Command): void {
  program
    .command('context <sessionId>')
    .description('Print session context XML (same as dashboard space y C)')
    .requiredOption('--cwd <path>', 'Working directory of the session')
    .action(async (sessionId: string, opts: { cwd: string }) => {
      const request: Request = { type: 'status', sessionId, cwd: opts.cwd };
      const response = await sendRequest(request);
      if (!response.ok) {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
      const session = response.data?.session as Session | undefined;
      if (!session) {
        console.error('Error: Session not found');
        process.exit(1);
      }
      process.stdout.write(buildSessionContext(session, opts.cwd));
    });
}

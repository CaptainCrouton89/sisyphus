import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { buildSessionContext } from '../../tui/lib/context.js';
import { exitError } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerSessionContext(program: Command): void {
  program
    .command('context <sessionId>')
    .description('Print session context XML (same as dashboard space y C)')
    .requiredOption('--cwd <path>', 'Working directory of the session')
    .addHelpText(
      'after',
      `
Output:
  Default       XML context blob on stdout.
  --json        { ok, schema_version: 1, data: { sessionId, context } }

Exit codes: 0 ok | 3 not_found.`,
    )
    .action(async (sessionId: string, opts: { cwd: string }) => {
      const request: Request = { type: 'status', sessionId, cwd: opts.cwd };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const session = response.data?.session as Session | undefined;
      if (!session) {
        exitError({
          code: 'unknown_session',
          kind: 'not_found',
          message: 'Session not found',
          received: sessionId,
          next: 'sis session inspect list --all',
        });
      }
      const context = buildSessionContext(session, opts.cwd);
      if (emitJsonOk({ sessionId, context })) return;
      process.stdout.write(context);
    });
}

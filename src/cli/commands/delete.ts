import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerDelete(program: Command): void {
  program
    .command('delete <sessionId>')
    .description('Delete a session and all its data (state.json, logs, panes)')
    .option('--cwd <path>', 'Project directory', process.env.SISYPHUS_CWD || process.cwd())
    .addHelpText(
      'after',
      `
Examples:
  $ sis session delete sess-7f2a
  $ sis session delete sess-7f2a --cwd /path/to/project --json

Output:
  Default       "Session <id> deleted." on stdout.
  --json        { ok, schema_version: 1, data: { sessionId } }

Exit codes: 0 ok | 3 not_found | 5 conflict (session still running — kill first).

Next on success:
  $ sis session list --all            # confirm removal`,
    )
    .action(async (sessionId: string, opts: { cwd: string }) => {
      const request: Request = { type: 'delete', sessionId, cwd: opts.cwd };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId })) return;
      console.log(`Session ${sessionId} deleted.`);
    });
}

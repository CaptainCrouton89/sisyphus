import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerAgentKill(program: Command): void {
  program
    .command('kill <agentId>')
    .description('Kill a running agent')
    .option('-s, --session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent ctl kill agent-3
  $ sis agent ctl kill agent-3 --session sess-7f2a --json

Output:
  Default       "Agent <id> killed." on stdout.
  --json        { ok, schema_version: 1, data: { sessionId, agentId } }

Exit codes: 0 ok | 2 usage (missing --session) | 3 not_found.`,
    )
    .action(async (agentId: string, opts: { session?: string }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const request: Request = { type: 'kill-agent', sessionId, agentId };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId, agentId })) return;
      console.log(`Agent ${agentId} killed.`);
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerKill(program: Command): void {
  program
    .command('kill <sessionId>')
    .description('Kill a running session and all its agents')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session lifecycle kill sess-7f2a
  $ sis session lifecycle kill sess-7f2a --json

Output:
  Default       Prose lines on stdout; "Session <id> killed." then cleanup count.
  --json        { ok, schema_version: 1, data: { sessionId, killedAgents } }

Exit codes: 0 ok | 3 not_found | 60 transient | see \`sis --help\` for full table.

Next on success:
  $ sis session inspect list                  # confirm the session is gone`,
    )
    .action(async (sessionId: string) => {
      const request: Request = { type: 'kill', sessionId };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const killedAgents = (response.data as { killedAgents?: number } | undefined)?.killedAgents ?? 0;
      if (emitJsonOk({ sessionId, killedAgents })) return;
      console.log(`Session ${sessionId} killed.`);
      console.log(`Cleaned up: ${killedAgents} agent(s) killed, tmux window removed.`);
    });
}

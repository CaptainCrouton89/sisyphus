import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerContinue(program: Command): void {
  program
    .command('continue')
    .description('Clear roadmap and continue working on a completed session (stays in current cycle)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session lifecycle continue
  $ sis session lifecycle continue --session sess-7f2a --json

When to use:
  After \`complete\`, when you want to keep working in the same session.

When NOT to use:
  Use \`sis session lifecycle resume\` instead when restarting with new instructions —
  resume preserves history; continue wipes the roadmap.

Output:
  Default       "Session reactivated. Roadmap cleared." then next-step hints.
  --json        { ok, schema_version: 1, data: { sessionId } }

Exit codes: 0 ok | 2 usage (missing session id) | 3 not_found.

Next on success:
  Write a new roadmap, then \`sis agent spawn ...\`.`,
    )
    .action(async (opts: { session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          expected: 'a session id string',
          received: null,
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const request: Request = { type: 'continue', sessionId };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId })) return;
      console.log('Session reactivated. Roadmap cleared.');
      console.log('');
      console.log('The previous roadmap has been wiped — you are starting fresh.');
      console.log('Consider writing a new roadmap before spawning agents.');
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerComplete(program: Command): void {
  program
    .command('complete')
    .description('Mark session as completed (orchestrator only)')
    .requiredOption('--report <report>', 'Final completion report')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session complete --report "All TODOs done; tests pass."
  $ sis session complete --session sess-7f2a --report @report.md --json

Output:
  Default       "Session completed." plus a continue-hint on stdout.
  --json        { ok, schema_version: 1, data: { sessionId } }

When NOT to use:
  This is for the orchestrator to signal end-of-roadmap. Sub-agents use
  \`sis agent submit\` to deliver their final report instead.

Exit codes: 0 ok | 2 usage (missing session id) | 3 not_found.

Next on success:
  $ sis session continue      # clear roadmap and keep working in the same session`,
    )
    .action(async (opts: { report: string; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          expected: 'a session id string',
          received: null,
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const request: Request = { type: 'complete', sessionId, report: opts.report };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId })) return;
      console.log('Session completed.');
      console.log('');
      console.log('To keep working in this session:');
      console.log('  sis session continue   # reactivate session and clear roadmap for new work');
    });
}

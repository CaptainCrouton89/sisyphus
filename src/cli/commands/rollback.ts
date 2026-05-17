import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerRollback(program: Command): void {
  program
    .command('rollback <sessionId> <cycle>')
    .description('Roll back a session to a previous cycle boundary')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session recover rollback sess-7f2a 3        # restore state as of cycle 3
  $ sis session recover rollback sess-7f2a 3 --json

Output:
  Default       "Session <id> rolled back to cycle <N>." + resume hint.
  --json        { ok, schema_version: 1, data: { sessionId, restoredToCycle } }

Exit codes: 0 ok | 2 usage (cycle must be positive int) | 3 not_found.

Next on success:
  $ sis session lifecycle resume <sessionId>     # respawn orchestrator from restored state`,
    )
    .action(async (sessionId: string, cycleStr: string) => {
      const toCycle = parseInt(cycleStr, 10);
      if (isNaN(toCycle) || toCycle < 1) {
        exitUsage('bad_cycle', 'cycle must be a positive integer', {
          received: cycleStr,
          expected: 'positive integer >= 1',
        });
      }

      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = { type: 'rollback', sessionId, cwd, toCycle };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const data = response.data as { restoredToCycle: number };
      if (emitJsonOk({ sessionId, restoredToCycle: data.restoredToCycle })) return;
      console.log(`Session ${sessionId} rolled back to cycle ${data.restoredToCycle}.`);
      console.log(`Session is now paused. Use 'sis session lifecycle resume ${sessionId}' to respawn the orchestrator.`);
    });
}

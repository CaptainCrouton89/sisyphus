import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

/**
 * `sis admin quiesce <session-id>`
 *
 * Stop a session at the next quiesce point (or immediately with --force) and
 * leave it paused — no cloud push. Used by `sis cloud reclaim` on the box to
 * halt the box-side session before rsync-ing state back to local.
 */
export function registerQuiesce(parent: Command): void {
  parent
    .command('quiesce <session-id>')
    .description('Pause a session at the next quiesce point (or now with --force). No cloud push.')
    .option('--force', 'Interrupt running orchestrator/agents immediately.')
    .action(async (sessionId: string, opts: { force?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = {
        type: 'admin-quiesce',
        sessionId,
        cwd,
        force: opts.force === true,
      };
      const response = await sendRequest(request);
      if (!response.ok) {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
      const data = response.data as { queued?: boolean; force?: boolean } | undefined;
      if (data?.force) {
        console.log(`Session ${sessionId} quiescing now (--force).`);
      } else {
        console.log(`Session ${sessionId} will pause at next quiesce point.`);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError } from '../errors.js';
import { emitJsonOk } from '../output.js';

/**
 * `sis session recover quiesce <session-id>`
 *
 * Stop a session at the next quiesce point (or immediately with --force) and
 * leave it paused — no cloud push. Used by `sis cloud handoff pull` on the box to
 * halt the box-side session before rsync-ing state back to local.
 */
export function registerQuiesce(parent: Command): void {
  parent
    .command('quiesce <session-id>')
    .description('Pause a session at the next quiesce point (or now with --force). No cloud push.')
    .option('--force', 'Interrupt running orchestrator/agents immediately.')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session recover quiesce sess-7f2a
  $ sis session recover quiesce sess-7f2a --force --json

When NOT to use:
  Use \`sis cloud handoff pull\` if you want to pull a cloud-running session back
  to local. \`quiesce\` only pauses; it does not transport state.

Output:
  Default       Prose line indicating queued vs. immediate pause.
  --json        { ok, schema_version: 1, data: { sessionId, force, queued } }

Exit codes: 0 ok | 3 not_found | 5 conflict (session on cloud — use reclaim).`,
    )
    .action(async (sessionId: string, opts: { force?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = {
        type: 'admin-quiesce',
        sessionId,
        cwd,
        force: opts.force === true,
      };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const data = response.data as { queued?: boolean; force?: boolean } | undefined;
      const force = data?.force === true;
      const queued = data?.queued === true;
      if (emitJsonOk({ sessionId, force, queued })) return;
      if (force) {
        console.log(`Session ${sessionId} quiescing now (--force).`);
      } else {
        console.log(`Session ${sessionId} will pause at next quiesce point.`);
      }
    });
}

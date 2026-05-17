import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

const VALID_TIERS = ['low', 'medium', 'high', 'xhigh'] as const;
type EffortTier = typeof VALID_TIERS[number];

export function registerSessionEffort(program: Command): void {
  program
    .command('effort <sessionId> <tier>')
    .description('Set the pipeline effort tier for a session (future cycles only; running agents keep their original prompt)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session config effort sess-7f2a high
  $ sis session config effort sess-7f2a xhigh --json

Output:
  Default       "Effort tier set to '<tier>' for session <id>" + scope note.
  --json        { ok, schema_version: 1, data: { sessionId, effort } }

Exit codes: 0 ok | 2 usage (bad tier) | 3 not_found.`,
    )
    .action(async (sessionId: string, tier: string) => {
      if (!VALID_TIERS.includes(tier as EffortTier)) {
        exitUsage('bad_tier', `tier must be one of: ${VALID_TIERS.join(', ')}`, {
          received: tier,
          expected: [...VALID_TIERS],
        });
      }

      const request: Request = { type: 'set-effort', sessionId, effort: tier as EffortTier };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId, effort: tier })) return;
      console.log(`Effort tier set to '${tier}' for session ${sessionId}`);
      console.log('Note: Future cycles only — running agents keep their original prompt.');
    });
}

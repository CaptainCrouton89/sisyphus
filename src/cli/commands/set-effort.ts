import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

const VALID_TIERS = ['low', 'medium', 'high', 'xhigh'] as const;
type EffortTier = typeof VALID_TIERS[number];

export function registerSetEffort(program: Command): void {
  program
    .command('set-effort <sessionId> <tier>')
    .description('Set the pipeline effort tier for a session (future cycles only; running agents keep their original prompt)')
    .action(async (sessionId: string, tier: string) => {
      if (!VALID_TIERS.includes(tier as EffortTier)) {
        console.error(`Error: tier must be one of: ${VALID_TIERS.join(', ')}`);
        process.exit(1);
      }

      const request: Request = { type: 'set-effort', sessionId, effort: tier as EffortTier };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Effort tier set to '${tier}' for session ${sessionId}`);
        console.log('Note: Future cycles only — running agents keep their original prompt.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

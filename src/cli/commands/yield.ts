import type { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerYield(program: Command): void {
  program
    .command('yield')
    .description('Yield control back to daemon (orchestrator only)')
    .option('--prompt <text>', 'Instructions for the next orchestrator cycle (or pipe via stdin)')
    .action(async (opts: { prompt?: string }) => {
      assertTmux();
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
        process.exit(1);
      }

      const nextPrompt = opts.prompt ?? await readStdin() ?? undefined;

      const request: Request = { type: 'yield', sessionId, agentId: 'orchestrator', nextPrompt };
      const response = await sendRequest(request);
      if (response.ok) {
        writeFileSync(`/tmp/sisyphus-exit-${sessionId}`, '');
        console.log('Yielded. Waiting for agents to complete.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

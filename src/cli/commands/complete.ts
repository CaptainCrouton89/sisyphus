import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';

export function registerComplete(program: Command): void {
  program
    .command('complete')
    .description('Mark session as completed (orchestrator only)')
    .requiredOption('--report <report>', 'Final completion report')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (opts: { report: string; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      const request: Request = { type: 'complete', sessionId, report: opts.report };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Session completed.');
        console.log(`\nTo keep working in this session:`);
        console.log(`  sisyphus continue   # reactivate session and clear roadmap for new work`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

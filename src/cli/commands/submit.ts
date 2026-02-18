import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerSubmit(program: Command): void {
  program
    .command('submit')
    .description('Submit work report and exit (agent only)')
    .option('--report <report>', 'Work report (or pipe via stdin)')
    .action(async (opts: { report?: string }) => {
      assertTmux();
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: SISYPHUS_SESSION_ID and SISYPHUS_AGENT_ID environment variables must be set');
        process.exit(1);
      }

      const report = opts.report ?? await readStdin();
      if (!report) {
        console.error('Error: provide --report or pipe content via stdin');
        process.exit(1);
      }

      const request: Request = { type: 'submit', sessionId, agentId, report };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Report submitted successfully');
        console.log('Your pane will close. The orchestrator resumes when all agents finish.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

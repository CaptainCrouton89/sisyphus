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
    .option('--stdin', 'Force-read report from stdin (avoids shell escaping for long prompts)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (opts: { report?: string; stdin?: boolean; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID (and SISYPHUS_AGENT_ID) environment variables');
        process.exit(1);
      }

      let report: string | null | undefined;
      if (opts.stdin) {
        report = await readStdin({ force: true });
        if (!report) {
          console.error('Error: --stdin set but no input received on stdin');
          process.exit(1);
        }
        if (opts.report) {
          console.error('Error: --stdin conflicts with --report; pass one source');
          process.exit(1);
        }
      } else {
        report = opts.report ?? await readStdin();
      }
      if (!report) {
        console.error('Error: provide --report, pipe content via stdin, or use --stdin');
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

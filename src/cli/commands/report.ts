import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Send a progress report without exiting (agent only)')
    .option('--message <message>', 'Progress report content')
    .option('--stdin', 'Force-read message from stdin (avoids shell escaping for long prompts)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (opts: { message?: string; stdin?: boolean; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID (and SISYPHUS_AGENT_ID) environment variables');
        process.exit(1);
      }

      let content: string | null | undefined;
      if (opts.stdin) {
        content = await readStdin({ force: true });
        if (!content) {
          console.error('Error: --stdin set but no input received on stdin');
          process.exit(1);
        }
        if (opts.message) {
          console.error('Error: --stdin conflicts with --message; pass one source');
          process.exit(1);
        }
      } else {
        content = opts.message ?? await readStdin();
      }
      if (!content) {
        console.error('Error: provide --message, pipe content via stdin, or use --stdin');
        process.exit(1);
      }

      const request: Request = { type: 'report', sessionId, agentId, content };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Progress report recorded');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerYield(program: Command): void {
  program
    .command('yield')
    .description('Yield control back to daemon (orchestrator only)')
    .option('--prompt <text>', 'Short orienting nudge for the next cycle (or pipe via stdin) — name what just happened; leave tactical decisions to the fresh read of the reports')
    .option('--stdin', 'Force-read prompt from stdin (avoids shell escaping for long prompts)')
    .requiredOption('--mode <mode>', 'System prompt mode for next cycle (discovery, planning, implementation, validation, completion). Required — pass the current mode to stay in it.')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (opts: { prompt?: string; stdin?: boolean; mode?: string; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      let nextPrompt: string | undefined;
      if (opts.stdin) {
        const piped = await readStdin({ force: true });
        if (!piped) {
          console.error('Error: --stdin set but no input received on stdin');
          process.exit(1);
        }
        if (opts.prompt) {
          console.error('Error: --stdin conflicts with --prompt; pass one source');
          process.exit(1);
        }
        nextPrompt = piped;
      } else {
        nextPrompt = opts.prompt ?? await readStdin() ?? undefined;
      }

      const request: Request = { type: 'yield', sessionId, agentId: 'orchestrator', nextPrompt, mode: opts.mode };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Yielded. Waiting for agents to complete.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

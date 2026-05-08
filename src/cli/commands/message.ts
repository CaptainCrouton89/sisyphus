import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { readStdin } from '../stdin.js';
import type { Request } from '../../shared/protocol.js';
import type { MessageSource } from '../../shared/types.js';

export function registerMessage(program: Command): void {
  program
    .command('message')
    .description('Queue a message for the orchestrator to see on next cycle')
    .argument('[content]', 'Message content (omit when using --stdin or piping)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .option('--agent <agentId>', 'Route message to a specific agent inbox instead of the orchestrator')
    .option('--stdin', 'Force-read message content from stdin (avoids shell escaping for long prompts)')
    .action(async (contentArg: string | undefined, opts: { session?: string; agent?: string; stdin?: boolean }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      let content: string | null | undefined;
      if (opts.stdin) {
        content = await readStdin({ force: true });
        if (!content) {
          console.error('Error: --stdin set but no input received on stdin');
          process.exit(1);
        }
        if (contentArg !== undefined && contentArg !== '-') {
          console.error('Error: --stdin conflicts with [content] argument; pass one source');
          process.exit(1);
        }
      } else if (contentArg === '-' || contentArg === undefined) {
        content = await readStdin();
        if (!content) {
          console.error('Error: provide [content] argument, pipe via stdin, or use --stdin');
          process.exit(1);
        }
      } else {
        content = contentArg;
      }

      const source: MessageSource | undefined = process.env.SISYPHUS_AGENT_ID
        ? { type: 'agent' as const, agentId: process.env.SISYPHUS_AGENT_ID }
        : undefined;

      const request: Request = { type: 'message', sessionId, content: content!, source, ...(opts.agent ? { agentId: opts.agent } : {}) };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Message queued');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

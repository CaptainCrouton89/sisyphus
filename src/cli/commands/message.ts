import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { MessageSource } from '../../shared/types.js';

export function registerMessage(program: Command): void {
  program
    .command('message <content>')
    .description('Queue a message for the orchestrator to see on next cycle')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (content: string, opts: { session?: string }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      const source: MessageSource | undefined = process.env.SISYPHUS_AGENT_ID
        ? { type: 'agent' as const, agentId: process.env.SISYPHUS_AGENT_ID }
        : undefined;

      const request: Request = { type: 'message', sessionId, content, source };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Message queued');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

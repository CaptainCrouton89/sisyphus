import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { readStdin } from '../stdin.js';
import type { Request } from '../../shared/protocol.js';
import type { MessageSource } from '../../shared/types.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerMessage(program: Command): void {
  program
    .command('message')
    .description('Queue a message for the orchestrator to see on next cycle')
    .argument('[content]', 'Message content (omit when using --stdin or piping)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .option('--agent <agentId>', 'Route message to a specific agent inbox instead of the orchestrator')
    .option('--stdin', 'Force-read message content from stdin (avoids shell escaping for long prompts)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis orch message "deploy is failing on lint step"
  $ sis orch message --agent agent-2 "switch focus to db migration"
  $ cat hint.md | sis orch message --stdin

When NOT to use:
  Use \`sis orch tell\` to type into a running pane immediately (this queues for
  the next cycle). Use \`sis ask submit\` to block waiting on a structured reply.

Output:
  Default       "Message queued" on stdout.
  --json        { ok, schema_version: 1, data: { sessionId, agentId? } }

Exit codes: 0 ok | 2 usage (missing content / session) | 3 not_found.`,
    )
    .action(async (contentArg: string | undefined, opts: { session?: string; agent?: string; stdin?: boolean }) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      let content: string | null | undefined;
      if (opts.stdin) {
        content = await readStdin({ force: true });
        if (!content) {
          exitUsage('empty_stdin', '--stdin set but no input received on stdin', {
            next: 'pipe content: `echo "..." | sis orch message --stdin`',
          });
        }
        if (contentArg !== undefined && contentArg !== '-') {
          exitUsage('stdin_conflict', '--stdin conflicts with [content] argument; pass one source', {
            received: { stdin: true, content: contentArg },
          });
        }
      } else if (contentArg === '-' || contentArg === undefined) {
        content = await readStdin();
        if (!content) {
          exitUsage('missing_content', 'provide [content] argument, pipe via stdin, or use --stdin', {
            next: 'sis orch message "text" — or sis orch message --stdin <hint.md',
          });
        }
      } else {
        content = contentArg;
      }

      const source: MessageSource | undefined = process.env.SISYPHUS_AGENT_ID
        ? { type: 'agent' as const, agentId: process.env.SISYPHUS_AGENT_ID }
        : undefined;

      const request: Request = { type: 'message', sessionId, content: content!, source, ...(opts.agent ? { agentId: opts.agent } : {}) };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId, ...(opts.agent ? { agentId: opts.agent } : {}) })) return;
      console.log('Message queued');
    });
}

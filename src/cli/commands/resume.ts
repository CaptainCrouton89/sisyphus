import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { readStdin } from '../stdin.js';
import type { Request } from '../../shared/protocol.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerResume(program: Command): void {
  program
    .command('resume')
    .description('Respawn orchestrator with new instructions (for paused/completed sessions)')
    .argument('<session-id>', 'Session ID to resume')
    .argument('[message]', 'Additional instructions for the orchestrator (omit when using --stdin)')
    .option('--stdin', 'Read message from stdin (avoids shell escaping for long prompts)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session resume sess-7f2a "Now also handle refresh tokens."
  $ sis session resume sess-7f2a --stdin <new-roadmap.md

When NOT to use:
  Use \`continue\` to keep working on a completed session without new
  instructions — \`continue\` clears the roadmap; \`resume\` preserves history.

Output:
  Default       "Session <id> resumed" + tmux attach hint.
  --json        { ok, schema_version: 1, data: { sessionId, tmuxSessionName? } }

Exit codes: 0 ok | 2 usage | 3 not_found | 5 conflict (session already running).`,
    )
    .action(async (sessionId: string, messageArg: string | undefined, opts: { stdin?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      let message: string | undefined = messageArg;
      if (opts.stdin) {
        const piped = await readStdin({ force: true });
        if (!piped) {
          exitUsage('empty_stdin', '--stdin set but no input received on stdin', {
            next: 'pipe content: `echo "..." | sis session resume <id> --stdin`',
          });
        }
        if (messageArg !== undefined && messageArg !== '-') {
          exitUsage('stdin_conflict', '--stdin conflicts with [message] argument; pass one source', {
            received: { stdin: true, message: messageArg },
          });
        }
        message = piped;
      } else if (messageArg === '-') {
        const piped = await readStdin({ force: true });
        if (!piped) {
          exitUsage('empty_stdin', "message '-' means read stdin, but no input received", {
            next: 'pipe content or omit `-`',
          });
        }
        message = piped;
      }

      const request: Request = { type: 'resume', sessionId, cwd, message };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const tmuxSessionName = response.data?.tmuxSessionName as string | undefined;
      if (emitJsonOk({ sessionId, ...(tmuxSessionName ? { tmuxSessionName } : {}) })) return;
      console.log(`Session ${sessionId} resumed`);
      if (tmuxSessionName) {
        console.log(`Tmux session: ${tmuxSessionName}`);
        console.log(`  tmux attach -t ${tmuxSessionName}`);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Send a progress report without exiting (agent only)')
    .option('--message <message>', 'Progress report content')
    .option('--stdin', 'Force-read message from stdin (avoids shell escaping for long prompts)')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent report --message "Located auth in 3 files; continuing investigation."
  $ cat checkpoint.md | sis agent report --stdin

What to report (flag it — don't work around it; the orchestrator routes it
to the right agent, you stay focused on your task):
  - Code smells — unexpected complexity, unclear architecture, wrong-looking code
  - Out-of-scope issues — failing tests, missing error handling, broken assumptions
  - Blockers — anything preventing you from completing your task
  Include exact file:line so the next agent can navigate.

When NOT to use:
  Use \`sis agent submit\` to deliver the final report and exit. \`report\`
  is non-terminal — it records an intermediate checkpoint and the agent
  keeps running.

Output:
  Default       "Progress report recorded" on stdout.
  --json        { ok, schema_version: 1, data: { sessionId, agentId } }

Exit codes: 0 ok | 2 usage | 3 not_found.`,
    )
    .action(async (opts: { message?: string; stdin?: boolean; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        exitUsage('missing_agent_env', 'Provide --session or set SISYPHUS_SESSION_ID (and SISYPHUS_AGENT_ID) environment variables', {
          received: { sessionId: sessionId ?? null, agentId: agentId ?? null },
          next: 'report is agent-only; SISYPHUS_AGENT_ID is set automatically inside agent panes',
        });
      }

      let content: string | null | undefined;
      if (opts.stdin) {
        content = await readStdin({ force: true });
        if (!content) {
          exitUsage('empty_stdin', '--stdin set but no input received on stdin', {
            next: 'pipe content: `echo "..." | sis agent report --stdin`',
          });
        }
        if (opts.message) {
          exitUsage('stdin_conflict', '--stdin conflicts with --message; pass one source', {
            received: { stdin: true, message: opts.message },
          });
        }
      } else {
        content = opts.message ?? await readStdin();
      }
      if (!content) {
        exitUsage('missing_content', 'provide --message, pipe content via stdin, or use --stdin', {
          next: 'sis agent report --message "..." or sis agent report --stdin <checkpoint.md',
        });
      }

      const request: Request = { type: 'report', sessionId, agentId, content };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId, agentId })) return;
      console.log('Progress report recorded');
    });
}

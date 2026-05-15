import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerYield(program: Command): void {
  program
    .command('yield')
    .description('Yield control back to daemon (orchestrator only)')
    .option('--prompt <text>', 'Short orienting nudge for the next cycle (or pipe via stdin) — name what just happened; leave tactical decisions to the fresh read of the reports')
    .option('--stdin', 'Force-read prompt from stdin (avoids shell escaping for long prompts)')
    .requiredOption('--mode <mode>', 'System prompt mode for next cycle (discovery, planning, implementation, validation, completion). Required — pass the current mode to stay in it.')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis orch yield --mode planning --prompt "agents finished discovery; ready to design"
  $ sis orch yield --mode implementation --stdin <prompt.md

--mode (required, every cycle): pass the CURRENT mode to stay in the phase,
a DIFFERENT mode to transition. There is no implicit "keep current mode".

--prompt — orient the next cycle, don't script it:
  Two clauses only: what just landed (the artifacts) + the live question.
  Under three sentences. The next cycle has the same reports / roadmap /
  strategy / digest and runs the same playbook — it triages from a fresh
  read, not from your plan.

  good: --prompt "Three per-commit reviews complete. Address findings; if any
        is ambiguous work with the user, then decide investigate vs synthesize."
  good: --prompt "Explore mapped the auth + session layers. Open: is the
        session refactor in scope or a follow-up?"
  bad:  --prompt "Read the 3 review docs. If thin, respawn narrower. Then
        cross-cutting pass. Then synthesize sorted by severity."
        — scripts the next cycle before it has read anything.

  Don't write these rules into the string. "Stay open", "don't pre-decide"
  are for you, not the next orchestrator — it already has them. The --mode
  token itself signals a phase change; the prompt is orienting content only.

NEVER yield while waiting for user input. Yield kills this process and
respawns a fresh instance with no memory of the conversation — you'll see the
same prompt, have no answer, and loop forever. Ask in the pane and stop instead.

Output:
  Default       "Yielded. Waiting for agents to complete." on stdout.
  --json        { ok, schema_version: 1, data: { sessionId, mode } }

Exit codes: 0 ok | 2 usage (missing --mode / --session) | 3 not_found.

After yielding the daemon blocks until all running agents submit, then
respawns the orchestrator with --mode applied for the next cycle.`,
    )
    .action(async (opts: { prompt?: string; stdin?: boolean; mode?: string; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      let nextPrompt: string | undefined;
      if (opts.stdin) {
        const piped = await readStdin({ force: true });
        if (!piped) {
          exitUsage('empty_stdin', '--stdin set but no input received on stdin', {
            next: 'pipe content: `echo "..." | sis orch yield --stdin --mode <mode>`',
          });
        }
        if (opts.prompt) {
          exitUsage('stdin_conflict', '--stdin conflicts with --prompt; pass one source', {
            received: { stdin: true, prompt: opts.prompt },
          });
        }
        nextPrompt = piped;
      } else {
        nextPrompt = opts.prompt ?? await readStdin() ?? undefined;
      }

      const request: Request = { type: 'yield', sessionId, agentId: 'orchestrator', nextPrompt, mode: opts.mode };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ sessionId, mode: opts.mode })) return;
      console.log('Yielded. Waiting for agents to complete.');
    });
}

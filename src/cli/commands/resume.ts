import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { readStdin } from '../stdin.js';
import type { Request } from '../../shared/protocol.js';

export function registerResume(program: Command): void {
  program
    .command('resume')
    .description('Respawn orchestrator with new instructions (for paused/completed sessions)')
    .addHelpText('after', '\n  Use `resume` to restart a paused or completed session with new instructions.\n  Use `continue` to keep working on a completed session without new instructions.\n')
    .argument('<session-id>', 'Session ID to resume')
    .argument('[message]', 'Additional instructions for the orchestrator (omit when using --stdin)')
    .option('--stdin', 'Read message from stdin (avoids shell escaping for long prompts)')
    .action(async (sessionId: string, messageArg: string | undefined, opts: { stdin?: boolean }) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      let message: string | undefined = messageArg;
      if (opts.stdin) {
        const piped = await readStdin({ force: true });
        if (!piped) {
          console.error('Error: --stdin set but no input received on stdin');
          process.exit(1);
        }
        if (messageArg !== undefined && messageArg !== '-') {
          console.error('Error: --stdin conflicts with [message] argument; pass one source');
          process.exit(1);
        }
        message = piped;
      } else if (messageArg === '-') {
        const piped = await readStdin({ force: true });
        if (!piped) {
          console.error("Error: message '-' means read stdin, but no input received");
          process.exit(1);
        }
        message = piped;
      }

      const request: Request = { type: 'resume', sessionId, cwd, message };
      const response = await sendRequest(request);
      if (response.ok) {
        const tmuxSessionName = response.data?.tmuxSessionName as string | undefined;
        console.log(`Session ${sessionId} resumed`);
        if (tmuxSessionName) {
          console.log(`Tmux session: ${tmuxSessionName}`);
          console.log(`  tmux attach -t ${tmuxSessionName}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

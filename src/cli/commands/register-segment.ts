import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerSegmentRegister(program: Command): void {
  program
    .command('register')
    .description('Register or update an external status bar segment')
    .requiredOption('--id <id>', 'Segment identifier')
    .requiredOption('--side <side>', 'Side to render on: left or right')
    .requiredOption('--priority <n>', 'Priority (lower = further from center)', parseInt)
    .requiredOption('--bg <color>', 'Background hex color (e.g. #2d2f33)')
    .requiredOption('--content <content>', 'tmux format string content')
    .addHelpText(
      'after',
      `
Examples:
  $ sis segment register --id deploy --side right --priority 10 --bg "#2d2f33" --content "deploy: ok"

Output:
  Default       "Segment '<id>' registered." on stdout.
  --json        { ok, schema_version: 1, data: { id } }

Exit codes: 0 ok | 2 usage (bad --side).`,
    )
    .action(async (opts: { id: string; side: string; priority: number; bg: string; content: string }) => {
      if (opts.side !== 'left' && opts.side !== 'right') {
        exitUsage('bad_side', '--side must be "left" or "right"', {
          received: opts.side,
          expected: ['left', 'right'],
        });
      }
      const request: Request = {
        type: 'register-segment',
        id: opts.id,
        side: opts.side as 'left' | 'right',
        priority: opts.priority,
        bg: opts.bg,
        content: opts.content,
      };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      if (emitJsonOk({ id: opts.id })) return;
      console.log(`Segment '${opts.id}' registered.`);
    });
}

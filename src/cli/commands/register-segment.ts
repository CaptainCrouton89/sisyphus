import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerRegisterSegment(program: Command): void {
  program
    .command('register-segment')
    .description('Register or update an external status bar segment')
    .requiredOption('--id <id>', 'Segment identifier')
    .requiredOption('--side <side>', 'Side to render on: left or right')
    .requiredOption('--priority <n>', 'Priority (lower = further from center)', parseInt)
    .requiredOption('--bg <color>', 'Background hex color (e.g. #2d2f33)')
    .requiredOption('--content <content>', 'tmux format string content')
    .action(async (opts: { id: string; side: string; priority: number; bg: string; content: string }) => {
      if (opts.side !== 'left' && opts.side !== 'right') {
        console.error('Error: --side must be "left" or "right"');
        process.exit(1);
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
      if (response.ok) {
        console.log(`Segment '${opts.id}' registered.`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { rawSend } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerNotify(program: Command): void {
  const notify = program
    .command('notify')
    .description('Internal notifications (fire-and-forget)');

  notify
    .command('pane-exited')
    .description('Notify daemon that a tmux pane exited')
    .requiredOption('--pane-id <paneId>', 'Pane ID that exited')
    .action(async (opts: { paneId: string }) => {
      try {
        const request: Request = { type: 'pane-exited', paneId: opts.paneId };
        await rawSend(request);
      } catch {
        // Fire-and-forget: daemon may be stopped, socket gone, etc.
      }
    });
}

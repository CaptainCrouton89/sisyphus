import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';

export function registerContinue(program: Command): void {
  program
    .command('continue')
    .description('Clear roadmap and continue working on a completed session (stays in current cycle)')
    .addHelpText('after', '\n  Use `continue` when a session completed but you want to add more work.\n  Use `resume` when you want to restart with specific new instructions.\n')
    .action(async () => {
      assertTmux();
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
        process.exit(1);
      }

      const request: Request = { type: 'continue', sessionId };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Session reactivated. Plan cleared.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

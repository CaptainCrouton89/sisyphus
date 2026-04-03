import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerReconnect(program: Command): void {
  program
    .command('reconnect')
    .description('Reconnect daemon to an orphaned tmux session (no state change, no orchestrator spawn)')
    .argument('<session-id>', 'Session ID to reconnect')
    .action(async (sessionId: string) => {
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = { type: 'reconnect', sessionId, cwd };
      const response = await sendRequest(request);
      if (response.ok) {
        const tmuxSessionName = response.data?.tmuxSessionName as string;
        const tmuxWindowId = response.data?.tmuxWindowId as string;
        console.log(`Reconnected to ${tmuxSessionName} (window ${tmuxWindowId})`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

export function registerRollback(program: Command): void {
  program
    .command('rollback <sessionId> <cycle>')
    .description('Roll back a session to a previous cycle boundary')
    .action(async (sessionId: string, cycleStr: string) => {
      const toCycle = parseInt(cycleStr, 10);
      if (isNaN(toCycle) || toCycle < 1) {
        console.error('Error: cycle must be a positive integer');
        process.exit(1);
      }

      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = { type: 'rollback', sessionId, cwd, toCycle };
      const response = await sendRequest(request);
      if (response.ok) {
        const data = response.data as { restoredToCycle: number };
        console.log(`Session ${sessionId} rolled back to cycle ${data.restoredToCycle}.`);
        console.log(`Session is now paused. Use 'sisyphus resume ${sessionId}' to respawn the orchestrator.`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}

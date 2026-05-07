import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { exportSessionToZip } from '../../shared/session-export.js';

export { exportSessionToZip };

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Export session data as zip to ~/Downloads')
    .argument('[session-id]', 'Session ID (defaults to SISYPHUS_SESSION_ID or active session)')
    .option('--cwd <path>', 'Project directory override')
    .action(async (sessionIdArg?: string, opts?: { cwd?: string }) => {
      let sessionId = sessionIdArg ?? process.env.SISYPHUS_SESSION_ID;
      const cwd = opts?.cwd ?? process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (!sessionId) {
        const request: Request = { type: 'status', cwd };
        const response = await sendRequest(request);
        if (response.ok) {
          const session = response.data?.session as Session | undefined;
          if (session) {
            sessionId = session.id;
          }
        }
      }

      if (!sessionId) {
        console.error('Error: No session ID provided and no active session found.');
        console.error('Usage: sis admin export [session-id]');
        process.exit(1);
      }

      try {
        const outputPath = await exportSessionToZip(sessionId, cwd);
        console.log(`Exported to ${outputPath}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

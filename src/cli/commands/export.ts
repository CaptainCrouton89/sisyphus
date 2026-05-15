import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { exportSessionToZip } from '../../shared/session-export.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

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
        exitUsage('missing_session_id', 'No session ID provided and no active session found.', {
          next: 'sis session export <session-id>',
        });
      }

      try {
        const outputPath = await exportSessionToZip(sessionId, cwd);
        if (emitJsonOk({ sessionId, outputPath })) return;
        console.log(`Exported to ${outputPath}`);
      } catch (err) {
        exitError({
          code: 'export_failed',
          kind: 'permanent',
          message: (err as Error).message,
          received: sessionId,
        });
      }
    });
}

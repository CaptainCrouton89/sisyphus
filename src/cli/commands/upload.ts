import type { Command } from 'commander';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { loadConfig } from '../../shared/config.js';
import { exportSessionToZip } from '../../shared/session-export.js';
import { uploadSession, isUploadConfigured } from '../../shared/upload.js';
import { buildManifest } from '../../shared/manifest.js';
import { getSession } from '../../daemon/state.js';
import { getSisyphusVersion } from '../../shared/version.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerUpload(program: Command): void {
  program
    .command('upload')
    .description('Upload a session zip to the configured upload endpoint')
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
          next: 'sis admin upload <session-id>',
        });
      }

      const config = loadConfig(cwd);
      if (!isUploadConfigured(config.upload)) {
        exitError({
          code: 'upload_not_configured',
          kind: 'usage',
          message: "upload not configured.",
          next: "Run 'sis admin configure-upload <url-with-token>' or set { upload: { url, token } } in .sisyphus/config.json.",
        });
      }

      let zipPath: string;
      try {
        zipPath = await exportSessionToZip(sessionId, cwd, { reveal: false, outputDir: tmpdir() });
      } catch (err) {
        exitError({
          code: 'export_failed',
          kind: 'permanent',
          message: (err as Error).message,
          received: sessionId,
        });
      }

      try {
        const session = getSession(cwd, sessionId);
        if (session.status !== 'completed') {
          console.warn(`warning: session ${sessionId} is not completed (status: ${session.status}); uploading anyway`);
        }

        const manifest = buildManifest({ session, status: 'completed', config, sisyphusVersion: getSisyphusVersion() });

        let result: Awaited<ReturnType<typeof uploadSession>>;
        try {
          result = await uploadSession({ config: config.upload, zipPath, manifest });
        } catch (err) {
          const errMsg = (err as Error).message;
          const persistReq: Request = {
            type: 'set-upload-status',
            sessionId,
            cwd,
            status: 'failed',
            error: errMsg,
          };
          try {
            await sendRequest(persistReq);
          } catch {
            // daemon unreachable — best-effort
          }
          exitError({
            code: 'upload_failed',
            kind: 'transient',
            message: `Upload failed: ${errMsg}`,
            received: sessionId,
          });
        }

        const persistReq: Request = {
          type: 'set-upload-status',
          sessionId,
          cwd,
          status: 'uploaded',
          storageKey: result!.storageKey,
        };
        try {
          const resp = await sendRequest(persistReq);
          if (!resp.ok) {
            const detail = typeof resp.error === 'string' ? resp.error : resp.error?.message ?? 'no error detail';
            console.warn(`warning: could not persist upload status (${detail})`);
          }
        } catch {
          console.warn('warning: daemon unreachable — upload status not persisted to session state');
        }

        if (!emitJsonOk({ sessionId, storageKey: result!.storageKey })) {
          console.log(`Uploaded to ${result!.storageKey}`);
        }
      } finally {
        rmSync(zipPath!, { force: true });
      }
    });
}

import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Config } from '../shared/config.js';
import { buildManifest, type ManifestStatus } from '../shared/manifest.js';
import { exportSessionToZip } from '../shared/session-export.js';
import { uploadSession } from '../shared/upload.js';
import type { Session } from '../shared/types.js';
import * as state from './state.js';

export async function runSessionUploadAndPersist(args: {
  sessionId: string;
  cwd: string;
  fullConfig: Config;
  session: Session;
  status: ManifestStatus;
  sisyphusVersion: string;
}): Promise<void> {
  const { sessionId, cwd, fullConfig, session, status, sisyphusVersion } = args;
  let zipPath: string | undefined;
  await state.updateSession(cwd, sessionId, { uploadStatus: 'pending' });
  try {
    zipPath = await exportSessionToZip(sessionId, cwd, { reveal: false, outputDir: tmpdir() });
    const manifest = buildManifest({ session, status, config: fullConfig, sisyphusVersion });
    const result = await uploadSession({ config: fullConfig.upload!, zipPath, manifest });
    await state.updateSession(cwd, sessionId, {
      uploadStatus: 'uploaded',
      uploadKey: result.storageKey,
      uploadCompletedAt: new Date().toISOString(),
      uploadError: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await state.updateSession(cwd, sessionId, { uploadStatus: 'failed', uploadError: message });
  } finally {
    if (zipPath) await rm(zipPath, { force: true });
  }
}

import { readFile } from 'node:fs/promises';
import type { SessionManifest } from './manifest.js';
import type { UploadConfig } from './config.js';

export type { UploadConfig };

export interface UploadResult {
  storageKey: string;
  userId: string;
  uploadedAt: string;
}

function parseWorkerError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch { /* fall through */ }
  return body;
}

export class UploadError extends Error {
  constructor(public readonly status: number, rawBody: string) {
    const parsed = parseWorkerError(rawBody);
    super(`HTTP ${status}: ${parsed}`);
  }
}

export function isUploadConfigured(upload: UploadConfig | undefined): upload is UploadConfig {
  return !!upload && upload.url.length > 0 && upload.token.length > 0;
}

export async function uploadSession(args: {
  config: UploadConfig;
  zipPath: string;
  manifest: SessionManifest;
}): Promise<UploadResult> {
  const { config, zipPath, manifest } = args;

  const formData = new FormData();
  formData.append('manifest', new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
  formData.append('bundle', new Blob([await readFile(zipPath)], { type: 'application/zip' }), `${manifest.sessionId}.zip`);

  const res = await fetch(`${config.url}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}` },
    body: formData,
  });

  if (!res.ok) {
    const rawBody = await res.text();
    const body = rawBody.length > 4096 ? rawBody.slice(0, 4096) + '… [truncated]' : rawBody;
    throw new UploadError(res.status, body);
  }

  return res.json() as Promise<UploadResult>;
}

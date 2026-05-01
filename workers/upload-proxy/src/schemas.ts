export interface TokenRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string | null;
  sessionsUploaded: number;
  revoked: boolean;
  notes?: string;
}

export interface Env {
  BUCKET: R2Bucket;
  TOKENS: KVNamespace;
}

export interface UploadResponse {
  storageKey: string;
  userId: string;
  uploadedAt: string;
}

export interface SessionManifest {
  userId: string;
  sessionId: string;
  sisyphusVersion: string;
  hostname: string;
  platform: string;
  status: 'completed' | 'failed' | 'cancelled';
  completedAt: string;
  durationMs: number;
  wallClockMs: number;
  model: string;
  effortTier: 'low' | 'medium' | 'high' | 'xhigh';
  cycleCount: number;
  agentCount: number;
  goal: string;
}

type ManifestInput = Omit<SessionManifest, 'userId'>;

export function validateManifest(value: unknown): value is ManifestInput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.sessionId !== 'string' || !v.sessionId) return false;
  if (typeof v.sisyphusVersion !== 'string' || !v.sisyphusVersion) return false;
  if (typeof v.hostname !== 'string' || !v.hostname) return false;
  if (typeof v.platform !== 'string' || !v.platform) return false;
  if (v.status !== 'completed' && v.status !== 'failed' && v.status !== 'cancelled') return false;
  if (typeof v.completedAt !== 'string' || !v.completedAt) return false;
  if (typeof v.durationMs !== 'number') return false;
  if (typeof v.wallClockMs !== 'number') return false;
  if (typeof v.model !== 'string' || !v.model) return false;
  if (v.effortTier !== 'low' && v.effortTier !== 'medium' && v.effortTier !== 'high' && v.effortTier !== 'xhigh') return false;
  if (typeof v.cycleCount !== 'number') return false;
  if (typeof v.agentCount !== 'number') return false;
  if (typeof v.goal !== 'string') return false;

  return true;
}

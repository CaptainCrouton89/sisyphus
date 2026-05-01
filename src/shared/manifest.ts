import os from 'node:os';
import type { Session } from './types.js';
import type { Config, EffortLevel } from './config.js';

export type ManifestStatus = 'completed' | 'failed' | 'cancelled';
export type ManifestEffortTier = 'low' | 'medium' | 'high' | 'xhigh';

export interface SessionManifest {
  // userId is omitted on the wire — Worker injects from token
  userId?: string;
  sessionId: string;
  sisyphusVersion: string;
  hostname: string;
  platform: NodeJS.Platform;
  status: ManifestStatus;
  completedAt: string;
  durationMs: number;
  wallClockMs: number;
  model: string;
  effortTier: ManifestEffortTier;
  cycleCount: number;
  agentCount: number;
  goal: string;
}

// 'max' is Config's wider effort level; collapse to 'xhigh' for the manifest's narrower union
function mapEffortFallback(level: EffortLevel | undefined): ManifestEffortTier | undefined {
  if (level === undefined) return undefined;
  if (level === 'max') return 'xhigh';
  return level;
}

function resolveEffortTier(session: Session, config: Config): ManifestEffortTier {
  if (session.effort) return session.effort;
  const fromConfig = mapEffortFallback(config.orchestratorEffort);
  if (fromConfig) return fromConfig;
  return 'medium';
}

export function buildManifest(args: {
  session: Session;
  // explicit — Session.status ('active' | 'paused' | 'completed') doesn't overlap with ManifestStatus
  status: ManifestStatus;
  config: Config;
  sisyphusVersion: string;
}): SessionManifest {
  const { session, status, config, sisyphusVersion } = args;
  return {
    sessionId: session.id,
    sisyphusVersion,
    hostname: os.hostname(),
    platform: process.platform,
    status,
    completedAt: session.completedAt ?? new Date().toISOString(),
    durationMs: session.activeMs,
    wallClockMs: session.wallClockMs ?? 0,
    model: session.model ?? config.model ?? '',
    effortTier: resolveEffortTier(session, config),
    cycleCount: session.orchestratorCycles.length,
    agentCount: session.agents.length,
    goal: session.task.slice(0, 200),
  };
}

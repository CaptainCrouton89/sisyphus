import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import {
  askDecisionsPath, askDir, askMetaPath, askOutputPath, askProgressPath, askVisualsDir,
} from '../shared/paths.js';
import type { AskMeta, AskStatus, Deck, InteractionKind, InteractionResponse } from '../shared/types.js';
import { loadConfig } from '../shared/config.js';
import { emitHistoryEvent } from './history.js';
import { atomicWrite, withLock } from './lib/atomic.js';
import { sendTerminalNotification } from './notify.js';
import * as state from './state.js';

const ACTIONABLE_KINDS: ReadonlySet<InteractionKind> = new Set([
  'validation', 'decision', 'context', 'error',
]);

const HEARTBEAT_ASKED_BY = 'system:heartbeat';

function maybeNotifyOnAskCreated(cwd: string, sessionId: string, meta: AskMeta): void {
  const isActionable = meta.kind !== undefined && ACTIONABLE_KINDS.has(meta.kind);
  const isHeartbeat = meta.askedBy === HEARTBEAT_ASKED_BY;
  if (!isActionable && !isHeartbeat) return;

  try {
    const config = loadConfig(cwd);
    if (config.notifications?.enabled === false) return;
    const session = state.getSession(cwd, sessionId);
    const label = session.name ?? sessionId.slice(0, 8);
    const body = meta.title ?? 'Question pending';
    sendTerminalNotification(label, body, session.tmuxSessionName, 'urgent');
  } catch {
    // notify failures must never roll back the ask write
  }
}

export interface CreateAskParams {
  askId: string;
  askedBy: string;
  blocking: boolean;
  pid?: number;
  claudeSessionId?: string;
  cwd: string;
  title?: string;
  subtitle?: string;
  kind?: InteractionKind;
  orphanTarget?: AskMeta['orphanTarget'];
}

export function createAsk(cwd: string, sessionId: string, params: CreateAskParams): AskMeta {
  // askVisualsDir is a subdir of askEntryDir — one recursive mkdir creates both.
  mkdirSync(askVisualsDir(cwd, sessionId, params.askId), { recursive: true });

  const askedAt = new Date().toISOString();
  const meta: AskMeta = {
    askId: params.askId,
    askedBy: params.askedBy,
    askedAt,
    status: 'pending' as AskStatus,
    blocking: params.blocking,
    cwd: params.cwd,
    ...(params.pid !== undefined ? { pid: params.pid, startedAt: askedAt } : {}),
    ...(params.claudeSessionId !== undefined ? { claudeSessionId: params.claudeSessionId } : {}),
    ...(params.title !== undefined ? { title: params.title } : {}),
    ...(params.subtitle !== undefined ? { subtitle: params.subtitle } : {}),
    ...(params.kind !== undefined ? { kind: params.kind } : {}),
    ...(params.orphanTarget !== undefined ? { orphanTarget: params.orphanTarget } : {}),
  };

  atomicWrite(askMetaPath(cwd, sessionId, params.askId), JSON.stringify(meta, null, 2));
  emitHistoryEvent(sessionId, 'ask-issued', {
    askId: params.askId,
    askedBy: params.askedBy,
    blocking: params.blocking,
    askedAt,
  });
  maybeNotifyOnAskCreated(cwd, sessionId, meta);
  return meta;
}

export function writeDecisions(cwd: string, sessionId: string, askId: string, deck: Deck): void {
  atomicWrite(askDecisionsPath(cwd, sessionId, askId), JSON.stringify(deck, null, 2));
}

export function readDecisions(cwd: string, sessionId: string, askId: string): Deck | null {
  const p = askDecisionsPath(cwd, sessionId, askId);
  try {
    // { encoding } in try body intentional — keeps try content free of bare } for linter clarity
    return JSON.parse(readFileSync(p, { encoding: 'utf-8' })) as Deck;
  } catch (_e) {
    return null;
  }
}

export async function writeProgress(
  cwd: string, sessionId: string, askId: string, responses: InteractionResponse[],
): Promise<void> {
  atomicWrite(askProgressPath(cwd, sessionId, askId), JSON.stringify({
    partial: true,
    responses,
    savedAt: new Date().toISOString(),
  }, null, 2));
  const cur = readMeta(cwd, sessionId, askId);
  if (cur?.status === 'pending') {
    await updateMeta(cwd, sessionId, askId, { status: 'in-progress', startedAt: new Date().toISOString() });
  }
}

export function readProgress(
  cwd: string, sessionId: string, askId: string,
): { responses: InteractionResponse[]; savedAt: string } | null {
  const p = askProgressPath(cwd, sessionId, askId);
  try {
    const data = JSON.parse(readFileSync(p, { encoding: 'utf-8' })) as Record<string, unknown>;
    if (!Array.isArray(data['responses'])) return null;
    return { responses: data['responses'] as InteractionResponse[], savedAt: data['savedAt'] as string };
  } catch (_e) {
    return null;
  }
}

export function writeOutput(
  cwd: string, sessionId: string, askId: string,
  responses: InteractionResponse[], completedAt?: string,
): void {
  atomicWrite(askOutputPath(cwd, sessionId, askId), JSON.stringify({
    responses,
    completedAt: completedAt ?? new Date().toISOString(),
  }, null, 2));
}

export function readMeta(cwd: string, sessionId: string, askId: string): AskMeta | null {
  const p = askMetaPath(cwd, sessionId, askId);
  if (!existsSync(p)) {
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf-8')) as AskMeta;
}

export async function updateMeta(
  cwd: string, sessionId: string, askId: string, patch: Partial<AskMeta>,
): Promise<AskMeta> {
  return withLock(askId, () => {
    const cur = readMeta(cwd, sessionId, askId);
    if (!cur) {
      throw new Error(`updateMeta: askId ${askId} not found`);
    }
    const next: AskMeta = { ...cur, ...patch };
    atomicWrite(askMetaPath(cwd, sessionId, askId), JSON.stringify(next, null, 2));
    return next;
  });
}

export function listAsks(cwd: string, sessionId: string): string[] {
  const dir = askDir(cwd, sessionId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

export interface PendingAskRef {
  askId: string;
  status: AskStatus;
  title?: string;
}

/**
 * Open asks (pending or in-progress) attributed to a specific caller. Used to gate
 * yield/submit so a deck can't be abandoned mid-flight — terminating the caller's
 * pane orphans any answer the user produces afterward.
 *
 * Skips: meta.orphaned, status === 'answered', decks where output.json already
 * exists (the user resolved the deck but markAnswered hasn't run yet, e.g. because
 * the original waiter died before observing the output), and non-blocking decks
 * (mode-transition notifications, heartbeat asks, orphan-recovery surfaces — these
 * have no CLI waiter, so terminating the caller doesn't orphan anything).
 */
export function listOpenAsksFor(cwd: string, sessionId: string, askedBy: string): PendingAskRef[] {
  const out: PendingAskRef[] = [];
  for (const askId of listAsks(cwd, sessionId)) {
    const meta = readMeta(cwd, sessionId, askId);
    if (!meta) continue;
    if (meta.askedBy !== askedBy) continue;
    if (meta.orphaned) continue;
    if (!meta.blocking) continue;
    if (meta.status !== 'pending' && meta.status !== 'in-progress') continue;
    if (existsSync(askOutputPath(cwd, sessionId, askId))) continue;
    out.push({ askId, status: meta.status, ...(meta.title !== undefined ? { title: meta.title } : {}) });
  }
  return out;
}

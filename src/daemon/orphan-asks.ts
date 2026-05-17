import { ulid } from 'ulid';
import * as askStore from './ask-store.js';
import * as state from './state.js';
import type { AskMeta, Deck, Interaction, InteractionOption, Session } from '../shared/types.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';
import { mapWithLimit } from '../shared/lib/concurrent.js';

// Cap parallel ask updates to avoid fd spikes when a session has hundreds of
// asks (each updateMeta does read+atomicWrite under withLock; without a cap,
// `Promise.all` over an entire ask list schedules all of them at once and
// piles up fd churn during startup recovery and orphan sweeps).
const ASK_FANOUT_LIMIT = 16;

const ORPHAN_ASKED_BY = 'system:orphan-handler';

export type OrphanReason = 'pane-gone' | 'pid-mismatch' | 'orchestrator-gone' | 'daemon-startup-stuck';

export interface EmitOrphanAskOpts {
  cwd: string;
  sessionId: string;
  reason: OrphanReason;
  detectedAt: string;
  /** Omit for orchestrator/session orphan. */
  agent?: { id: string; name: string; paneId?: string };
}

function reasonSubtitle(reason: OrphanReason): string {
  switch (reason) {
    case 'pane-gone': return 'Pane closed unexpectedly';
    case 'pid-mismatch': return 'Process gone or pid recycled';
    case 'orchestrator-gone': return 'Orchestrator pane vanished without yield';
    case 'daemon-startup-stuck': return 'Orchestrator lost while daemon was down';
  }
}

function buildBody(opts: EmitOrphanAskOpts): string {
  const lines: string[] = [];
  lines.push(`# ${opts.agent ? opts.agent.name : 'Orchestrator'} orphaned`);
  lines.push('');
  lines.push(`- **Reason:** ${reasonSubtitle(opts.reason)}`);
  lines.push(`- **Detected at:** ${opts.detectedAt}`);
  if (opts.agent) {
    lines.push(`- **Agent ID:** ${opts.agent.id}`);
    if (opts.agent.paneId) lines.push(`- **Pane ID:** ${opts.agent.paneId}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildDeck(
  opts: EmitOrphanAskOpts,
  sessionName: string | undefined,
  orphanTarget: NonNullable<AskMeta['orphanTarget']>,
): { deck: Deck; meta: Pick<AskMeta, 'title' | 'subtitle' | 'kind' | 'orphanTarget'> } {
  const agent = opts.agent;
  const title = agent ? `${agent.name}: process gone` : 'Orchestrator: process gone';
  const subtitle = `${reasonSubtitle(opts.reason)} · detected ${opts.detectedAt}`;

  const options: InteractionOption[] = agent
    ? [
        { id: 'takeover', label: 'Take over agent pane', shortcut: 't' },
        { id: 'restart', label: 'Restart agent', shortcut: 'r' },
        { id: 'dismiss', label: 'Dismiss', shortcut: 'd' },
      ]
    : [
        { id: 'resume', label: 'Resume session', shortcut: 'r' },
        { id: 'dismiss', label: 'Dismiss', shortcut: 'd' },
      ];

  const interaction: Interaction = {
    id: 'orphan',
    title: 'Take over or dismiss?',
    subtitle,
    body: buildBody(opts),
    options,
    allowFreetext: true,
    freetextLabel: 'Notes (optional)',
    kind: 'error',
  };

  const deck: Deck = {
    title,
    source: {
      sessionName,
      askedBy: ORPHAN_ASKED_BY,
      blockedSince: opts.detectedAt,
    },
    interactions: [interaction],
  };

  return { deck, meta: { title, subtitle, kind: 'error', orphanTarget } };
}

function findExistingOrphanAskInList(
  asks: string[],
  cwd: string,
  sessionId: string,
  target: AskMeta['orphanTarget'],
): string | null {
  if (!target) return null;
  for (const askId of asks) {
    const meta = askStore.readMeta(cwd, sessionId, askId);
    if (!meta) continue;
    if (meta.askedBy !== ORPHAN_ASKED_BY) continue;
    if (meta.status === 'answered') continue;
    const t = meta.orphanTarget;
    if (!t) continue;
    if (target.kind === 'orchestrator') {
      if (t.kind !== 'orchestrator') continue;
    } else {
      if (t.kind !== 'agent') continue;
      if (t.agentId !== target.agentId) continue;
    }
    return askId;
  }
  return null;
}

function findExistingOrphanAsk(
  cwd: string,
  sessionId: string,
  target: AskMeta['orphanTarget'],
): string | null {
  return findExistingOrphanAskInList(askStore.listAsks(cwd, sessionId), cwd, sessionId, target);
}

/**
 * Idempotent — scans existing asks for a matching pending/in-progress orphan ask first
 * and skips emission if one exists. Returns the askId on emit, null if deduped.
 */
export async function emitOrphanAsk(opts: EmitOrphanAskOpts): Promise<string | null> {
  // Build orphanTarget first — dedupe check avoids all remaining work on steady-state ticks
  const orphanTarget: NonNullable<AskMeta['orphanTarget']> = opts.agent
    ? { kind: 'agent', agentId: opts.agent.id, paneId: opts.agent.paneId }
    : { kind: 'orchestrator' };

  if (findExistingOrphanAsk(opts.cwd, opts.sessionId, orphanTarget)) return null;

  let sessionName: string | undefined;
  try {
    sessionName = state.getSession(opts.cwd, opts.sessionId).name;
  } catch {
    // tolerate — orphan emission must not crash if state is in flux
  }

  const { deck, meta } = buildDeck(opts, sessionName, orphanTarget);
  const askId = ulid();
  askStore.createAsk(opts.cwd, opts.sessionId, {
    askId,
    askedBy: ORPHAN_ASKED_BY,
    blocking: false,
    cwd: opts.cwd,
    title: meta.title,
    subtitle: meta.subtitle,
    kind: meta.kind,
    orphanTarget: meta.orphanTarget,
  });
  askStore.writeDecisions(opts.cwd, opts.sessionId, askId, deck);
  return askId;
}

/**
 * Mark a session orphaned and emit the corresponding orphan ask in a single call.
 * Consolidates the three identical two-statement sequences across pane-monitor and index.
 * Single listAsks scan shared between emitOrphanAsk and markAgentAsksOrphan logic.
 */
export async function orphanOrchestrator(
  cwd: string,
  sessionId: string,
  stateReason: string,
  askReason: OrphanReason,
): Promise<void> {
  const asks = askStore.listAsks(cwd, sessionId);
  const detectedAt = new Date().toISOString();
  const orphanTarget: NonNullable<AskMeta['orphanTarget']> = { kind: 'orchestrator' };

  await Promise.all([
    state.markSessionOrphan(cwd, sessionId, { reason: stateReason }),
    // emit orchestrator orphan ask (deduped against the pre-loaded list)
    (async () => {
      if (findExistingOrphanAskInList(asks, cwd, sessionId, orphanTarget)) return null;
      let sessionName: string | undefined;
      try { sessionName = state.getSession(cwd, sessionId).name; } catch { /* tolerate */ }
      const { deck, meta } = buildDeck(
        { cwd, sessionId, reason: askReason, detectedAt },
        sessionName,
        orphanTarget,
      );
      const askId = ulid();
      askStore.createAsk(cwd, sessionId, {
        askId,
        askedBy: ORPHAN_ASKED_BY,
        blocking: false,
        cwd,
        title: meta.title,
        subtitle: meta.subtitle,
        kind: meta.kind,
        orphanTarget: meta.orphanTarget,
      });
      askStore.writeDecisions(cwd, sessionId, askId, deck);
      return askId;
    })(),
    // mark orchestrator's pending asks orphaned (over the pre-loaded list)
    _markAsksOrphanFromList(asks, cwd, sessionId, ORCHESTRATOR_ASKED_BY),
  ]);
}

async function _markAsksOrphanFromList(
  asks: string[],
  cwd: string,
  sessionId: string,
  agentId: string,
): Promise<void> {
  await mapWithLimit(asks, ASK_FANOUT_LIMIT, async (askId) => {
    try {
      const meta = askStore.readMeta(cwd, sessionId, askId);
      if (!meta) return;
      if (meta.orphaned) return;
      if (meta.askedBy !== agentId) return;
      if (meta.status === 'answered') return;
      await askStore.updateMeta(cwd, sessionId, askId, { orphaned: true });
    } catch (err) {
      console.warn(
        `[sisyphus] markAgentAsksOrphan: ${sessionId}/${askId} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  });
}

/**
 * Sweeps `<sessionDir>/context/ask/` for asks where `meta.askedBy === agentId` and
 * `meta.status !== 'answered'`. Sets `meta.orphaned = true` atomically. Per-ask try/catch.
 */
export async function markAgentAsksOrphan(cwd: string, sessionId: string, agentId: string): Promise<void> {
  await _markAsksOrphanFromList(askStore.listAsks(cwd, sessionId), cwd, sessionId, agentId);
}

/**
 * Orphans pending/in-progress asks for all currently-running agents in the session.
 * Extracted from the identical filter+Promise.all blocks in handleComplete and handleKill.
 */
export async function orphanRunningAgentAsks(cwd: string, sessionId: string, session: Session): Promise<void> {
  const runningAgentIds = session.agents.filter(a => a.status === 'running').map(a => a.id);
  if (runningAgentIds.length === 0) return;
  await Promise.all(runningAgentIds.map(agentId => markAgentAsksOrphan(cwd, sessionId, agentId)));
}

/**
 * Marks any pending/in-progress orchestrator orphan asks as answered, with a
 * synthetic response indicating which path resolved them. Called by the resume
 * flow, the manual UI dismiss, and the auto-respawn path (`onAllAgentsDone`)
 * so the orphan ask doesn't linger in the inbox after a successful respawn.
 *
 * `resolution` is the internal disposition; the option id written to the deck
 * stays within the deck's actual option set (`resume` | `dismiss`) so existing
 * consumers don't trip on an unknown id. `respawn` is auto-respawn, recorded
 * as `dismiss` with explanatory freetext.
 */
export async function resolveOrchestratorOrphanAsks(
  cwd: string,
  sessionId: string,
  resolution: 'resume' | 'dismiss' | 'respawn',
): Promise<void> {
  const asks = askStore.listAsks(cwd, sessionId);
  const completedAt = new Date().toISOString();
  const selectedOptionId = resolution === 'respawn' ? 'dismiss' : resolution;
  const freetext =
    resolution === 'resume'
      ? 'auto-resolved by sis session lifecycle resume'
      : resolution === 'respawn'
        ? 'auto-resolved by orchestrator auto-respawn'
        : 'auto-resolved by system';
  await mapWithLimit(asks, ASK_FANOUT_LIMIT, async (askId) => {
    try {
      const meta = askStore.readMeta(cwd, sessionId, askId);
      if (!meta) return;
      if (meta.askedBy !== ORPHAN_ASKED_BY) return;
      if (meta.status === 'answered') return;
      if (meta.orphanTarget?.kind !== 'orchestrator') return;
      askStore.writeOutput(cwd, sessionId, askId, [{
        id: 'orphan',
        selectedOptionId,
        freetext,
      }], completedAt);
      await askStore.updateMeta(cwd, sessionId, askId, { status: 'answered', completedAt });
    } catch (err) {
      console.warn(
        `[sisyphus] resolveOrchestratorOrphanAsks: ${sessionId}/${askId} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  });
}

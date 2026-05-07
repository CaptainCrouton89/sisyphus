import { existsSync } from 'node:fs';
import { ulid } from 'ulid';
import * as askStore from './ask-store.js';
import * as state from './state.js';
import { discoverOrchestratorModes } from './orchestrator-modes.js';
import { askOutputPath } from '../shared/paths.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';
import type { Deck, Interaction, ModeChainEntry } from '../shared/types.js';

export interface PrevModeStats {
  cycles: number;
  activeMs: number;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const remM = min % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

// Find an open mode-transition notify ask attributable to the orchestrator —
// the aggregation key. Mirrors the resolved-deck guard in `listOpenAsksFor`
// so we never fold a transition into an ask the user has already answered.
function findOpenModeTransitionAsk(cwd: string, sessionId: string): string | null {
  for (const askId of askStore.listAsks(cwd, sessionId)) {
    const meta = askStore.readMeta(cwd, sessionId, askId);
    if (!meta) continue;
    if (meta.askedBy !== ORCHESTRATOR_ASKED_BY) continue;
    if (meta.modeTransition !== true) continue;
    if (meta.status === 'answered') continue;
    if (meta.orphaned === true) continue;
    if (existsSync(askOutputPath(cwd, sessionId, askId))) continue;
    return askId;
  }
  return null;
}

function buildNextChain(
  prevChain: ModeChainEntry[] | undefined,
  prevMode: string | undefined,
  nextMode: string,
  prevModeStats: PrevModeStats | undefined,
): ModeChainEntry[] {
  const stats = prevModeStats
    ? { cycles: prevModeStats.cycles, activeMs: prevModeStats.activeMs }
    : {};
  if (prevChain && prevChain.length > 0) {
    const updated: ModeChainEntry[] = prevChain.map((e, i) =>
      i === prevChain.length - 1 && prevModeStats ? { ...e, ...stats } : e,
    );
    updated.push({ mode: nextMode });
    return updated;
  }
  if (prevMode !== undefined) {
    return [{ mode: prevMode, ...stats }, { mode: nextMode }];
  }
  return [{ mode: 'unknown' }, { mode: nextMode }];
}

function renderBody(chain: ModeChainEntry[]): string {
  const current = chain[chain.length - 1]!;
  const description = discoverOrchestratorModes()
    .find(m => m.name === current.mode)?.description?.trim();
  const lines: string[] = [];
  if (description) {
    lines.push(`**${capitalize(current.mode)}** — ${description}`);
  } else {
    lines.push(`Now in **${capitalize(current.mode)}** mode.`);
  }
  for (let i = 0; i < chain.length - 1; i++) {
    const e = chain[i]!;
    if (e.cycles === undefined) continue;
    const label = e.cycles === 1 ? 'cycle' : 'cycles';
    lines.push(
      `${capitalize(e.mode)}: ${e.cycles} ${label} · ${formatDuration(e.activeMs ?? 0)} active`,
    );
  }
  return lines.join('\n\n');
}

export async function emitModeTransitionNotify(
  cwd: string,
  sessionId: string,
  prevMode: string | undefined,
  nextMode: string,
  prevModeStats?: PrevModeStats,
): Promise<void> {
  let sessionName: string | undefined;
  try {
    sessionName = state.getSession(cwd, sessionId).name;
  } catch {
    // tolerate — state may be in flux mid-yield
  }

  const existingAskId = findOpenModeTransitionAsk(cwd, sessionId);
  const existingDeck = existingAskId
    ? askStore.readDecisions(cwd, sessionId, existingAskId)
    : null;
  const chain = buildNextChain(
    existingDeck?.source?.modeChain,
    prevMode,
    nextMode,
    prevModeStats,
  );

  const subtitle = chain.map(e => e.mode).join(' → ');
  const title = 'Mode change';
  const deckTitle = `Mode: ${subtitle}`;
  const body = renderBody(chain);

  const interaction: Interaction = {
    id: 'mode-transition',
    title,
    subtitle,
    body,
    kind: 'notify',
    options: [{ id: 'ack', label: 'Acknowledged' }],
  };

  const deck: Deck = {
    title: deckTitle,
    source: {
      ...(sessionName !== undefined ? { sessionName } : {}),
      askedBy: ORCHESTRATOR_ASKED_BY,
      modeChain: chain,
    },
    interactions: [interaction],
  };

  try {
    if (existingAskId) {
      askStore.writeDecisions(cwd, sessionId, existingAskId, deck);
      await askStore.updateMeta(cwd, sessionId, existingAskId, {
        title,
        subtitle,
        askedAt: new Date().toISOString(),
      });
      return;
    }
    const askId = ulid();
    askStore.createAsk(cwd, sessionId, {
      askId,
      askedBy: ORCHESTRATOR_ASKED_BY,
      blocking: false,
      cwd,
      title,
      subtitle,
      kind: 'notify',
      modeTransition: true,
    });
    askStore.writeDecisions(cwd, sessionId, askId, deck);
  } catch (err) {
    console.warn(
      `[sisyphus] mode-notify: failed to emit mode transition ask for ${sessionId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

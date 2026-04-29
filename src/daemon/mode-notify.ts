import { ulid } from 'ulid';
import * as askStore from './ask-store.js';
import * as state from './state.js';
import { discoverOrchestratorModes } from './orchestrator-modes.js';
import { ORCHESTRATOR_ASKED_BY } from '../shared/types.js';
import type { Deck, Interaction } from '../shared/types.js';

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

export async function emitModeTransitionNotify(
  cwd: string,
  sessionId: string,
  prevMode: string | undefined,
  nextMode: string,
  prevModeStats?: PrevModeStats,
): Promise<void> {
  const prev = prevMode !== undefined ? prevMode : 'unknown';
  const subtitle = `${prev} → ${nextMode}`;
  const title = 'Mode change';
  const deckTitle = `Mode: ${subtitle}`;

  let sessionName: string | undefined;
  try {
    sessionName = state.getSession(cwd, sessionId).name;
  } catch {
    // tolerate — state may be in flux mid-yield
  }

  const description = discoverOrchestratorModes()
    .find(m => m.name === nextMode)?.description?.trim();

  const lines: string[] = [];
  if (description) {
    lines.push(`**${capitalize(nextMode)}** — ${description}`);
  } else {
    lines.push(`Now in **${nextMode}** mode.`);
  }
  if (prevModeStats && prevMode) {
    const cyclesLabel = prevModeStats.cycles === 1 ? 'cycle' : 'cycles';
    lines.push(
      `${capitalize(prev)}: ${prevModeStats.cycles} ${cyclesLabel} · ${formatDuration(prevModeStats.activeMs)} active`,
    );
  }
  const body = lines.join('\n\n');

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
      sessionName,
      askedBy: ORCHESTRATOR_ASKED_BY,
    },
    interactions: [interaction],
  };

  const askId = ulid();
  try {
    askStore.createAsk(cwd, sessionId, {
      askId,
      askedBy: ORCHESTRATOR_ASKED_BY,
      blocking: false,
      cwd,
      title,
      subtitle,
      kind: 'notify',
    });
    askStore.writeDecisions(cwd, sessionId, askId, deck);
  } catch (err) {
    console.warn(
      `[sisyphus] mode-notify: failed to emit mode transition ask for ${sessionId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

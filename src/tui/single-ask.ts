import { existsSync, watchFile, unwatchFile } from 'node:fs';
import { mountPanel, type Deck, type InteractionResponse, type MountedPanel } from '@crouton-kit/humanloop';
import { readDecisions, readMeta, updateMeta, writeOutput } from '../daemon/ask-store.js';
import { askOutputPath, askProgressPath } from '../shared/paths.js';
import { setupTerminal, startKeypressListener, onResize, writeToStdout, type Key } from './terminal.js';
import { flushFrame } from './render.js';

interface RunSingleAskOpts {
  cwd: string;
  sessionId: string;
  askId: string;
}

/**
 * Standalone single-ask runner — opens a humanloop deck for one ask in the
 * current pane and exits when answered (locally or by the dashboard).
 *
 * Designed for the parallel ask-pane spawned by `sis ask`: the pane has
 * no inbox, no tree, just the deck. Both this pane and the dashboard write
 * through the same on-disk ask-store paths, so whichever surface answers
 * first wins; the loser detects the resolution via response.json and exits.
 */
export async function runSingleAsk(opts: RunSingleAskOpts): Promise<void> {
  const { cwd, sessionId, askId } = opts;

  const meta = readMeta(cwd, sessionId, askId);
  if (!meta || meta.status === 'answered') {
    return;
  }

  const deck = readDecisions(cwd, sessionId, askId);
  if (!deck) return;

  const cleanupTerminal = setupTerminal();

  let exiting = false;
  let panel: MountedPanel | null = null;
  let prevFrame: string[] = [];
  let stopKeypress: (() => void) | null = null;
  let stopResize: (() => void) | null = null;
  const outputPath = askOutputPath(cwd, sessionId, askId);

  const exit = (code: number): void => {
    if (exiting) return;
    exiting = true;
    try { stopKeypress?.(); } catch { /* best-effort */ }
    try { stopResize?.(); } catch { /* best-effort */ }
    try { panel?.unmount(); } catch { /* best-effort */ }
    try { unwatchFile(outputPath, onExternalChange); } catch { /* best-effort */ }
    cleanupTerminal();
    process.exit(code);
  };

  const flushHost = (lines: string[]): void => {
    const out = flushFrame(lines, prevFrame, '\x1b[?25l');
    writeToStdout(out);
    prevFrame = lines;
  };

  const onExternalChange = (): void => {
    if (exiting) return;
    if (!existsSync(outputPath)) return;
    exit(0);
  };

  let lastResponses: InteractionResponse[] = [];

  const submit = (responses: InteractionResponse[]): void => {
    if (exiting) return;
    void (async () => {
      const completedAt = new Date().toISOString();
      writeOutput(cwd, sessionId, askId, responses, completedAt);
      try {
        await updateMeta(cwd, sessionId, askId, { status: 'answered', completedAt });
      } catch {
        // Race: dashboard updated meta concurrently. response.json is written; the
        // blocked `sis ask` will still pick up the result.
      }
      exit(0);
    })();
  };

  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;

  panel = mountPanel({
    deck: deck as Deck,
    cols,
    rows,
    progressPath: askProgressPath(cwd, sessionId, askId),
    onProgress: (responses: InteractionResponse[]) => {
      lastResponses = responses;
      const cur = readMeta(cwd, sessionId, askId);
      if (cur?.status === 'pending') {
        void updateMeta(cwd, sessionId, askId, { status: 'in-progress', startedAt: new Date().toISOString() }).catch(() => { /* best-effort */ });
      }
      if (panel) flushHost(panel.render());
    },
    onComplete: (responses: InteractionResponse[]) => {
      submit(responses);
    },
    // Final-phase Enter on an incomplete deck — submit what we have.
    onExit: () => {
      submit(lastResponses);
    },
  });

  stopKeypress = startKeypressListener((input: string, key: Key) => {
    if (exiting || !panel) return;
    panel.handleKey(input, key);
    flushHost(panel.render());
  });

  stopResize = onResize(() => {
    if (exiting || !panel) return;
    const newCols = process.stdout.columns ?? 80;
    const newRows = process.stdout.rows ?? 24;
    panel.handleResize(newCols, newRows);
    prevFrame = [];
    flushHost(panel.render());
  });

  watchFile(outputPath, { interval: 250 }, onExternalChange);

  // Race guard: dashboard may have answered between our initial readMeta and
  // mount completion. If response.json is already on disk, exit immediately.
  if (existsSync(outputPath)) {
    exit(0);
    return;
  }

  flushHost(panel.render());

  // Keep the process alive — the panel + listeners hold the event loop open
  // via stdin (raw mode) and the watchFile poller. Returning from this async
  // function would let `await runSingleAsk(...)` resolve in index.ts but the
  // listeners keep node running until exit() fires.
  await new Promise<void>(() => { /* never resolves; exit() handles teardown */ });
}

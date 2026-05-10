import { setupTerminal } from './terminal.js';
import { createAppState } from './state.js';
import { startApp } from './app.js';
import { registerDashboardWindow } from './lib/tmux.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const cwd = getArg('cwd') ?? process.cwd();

const askId = getArg('ask');
const sessionId = getArg('session-id');
if (askId && sessionId) {
  // Single-ask mode — used by the parallel ask-pane spawned from `sis ask`.
  // Skips the dashboard inbox and renders only the deck for this one ask.
  // Must NOT call registerDashboardWindow() — would clobber the real dashboard.
  const { runSingleAsk } = await import('./single-ask.js');
  await runSingleAsk({ cwd, sessionId, askId });
  process.exit(0);
}

registerDashboardWindow(cwd);
const cleanup = setupTerminal();
const state = createAppState(cwd);
startApp(state, cleanup);

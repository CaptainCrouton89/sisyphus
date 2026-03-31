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
registerDashboardWindow();
const cleanup = setupTerminal();
const state = createAppState(cwd);
startApp(state, cleanup);

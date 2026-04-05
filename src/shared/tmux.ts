import { randomBytes } from 'node:crypto';
import { shellQuote } from './shell.js';
import { exec } from './exec.js';

export interface TmuxWindow {
  windowId: string;
  channel: string;
}

/**
 * Open a new tmux window that runs `command`, then signals a channel on exit.
 * The caller decides whether to block by calling `waitForTmuxWindow`.
 */
export function openTmuxWindow(windowName: string, command: string): TmuxWindow {
  const channel = `sisyphus-${randomBytes(4).toString('hex')}`;
  const fullCmd = `${command}; tmux wait-for -S ${shellQuote(channel)}; exit`;

  const windowId = exec(`tmux new-window -n ${shellQuote(windowName)} -P -F "#{window_id}"`);
  exec(`tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(fullCmd)} Enter`);

  return { windowId, channel };
}

/**
 * Block until a tmux window signals its channel (user closes the window).
 * No timeout — the user controls when they're done.
 */
export function waitForTmuxWindow(channel: string): void {
  exec(`tmux wait-for ${shellQuote(channel)}`, undefined, 0);
}

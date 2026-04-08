import { randomBytes } from 'node:crypto';
import { shellQuote } from './shell.js';
import { exec } from './exec.js';

export interface TmuxPane {
  paneId: string;
  channel: string;
}

/**
 * Open a new tmux pane to the right of the current pane that runs `command`,
 * then signals a channel on exit. The caller decides whether to block by
 * calling `waitForTmuxPane`.
 */
export function openTmuxPane(command: string): TmuxPane {
  const channel = `sisyphus-${randomBytes(4).toString('hex')}`;
  const fullCmd = `${command}; tmux wait-for -S ${shellQuote(channel)}`;

  const paneId = exec(
    `tmux split-window -h -l 50% -P -F "#{pane_id}" ${shellQuote(fullCmd)}`,
  );

  return { paneId, channel };
}

/**
 * Block until a tmux pane signals its channel (process exits / user closes).
 * No timeout — the user controls when they're done.
 */
export function waitForTmuxPane(channel: string): void {
  exec(`tmux wait-for ${shellQuote(channel)}`, undefined, 0);
}

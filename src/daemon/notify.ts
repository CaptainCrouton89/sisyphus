import { execFile } from 'node:child_process';

export function sendTerminalNotification(title: string, message: string): void {
  execFile('osascript', [
    '-e',
    `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`,
  ], (err) => {
    if (err) {
      console.error('[sisyphus] Failed to send notification:', err.message);
    }
  });
}

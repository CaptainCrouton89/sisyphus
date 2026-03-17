import { useInput } from 'ink';
import type { InputMode } from '../components/InputBar.js';

export type LeaderAction =
  | { type: 'enter-copy-menu' }
  | { type: 'copy-path' }
  | { type: 'copy-context' }
  | { type: 'copy-logs' }
  | { type: 'copy-session-id' }
  | { type: 'delete-session' }
  | { type: 'open-logs' }
  | { type: 'open-session-dir' }
  | { type: 'search' }
  | { type: 'jump-to-session'; index: number }
  | { type: 'spawn-agent' }
  | { type: 'message-agent' }
  | { type: 'help' }
  | { type: 'shell-command' }
  | { type: 'jump-to-pane' }
  | { type: 'kill' }
  | { type: 'quit' }
  | { type: 'dismiss' };

export function useLeaderKey(mode: InputMode, onAction: (action: LeaderAction) => void): void {
  useInput(
    (input, key) => {
      if (key.escape) { onAction({ type: 'dismiss' }); return; }
      if (input === 'y') { onAction({ type: 'enter-copy-menu' }); return; }
      if (input === 'd') { onAction({ type: 'delete-session' }); return; }
      if (input === 'l') { onAction({ type: 'open-logs' }); return; }
      if (input === 'o') { onAction({ type: 'open-session-dir' }); return; }
      if (input === '/') { onAction({ type: 'search' }); return; }
      if (input === 'a') { onAction({ type: 'spawn-agent' }); return; }
      if (input === 'm') { onAction({ type: 'message-agent' }); return; }
      if (input === '?') { onAction({ type: 'help' }); return; }
      if (input === '!') { onAction({ type: 'shell-command' }); return; }
      if (input === 'j') { onAction({ type: 'jump-to-pane' }); return; }
      if (input === 'k') { onAction({ type: 'kill' }); return; }
      if (input === 'q') { onAction({ type: 'quit' }); return; }
      const digit = parseInt(input, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        onAction({ type: 'jump-to-session', index: digit });
        return;
      }
      onAction({ type: 'dismiss' });
    },
    { isActive: mode === 'leader' },
  );

  useInput(
    (input, key) => {
      if (key.escape) { onAction({ type: 'dismiss' }); return; }
      if (input === 'p') { onAction({ type: 'copy-path' }); return; }
      if (input === 'C') { onAction({ type: 'copy-context' }); return; }
      if (input === 'l') { onAction({ type: 'copy-logs' }); return; }
      if (input === 's') { onAction({ type: 'copy-session-id' }); return; }
      onAction({ type: 'dismiss' });
    },
    { isActive: mode === 'copy-menu' },
  );

  useInput(
    (input, key) => {
      if (key.escape || input === '?') { onAction({ type: 'dismiss' }); return; }
    },
    { isActive: mode === 'help' },
  );
}

import { execSync } from 'node:child_process';

export function assertTmux(): void {
  if (!process.env.TMUX) {
    throw new Error('Not running inside a tmux pane. Sisyphus requires tmux.');
  }
}

export function getTmuxSession(): string {
  assertTmux();
  return execSync('tmux display-message -p "#{session_name}"', { encoding: 'utf8' }).trim();
}

export function getTmuxWindow(): string {
  assertTmux();
  return execSync('tmux display-message -p "#{window_id}"', { encoding: 'utf8' }).trim();
}

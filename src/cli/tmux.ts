import { execSync } from 'node:child_process';
import { shellQuote } from '../shared/shell.js';

export function isTmuxInstalled(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function assertTmux(): void {
  if (!process.env.TMUX) {
    throw new Error('Not running inside a tmux pane. Sisyphus requires tmux.');
  }
}

export function getTmuxSession(): string {
  assertTmux();
  return execSync('tmux display-message -p "#{session_name}"', { encoding: 'utf8' }).trim();
}

/**
 * Current tmux session's $N id and name. Always prefer the id for `-t` targeting
 * — tmux -t <name> silently substring-matches other sessions under sparse env.
 */
export function getTmuxSessionInfo(): { id: string; name: string } {
  assertTmux();
  const out = execSync('tmux display-message -p "#{session_id}|#{session_name}"', { encoding: 'utf8' }).trim();
  const pipeIdx = out.indexOf('|');
  return { id: out.slice(0, pipeIdx), name: out.slice(pipeIdx + 1) };
}

/**
 * Read @sisyphus_cwd from the current tmux session, or '' if unset.
 * Returns '' (not throws) on any failure so callers can treat "no tag" and
 * "tmux unhappy" the same way.
 */
export function getCurrentTmuxSessionHome(sessionId: string): string {
  try {
    return execSync(
      `tmux show-options -t ${shellQuote(sessionId)} -v @sisyphus_cwd`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    return '';
  }
}


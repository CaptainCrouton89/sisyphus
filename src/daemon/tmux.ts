import { execSync } from 'node:child_process';

const EXEC_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? '/usr/bin:/bin'}`,
};

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV }).trim();
}

function execSafe(cmd: string): string | null {
  try {
    return exec(cmd);
  } catch {
    return null;
  }
}

export function getCurrentTmuxSession(): string {
  const tmuxEnv = process.env['TMUX'];
  if (!tmuxEnv) throw new Error('Not running inside tmux');
  return exec('tmux display-message -p "#{session_name}"');
}

export function createWindow(sessionName: string, windowName: string): string {
  exec(`tmux new-window -t "${sessionName}" -n "${windowName}" -P -F "#{window_id}"`);
  return exec(`tmux display-message -t "${sessionName}:${windowName}" -p "#{window_id}"`);
}

export function createPane(windowTarget: string): string {
  return exec(`tmux split-window -h -t "${windowTarget}" -P -F "#{pane_id}"`);
}

export function sendKeys(paneTarget: string, command: string): void {
  exec(`tmux send-keys -t "${paneTarget}" ${shellQuote(command)} Enter`);
}

export function killPane(paneTarget: string): void {
  execSafe(`tmux kill-pane -t "${paneTarget}"`);
}

export function killWindow(windowTarget: string): void {
  execSafe(`tmux kill-window -t "${windowTarget}"`);
}

export interface PaneInfo {
  paneId: string;
  panePid: string;
}

export function listPanes(windowTarget: string): PaneInfo[] {
  const output = execSafe(`tmux list-panes -t "${windowTarget}" -F "#{pane_id} #{pane_pid}"`);
  if (!output) return [];
  return output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [paneId, panePid] = line.split(' ');
      return { paneId: paneId!, panePid: panePid! };
    });
}

export function setPaneTitle(paneTarget: string, title: string): void {
  execSafe(`tmux select-pane -t "${paneTarget}" -T ${shellQuote(title)}`);
}

export function setPaneStyle(paneTarget: string, color: string): void {
  execSafe(`tmux select-pane -t "${paneTarget}" -P "border-style=fg=${color}"`);
}

export function sendSignal(paneTarget: string, signal: string): void {
  const info = execSafe(`tmux list-panes -t "${paneTarget}" -F "#{pane_pid}"`);
  if (!info) return;
  const pid = info.split('\n')[0]?.trim();
  if (pid) {
    execSafe(`kill -${signal} ${pid}`);
  }
}

export function selectLayout(windowTarget: string, layout: string = 'even-horizontal'): void {
  execSafe(`tmux select-layout -t "${windowTarget}" ${layout}`);
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

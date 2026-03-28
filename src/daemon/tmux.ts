import { shellQuote } from '../shared/shell.js';
import { exec, execSafe } from '../shared/exec.js';
export { EXEC_ENV } from '../shared/exec.js';

export function createPane(windowTarget: string, cwd?: string, position: 'left' | 'right' = 'right'): string {
  const cwdFlag = cwd ? ` -c ${shellQuote(cwd)}` : '';
  // Target the first/last pane in the window to ensure absolute left/right placement
  const panes = listPanes(windowTarget);
  const target = position === 'left' ? panes[0]?.paneId : panes[panes.length - 1]?.paneId;
  const targetFlag = target ? ` -t "${target}"` : ` -t "${windowTarget}"`;
  const beforeFlag = position === 'left' ? 'b' : '';
  const paneId = exec(`tmux split-window -h${beforeFlag}${targetFlag}${cwdFlag} -P -F "#{pane_id}"`);
  execSafe(`tmux select-layout -t "${windowTarget}" even-horizontal`);
  return paneId;
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

export function createSession(sessionName: string, windowName: string, cwd: string): { windowId: string; initialPaneId: string } {
  exec(`tmux new-session -d -s "${sessionName}" -n "${windowName}" -c ${shellQuote(cwd)}`);
  const windowId = exec(`tmux display-message -t "${sessionName}:${windowName}" -p "#{window_id}"`);
  const initialPaneId = exec(`tmux display-message -t "${sessionName}:${windowName}" -p "#{pane_id}"`);
  configureSessionDefaults(sessionName, windowId);
  return { windowId, initialPaneId };
}

export function paneExists(paneTarget: string): boolean {
  return execSafe(`tmux display-message -t "${paneTarget}" -p "#{pane_id}"`) !== null;
}

export function sessionExists(sessionName: string): boolean {
  return execSafe(`tmux has-session -t "${sessionName}"`) !== null;
}

export function killSession(sessionName: string): void {
  execSafe(`tmux kill-session -t "${sessionName}"`);
}

export function renameSession(oldName: string, newName: string): void {
  exec(`tmux rename-session -t "${oldName}" "${newName}"`);
}

export function setSessionOption(sessionName: string, option: string, value: string): void {
  execSafe(`tmux set-option -t "${sessionName}" ${option} ${shellQuote(value)}`);
}

export function findHomeSession(cwd: string): string | null {
  const output = execSafe('tmux list-sessions -F "#{session_name}"');
  if (!output) return null;
  const normalizedCwd = cwd.replace(/\/+$/, '');
  for (const name of output.split('\n').filter(Boolean)) {
    if (name.startsWith('sisyphus-')) continue;
    const val = execSafe(`tmux show-options -t "${name}" -v @sisyphus_cwd`);
    if (val?.trim() === normalizedCwd) return name;
  }
  return null;
}

export function switchAttachedClients(sessionName: string, targetSession: string): void {
  if (!sessionExists(targetSession)) return;
  const output = execSafe(`tmux list-clients -t "${sessionName}" -F "#{client_tty}"`);
  if (!output) return;
  for (const tty of output.split('\n').filter(Boolean)) {
    execSafe(`tmux switch-client -c "${tty}" -t "${targetSession}"`);
  }
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
  const gitBranch = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null)`;
  const branchSuffix = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null | grep -q . && echo ' |') ${gitBranch}`;
  const homePath = `#(echo '#{pane_current_path}' | sed "s|^$HOME|~|")`;
  const fmt = `#[fg=${color},bold] #{pane_title} #[fg=${color}]${homePath}${branchSuffix} #[default]`;
  execSafe(`tmux set -p -t "${paneTarget}" pane-border-format ${shellQuote(fmt)}`);
  // Store color as a per-pane user variable. The window-level border styles use a
  // format string that resolves #{@pane_color} per-pane at render time, giving each
  // pane its own border color (pane-border-style itself is window-level / last-write-wins).
  execSafe(`tmux set -p -t "${paneTarget}" @pane_color "${color}"`);
  execSafe(`tmux set -w -t "${paneTarget}" pane-border-style "fg=#{?#{@pane_color},#{@pane_color},default}"`);
  execSafe(`tmux set -w -t "${paneTarget}" pane-active-border-style "fg=#{?#{@pane_color},#{@pane_color},default}"`);
}

export function selectLayout(windowTarget: string, layout: string = 'even-horizontal'): void {
  execSafe(`tmux select-layout -t "${windowTarget}" ${layout}`);
}

/**
 * Sets window/session-level tmux options that Sisyphus depends on.
 * Without these, pane labels won't show and titles may get clobbered.
 */
function configureSessionDefaults(sessionName: string, windowId: string): void {
  // Pane border labels at top of each pane
  execSafe(`tmux set -w -t "${windowId}" pane-border-status top`);
  // Prevent tmux from overwriting pane/window titles we set
  execSafe(`tmux set -w -t "${windowId}" allow-rename off`);
  execSafe(`tmux set -w -t "${windowId}" automatic-rename off`);
  // Re-tile when a pane dies so remaining panes fill the space
  execSafe(`tmux set-hook -t "${sessionName}" after-kill-pane "select-layout even-horizontal"`);
  execSafe(`tmux set-hook -t "${sessionName}" pane-exited "select-layout even-horizontal"`);
}


import { shellQuote } from '../shared/shell.js';
import { exec, execSafe } from '../shared/exec.js';
export { EXEC_ENV } from '../shared/exec.js';

// Escape tmux -t targets for shell. Session IDs like $34 contain $ which
// gets expanded by /bin/sh when passed through execSync. shellQuote wraps
// in single quotes, preventing all expansion.
const t = (target: string): string => shellQuote(target);

export function createPane(windowTarget: string, cwd?: string, position: 'left' | 'right' = 'right'): string {
  const cwdFlag = cwd ? ` -c ${shellQuote(cwd)}` : '';
  // Target the first/last pane in the window to ensure absolute left/right placement
  const panes = listPanes(windowTarget);
  const target = position === 'left' ? panes[0]?.paneId : panes[panes.length - 1]?.paneId;
  const targetFlag = target ? ` -t ${t(target)}` : ` -t ${t(windowTarget)}`;
  const beforeFlag = position === 'left' ? 'b' : '';
  const paneId = exec(`tmux split-window -h${beforeFlag}${targetFlag}${cwdFlag} -P -F "#{pane_id}"`);
  execSafe(`tmux select-layout -t ${t(windowTarget)} even-horizontal`);
  return paneId;
}

export function sendKeys(paneTarget: string, command: string): void {
  exec(`tmux send-keys -t ${t(paneTarget)} ${shellQuote(command)} Enter`);
}

export function killPane(paneTarget: string): void {
  execSafe(`tmux kill-pane -t ${t(paneTarget)}`);
}

export function killWindow(windowTarget: string): void {
  execSafe(`tmux kill-window -t ${t(windowTarget)}`);
}

export function createSession(sessionName: string, cwd: string): { windowId: string; initialPaneId: string; sessionId: string } {
  const sessionId = exec(`tmux new-session -d -s ${t(sessionName)} -n main -c ${shellQuote(cwd)} -P -F "#{session_id}"`);
  const windowId = exec(`tmux display-message -t ${t(sessionId + ':main')} -p "#{window_id}"`);
  const initialPaneId = exec(`tmux display-message -t ${t(sessionId + ':main')} -p "#{pane_id}"`);
  configureSessionDefaults(sessionId, windowId);
  return { windowId, initialPaneId, sessionId };
}

export function paneExists(paneTarget: string): boolean {
  return execSafe(`tmux display-message -t ${t(paneTarget)} -p "#{pane_id}"`) !== null;
}

/**
 * Check if a tmux session exists by its $N ID. Safe for all operations —
 * $N IDs use exact integer matching (no prefix-match risk).
 */
export function sessionExistsById(tmuxSessionId: string): boolean {
  return execSafe(`tmux has-session -t ${t(tmuxSessionId)}`) !== null;
}

/**
 * Check if a session name is already taken. Uses exact name matching.
 * Only needed for collision detection at creation/rename — prefer
 * sessionExistsById() for all other existence checks.
 */
export function sessionNameTaken(sessionName: string): boolean {
  const output = execSafe('tmux list-sessions -F "#{session_name}"');
  if (!output) return false;
  return output.split('\n').some(line => line === sessionName);
}

/**
 * Re-capture a tmux $N session ID from a known session name.
 * Used for recovery after tmux server restart when stored $N is stale.
 */
export function resolveSessionId(sessionName: string): string | null {
  // Use list-sessions with exact match filter rather than display-message,
  // which may fail without an attached client in daemon context.
  const output = execSafe('tmux list-sessions -F "#{session_id} #{session_name}"');
  if (!output) return null;
  for (const line of output.split('\n').filter(Boolean)) {
    const { sessionId, name } = parseSessionLine(line);
    if (name === sessionName) return sessionId;
  }
  return null;
}

/**
 * Check if a tmux session is alive, preferring $N ID when available.
 * Encapsulates the $N-vs-name dispatch so callers don't need to know about tmux ID formats.
 */
export function isSessionAlive(tmuxSessionId: string | undefined, tmuxSessionName: string | undefined): boolean {
  if (tmuxSessionId) return sessionExistsById(tmuxSessionId);
  if (tmuxSessionName) return sessionNameTaken(tmuxSessionName);
  return false;
}

/**
 * Set standard sisyphus metadata on a newly created tmux session.
 */
export function initSessionMeta(tmuxTarget: string, cwd: string, sisyphusSessionId: string): void {
  setSessionOption(tmuxTarget, '@sisyphus_cwd', cwd.replace(/\/+$/, ''));
  setSessionOption(tmuxTarget, '@sisyphus_session_id', sisyphusSessionId);
}

export function killSession(target: string): void {
  execSafe(`tmux kill-session -t ${t(target)}`);
}

export function renameSession(target: string, newName: string): void {
  exec(`tmux rename-session -t ${t(target)} ${t(newName)}`);
}

export function setSessionOption(target: string, option: string, value: string): void {
  execSafe(`tmux set-option -t ${t(target)} ${option} ${shellQuote(value)}`);
}

export function unsetSessionOption(target: string, option: string): void {
  execSafe(`tmux set-option -u -t ${t(target)} ${option}`);
}

function parseSessionLine(line: string): { sessionId: string; name: string } {
  const spaceIdx = line.indexOf(' ');
  return { sessionId: line.slice(0, spaceIdx), name: line.slice(spaceIdx + 1) };
}

export function findHomeSession(cwd: string): string | null {
  const output = execSafe('tmux list-sessions -F "#{session_id} #{session_name}"');
  if (!output) return null;
  const normalizedCwd = cwd.replace(/\/+$/, '');
  for (const line of output.split('\n').filter(Boolean)) {
    const { sessionId: sessId, name } = parseSessionLine(line);
    if (name.startsWith('ssyph_')) continue;
    const val = execSafe(`tmux show-options -t ${t(sessId)} -v @sisyphus_cwd`);
    if (val?.trim() === normalizedCwd) return sessId;
  }
  return null;
}

export function switchAttachedClients(sourceTarget: string, destTarget: string): void {
  if (execSafe(`tmux has-session -t ${t(destTarget)}`) === null) return;
  const output = execSafe(`tmux list-clients -t ${t(sourceTarget)} -F "#{client_tty}"`);
  if (!output) return;
  for (const tty of output.split('\n').filter(Boolean)) {
    execSafe(`tmux switch-client -c ${t(tty)} -t ${t(destTarget)}`);
  }
}


export interface PaneInfo {
  paneId: string;
  panePid: string;
}

export function getFirstWindowId(sessionTarget: string): string | null {
  return execSafe(`tmux list-windows -t ${t(sessionTarget)} -F "#{window_id}" -f "#{==:#{window_index},0}"`)?.trim() || null;
}

export function listPanes(windowTarget: string): PaneInfo[] {
  const output = execSafe(`tmux list-panes -t ${t(windowTarget)} -F "#{pane_id} #{pane_pid}"`);
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
  execSafe(`tmux select-pane -t ${t(paneTarget)} -T ${shellQuote(title)}`);
}

export interface PaneMeta {
  role: string;      // "orch" or agent paneLabel (e.g. "impl", "review-plan")
  session: string;   // session name or truncated UUID
  cycle: string;     // e.g. "c3"
  mode?: string;     // orchestrator mode (e.g. "strategy", "implementation")
}

export function setPaneStyle(paneTarget: string, color: string, meta: PaneMeta): void {
  const gitBranch = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null)`;
  const branchSuffix = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null | grep -q . && echo ' |') ${gitBranch}`;
  const homePath = `#(echo '#{pane_current_path}' | sed "s|^$HOME|~|")`;

  // Store structured metadata as per-pane user variables so the format string
  // resolves them independently per pane (one format, per-pane values).
  execSafe(`tmux set -p -t ${t(paneTarget)} @pane_role ${shellQuote(meta.role)}`);
  execSafe(`tmux set -p -t ${t(paneTarget)} @pane_session ${shellQuote(meta.session)}`);
  execSafe(`tmux set -p -t ${t(paneTarget)} @pane_cycle ${shellQuote(meta.cycle)}`);
  if (meta.mode) {
    execSafe(`tmux set -p -t ${t(paneTarget)} @pane_mode ${shellQuote(meta.mode)}`);
  }

  // Visual hierarchy: role badge (bg color) > session name (fg color) > mode (italic) > cycle + path (dim)
  // Mode only renders for orchestrator panes (where @pane_mode is set).
  const modeSegment = `#{?#{@pane_mode}, #[fg=${color}\\,italics]#{@pane_mode}#[default],}`;
  const fmt = [
    `#[bg=${color},fg=black,bold] #{@pane_role} #[default]`,
    ` #[fg=${color},bold]#{@pane_session}`,
    modeSegment,
    ` #[default,dim]#{@pane_cycle}`,
    `  ${homePath}${branchSuffix}`,
    `#[default]`,
  ].join('');

  execSafe(`tmux set -p -t ${t(paneTarget)} pane-border-format ${shellQuote(fmt)}`);
  // Store color as a per-pane user variable. The window-level border styles use a
  // format string that resolves #{@pane_color} per-pane at render time, giving each
  // pane its own border color (pane-border-style itself is window-level / last-write-wins).
  execSafe(`tmux set -p -t ${t(paneTarget)} @pane_color "${color}"`);
  execSafe(`tmux set -w -t ${t(paneTarget)} pane-border-style "fg=#{?#{@pane_color},#{@pane_color},default}"`);
  execSafe(`tmux set -w -t ${t(paneTarget)} pane-active-border-style "fg=#{?#{@pane_color},#{@pane_color},default}"`);
}

/**
 * Update pane metadata variables without rebuilding the full style.
 * Used by auto-naming to update session name across all live panes.
 */
export function updatePaneMeta(paneTarget: string, updates: Partial<PaneMeta>): void {
  if (updates.role !== undefined) execSafe(`tmux set -p -t ${t(paneTarget)} @pane_role ${shellQuote(updates.role)}`);
  if (updates.session !== undefined) execSafe(`tmux set -p -t ${t(paneTarget)} @pane_session ${shellQuote(updates.session)}`);
  if (updates.cycle !== undefined) execSafe(`tmux set -p -t ${t(paneTarget)} @pane_cycle ${shellQuote(updates.cycle)}`);
  if (updates.mode !== undefined) execSafe(`tmux set -p -t ${t(paneTarget)} @pane_mode ${shellQuote(updates.mode)}`);
}

export function selectLayout(windowTarget: string, layout: string = 'even-horizontal'): void {
  execSafe(`tmux select-layout -t ${t(windowTarget)} ${layout}`);
}

export function setWindowOption(windowTarget: string, option: string, value: string): void {
  execSafe(`tmux set-option -w -t ${t(windowTarget)} ${option} ${shellQuote(value)}`);
}

export function getSessionOption(target: string, option: string): string | null {
  return execSafe(`tmux show-options -t ${t(target)} -v ${option}`);
}

export function getGlobalOption(option: string): string | null {
  try {
    return execSafe(`tmux show-option -gv ${option}`)?.trim() || null;
  } catch {
    return null;
  }
}

export function setGlobalOption(option: string, value: string): void {
  execSafe(`tmux set-option -g ${option} ${shellQuote(value)}`);
}

export function listAllSessions(): Array<{ name: string; sessionId: string }> {
  const output = execSafe('tmux list-sessions -F "#{session_id} #{session_name}"');
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(parseSessionLine);
}

export function listAllPanes(): Array<{ sessionName: string; paneId: string }> {
  const output = execSafe('tmux list-panes -a -F "#{session_name} #{pane_id}"');
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const spaceIdx = line.indexOf(' ');
    return { sessionName: line.slice(0, spaceIdx), paneId: line.slice(spaceIdx + 1) };
  });
}

/**
 * Sets window/session-level tmux options that Sisyphus depends on.
 * Without these, pane labels won't show and titles may get clobbered.
 */
function configureSessionDefaults(sessionName: string, windowId: string): void {
  // Pane border labels at top of each pane
  execSafe(`tmux set -w -t ${t(windowId)} pane-border-status top`);
  // Prevent tmux from overwriting pane/window titles we set
  execSafe(`tmux set -w -t ${t(windowId)} allow-rename off`);
  execSafe(`tmux set -w -t ${t(windowId)} automatic-rename off`);
  // Re-tile when a pane dies so remaining panes fill the space
  execSafe(`tmux set-hook -t ${t(sessionName)} after-kill-pane "select-layout even-horizontal"`);
  execSafe(`tmux set-hook -t ${t(sessionName)} pane-exited "select-layout even-horizontal"`);
}


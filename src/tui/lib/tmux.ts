import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { globalDir, tmuxSessionName } from '../../shared/paths.js';
import { augmentedPath } from '../../shared/env.js';
import { shellQuote } from '../../shared/shell.js';
import { exec, execSafe, EXEC_ENV } from '../../shared/exec.js';


export function getWindowId(): string {
  const pane = process.env['TMUX_PANE'];
  if (pane) {
    return exec(`tmux display-message -t ${shellQuote(pane)} -p "#{window_id}"`);
  }
  return exec('tmux display-message -p "#{window_id}"');
}

export function selectWindow(windowId: string): void {
  execSafe(`tmux select-window -t ${shellQuote(windowId)}`);
}

export function selectPane(paneId: string): void {
  execSafe(`tmux select-pane -t ${shellQuote(paneId)}`);
}

export function windowExists(windowId: string): boolean {
  return execSafe(`tmux display-message -t ${shellQuote(windowId)} -p "#{window_id}"`) !== null;
}

export function listAllWindowIds(): Set<string> {
  try {
    const output = execSync('tmux list-windows -a -F "#{window_id}"', { encoding: 'utf-8', env: EXEC_ENV });
    return new Set(output.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Register this TUI window as the dashboard for the current tmux session.
 * Called on TUI startup so M-S (sisyphus-home) can find the dashboard window.
 */
export function registerDashboardWindow(): void {
  const wid = getWindowId();
  const pane = process.env['TMUX_PANE'];
  if (pane) {
    const session = execSafe(`tmux display-message -t ${shellQuote(pane)} -p "#{session_id}"`);
    if (session) {
      execSafe(`tmux set-option -t ${shellQuote(session)} @sisyphus_dashboard ${wid}`);
      return;
    }
  }
  execSafe(`tmux set-option @sisyphus_dashboard ${wid}`);
}

let companionPaneId: string | null = null;

function setupCompanionPlugin(): string {
  const srcDir = join(import.meta.dirname, 'templates', 'companion-plugin');
  const destDir = join(globalDir(), 'companion-plugin');
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });
  return destDir;
}

export function paneExists(paneId: string): boolean {
  return execSafe(`tmux display-message -t ${shellQuote(paneId)} -p "#{pane_id}"`) !== null;
}

export function openCompanionPane(cwd: string): void {
  // If companion pane is alive, focus it
  if (companionPaneId && paneExists(companionPaneId)) {
    execSafe(`tmux select-pane -t ${shellQuote(companionPaneId)}`);
    return;
  }

  const pluginDir = setupCompanionPlugin();

  const templatePath = join(import.meta.dirname, 'templates', 'dashboard-claude.md');
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    template = `You are a Sisyphus dashboard companion. Help the user manage multi-agent sessions.\nProject: ${cwd}\nRun \`sisyphus list\` and \`sisyphus status\` to see current state.`;
  }

  const rendered = template.replace(/\{\{CWD\}\}/g, cwd);
  const promptPath = join(globalDir(), 'dashboard-companion-prompt.md');
  writeFileSync(promptPath, rendered, 'utf-8');

  const pathEnv = augmentedPath();

  const claudeCmd = `SISYPHUS_COMPANION_CWD=${shellQuote(cwd)} PATH=${shellQuote(pathEnv)} claude --dangerously-skip-permissions --plugin-dir ${shellQuote(pluginDir)} --append-system-prompt "$(cat ${shellQuote(promptPath)})"`;

  const result = exec(
    `tmux split-window -h -d -l 33% -P -F "#{pane_id}" -c ${shellQuote(cwd)} ${shellQuote(claudeCmd)}`,
  );
  companionPaneId = result.trim() || null;
}

const TERMINAL_EDITORS = new Set(['nvim', 'vim', 'vi', 'nano', 'emacs', 'micro', 'helix', 'hx', 'joe', 'ne', 'kak']);

export function switchToSession(sessionName: string): void {
  execSafe(`tmux switch-client -t ${shellQuote(sessionName)}`);
}

export function editInPopup(cwd: string, editor: string, opts?: { content?: string; size?: { w: string; h: string } }): string | null {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sisyphus-'));
  const filePath = join(tmpDir, 'input.md');
  try {
    writeFileSync(filePath, opts?.content ? opts.content : '', 'utf-8');
    openEditorPopup(cwd, editor, filePath, opts?.size);
    const result = readFileSync(filePath, 'utf-8').trim();
    return result || null;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Small centered tmux popup that prompts for a single line of input.
 * Returns the trimmed input or null if empty/cancelled (Ctrl-C / Escape).
 */
export function promptInPopup(prompt: string, opts?: { w?: string; h?: string }): string | null {
  const { w = '50%', h = '3' } = opts ?? {};
  const tmpDir = mkdtempSync(join(tmpdir(), 'sisyphus-'));
  const outFile = join(tmpDir, 'result');
  try {
    const script = `printf ${shellQuote(prompt + ' ')} && read -r line && printf '%s' "$line" > ${shellQuote(outFile)}`;
    execSync(
      `tmux display-popup -E -w ${w} -h ${h} ${shellQuote(`bash -c ${shellQuote(script)}`)}`,
      { stdio: 'inherit', env: EXEC_ENV },
    );
    if (!existsSync(outFile)) return null;
    const result = readFileSync(outFile, 'utf-8').trim();
    return result || null;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function openLogPopup(): void {
  execSync(
    `tmux display-popup -E -w 90% -h 80% ${shellQuote('tail -f ~/.sisyphus/daemon.log')}`,
    { stdio: 'inherit', env: EXEC_ENV },
  );
}

export function openShellPopup(cwd: string, command: string): void {
  execSync(
    `tmux display-popup -E -w 90% -h 80% -d ${shellQuote(cwd)} ${shellQuote(`sh -c '${command.replace(/'/g, "'\\''")}; echo; echo "Press enter to close"; read'`)}`,
    { stdio: 'inherit', env: EXEC_ENV },
  );
}

export function openInFileManager(path: string): void {
  execSync(`open ${shellQuote(path)}`, { stdio: 'inherit', env: EXEC_ENV });
}

export function openClaudeResumePopup(cwd: string, claudeSessionId: string, resumeEnv?: string, resumeArgs?: string): void {
  const pathEnv = augmentedPath();
  const envPrefix = resumeEnv ? `${resumeEnv} && ` : '';
  const args = resumeArgs
    ? `${resumeArgs} --resume ${shellQuote(claudeSessionId)}`
    : `--resume ${shellQuote(claudeSessionId)}`;
  const cmd = `${envPrefix}PATH=${shellQuote(pathEnv)} claude ${args}`;
  execSync(
    `tmux display-popup -E -w 90% -h 80% -d ${shellQuote(cwd)} ${shellQuote(cmd)}`,
    { stdio: 'inherit', env: EXEC_ENV },
  );
}

export function openClaudeResumeSession(cwd: string, sessionId: string, claudeSessionId: string, sessionLabel: string, resumeEnv?: string, resumeArgs?: string, cycleNum?: number, mode?: string): string {
  const sessionName = tmuxSessionName(cwd, sessionLabel);
  const cycleLabel = cycleNum != null ? `c${cycleNum}` : '';
  const paneTitle = cycleLabel ? `ssph:orch ${sessionLabel} ${cycleLabel}` : `ssph:orch ${sessionLabel}`;

  // Resolve name → $N id for subsequent -t ops. tmux -t <name> can
  // substring-match the wrong session under sparse env; $N is unambiguous.
  const existing = execSafe('tmux list-sessions -F "#{session_id}|#{session_name}"');
  const existingLine = existing?.split('\n').find(line => line.slice(line.indexOf('|') + 1) === sessionName);
  if (existingLine) {
    const existingSessId = existingLine.slice(0, existingLine.indexOf('|'));
    execSafe(`tmux set-option -t ${shellQuote(existingSessId)} @sisyphus_cwd ${shellQuote(cwd.replace(/\/+$/, ''))}`);
    execSafe(`tmux set-option -t ${shellQuote(existingSessId)} @sisyphus_session_id ${shellQuote(sessionId)}`);
    const firstPaneId = execSafe(`tmux list-panes -t ${shellQuote(existingSessId)} -F '#{pane_id}'`)?.split('\n')[0];
    if (firstPaneId) applyOrchestratorPaneStyle(firstPaneId, paneTitle, sessionLabel, cycleLabel, mode);
    return sessionName;
  }

  const pathEnv = augmentedPath();
  const envPrefix = resumeEnv ? `${resumeEnv} && ` : '';
  const args = resumeArgs
    ? `${resumeArgs} --resume ${shellQuote(claudeSessionId)}`
    : `--resume ${shellQuote(claudeSessionId)}`;
  const cmd = `${envPrefix}PATH=${shellQuote(pathEnv)} claude ${args}`;
  // -P -F captures the new session's $N id + first pane id for unambiguous targeting.
  const createOut = exec(`tmux new-session -d -s ${shellQuote(sessionName)} -n main -c ${shellQuote(cwd)} -P -F '#{session_id}|#{pane_id}' ${shellQuote(cmd)}`).trim();
  const pipeIdx = createOut.indexOf('|');
  const newSessId = createOut.slice(0, pipeIdx);
  const firstPaneId = createOut.slice(pipeIdx + 1);
  execSafe(`tmux set-option -t ${shellQuote(newSessId)} @sisyphus_cwd ${shellQuote(cwd.replace(/\/+$/, ''))}`);
  execSafe(`tmux set-option -t ${shellQuote(newSessId)} @sisyphus_session_id ${shellQuote(sessionId)}`);
  // Match session defaults from daemon tmux.ts configureSessionDefaults
  execSafe(`tmux set -w -t ${shellQuote(newSessId + ':')} pane-border-status top`);
  execSafe(`tmux set -w -t ${shellQuote(newSessId + ':')} allow-rename off`);
  execSafe(`tmux set -w -t ${shellQuote(newSessId + ':')} automatic-rename off`);
  if (firstPaneId) applyOrchestratorPaneStyle(firstPaneId, paneTitle, sessionLabel, cycleLabel, mode);
  return sessionName;
}

/**
 * Mirror daemon's setPaneStyle for an orchestrator pane — sets pane title,
 * per-pane metadata vars (@pane_role/session/cycle/mode), and pane-border-format
 * so the new tmux session shows the same badge as a live orchestrator pane.
 */
function applyOrchestratorPaneStyle(paneId: string, title: string, sessionLabel: string, cycleLabel: string, mode?: string): void {
  const color = 'yellow'; // matches daemon/colors.ts ORCHESTRATOR_COLOR
  execSafe(`tmux select-pane -t ${shellQuote(paneId)} -T ${shellQuote(title)}`);
  execSafe(`tmux set -p -t ${shellQuote(paneId)} @pane_role ${shellQuote('orch')}`);
  execSafe(`tmux set -p -t ${shellQuote(paneId)} @pane_session ${shellQuote(sessionLabel)}`);
  if (cycleLabel) execSafe(`tmux set -p -t ${shellQuote(paneId)} @pane_cycle ${shellQuote(cycleLabel)}`);
  if (mode) execSafe(`tmux set -p -t ${shellQuote(paneId)} @pane_mode ${shellQuote(mode)}`);
  const gitBranch = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null)`;
  const branchSuffix = `#(cd #{pane_current_path} && git branch --show-current 2>/dev/null | grep -q . && echo ' |') ${gitBranch}`;
  const homePath = `#(echo '#{pane_current_path}' | sed "s|^$HOME|~|")`;
  const modeSegment = `#{?#{@pane_mode}, #[fg=${color}\\,italics]#{@pane_mode}#[default],}`;
  const fmt = [
    `#[bg=${color},fg=black,bold] #{@pane_role} #[default]`,
    ` #[fg=${color},bold]#{@pane_session}`,
    modeSegment,
    ` #[default,dim]#{@pane_cycle}`,
    `  ${homePath}${branchSuffix}`,
    `#[default]`,
  ].join('');
  execSafe(`tmux set -p -t ${shellQuote(paneId)} pane-border-format ${shellQuote(fmt)}`);
}

export function openEditorPopup(cwd: string, editor: string, filePath: string, size?: { w: string; h: string }): void {
  const { w = '90%', h = '90%' } = size ?? {};
  const editorBin = editor.split(/\s+/)[0]!.split('/').pop()!;
  if (TERMINAL_EDITORS.has(editorBin)) {
    execSync(
      `tmux display-popup -E -w ${w} -h ${h} -d ${shellQuote(cwd)} ${shellQuote(`${editor} ${shellQuote(filePath)}`)}`,
      { stdio: 'inherit', env: EXEC_ENV },
    );
  } else {
    execSync(`${editor} ${shellQuote(filePath)}`, { stdio: 'inherit', cwd, env: EXEC_ENV });
  }
}

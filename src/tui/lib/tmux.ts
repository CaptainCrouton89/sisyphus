import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { globalDir } from '../../shared/paths.js';
import { buildCompanionContext } from './context.js';

const EXEC_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? '/usr/bin:/bin'}`,
};

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV }).trim();
}

function execSafe(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', env: EXEC_ENV, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function getWindowId(): string {
  return exec('tmux display-message -p "#{window_id}"');
}

export function selectWindow(windowId: string): void {
  execSafe(`tmux select-window -t "${windowId}"`);
}

export function selectPane(paneId: string): void {
  execSafe(`tmux select-pane -t "${paneId}"`);
}

export function windowExists(windowId: string): boolean {
  return execSafe(`tmux display-message -t "${windowId}" -p "#{window_id}"`) !== null;
}

export function openCompanionPopup(cwd: string): void {
  const templatePath = join(import.meta.dirname, 'templates', 'dashboard-claude.md');
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    template = `You are a Sisyphus dashboard companion. Help the user manage multi-agent sessions.\nProject: ${cwd}\nRun \`sisyphus list\` and \`sisyphus status\` to see current state.`;
  }

  const sessionsContext = buildCompanionContext(cwd);
  const rendered = template
    .replace(/\{\{CWD\}\}/g, cwd)
    .replace(/\{\{SESSIONS_CONTEXT\}\}/g, sessionsContext);
  const promptPath = join(globalDir(), 'dashboard-companion-prompt.md');
  writeFileSync(promptPath, rendered, 'utf-8');

  execSync(
    `tmux display-popup -E -w 80% -h 80% -d ${shellQuote(cwd)} ${shellQuote(`claude --dangerously-skip-permissions --system-prompt "$(cat ${shellQuote(promptPath)})"`)}`  ,
    { stdio: 'inherit', env: EXEC_ENV },
  );
}

const TERMINAL_EDITORS = new Set(['nvim', 'vim', 'vi', 'nano', 'emacs', 'micro', 'helix', 'hx', 'joe', 'ne', 'kak']);

export function switchToSession(sessionName: string): void {
  execSafe(`tmux switch-client -t "${sessionName}"`);
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

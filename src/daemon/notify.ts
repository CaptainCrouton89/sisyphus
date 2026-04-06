import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface NotificationOptions {
  title: string;
  message: string;
  /** tmux session name to switch to on click */
  tmuxSession?: string;
}

const TMUX_SOCKET = `/tmp/tmux-${process.getuid()}/default`;

const SWITCH_SCRIPT = [
  '#!/bin/bash',
  'SESSION="$1"',
  `TMUX_SOCKET="${TMUX_SOCKET}"`,
  'TMUX=/opt/homebrew/bin/tmux',
  '',
  '# Find any attached client (user is likely on a different session)',
  'CLIENT_TTY=$("$TMUX" -S "$TMUX_SOCKET" list-clients -F \'#{client_tty}\' 2>/dev/null | head -1)',
  '[ -z "$CLIENT_TTY" ] && exit 0',
  '',
  '# Switch that client to the target session',
  '"$TMUX" -S "$TMUX_SOCKET" switch-client -c "$CLIENT_TTY" -t "$SESSION" 2>/dev/null',
  '"$TMUX" -S "$TMUX_SOCKET" select-window -t "$SESSION" 2>/dev/null',
  '',
  '# Bring iTerm2 to front and select the tab with this client',
  'TTY_SHORT=$(echo "$CLIENT_TTY" | sed \'s|/dev/||\')',
  'osascript -e "',
  '  tell application \\"iTerm2\\"',
  '    activate',
  '    repeat with w in windows',
  '      tell w',
  '        repeat with t in tabs',
  '          tell t',
  '            repeat with s in sessions',
  '              tell s',
  '                if tty contains \\"$TTY_SHORT\\" then',
  '                  select t',
  '                  return',
  '                end if',
  '              end tell',
  '            end repeat',
  '          end tell',
  '        end repeat',
  '      end tell',
  '    end repeat',
  '  end tell',
  '" 2>/dev/null || osascript -e \'tell application "iTerm2" to activate\' 2>/dev/null',
  '',
].join('\n');

function ensureSwitchScript(): void {
  const dir = join(homedir(), '.sisyphus');
  const scriptPath = join(dir, 'notify-switch.sh');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(scriptPath, SWITCH_SCRIPT, { mode: 0o755 });
  } catch (err) {
    console.error('[sisyphus] Failed to write notification switch script:', err instanceof Error ? err.message : err);
  }
}

// Long-lived SisyphusNotify.app process — accepts JSON lines on stdin
let notifyProcess: ChildProcess | null = null;

function getNotifyBinary(): string {
  return join(homedir(), '.sisyphus', 'SisyphusNotify.app', 'Contents', 'MacOS', 'sisyphus-notify');
}

function ensureNotifyProcess(): ChildProcess | null {
  if (notifyProcess && !notifyProcess.killed && notifyProcess.stdin?.writable) {
    return notifyProcess;
  }

  const binary = getNotifyBinary();
  if (!existsSync(binary)) {
    return null;
  }

  notifyProcess = spawn(binary, [], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });

  notifyProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[sisyphus-notify] ${msg}`);
  });

  notifyProcess.on('close', () => {
    notifyProcess = null;
  });

  return notifyProcess;
}

export function sendTerminalNotification(opts: NotificationOptions): void;
export function sendTerminalNotification(title: string, message: string, tmuxSession?: string): void;
export function sendTerminalNotification(titleOrOpts: string | NotificationOptions, message?: string, tmuxSession?: string): void {
  let title: string;
  let msg: string;
  let tmuxSess: string | undefined;

  if (typeof titleOrOpts === 'object') {
    title = titleOrOpts.title;
    msg = titleOrOpts.message;
    tmuxSess = titleOrOpts.tmuxSession;
  } else {
    title = titleOrOpts;
    msg = message!;
    tmuxSess = tmuxSession;
  }

  // Ensure the switch script is in place
  if (tmuxSess) ensureSwitchScript();

  // Try native SisyphusNotify.app (supports click-to-switch)
  const proc = ensureNotifyProcess();
  if (proc?.stdin?.writable) {
    const payload: Record<string, string> = { title, message: msg };
    if (tmuxSess) payload.tmuxSession = tmuxSess;
    proc.stdin.write(JSON.stringify(payload) + '\n');
    return;
  }

  // Fallback: terminal-notifier (no click action)
  execFile('terminal-notifier', ['-title', title, '-message', msg], (err) => {
    if (err) {
      // Last resort: osascript
      execFile('osascript', [
        '-e',
        `display notification "${msg.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`,
      ], (osErr) => {
        if (osErr) console.error('[sisyphus] All notification methods failed:', osErr instanceof Error ? osErr.message : osErr);
      });
    }
  });
}

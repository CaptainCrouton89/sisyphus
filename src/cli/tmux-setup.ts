import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { globalDir } from '../shared/paths.js';

export const DEFAULT_CYCLE_KEY = 'M-s';
export const DEFAULT_PREFIX_KEY = 'C-s';
export const KEY_TABLE = 'sisyphus';

const SISYPHUS_CONF_MARKER = '# sisyphus-managed — do not edit';

function scriptPath(name: string): string {
  return join(globalDir(), 'bin', name);
}

export function cycleScriptPath(): string {
  return scriptPath('sisyphus-cycle');
}

export function homeScriptPath(): string {
  return scriptPath('sisyphus-home');
}

export function killPaneScriptPath(): string {
  return scriptPath('sisyphus-kill-pane');
}

export function newPromptScriptPath(): string {
  return scriptPath('sisyphus-new');
}

export function messageScriptPath(): string {
  return scriptPath('sisyphus-msg');
}

export function deleteSessionScriptPath(): string {
  return scriptPath('sisyphus-delete-session');
}

export function killSessionScriptPath(): string {
  return scriptPath('sisyphus-kill-session');
}

export function sisyphusTmuxConfPath(): string {
  return join(globalDir(), 'tmux.conf');
}

function userTmuxConfPath(): string | null {
  const dotfile = join(homedir(), '.tmux.conf');
  const xdg = join(homedir(), '.config', 'tmux', 'tmux.conf');
  if (existsSync(xdg)) return xdg;
  if (existsSync(dotfile)) return dotfile;
  return null;
}

// --- Manifest helper used by multiple scripts ---
const MANIFEST_LOOKUP = `
MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
[ ! -f "$MANIFEST" ] && exit 0
current=$(tmux display-message -p '#{session_name}')
# Find cwd for current session from manifest
cwd=""
while IFS=$'\\t' read -r type name scwd phase dwid; do
  [ "$name" = "$current" ] && { cwd="$scwd"; break; }
done < "$MANIFEST"
[ -z "$cwd" ] && exit 0`.trim();

const CYCLE_SCRIPT = `#!/bin/bash
${MANIFEST_LOOKUP}
# Collect all sessions (S and H) matching this cwd
sessions=()
while IFS=$'\\t' read -r type name scwd phase dwid; do
  [[ "$type" == "#"* ]] && continue
  [ "$scwd" = "$cwd" ] && sessions+=("$name")
done < "$MANIFEST"
(( \${#sessions[@]} <= 1 )) && exit 0
for (( i=0; i<\${#sessions[@]}; i++ )); do
  if [ "\${sessions[$i]}" = "$current" ]; then
    next=$(( (i + 1) % \${#sessions[@]} ))
    tmux switch-client -t "\${sessions[$next]}"
    exit 0
  fi
done
tmux switch-client -t "\${sessions[0]}"
`;

const HOME_SCRIPT_JUMP = `
go_home() {
  local name="$1" dwid="$2"
  tmux switch-client -t "$name"
  if [ -n "$dwid" ] && [ "$dwid" != "-" ]; then
    tmux select-window -t "\${name}:\${dwid}" 2>/dev/null || \\
      tmux select-window -t "\${name}:sisyphus-dashboard" 2>/dev/null
  fi
}`.trim();

const HOME_SCRIPT = `#!/bin/bash
# Jump to the dashboard window — prefer current session, then manifest lookup
${HOME_SCRIPT_JUMP}
current=$(tmux display-message -p '#{session_name}')
# If current session has a dashboard window, just select it (no session switch)
local_dwid=$(tmux show-options -t "$current" -v @sisyphus_dashboard 2>/dev/null)
if [ -n "$local_dwid" ]; then
  tmux select-window -t "\${current}:\${local_dwid}" 2>/dev/null && exit 0
fi
# Otherwise, find the right home session via manifest
MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
[ ! -f "$MANIFEST" ] && exit 0
cwd=""
while IFS=$'\\t' read -r type name scwd phase dwid; do
  [ "$name" = "$current" ] && { cwd="$scwd"; break; }
done < "$MANIFEST"
if [ -n "$cwd" ]; then
  while IFS=$'\\t' read -r type name scwd phase dwid; do
    if [ "$type" = "H" ] && [ "$scwd" = "$cwd" ]; then
      go_home "$name" "$dwid"
      exit 0
    fi
  done < "$MANIFEST"
fi
`;

const KILL_PANE_SCRIPT = `#!/bin/bash
# prefix-x override for sisyphus sessions.
# If this is the last pane, switch to the home session before killing.
session=$(tmux display-message -p '#{session_name}')
pane_count=$(tmux list-panes -t "$session" -F '#{pane_id}' | wc -l | tr -d ' ')

if [ "$pane_count" -le 1 ]; then
  MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
  if [ -f "$MANIFEST" ]; then
    cwd=""
    while IFS=$'\\t' read -r type name scwd phase dwid; do
      [ "$name" = "$session" ] && { cwd="$scwd"; break; }
    done < "$MANIFEST"
    if [ -n "$cwd" ]; then
      while IFS=$'\\t' read -r type name scwd phase dwid; do
        if [ "$type" = "H" ] && [ "$scwd" = "$cwd" ]; then
          tmux switch-client -t "$name"
          if [ -n "$dwid" ] && [ "$dwid" != "-" ]; then
            tmux select-window -t "\${name}:\${dwid}" 2>/dev/null || \\
              tmux select-window -t "\${name}:sisyphus-dashboard" 2>/dev/null
          fi
          tmux kill-session -t "$session"
          exit 0
        fi
      done < "$MANIFEST"
    fi
  fi
  tmux kill-pane
else
  tmux kill-pane
  tmux select-layout even-horizontal
fi
`;

const NEW_PROMPT_SCRIPT = `#!/bin/bash
# Open nvim to compose a new sisyphus task, then start a session
tmpfile=$(mktemp /tmp/sisyphus-new-XXXXXX.md)
trap 'rm -f "$tmpfile"' EXIT
nvim "$tmpfile"
grep -q '[^[:space:]]' "$tmpfile" || exit 0
exec sisyphus start "$(cat "$tmpfile")"
`;

const MESSAGE_SCRIPT = `#!/bin/bash
# Open nvim to compose a message for the current session's orchestrator
# Resolve session ID: direct tmux option → manifest lookup
session_name=$(tmux display-message -p '#{session_name}')
session_id=$(tmux show-options -t "$session_name" -v @sisyphus_session_id 2>/dev/null)

if [ -z "$session_id" ]; then
  MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
  [ ! -f "$MANIFEST" ] && { echo "No active sessions found"; sleep 1; exit 1; }
  cwd=""
  while IFS=$'\\t' read -r type name scwd phase dwid; do
    [ "$name" = "$session_name" ] && { cwd="$scwd"; break; }
  done < "$MANIFEST"
  [ -z "$cwd" ] && { echo "Session not in manifest"; sleep 1; exit 1; }
  while IFS=$'\\t' read -r type name scwd phase dwid; do
    if [ "$type" = "S" ] && [ "$scwd" = "$cwd" ]; then
      session_id=$(tmux show-options -t "$name" -v @sisyphus_session_id 2>/dev/null)
      [ -n "$session_id" ] && break
    fi
  done < "$MANIFEST"
fi

[ -z "$session_id" ] && { echo "No active sisyphus session found"; sleep 1; exit 1; }

tmpfile=$(mktemp /tmp/sisyphus-msg-XXXXXX.md)
trap 'rm -f "$tmpfile"' EXIT
nvim "$tmpfile"
grep -q '[^[:space:]]' "$tmpfile" || exit 0
exec sisyphus message --session "$session_id" "$(cat "$tmpfile")"
`;

// --- Shared session ID + cwd resolution for session-scoped scripts ---
const SESSION_RESOLVE = `
session_name=$(tmux display-message -p '#{session_name}')
session_id=$(tmux show-options -t "$session_name" -v @sisyphus_session_id 2>/dev/null)
cwd=$(tmux show-options -t "$session_name" -v @sisyphus_cwd 2>/dev/null)

if [ -z "$session_id" ]; then
  MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
  [ ! -f "$MANIFEST" ] && { echo "No active sessions found"; sleep 1; exit 1; }
  if [ -z "$cwd" ]; then
    while IFS=$'\\t' read -r type name scwd phase dwid; do
      [ "$name" = "$session_name" ] && { cwd="$scwd"; break; }
    done < "$MANIFEST"
  fi
  [ -z "$cwd" ] && { echo "Session not in manifest"; sleep 1; exit 1; }
  while IFS=$'\\t' read -r type name scwd phase dwid; do
    if [ "$type" = "S" ] && [ "$scwd" = "$cwd" ]; then
      session_id=$(tmux show-options -t "$name" -v @sisyphus_session_id 2>/dev/null)
      [ -n "$session_id" ] && break
    fi
  done < "$MANIFEST"
fi

[ -z "$session_id" ] && { echo "No active sisyphus session found"; sleep 1; exit 1; }
[ -z "$cwd" ] && cwd=$(tmux display-message -p '#{pane_current_path}')`.trim();

// --- Go-home helper used by kill/delete scripts ---
const GO_HOME_AFTER = `
${HOME_SCRIPT_JUMP}
# After the action, switch back to the home/dashboard session
MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
if [ -f "$MANIFEST" ] && [ -n "$cwd" ]; then
  while IFS=$'\\t' read -r type name scwd phase dwid; do
    if [ "$type" = "H" ] && [ "$scwd" = "$cwd" ]; then
      go_home "$name" "$dwid"
      break
    fi
  done < "$MANIFEST"
fi`.trim();

const KILL_SESSION_SCRIPT = `#!/bin/bash
# Kill the sisyphus session associated with the current tmux session
${SESSION_RESOLVE}

sisyphus kill "$session_id" >/dev/null 2>&1
${GO_HOME_AFTER}
`;

const DELETE_SESSION_SCRIPT = `#!/bin/bash
# Delete the sisyphus session associated with the current tmux session
${SESSION_RESOLVE}

printf "\\033[31mType 'yes' to confirm:\\033[0m "
read -r answer
[ "$answer" = "yes" ] || exit 0
sisyphus delete "$session_id" --cwd "$cwd" >/dev/null 2>&1
${GO_HOME_AFTER}
`;

function installScript(name: string, content: string): void {
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  const path = scriptPath(name);
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o755);
}

function installAllScripts(): void {
  installScript('sisyphus-cycle', CYCLE_SCRIPT);
  installScript('sisyphus-home', HOME_SCRIPT);
  installScript('sisyphus-kill-pane', KILL_PANE_SCRIPT);
  installScript('sisyphus-new', NEW_PROMPT_SCRIPT);
  installScript('sisyphus-msg', MESSAGE_SCRIPT);
  installScript('sisyphus-kill-session', KILL_SESSION_SCRIPT);
  installScript('sisyphus-delete-session', DELETE_SESSION_SCRIPT);
}

export function getExistingBinding(key: string, table: string = 'root'): string | null {
  try {
    const output = execSync(`tmux list-keys -T ${table}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    for (const line of output.split('\n')) {
      if (line.includes(key)) {
        const parts = line.trim().split(/\s+/);
        const keyIdx = parts.indexOf(key);
        if (keyIdx !== -1) {
          return line.trim();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isSisyphusBinding(binding: string): boolean {
  return binding.includes('sisyphus');
}

export type SetupResult =
  | { status: 'installed'; message: string }
  | { status: 'already-installed'; message: string }
  | { status: 'conflict'; message: string; existingBinding: string };

export function setupTmuxKeybind(cycleKey: string = DEFAULT_CYCLE_KEY, prefixKey: string = DEFAULT_PREFIX_KEY): SetupResult {
  installAllScripts();

  // Check for existing bindings before writing anything
  for (const [label, key] of [['cycle', cycleKey], ['prefix', prefixKey]] as const) {
    const existing = getExistingBinding(key);
    if (existing !== null && !isSisyphusBinding(existing)) {
      return {
        status: 'conflict',
        message: `Tmux key ${key} (${label}) is already bound to something else. Run "sisyphus setup-keybind <key>" to use a different key.`,
        existingBinding: existing,
      };
    }
  }

  // Build binding lines
  const popupOpts = `-E -w 80% -h 60%`;
  const bindings = [
    // Root-table: direct cycle + prefix entry
    `bind-key -T root ${cycleKey} run-shell ${cycleScriptPath()}`,
    `bind-key -T root ${prefixKey} switch-client -T ${KEY_TABLE}`,
    // Sisyphus key table
    `bind-key -T ${KEY_TABLE} s run-shell ${cycleScriptPath()}`,
    `bind-key -T ${KEY_TABLE} h run-shell ${homeScriptPath()}`,
    `bind-key -T ${KEY_TABLE} x run-shell ${killPaneScriptPath()}`,
    `bind-key -T ${KEY_TABLE} n display-popup ${popupOpts} -d "#{pane_current_path}" ${newPromptScriptPath()}`,
    `bind-key -T ${KEY_TABLE} m display-popup ${popupOpts} -d "#{pane_current_path}" ${messageScriptPath()}`,
    `bind-key -T ${KEY_TABLE} k display-popup -E -w 40 -h 5 -S 'fg=red' -T ' Kill Session ' -d "#{pane_current_path}" ${killSessionScriptPath()}`,
    `bind-key -T ${KEY_TABLE} d display-popup -E -w 40 -h 5 -S 'fg=red' -T ' Delete Session ' -d "#{pane_current_path}" ${deleteSessionScriptPath()}`,
    // prefix-x smart kill
    `bind-key -T prefix x if-shell "tmux display-message -p '#{session_name}' | grep -q '^ssyph_'" "run-shell ${killPaneScriptPath()}" "kill-pane \\; select-layout even-horizontal"`,
  ];

  const confPath = sisyphusTmuxConfPath();
  writeFileSync(confPath, `${SISYPHUS_CONF_MARKER}\n${bindings.join('\n')}\n`, 'utf8');

  // Append source line to tmux.conf if not already there
  const userConf = userTmuxConfPath();
  const markedSourceLine = `source-file ${confPath} ${SISYPHUS_CONF_MARKER}`;
  let persistedToConf = false;

  if (userConf !== null) {
    const contents = readFileSync(userConf, 'utf8');
    if (!contents.includes(confPath)) {
      const separator = contents.endsWith('\n') ? '' : '\n';
      writeFileSync(userConf, `${contents}${separator}${markedSourceLine}\n`, 'utf8');
    }
    persistedToConf = true;
  }

  // Apply bindings live
  try {
    for (const b of bindings) {
      execSync(`tmux ${b}`, { stdio: 'pipe' });
    }
  } catch {
    // tmux not running
  }

  if (getExistingBinding(cycleKey) !== null && isSisyphusBinding(getExistingBinding(cycleKey)!)) {
    return {
      status: 'already-installed',
      message: `Tmux keybindings already configured: ${cycleKey} (cycle), ${prefixKey}+key (s=cycle, h=dashboard, n=new, m=message, x=kill-pane, k=kill-session, d=delete).`,
    };
  }

  const persistNote = persistedToConf
    ? ''
    : `\nNote: No tmux.conf found. Add this to your tmux config for persistence:\n  source-file ${confPath}`;
  return {
    status: 'installed',
    message: `Tmux keybindings set: ${cycleKey} cycles, ${prefixKey}+key (s=cycle, h=dashboard, n=new, m=message, x=kill-pane, k=kill-session, d=delete)${persistNote}`,
  };
}

export function removeTmuxKeybind(): void {
  const confPath = sisyphusTmuxConfPath();
  for (const candidate of [join(homedir(), '.tmux.conf'), join(homedir(), '.config', 'tmux', 'tmux.conf')]) {
    if (existsSync(candidate)) {
      const contents = readFileSync(candidate, 'utf8');
      const filtered = contents
        .split('\n')
        .filter((line) => !line.includes(confPath))
        .join('\n');
      if (filtered !== contents) {
        writeFileSync(candidate, filtered, 'utf8');
      }
    }
  }

  if (existsSync(confPath)) {
    unlinkSync(confPath);
  }

  // Unbind live
  try {
    execSync(`tmux unbind-key -T root ${DEFAULT_CYCLE_KEY}`, { stdio: 'pipe' });
    execSync(`tmux unbind-key -T root ${DEFAULT_PREFIX_KEY}`, { stdio: 'pipe' });
    const output = execSync(`tmux list-keys -T ${KEY_TABLE}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && parts[2] === KEY_TABLE) {
        execSync(`tmux unbind-key -T ${KEY_TABLE} ${parts[3]}`, { stdio: 'pipe' });
      }
    }
    execSync('tmux bind-key -T prefix x kill-pane \\; select-layout even-horizontal', { stdio: 'pipe' });
  } catch {
    // tmux not running
  }

  // Remove scripts
  const scripts = ['sisyphus-cycle', 'sisyphus-home', 'sisyphus-kill-pane', 'sisyphus-new', 'sisyphus-msg', 'sisyphus-kill-session', 'sisyphus-delete-session'];
  for (const name of scripts) {
    const path = scriptPath(name);
    if (existsSync(path)) unlinkSync(path);
  }
}

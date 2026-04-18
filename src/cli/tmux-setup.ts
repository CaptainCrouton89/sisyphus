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

export function helpScriptPath(): string {
  return scriptPath('sisyphus-help');
}

export function statusPopupScriptPath(): string {
  return scriptPath('sisyphus-status-popup');
}

export function pickSessionScriptPath(): string {
  return scriptPath('sisyphus-pick-session');
}

export function continueSessionScriptPath(): string {
  return scriptPath('sisyphus-continue-session');
}

export function restartAgentScriptPath(): string {
  return scriptPath('sisyphus-restart-agent-popup');
}

export function exportSessionScriptPath(): string {
  return scriptPath('sisyphus-export-session');
}

export function openRoadmapScriptPath(): string {
  return scriptPath('sisyphus-open-roadmap');
}

export function openStrategyScriptPath(): string {
  return scriptPath('sisyphus-open-strategy');
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
while IFS=$'\\t' read -r type name scwd phase; do
  [ "$name" = "$current" ] && { cwd="$scwd"; break; }
done < "$MANIFEST"
[ -z "$cwd" ] && exit 0`.trim();

const CYCLE_SCRIPT = `#!/bin/bash
${MANIFEST_LOOKUP}
# Collect all sessions (S and H) matching this cwd
sessions=()
while IFS=$'\\t' read -r type name scwd phase; do
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

// Live tmux query for the home session + its dashboard window ID.
// Sets HOME_SESSION and HOME_DWID. Returns 0 on success, 1 if no home found.
// Optional arg: explicit cwd to look up. If omitted, uses @sisyphus_cwd from
// the current tmux session, falling back to #{pane_current_path}.
const RESOLVE_HOME = `
HOME_SESSION=""
HOME_DWID=""
resolve_home() {
  local target_cwd="$1"
  local current_session sname scwd
  if [ -z "$target_cwd" ]; then
    current_session=$(tmux display-message -p '#{session_name}')
    target_cwd=$(tmux show-options -t "$current_session" -v @sisyphus_cwd 2>/dev/null)
    [ -z "$target_cwd" ] && target_cwd=$(tmux display-message -p '#{pane_current_path}')
  fi
  target_cwd="\${target_cwd%/}"
  [ -z "$target_cwd" ] && return 1
  while IFS= read -r sname; do
    [ -z "$sname" ] && continue
    case "$sname" in ssyph_*) continue ;; esac
    scwd=$(tmux show-options -t "$sname" -v @sisyphus_cwd 2>/dev/null)
    scwd="\${scwd%/}"
    if [ "$scwd" = "$target_cwd" ]; then
      HOME_SESSION="$sname"
      HOME_DWID=$(tmux show-options -t "$sname" -v @sisyphus_dashboard 2>/dev/null)
      return 0
    fi
  done < <(tmux list-sessions -F '#{session_name}')
  return 1
}`.trim();

function homeScript(): string {
  const tuiPath = join(import.meta.dirname, 'tui.js');
  return `#!/bin/bash
# Jump to the dashboard window for the home session matching this cwd.
${RESOLVE_HOME}
if ! resolve_home; then
  tmux display-message "No sisyphus dashboard for this cwd"
  exit 0
fi
# Validate dashboard window is still alive; clear if stale
if [ -n "$HOME_DWID" ] && ! tmux list-panes -t "$HOME_DWID" >/dev/null 2>&1; then
  HOME_DWID=""
fi
if [ -z "$HOME_DWID" ]; then
  # Reopen dashboard: create window, launch TUI, update option
  home_cwd=$(tmux show-options -t "$HOME_SESSION" -v @sisyphus_cwd 2>/dev/null)
  [ -z "$home_cwd" ] && { tmux display-message "Home session has no cwd"; exit 0; }
  HOME_DWID=$(tmux new-window -t "$HOME_SESSION:" -n "sisyphus-dashboard" -c "$home_cwd" -P -F "#{window_id}")
  tmux send-keys -t "$HOME_DWID" "node '${tuiPath}' --cwd '$home_cwd'; exit" Enter
  tmux set-option -t "$HOME_SESSION" @sisyphus_dashboard "$HOME_DWID"
fi
current=$(tmux display-message -p '#{session_name}')
[ "$current" != "$HOME_SESSION" ] && tmux switch-client -t "$HOME_SESSION"
tmux select-window -t "$HOME_DWID"
`;
}

const KILL_PANE_SCRIPT = `#!/bin/bash
# prefix-x override for sisyphus sessions.
# If this is the last pane, switch to the home session before killing.
${RESOLVE_HOME}
session=$(tmux display-message -p '#{session_name}')
pane_count=$(tmux list-panes -t "$session" -F '#{pane_id}' | wc -l | tr -d ' ')

if [ "$pane_count" -le 1 ]; then
  if resolve_home; then
    tmux switch-client -t "$HOME_SESSION"
    [ -n "$HOME_DWID" ] && tmux select-window -t "$HOME_DWID"
    tmux kill-session -t "$session"
    exit 0
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
  while IFS=$'\\t' read -r type name scwd phase; do
    [ "$name" = "$session_name" ] && { cwd="$scwd"; break; }
  done < "$MANIFEST"
  [ -z "$cwd" ] && { echo "Session not in manifest"; sleep 1; exit 1; }
  while IFS=$'\\t' read -r type name scwd phase; do
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
    while IFS=$'\\t' read -r type name scwd phase; do
      [ "$name" = "$session_name" ] && { cwd="$scwd"; break; }
    done < "$MANIFEST"
  fi
  [ -z "$cwd" ] && { echo "Session not in manifest"; sleep 1; exit 1; }
  while IFS=$'\\t' read -r type name scwd phase; do
    if [ "$type" = "S" ] && [ "$scwd" = "$cwd" ]; then
      session_id=$(tmux show-options -t "$name" -v @sisyphus_session_id 2>/dev/null)
      [ -n "$session_id" ] && break
    fi
  done < "$MANIFEST"
fi

[ -z "$session_id" ] && { echo "No active sisyphus session found"; sleep 1; exit 1; }
[ -z "$cwd" ] && cwd=$(tmux display-message -p '#{pane_current_path}')`.trim();

// --- Go-home helper used by kill/delete scripts ---
// Assumes $cwd was captured before the destructive action ran (via SESSION_RESOLVE).
const GO_HOME_AFTER = `
${RESOLVE_HOME}
if resolve_home "$cwd"; then
  tmux switch-client -t "$HOME_SESSION"
  [ -n "$HOME_DWID" ] && tmux select-window -t "$HOME_DWID"
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

const HELP_SCRIPT = `#!/bin/bash
cat <<'EOF'

  Sisyphus Keybindings  (Ctrl-s + key)

  --- Navigation --------------------
    s   Cycle between sessions
    h   Go to dashboard
    l   Session picker
    z   Zoom/focus toggle

  --- Actions -----------------------
    n   New session
    m   Message orchestrator
    c   Continue session
    r   Restart agent
    t   Session status
    p   Open roadmap
    S   Open strategy
    e   Export session

  --- Management --------------------
    k   Kill session
    d   Delete session
    x   Kill current pane

    ?   This help

EOF
read -n 1 -s -r -p "  Press any key to close"
`;

const STATUS_POPUP_SCRIPT = `#!/bin/bash
# Show session status — falls back to session list
session_name=$(tmux display-message -p '#{session_name}')
session_id=$(tmux show-options -t "$session_name" -v @sisyphus_session_id 2>/dev/null)

if [ -z "$session_id" ]; then
  MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
  if [ -f "$MANIFEST" ]; then
    cwd=""
    while IFS=$'\\t' read -r type name scwd phase; do
      [ "$name" = "$session_name" ] && { cwd="$scwd"; break; }
    done < "$MANIFEST"
    if [ -n "$cwd" ]; then
      while IFS=$'\\t' read -r type name scwd phase; do
        if [ "$type" = "S" ] && [ "$scwd" = "$cwd" ]; then
          session_id=$(tmux show-options -t "$name" -v @sisyphus_session_id 2>/dev/null)
          [ -n "$session_id" ] && break
        fi
      done < "$MANIFEST"
    fi
  fi
fi

if [ -n "$session_id" ]; then
  sisyphus status "$session_id" 2>&1 | less -R
else
  sisyphus list 2>&1 | less -R
fi
`;

const PICK_SESSION_SCRIPT = `#!/bin/bash
# Session picker — switch to a sisyphus session
MANIFEST="$HOME/.sisyphus/sessions-manifest.tsv"
[ ! -f "$MANIFEST" ] && { echo "No sessions found"; sleep 1; exit 0; }

current=$(tmux display-message -p '#{session_name}')
cwd=""
while IFS=$'\\t' read -r type name scwd phase; do
  [ "$name" = "$current" ] && { cwd="$scwd"; break; }
done < "$MANIFEST"

declare -a entries=()
declare -a targets=()
while IFS=$'\\t' read -r type name scwd phase; do
  [[ "$type" == "#"* ]] && continue
  [ -n "$cwd" ] && [ "$scwd" != "$cwd" ] && continue
  display="$name"
  if [[ "$name" == ssyph_* ]]; then
    display="\${name#ssyph_}"
    display="\${display#*_}"
  fi
  [ "$type" = "H" ] && display="~ home"
  marker=""
  [ "$name" = "$current" ] && marker=" *"
  phase_label="\${phase:-—}"
  entries+=("\${display} [\${phase_label}]\${marker}")
  targets+=("$name")
done < "$MANIFEST"

(( \${#entries[@]} == 0 )) && { echo "No sessions found"; sleep 1; exit 0; }

if command -v fzf &>/dev/null; then
  idx=$(for (( i=0; i<\${#entries[@]}; i++ )); do echo "$i \${entries[$i]}"; done | \\
    fzf --height=100% --reverse --with-nth=2.. --prompt="Switch to: " | awk '{print $1}')
  [ -z "$idx" ] && exit 0
  tmux switch-client -t "\${targets[$idx]}"
else
  for (( i=0; i<\${#entries[@]}; i++ )); do
    printf "  %d) %s\\n" $((i+1)) "\${entries[$i]}"
  done
  printf "\\nPick session: "
  read -r choice
  idx=$((choice - 1))
  (( idx >= 0 && idx < \${#entries[@]} )) || exit 0
  tmux switch-client -t "\${targets[$idx]}"
fi
`;

const CONTINUE_SESSION_SCRIPT = `#!/bin/bash
# Continue a completed session
${SESSION_RESOLVE}

short_id="\${session_id:0:8}"
printf "\\033[33mContinue session %s...?\\033[0m (y/n) " "$short_id"
read -r answer
[ "$answer" = "y" ] || [ "$answer" = "yes" ] || exit 0
sisyphus continue --session "$session_id"
sleep 1
`;

const OPEN_ROADMAP_SCRIPT = `#!/bin/bash
# Open roadmap.md for the current session in $EDITOR
${SESSION_RESOLVE}

file="$cwd/.sisyphus/sessions/$session_id/roadmap.md"
[ ! -f "$file" ] && { tmux display-message "No roadmap.md for this session"; exit 0; }
exec \${EDITOR:-nvim} "$file"
`;

const OPEN_STRATEGY_SCRIPT = `#!/bin/bash
# Open strategy.md for the current session in $EDITOR
${SESSION_RESOLVE}

file="$cwd/.sisyphus/sessions/$session_id/strategy.md"
[ ! -f "$file" ] && { tmux display-message "No strategy.md for this session"; exit 0; }
exec \${EDITOR:-nvim} "$file"
`;

const EXPORT_SESSION_SCRIPT = `#!/bin/bash
# Export session data as zip to ~/Downloads
${SESSION_RESOLVE}

echo "Exporting session \${session_id:0:8}..."
sisyphus export "$session_id" --cwd "$cwd"
echo ""
read -n 1 -s -r -p "Press a key to close."
`;

const RESTART_AGENT_SCRIPT = `#!/bin/bash
# Restart a failed/lost agent
${SESSION_RESOLVE}

echo "Session agents:"
echo ""
sisyphus status "$session_id" 2>&1 | grep -E '(agent-[0-9]+|Active agents|Agents:)' | head -20
echo ""
printf "Agent ID to restart (e.g. agent-001): "
read -r agent_id
[ -z "$agent_id" ] && exit 0
echo ""
sisyphus restart-agent "$agent_id" --session "$session_id"
echo ""
echo "Press any key to close."
read -n 1 -s -r
`;

function installScript(name: string, content: string): void {
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  const path = scriptPath(name);
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o755);
}

function installAllScripts(): void {
  installScript('sisyphus-cycle', CYCLE_SCRIPT);
  installScript('sisyphus-home', homeScript());
  installScript('sisyphus-kill-pane', KILL_PANE_SCRIPT);
  installScript('sisyphus-new', NEW_PROMPT_SCRIPT);
  installScript('sisyphus-msg', MESSAGE_SCRIPT);
  installScript('sisyphus-kill-session', KILL_SESSION_SCRIPT);
  installScript('sisyphus-delete-session', DELETE_SESSION_SCRIPT);
  installScript('sisyphus-help', HELP_SCRIPT);
  installScript('sisyphus-status-popup', STATUS_POPUP_SCRIPT);
  installScript('sisyphus-pick-session', PICK_SESSION_SCRIPT);
  installScript('sisyphus-continue-session', CONTINUE_SESSION_SCRIPT);
  installScript('sisyphus-restart-agent-popup', RESTART_AGENT_SCRIPT);
  installScript('sisyphus-open-roadmap', OPEN_ROADMAP_SCRIPT);
  installScript('sisyphus-open-strategy', OPEN_STRATEGY_SCRIPT);
  installScript('sisyphus-export-session', EXPORT_SESSION_SCRIPT);
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
    // Info & navigation
    `bind-key -T ${KEY_TABLE} ? display-popup -E -w 44 -h 28 -T ' Keybindings ' ${helpScriptPath()}`,
    `bind-key -T ${KEY_TABLE} t display-popup -E -w 90% -h 90% -d "#{pane_current_path}" ${statusPopupScriptPath()}`,
    `bind-key -T ${KEY_TABLE} l display-popup -E -w 60% -h 60% -d "#{pane_current_path}" ${pickSessionScriptPath()}`,
    `bind-key -T ${KEY_TABLE} z resize-pane -Z`,
    // Session actions
    `bind-key -T ${KEY_TABLE} c display-popup -E -w 50 -h 5 -S 'fg=yellow' -T ' Continue Session ' -d "#{pane_current_path}" ${continueSessionScriptPath()}`,
    `bind-key -T ${KEY_TABLE} r display-popup -E -w 70% -h 50% -d "#{pane_current_path}" ${restartAgentScriptPath()}`,
    `bind-key -T ${KEY_TABLE} p display-popup ${popupOpts} -d "#{pane_current_path}" ${openRoadmapScriptPath()}`,
    `bind-key -T ${KEY_TABLE} S display-popup ${popupOpts} -d "#{pane_current_path}" ${openStrategyScriptPath()}`,
    // Export
    `bind-key -T ${KEY_TABLE} e display-popup -E -w 60 -h 8 -T ' Export Session ' -d "#{pane_current_path}" ${exportSessionScriptPath()}`,
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
      message: `Tmux keybindings already configured: ${cycleKey} (cycle), ${prefixKey}+key (?=help for full list).`,
    };
  }

  const persistNote = persistedToConf
    ? ''
    : `\nNote: No tmux.conf found. Add this to your tmux config for persistence:\n  source-file ${confPath}`;
  return {
    status: 'installed',
    message: `Tmux keybindings set: ${cycleKey} cycles, ${prefixKey}+key (?=help for full list)${persistNote}`,
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
  const scripts = [
    'sisyphus-cycle', 'sisyphus-home', 'sisyphus-kill-pane', 'sisyphus-new', 'sisyphus-msg',
    'sisyphus-kill-session', 'sisyphus-delete-session', 'sisyphus-help', 'sisyphus-status-popup',
    'sisyphus-pick-session', 'sisyphus-continue-session', 'sisyphus-restart-agent-popup',
    'sisyphus-open-roadmap', 'sisyphus-open-strategy', 'sisyphus-export-session',
  ];
  for (const name of scripts) {
    const path = scriptPath(name);
    if (existsSync(path)) unlinkSync(path);
  }
}

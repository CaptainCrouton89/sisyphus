import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { globalDir } from '../shared/paths.js';

export const DEFAULT_KEY = 'M-s';
export const DEFAULT_HOME_KEY = 'M-S';

const SISYPHUS_CONF_MARKER = '# sisyphus-managed — do not edit';

export function cycleScriptPath(): string {
  return join(globalDir(), 'bin', 'sisyphus-cycle');
}

export function homeScriptPath(): string {
  return join(globalDir(), 'bin', 'sisyphus-home');
}

export function killPaneScriptPath(): string {
  return join(globalDir(), 'bin', 'sisyphus-kill-pane');
}

export function sisyphusTmuxConfPath(): string {
  return join(globalDir(), 'tmux.conf');
}

function userTmuxConfPath(): string | null {
  // Check both standard locations, preferring whichever exists
  const dotfile = join(homedir(), '.tmux.conf');
  const xdg = join(homedir(), '.config', 'tmux', 'tmux.conf');
  if (existsSync(xdg)) return xdg;
  if (existsSync(dotfile)) return dotfile;
  return null;
}

const CYCLE_SCRIPT = `#!/bin/bash
cwd=$(tmux show-option -v @sisyphus_cwd 2>/dev/null)
[ -z "$cwd" ] && exit 0
current=$(tmux display-message -p '#{session_name}')
sessions=()
while IFS= read -r name; do
  scwd=$(tmux show-option -t "$name" -v @sisyphus_cwd 2>/dev/null)
  [ "$scwd" = "$cwd" ] && sessions+=("$name")
done < <(tmux list-sessions -F '#{session_name}')
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

const HOME_SCRIPT = `#!/bin/bash
# Jump to the home (non-sisyphus) session that has the dashboard window
cwd=$(tmux show-option -v @sisyphus_cwd 2>/dev/null)
[ -z "$cwd" ] && exit 0
while IFS= read -r name; do
  # Skip sisyphus agent/orchestrator sessions
  case "$name" in sisyphus-*) continue ;; esac
  scwd=$(tmux show-option -t "$name" -v @sisyphus_cwd 2>/dev/null)
  if [ "$scwd" = "$cwd" ]; then
    tmux switch-client -t "$name"
    # Focus the dashboard window by stored ID (not name)
    dwid=$(tmux show-option -t "$name" -v @sisyphus_dashboard 2>/dev/null)
    [ -n "$dwid" ] && tmux select-window -t "$dwid" 2>/dev/null
    exit 0
  fi
done < <(tmux list-sessions -F '#{session_name}')
`;

const KILL_PANE_SCRIPT = `#!/bin/bash
# prefix-x override for sisyphus sessions.
# If this is the last pane, switch to the home session before killing.
session=$(tmux display-message -p '#{session_name}')
pane_count=$(tmux list-panes -t "$session" -F '#{pane_id}' | wc -l | tr -d ' ')

if [ "$pane_count" -le 1 ]; then
  # Last pane — find home session, switch there, then kill sisyphus session
  cwd=$(tmux show-option -t "$session" -v @sisyphus_cwd 2>/dev/null)
  if [ -n "$cwd" ]; then
    while IFS= read -r name; do
      case "$name" in sisyphus-*) continue ;; esac
      scwd=$(tmux show-option -t "$name" -v @sisyphus_cwd 2>/dev/null)
      if [ "$scwd" = "$cwd" ]; then
        tmux switch-client -t "$name"
        dwid=$(tmux show-option -t "$name" -v @sisyphus_dashboard 2>/dev/null)
        [ -n "$dwid" ] && tmux select-window -t "$dwid" 2>/dev/null
        tmux kill-session -t "$session"
        exit 0
      fi
    done < <(tmux list-sessions -F '#{session_name}')
  fi
  # No home session found — just kill the pane
  tmux kill-pane
else
  # Multiple panes — kill this one and rebalance
  tmux kill-pane
  tmux select-layout even-horizontal
fi
`;

export function installCycleScript(): void {
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  const scriptPath = cycleScriptPath();
  writeFileSync(scriptPath, CYCLE_SCRIPT, 'utf8');
  chmodSync(scriptPath, 0o755);
}

export function installHomeScript(): void {
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  const scriptPath = homeScriptPath();
  writeFileSync(scriptPath, HOME_SCRIPT, 'utf8');
  chmodSync(scriptPath, 0o755);
}

export function installKillPaneScript(): void {
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  const scriptPath = killPaneScriptPath();
  writeFileSync(scriptPath, KILL_PANE_SCRIPT, 'utf8');
  chmodSync(scriptPath, 0o755);
}

export function getExistingBinding(key: string): string | null {
  try {
    const output = execSync('tmux list-keys', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    for (const line of output.split('\n')) {
      // lines look like: bind-key -T root M-s run-shell ...
      // or:              bind-key    -T root M-s run-shell ...
      if (line.includes(key)) {
        const parts = line.trim().split(/\s+/);
        // Find the key in parts and check it matches exactly (not as substring of another key)
        const keyIdx = parts.indexOf(key);
        if (keyIdx !== -1) {
          return line.trim();
        }
      }
    }
    return null;
  } catch {
    // tmux not running or not available
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

export function setupTmuxKeybind(key: string = DEFAULT_KEY, homeKey: string = DEFAULT_HOME_KEY): SetupResult {
  installCycleScript();
  installHomeScript();
  installKillPaneScript();

  // Check for existing binding before writing anything
  const existing = getExistingBinding(key);
  if (existing !== null && !isSisyphusBinding(existing)) {
    return {
      status: 'conflict',
      message: `Tmux key ${key} is already bound to something else. Run "sisyphus setup-keybind <key>" to use a different key.`,
      existingBinding: existing,
    };
  }

  // Check home key for conflicts too (only if different from cycle key)
  if (homeKey !== key) {
    const existingHome = getExistingBinding(homeKey);
    if (existingHome !== null && !isSisyphusBinding(existingHome)) {
      return {
        status: 'conflict',
        message: `Tmux key ${homeKey} is already bound to something else.`,
        existingBinding: existingHome,
      };
    }
  }

  // Write ~/.sisyphus/tmux.conf with keybindings + prefix-x override
  const confPath = sisyphusTmuxConfPath();
  const cycleBinding = `bind-key -T root ${key} run-shell ${cycleScriptPath()}`;
  const homeBinding = `bind-key -T root ${homeKey} run-shell ${homeScriptPath()}`;
  const killPaneOverride = `bind-key -T prefix x if-shell "tmux display-message -p '#{session_name}' | grep -q '^sisyphus-'" "run-shell ${killPaneScriptPath()}" "kill-pane \\; select-layout even-horizontal"`;
  writeFileSync(confPath, `${SISYPHUS_CONF_MARKER}\n${cycleBinding}\n${homeBinding}\n${killPaneOverride}\n`, 'utf8');

  // Append source line to tmux.conf if not already there
  const userConf = userTmuxConfPath();
  const sourceLine = `source-file ${confPath}`;
  const markedSourceLine = `${sourceLine} ${SISYPHUS_CONF_MARKER}`;
  let persistedToConf = false;

  if (userConf !== null) {
    const contents = readFileSync(userConf, 'utf8');
    if (!contents.includes(confPath)) {
      const separator = contents.endsWith('\n') ? '' : '\n';
      writeFileSync(userConf, `${contents}${separator}${markedSourceLine}\n`, 'utf8');
    }
    persistedToConf = true;
  }

  // Apply bindings live if tmux is running
  try {
    execSync(`tmux bind-key -T root ${key} run-shell ${cycleScriptPath()}`, { stdio: 'pipe' });
    execSync(`tmux bind-key -T root ${homeKey} run-shell ${homeScriptPath()}`, { stdio: 'pipe' });
    execSync(`tmux ${killPaneOverride}`, { stdio: 'pipe' });
  } catch {
    // tmux not running — bindings will take effect on next session start
  }

  if (existing !== null && isSisyphusBinding(existing)) {
    return {
      status: 'already-installed',
      message: `Tmux keybindings ${key} (cycle) and ${homeKey} (dashboard) already configured for sisyphus.`,
    };
  }

  const persistNote = persistedToConf
    ? ''
    : `\nNote: No tmux.conf found. Add this to your tmux config for persistence:\n  source-file ${confPath}`;
  return {
    status: 'installed',
    message: `Tmux keybindings set: ${key} cycles sessions, ${homeKey} jumps to dashboard${persistNote}`,
  };
}

export function removeTmuxKeybind(): void {
  // Remove source line from user's tmux.conf
  const confPath = sisyphusTmuxConfPath();
  // Check both possible tmux.conf locations
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

  // Remove ~/.sisyphus/tmux.conf
  if (existsSync(confPath)) {
    unlinkSync(confPath);
  }

  // Restore default prefix-x binding if tmux is running
  try {
    execSync('tmux bind-key -T prefix x kill-pane \\; select-layout even-horizontal', { stdio: 'pipe' });
  } catch {
    // tmux not running
  }

  // Remove scripts
  for (const scriptPath of [cycleScriptPath(), homeScriptPath(), killPaneScriptPath()]) {
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath);
    }
  }
}

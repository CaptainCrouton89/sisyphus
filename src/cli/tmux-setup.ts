import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { globalDir } from '../shared/paths.js';

export const DEFAULT_KEY = 'M-s';

const SISYPHUS_CONF_MARKER = '# sisyphus-managed — do not edit';

export function cycleScriptPath(): string {
  return join(globalDir(), 'bin', 'sisyphus-cycle');
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

export function installCycleScript(): void {
  const scriptPath = cycleScriptPath();
  mkdirSync(join(globalDir(), 'bin'), { recursive: true });
  writeFileSync(scriptPath, CYCLE_SCRIPT, 'utf8');
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

export function setupTmuxKeybind(key: string = DEFAULT_KEY): SetupResult {
  installCycleScript();

  // Check for existing binding before writing anything
  const existing = getExistingBinding(key);
  if (existing !== null && !isSisyphusBinding(existing)) {
    return {
      status: 'conflict',
      message: `Tmux key ${key} is already bound to something else. Run "sisyphus setup-keybind <key>" to use a different key.`,
      existingBinding: existing,
    };
  }

  // Write ~/.sisyphus/tmux.conf
  const confPath = sisyphusTmuxConfPath();
  const bindingLine = `bind-key -T root ${key} run-shell ${cycleScriptPath()}`;
  writeFileSync(confPath, `${SISYPHUS_CONF_MARKER}\n${bindingLine}\n`, 'utf8');

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

  // Apply binding live if tmux is running
  try {
    execSync(`tmux bind-key -T root ${key} run-shell ${cycleScriptPath()}`, { stdio: 'pipe' });
  } catch {
    // tmux not running — binding will take effect on next session start
  }

  if (existing !== null && isSisyphusBinding(existing)) {
    return {
      status: 'already-installed',
      message: `Tmux keybinding ${key} already configured for sisyphus.`,
    };
  }

  const persistNote = persistedToConf
    ? ''
    : `\nNote: No tmux.conf found. Add this to your tmux config for persistence:\n  source-file ${confPath}`;
  return {
    status: 'installed',
    message: `Tmux keybinding set: ${key} cycles sisyphus sessions${persistNote}`,
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

  // Remove cycle script
  const scriptPath = cycleScriptPath();
  if (existsSync(scriptPath)) {
    unlinkSync(scriptPath);
  }
}

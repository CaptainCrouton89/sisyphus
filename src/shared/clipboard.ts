import { execFileSync, spawnSync } from 'node:child_process';
import { detectPlatform, hasCommand } from './platform.js';

export interface ClipboardTool {
  /** Command name as invoked on PATH (e.g. "pbcopy", "wl-copy") */
  cmd: string;
  /** Args passed to the command */
  args: readonly string[];
}

export interface ClipboardCapability {
  copy: ClipboardTool | null;
  paste: ClipboardTool | null;
  /** If null, clipboard is fully unavailable; this hint tells the user how to fix it. */
  hint: string | null;
}

/**
 * Probe the system for a clipboard backend. Order matters: prefer native
 * platform tools, fall back to Wayland → X11. On WSL we use Windows' clip.exe
 * for copy and powershell.exe Get-Clipboard for paste (both work without WSLg).
 */
export function detectClipboard(): ClipboardCapability {
  const platform = detectPlatform();

  if (platform === 'darwin') {
    return {
      copy: { cmd: 'pbcopy', args: [] },
      paste: { cmd: 'pbpaste', args: [] },
      hint: null,
    };
  }

  if (platform === 'wsl') {
    const copy = hasCommand('clip.exe') ? { cmd: 'clip.exe', args: [] } : null;
    const paste = hasCommand('powershell.exe')
      ? { cmd: 'powershell.exe', args: ['-NoProfile', '-Command', 'Get-Clipboard'] }
      : null;
    return {
      copy,
      paste,
      hint: copy && paste
        ? null
        : 'WSL clipboard needs Windows interop. Ensure /mnt/c/Windows/System32 is on PATH (it is by default).',
    };
  }

  if (platform === 'linux') {
    // Wayland first — modern desktops prefer it.
    if (process.env['WAYLAND_DISPLAY'] && hasCommand('wl-copy') && hasCommand('wl-paste')) {
      return {
        copy: { cmd: 'wl-copy', args: [] },
        paste: { cmd: 'wl-paste', args: ['--no-newline'] },
        hint: null,
      };
    }
    // X11 / generic.
    if (hasCommand('xclip')) {
      return {
        copy: { cmd: 'xclip', args: ['-selection', 'clipboard'] },
        paste: { cmd: 'xclip', args: ['-selection', 'clipboard', '-o'] },
        hint: null,
      };
    }
    if (hasCommand('xsel')) {
      return {
        copy: { cmd: 'xsel', args: ['--clipboard', '--input'] },
        paste: { cmd: 'xsel', args: ['--clipboard', '--output'] },
        hint: null,
      };
    }
    return {
      copy: null,
      paste: null,
      hint: 'Install a clipboard tool: `sudo apt install xclip` (or wl-clipboard for Wayland).',
    };
  }

  return {
    copy: null,
    paste: null,
    hint: 'Clipboard not supported on this platform.',
  };
}

let cached: ClipboardCapability | undefined;
function cap(): ClipboardCapability {
  if (!cached) cached = detectClipboard();
  return cached;
}

export interface ClipboardError {
  /** Reason copy/paste failed — show to user as a notify message. */
  reason: string;
}

export function copyToClipboard(text: string): ClipboardError | null {
  const c = cap();
  if (!c.copy) {
    // Invariant from detectClipboard: when copy is null, hint is always set.
    return { reason: c.hint === null ? 'No clipboard backend available' : c.hint };
  }
  try {
    execFileSync(c.copy.cmd, c.copy.args, { input: text, stdio: ['pipe', 'ignore', 'pipe'] });
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { reason: `${c.copy.cmd} failed: ${msg}` };
  }
}

export function pasteFromClipboard(): { text: string } | ClipboardError {
  const c = cap();
  if (!c.paste) {
    return { reason: c.hint === null ? 'No clipboard backend available' : c.hint };
  }
  const result = spawnSync(c.paste.cmd, c.paste.args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    if (stderr.length > 0) {
      return { reason: `${c.paste.cmd}: ${stderr.split('\n')[0]}` };
    }
    return { reason: `${c.paste.cmd} exited ${result.status}` };
  }
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  // powershell.exe Get-Clipboard appends \r\n; trim trailing whitespace consistently.
  return { text: stdout.replace(/\s+$/, '') };
}

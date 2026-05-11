import { execFileSync, spawnSync } from 'node:child_process';
import { detectPlatform, hasCommand } from './platform.js';

export interface OpenError {
  reason: string;
}

/**
 * Open a directory or file in the platform's default file manager / handler.
 * On WSL we use explorer.exe with a Windows-style path so the user gets a
 * Windows File Explorer window (matches their muscle memory).
 */
export function openPath(path: string): OpenError | null {
  const platform = detectPlatform();

  if (platform === 'darwin') {
    try {
      execFileSync('open', [path], { stdio: 'ignore' });
      return null;
    } catch (err) {
      return { reason: errMsg(err) };
    }
  }

  if (platform === 'wsl') {
    // Translate /home/... → \\wsl$\... or /mnt/c/Users/... → C:\Users\...
    const winPath = wslToWindowsPath(path);
    if (!hasCommand('explorer.exe')) {
      return { reason: 'explorer.exe not on PATH (is /mnt/c/Windows/explorer.exe accessible?)' };
    }
    // explorer.exe returns exit code 1 on success; treat anything launching as success.
    spawnSync('explorer.exe', [winPath], { stdio: 'ignore' });
    return null;
  }

  if (platform === 'linux') {
    if (!hasCommand('xdg-open')) {
      return { reason: 'xdg-open not found. Install: sudo apt install xdg-utils' };
    }
    try {
      execFileSync('xdg-open', [path], { stdio: 'ignore' });
      return null;
    } catch (err) {
      return { reason: errMsg(err) };
    }
  }

  return { reason: 'Open is not supported on this platform.' };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    const first = err.message.split('\n')[0];
    return first === undefined ? err.message : first;
  }
  return String(err);
}

function wslToWindowsPath(path: string): string {
  // Use wslpath if available — it handles every edge case (UNC, mounts, etc).
  if (hasCommand('wslpath')) {
    const r = spawnSync('wslpath', ['-w', path], { encoding: 'utf-8' });
    if (r.status === 0 && typeof r.stdout === 'string') {
      const out = r.stdout.trim();
      if (out.length > 0) return out;
    }
  }
  return path;
}

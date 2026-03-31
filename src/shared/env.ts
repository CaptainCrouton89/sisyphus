import { resolve } from 'node:path';

/**
 * Build a PATH string that includes common binary directories
 * across package managers and platforms.
 *
 * Prepends known directories that exist on the system to the current PATH.
 * This ensures tmux commands can find binaries installed by Homebrew,
 * MacPorts, nix, and other package managers.
 */
export function augmentedPath(): string {
  const rawPath = process.env['PATH'];
  const basePath = rawPath !== undefined && rawPath.length > 0 ? rawPath : '/usr/bin:/bin';

  // Common binary directories across platforms/package managers.
  // Only prepend ones that aren't already in PATH.
  const home = process.env['HOME'];
  const candidates = [
    ...(home ? [`${home}/.local/bin`] : []),  // Claude CLI, pipx, user-local installs
    resolve(process.execPath, '..'),           // Node.js bin dir (ensures node/npm available)
    '/opt/homebrew/bin',              // Homebrew (Apple Silicon macOS)
    '/opt/homebrew/sbin',             // Homebrew sbin
    '/usr/local/bin',                 // Homebrew (Intel macOS), manual installs
    '/usr/local/sbin',                // Manual installs
    '/opt/local/bin',                 // MacPorts
    '/opt/local/sbin',                // MacPorts
    '/home/linuxbrew/.linuxbrew/bin', // Linuxbrew
  ];

  // Check for nix profile paths
  const nixProfile = process.env['NIX_PROFILES'];
  if (nixProfile) {
    for (const p of nixProfile.split(' ').reverse()) {
      candidates.push(`${p}/bin`);
    }
  }

  const existing = new Set(basePath.split(':'));
  const prepend = candidates.filter(dir => !existing.has(dir));

  return prepend.length > 0 ? `${prepend.join(':')}:${basePath}` : basePath;
}

/**
 * Environment variables for child processes that need access to
 * user-installed binaries (tmux, git, claude, etc.).
 */
export function execEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    PATH: augmentedPath(),
  };
}

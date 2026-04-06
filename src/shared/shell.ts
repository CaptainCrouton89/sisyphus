export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Validate that a session ID is a safe UUID-like string (no path traversal). */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export function validateSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id) && !id.includes('..');
}

/** Validate that a repo name is a simple directory name (no path components). */
export function validateRepoName(repo: string): boolean {
  return !repo.includes('/') && !repo.includes('\\') && !repo.includes('..');
}

/** Escape a string for safe interpolation inside AppleScript double quotes. */
export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
